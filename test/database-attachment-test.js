var path = require('path'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs'),
    vows = require('vows');

function status(code) {
    return function (e, res, body) {
        assert.ok(res || e);
        assert.equal((res || e).headers.status || (res || e).statusCode, code);
    };
}

function mixin(target) {
    var objs = Array.prototype.slice.call(arguments, 1);
    objs.forEach(function (o) {
        for (var attr in o) { target[attr] = o[attr] }
    });
    return target;
}

var cradle = require('../lib/cradle');

vows.describe('cradle/database/attachments').addBatch({
    "Database with cache": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, { cache: true }).database('pigs');
        },
        "saveAttachment()": {
            "updates the cache": {
                topic: function (db) {
                    var that = this;
                    db.save({ _id: 'attachment-cacher' }, function (e, res) {
                        db.saveAttachment({
                            id: res.id, 
                            rev: res.rev
                        }, {
                            name: 'cached/foo.txt', 
                            'Content-Type': 'text/plain', 
                            body: 'Foo!'
                        }, function () {
                            that.callback(null, db.cache.get(res.id));
                        });
                    });
                },
                "with the revision": function (cached) {
                    assert.match(cached._rev, /^2-/);
                },
                "with the _attachments": function (cached) {
                    assert.ok(cached._attachments);
                    assert.ok(cached._attachments['cached/foo.txt']);
                    assert.equal(cached._attachments['cached/foo.txt'].stub, true);
                },
                "and is valid enough to re-save": {
                    topic: function (cached, db) {
                        var that = this
                        db.save(mixin({ foo: 'bar' }, cached), function (e,res) {
                            db.cache.purge(cached._id);
                            db.get(cached._id, that.callback);
                        });
                    },
                    "has the attachment": function (res) {
                        var att = res._attachments['cached/foo.txt'];
                        assert.equal(att.stub, true);
                        assert.equal(att.content_type, 'text/plain');
                        assert.equal(att.length, 4);
                        assert.equal(att.revpos, 2);
                    },
                    "and actually updated the rev": function (res) {
                        assert.match(res._rev, /^3-/);
                    }
                }
            },
            "pulls the revision from the cache if not given": {
                topic: function (db) {
                    var callback = this.callback;
                    db.save({ _id: 'attachment-saving-pulls-rev-from-cache' }, function (e, res) {
                        db.saveAttachment(res.id, {
                            name: 'foo.txt', 
                            contentType: 'text/plain', 
                            body: 'Foo!'
                        }, callback);
                    });
                },
                "and saves successfully": status(201)
            }
        }
    }
}).addBatch({
    "Database with no cache": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false}).database('pigs');
        },
        "putting an attachment": {
            "to an existing document": {
                "with given data": {
                    topic: function (db) {
                        var that = this;
                        db.save({_id: 'complete-attachment'}, function (e, res) {
                            db.saveAttachment({
                                id: res.id, 
                                rev: res.rev
                            }, {
                                name: 'foo.txt', 
                                'content-type': 'text/plain', 
                                body: 'Foo!'
                            }, that.callback);
                        });
                    },
                    "returns a 201": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                        assert.match(res.rev, /^2/);
                    },
                },
                "when piping": {
                    topic: function (db) {
                        var callback = this.callback, filestream;
                        db.save({ _id: 'piped-attachment' }, function (e, res) {
                            var stream = db.saveAttachment({
                                id: res.id, 
                                rev: res.rev
                            }, {
                                name: 'foo.txt', 
                                contentType: 'text/plain'
                            }, callback);
                            
                            fs.createReadStream(__dirname + "/../README.md").pipe(stream);
                        });
                    },
                    "returns a 201": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                        assert.match(res.rev, /^2/);
                    }
                },
                "with incorrect revision": {
                    topic: function (db) {
                        var callback = this.callback, oldRev;
                        db.save({ _id: 'attachment-incorrect-revision' }, function (e, res) {
                            oldRev = res.rev;
                            db.save({_id: 'attachment-incorrect-revision', _rev:res.rev}, function (e, res) {
                                db.saveAttachment({
                                    id: res.id, 
                                    rev: oldRev
                                }, {
                                    name: 'foo.txt', 
                                    contentType: 'text/plain', 
                                    body: 'Foo!'
                                }, callback);
                            });
                        });
                    },
                    "returns a 409": status(409)
                }
            },
            "to a non-existing document": {
                topic: function (db) {
                    db.saveAttachment('standalone-attachment', {
                        name: 'foo.txt', 
                        contentType: 'text/plain', 
                        body: 'Foo!'
                    }, this.callback);
                },
                "returns a 201": status(201),
                "returns the revision": function (res) {
                    assert.ok(res.rev);
                    assert.match(res.rev, /^1-/);
                }
            }
        },
        "getting an attachment": {
            "when it exists": {
                topic: function (db) {
                    var that = this, doc = {
                        _id: 'attachment-getter', 
                        _attachments: { 
                            "foo.txt": {
                                content_type: "text/plain", 
                                data: "aGVsbG8gd29ybGQ="
                            }
                        }
                    };
                    
                    db.save(doc, function (e, res) {
                        db.getAttachment('attachment-getter', 'foo.txt', that.callback);
                    });
                },
                "returns a 200": status(200),
                "returns the right mime-type in the header": function (err, res, body) {
                    assert.equal(res.headers['content-type'], 'text/plain');
                },
                "returns the attachment in the body": function (err, res, body) {
                    assert.equal(body, "hello world");
                }
            },
            "when not found": {
                topic: function (db) {
                    var that = this;
                    db.save({ _id: 'attachment-not-found' }, function (e, res) {
                        db.getAttachment('attachment-not-found', 'foo.txt', that.callback);
                    });
                },
                "returns a 404": status(404)
            }
        }
    }
}).addBatch({
    "Database with no cache": {
        topic: function () {
           return new(cradle.Connection)('127.0.0.1', 5984, {cache: false}).database('pigs');
        },
        "saving an attachment with ETag": {
            topic: function (db) {
                var id = 'attachment-incorrect-revision',
                    that = this;
                
                db.head('attachment-incorrect-revision', function (err, _doc) {
                  db.saveAttachment({
                      id: id, 
                      rev: _doc.etag,
                    }, {
                       name: 'etag-foo.txt',
                       contentType: 'text/plain',
                       body: 'FOOO!!' 
                    }, that.callback);
                });
            },
            "returns a 201": status(201),
            "returns the revision": function (res) {
                assert.ok(res.rev);
                assert.match(res.rev, /^3/);
            }
        }
    }
}).addBatch({
    "Database with no cache": {
        topic: function () {
           return new(cradle.Connection)('127.0.0.1', 5984, {cache: false}).database('pigs');
        },
        "getting an attachment with .pipe()": {
            "when it exists": {
                topic: function (db) {
                    var stream = db.getAttachment('piped-attachment', 'foo.txt', this.callback);
                    stream.pipe(fs.createWriteStream(path.join(__dirname, 'fixtures', 'README.md')));
                },
                "returns a 200": status(200),
                "returns the right mime-type in the header": function (err, res, body) {
                    assert.equal(res.headers['content-type'], 'text/plain');
                },
                "should write the correct attachment to disk": function (err, res, body) {
                    assert.isNull(err);
                    
                    assert.equal(
                        fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8'),
                        fs.readFileSync(path.join(__dirname, 'fixtures', 'README.md'), 'utf8')
                    );
                }
            },
            "when not found": {
                topic: function (db) {
                    var stream = db.getAttachment('attachment-not-found', 'foo.txt');
                    stream.pipe(fs.createWriteStream(path.join(__dirname, 'fixtures', 'not-found.txt')));
                    
                    stream.on('end', this.callback);
                },
                "should write the error to disk": function () {
                    var result = JSON.parse(
                        fs.readFileSync(path.join(__dirname, 'fixtures', 'not-found.txt'), 'utf8')
                    );
                    
                    assert.equal(result.reason, 'Document is missing attachment');
                }
            }
        }
    }
}).addBatch({
    "Database with no cache": {
        topic: function () {
           return new(cradle.Connection)('127.0.0.1', 5984, { cache: false }).database('pigs');
        },
        "removeAttachment()": {
            "when it exists": {
                topic: function (db) {
                    var that = this;
                    db.get('attachment-getter', function (err, doc) {
                        db.removeAttachment(doc, 'foo.txt', that.callback);
                    });
                },
                "should remove the attachment": function (err, res) {
                    assert.isNull(err);
                    assert.ok(res.ok);
                }
            },
            "when the document doesnt exist": {
                topic: function (db) {
                    db.removeAttachment({
                        id: 'YUNOEXIST',
                        rev: '2-6bb732ce2ecc7ac85567b444b10590b4'
                    }, 'foo.txt', this.callback.bind(this, null));
                },
                "should respond with the correct error": function (_, err) {
                    assert.isObject(err);
                    assert.equal(err.headers.status, 500);
                    assert.equal(err.error, '{not_found,missing}');
                }
            }
        }
    }
}).addBatch({
    "Database with cache": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, { cache: true }).database('pigs');
        },
        "removeAttachment()": {
            "when it exists": {
                topic: function (db) {
                    var that = this;
                    db.get('attachment-cacher', function (err, doc) {
                        db.removeAttachment(doc._id, 'cached/foo.txt', that.callback);
                    });
                },
                "should remove the attachment": function (err, res) {
                    assert.isNull(err);
                    assert.ok(res.ok);
                }
            },
            "when the document doesnt exist": {
                topic: function (db) {
                    db.removeAttachment({
                        id: 'YUNOEXIST',
                        rev: '2-6bb732ce2ecc7ac85567b444b10590b4'
                    }, 'foo.txt', this.callback.bind(this, null));
                },
                "should respond with the correct error": function (_, err) {
                    assert.isObject(err);
                    assert.equal(err.headers.status, 500);
                    assert.equal(err.error, '{not_found,missing}');
                }
            }
        }
    }
}).export(module);