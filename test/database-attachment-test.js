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

var cradle = require('../lib/cradle');

vows.describe('cradle/database/attachments').addBatch({
    "A Cradle connection (cache)": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, { cache: true }).database('pigs');
        },
        /*"saveAttachment()": {
            "updates the cache": {
                topic: function (db) {
                    var that = this;
                    db.save({_id:'attachment-cacher'}, function (e, res) {
                        db.saveAttachment(res.id, res.rev, 'foo.txt', 'text/plain', 'Foo!', function (attRes) {
                            that.callback(null, db.cache.get(res.id));
                        });
                    });
                },
                "with the revision": function (cached) {
                    assert.match(cached._rev, /^2-/);
                },
                "with the _attachments": function (cached) {
                    assert.ok(cached._attachments);
                    assert.ok(cached._attachments['foo.txt']);
                    assert.equal(cached._attachments['foo.txt'].stub, true);
                },
                "and is valid enough to re-save": {
                    topic: function (cached, db) {
                        var that = this
                        db.save(mixin({foo:'bar'}, cached), function (e,res) {
                            db.cache.purge(cached._id);
                            db.get(cached._id, that.callback);
                        });
                    },
                    "has the attachment": function (res) {
                        var att = res._attachments['foo.txt'];
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
                    db.save({_id:'attachment-saving-pulls-rev-from-cache'}, function (e, res) {
                        db.saveAttachment(res.id, null, 'foo.txt', 'text/plain', 'Foo!', callback);
                    });
                },
                "and saves successfully": status(201)
            }
        }*/
    }
}).addBatch({
    "Database with no cache": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false}).database('pigs');
        },
        /*"putting an attachment": {
            "to an existing document": {
                "with given data": {
                    topic: function (db) {
                        var callback = this.callback;
                        db.save({_id: 'complete-attachment'}, function (e, res) {
                            db.saveAttachment(res.id, res.rev, 'foo.txt', 'text/plain', 'Foo!', callback);
                        });
                    },
                    "returns a 201": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                        assert.match(res.rev, /^2/);
                    },
                },
                "with streaming data": {
                    topic: function (db) {
                        var callback = this.callback, filestream;
                        db.save({'_id':'streaming-attachment'}, function (e, res) {
                            filestream = fs.createReadStream(__dirname + "/../README.md");
                            db.saveAttachment(res.id, res.rev, 'foo.txt', 'text/plain', filestream, callback);
                        })
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
                        db.save({_id: 'attachment-incorrect-revision'}, function (e, res) {
                            oldRev = res.rev;
                            db.save({_id: 'attachment-incorrect-revision', _rev:res.rev}, function (e, res) {
                                db.saveAttachment(res.id, oldRev, 'foo.txt', 'text/plain', 'Foo!', callback);
                            });
                        });
                    },
                    "returns a 409": status(409)
                }
            },
            "to a non-existing document": {
                topic: function (db) {
                    db.saveAttachment('standalone-attachment', 'foo.txt', 'text/plain', 'Foo!', this.callback);
                },
                "returns a 201": status(201),
                "returns the revision": function (res) {
                    assert.ok(res.rev);
                    assert.match(res.rev, /^1-/);
                }
            }
        },*/
        "getting an attachment": {
            "when it exists": {
                topic: function (db) {
                    var that = this, doc = {
                        _id:'attachment-getter', 
                        _attachments:{ 
                            "foo.txt":{
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
}).export(module);