var path = require('path'),
    sys = require('sys'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs'),
    vows = require('vows'),
    seed = require('./helpers/seed');

function status(code) {
    return function (e, res) {
        assert.ok(res || e);
        assert.equal((res || e).headers.status || (res || e).status, code);
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

vows.describe("cradle").addBatch(seed.requireSeed()).addBatch({
    "Default connection settings": {
        topic: function () {
            cradle.setup({
                host: "http://cloudhead.io",
                port: 4242,
                milk: 'white'
            });
            return new(cradle.Connection);
        },
        "should be carried on to new Connections": function (c) {
            assert.equal(c.host, "cloudhead.io");
            assert.equal(c.protocol, "http");
            assert.equal(c.port, 4242);
            assert.equal(c.options.milk, 'white');
            assert.equal(c.options.cache, true);
        },
        "with just a {} passed to a new Connection object": {
            topic: function () { return new(cradle.Connection)({milk: 'green'}) },
            "should override the defaults": function (c) {
                assert.equal(c.options.milk, 'green');
                assert.equal(c.port, 4242);
            }
        },
        "with a host and port passed to Connection": {
            topic: function () { return new(cradle.Connection)("255.255.0.0", 9696) },
            "should override the defaults": function (c) {
                assert.equal(c.host, '255.255.0.0');
                assert.equal(c.port, 9696);
            }
        },
        "with a host, port and options passed to Connection": {
            topic: function () { return new(cradle.Connection)("4.4.4.4", 911, {raw: true}) },
            "should override the defaults": function (c) {
                assert.equal(c.host, '4.4.4.4');
                assert.equal(c.port, 911);
                assert.equal(c.options.raw, true);
            }
        },
        "with a host and port and protocol passed to Connection": {
            topic: function () { return new(cradle.Connection)("http://4.4.4.4", 911, {raw: true, secure: true}) },
            "should override the defaults": function (c) {
                assert.equal(c.host, '4.4.4.4');
                assert.equal(c.port, 911);
                assert.equal(c.options.raw, true);
                assert.equal(c.options.secure, true);
            }
        },
        "with a host and port passed as an object to Connection": {
            topic: function () { return new(cradle.Connection)({ host: "https://4.4.4.4", port: 911, raw: true }) },
            "should override the defaults": function (c) {
                assert.equal(c.options.secure, true);
                assert.equal(c.host, '4.4.4.4');
                assert.equal(c.port, 911);
                assert.equal(c.options.raw, true);
            }
        },
        "with a the 'https' protocol": {
            topic: function () { return new(cradle.Connection)("https://couch.io", 5984) },
            "should set 'secure' to `true`": function (c) {
                assert.equal(c.protocol, 'https');
                assert.equal(c.options.secure, true);
                assert.equal(c.host, 'couch.io');
                assert.equal(c.port, 5984);
            }
        },
    },
}).addBatch({
    //
    // Cache
    //
    "A Cradle connection (cache)": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, { cache: true }).database('pigs');
        },
        "save()": {
            topic: function (db) {
                var promise = new(events.EventEmitter);
                db.save('bob', {ears: true}, function (e, res) {
                    promise.emit("success", db);
                });
                return promise;
            },
            "should write through the cache": function (db) {
                assert.ok(db.cache.has('bob'));
                assert.ok(db.cache.get('bob')._rev);
            },
            "when fetching the cached document": {
                topic: function (db) {
                    db.get('bob', this.callback)
                },
                "document contains _id": function (e, doc) {
                    assert.equal(doc._id, 'bob');
                }
            },
            "and": {
                topic: function (db) {
                    var promise = new(events.EventEmitter);
                    db.save('bob', {size: 12}, function (e, res) {
                        promise.emit('success', res, db.cache.get('bob'));
                    });
                    return promise;
                },
                "return a 201": status(201),
                "allow an overwrite": function (res) {
                   assert.match(res.rev, /^2/);
                },
                "caches the updated document": function (e, res, doc) {
                    assert.ok(doc);
                    assert.equal(doc.size, 12);
                    assert.isUndefined(doc.ears);
                }
            }
        },
        "save() with / in id": {
            topic: function (db) {
                var promise = new(events.EventEmitter);
                db.save('bob/someotherdoc', {size: 12}, function (e, res) {
                    promise.emit('success', res, db.cache.get('bob/someotherdoc'));
                });
                return promise;
            },
            "return a 201": status(201),
            "allow an overwrite": function (res) {
               assert.match(res.rev, /^1/);
            },
            "caches the updated document": function (e, res, doc) {
                assert.ok(doc);
                assert.equal(doc.size, 12);
            }
        },
        "merge()": {
            topic: function (db) {
                var promise = new(events.EventEmitter);
                db.save('billy', {ears: true}, function (e, res) {
                    promise.emit("success", db);
                });
                return promise;
            },
            "should write through the cache": function (db) {
                assert.ok(db.cache.has('billy'));
                assert.ok(db.cache.get('billy')._rev);
            },
            "and": {
                topic: function (db) {
                    var promise = new(events.EventEmitter);
                    db.merge('billy', {size: 12}, function (e, res) {
                        promise.emit('success', res, db.cache.get('billy'));
                    });
                    return promise;
                },
                "return a 201": status(201),
                "allow an overwrite": function (res) {
                   assert.match(res.rev, /^2/);
                },
                "caches the updated document": function (e, res, doc) {
                    assert.ok(doc);
                    assert.equal(doc.size, 12);
                    assert.equal(doc.ears, true);
                }
            }
        },
        "remove()": {
            topic: function (db) {
                var promise = new(events.EventEmitter);
                db.save('bruno', {}, function (e, res) {
                    promise.emit("success", db);
                });
                return promise;
            },
            "shouldn't ask for a revision": {
                topic: function (db) {
                    var promise = new(events.EventEmitter);
                    db.remove('bruno', function () { promise.emit('success', db) });
                    return promise;
                },
                "and should purge the cache": function (db) {
                    assert.equal(db.cache.has('bruno'), false);
                },
                "and raise an exception if you use remove() without a rev": function (db) {
                    //assert.throws(db.remove('bruno'), Error);
                }
            }
        },
        "saveAttachment()": {
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
        }
    }
}).addBatch({
    "Connection": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false});
        },
        "getting server info": {
            topic: function (c) { c.info(this.callback) },

            "returns a 200": status(200),
            "returns the version number": function (info) {
                assert.ok(info);
                assert.match(info.version, /\d+\.\d+\.\d+/);
            }
        },
        "uuids()": {
            "with count": {
                topic: function (c) { c.uuids(42, this.callback) },

                "returns a 200": status(200),
                "returns an array of UUIDs": function (uuids) {
                    assert.isArray(uuids);
                    assert.length(uuids, 42);
                }
            },
            "without count": {
                topic: function (c) { c.uuids(this.callback) },

                "returns a 200": status(200),
                "returns an array of UUIDs": function (uuids) {
                    assert.isArray(uuids);
                    assert.length(uuids, 1);
                }
            }
        },
        "getting the list of databases": {
            topic: function (c) {
                c.databases(this.callback);
            },
            "should contain the 'rabbits' and 'pigs' databases": function (dbs) {
                assert.isArray(dbs);
                assert.include(dbs, 'rabbits');
                assert.include(dbs, 'pigs');
            }
        },
    }
}).addBatch({
    "Connection": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false});
        },      
        "create()": {
            topic: function (c) {
                c.database('badgers').create(this.callback);
            },
            "returns a 201": status(201),
            "creates a database": {
                topic: function (res, c) { c.database('badgers').exists(this.callback) },
                "it exists": function (res) { assert.ok(res) }
            }
        },
        "destroy()": {
            topic: function (c) {
                c.database('rabbits').destroy(this.callback);
            },
            "returns a 200": status(200),
            "destroys a database": {
                topic: function (res, c) {
                    c.database('rabbits').exists(this.callback);
                },
                "it doesn't exist anymore": function (res) { assert.ok(! res) }
            }
        },
        "database()": {
            topic: function (c) { return c.database('pigs') },

            "info()": {
                topic: function (db) {
                    db.info(this.callback);
                },
                "returns a 200": status(200),
                "returns database info": function (info) {
                    assert.equal(info['db_name'], 'pigs');
                }
            },
            "fetching a document by id (GET)": {
                topic: function (db) { db.get('mike', this.callback) },
                "returns a 200": status(200),
                "returns the document": function (res) {
                    assert.equal(res.id, 'mike');
                },
                "when not found": {
                    topic: function (_, db) { db.get('tyler', this.callback) },
                    "returns a 404": status(404),
                    "returns the error": function (err, res) {
                        assert.isObject(err);
                        assert.isObject(err.headers);
                        assert.isUndefined(res);
                    },
                }
            },
            "head()": {
                topic: function (db) { db.head('mike', this.callback) },
                "returns the headers": function (res) {
                    assert.match(res.etag, /^"\d-[a-z0-9]+"$/);
                }
            },
            "save()": {
                "with an id & doc": {
                    topic: function (db) {
                        db.save('joe', {gender: 'male'}, this.callback);
                    },
                    "creates a new document (201)": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                    }
                },
                "with a doc containing non-ASCII characters": {
                    topic: function (db) {
                        db.save('john', {umlauts: 'äöü'}, this.callback);
                    },
                    "creates a new document (201)": status(201)
                },
                "with a large doc": {
                    topic: function (db) {
                        var text = (function (s) {
                            for (var i = 0; i < 18; i++) { s += s }
                            return s;
                        })('blah');

                        db.save('large-bob', {
                            gender: 'male',
                            speech: text
                        }, this.callback);
                    },
                    "creates a new document (201)": status(201)
                },
                "with a '_design' id": {
                    topic: function (db) {
                        db.save('_design/horses', {
                            all: {
                                map: function (doc) {
                                    if (doc.speed == 72) emit(null, doc);
                                }
                            }
                        }, this.callback);
                    },
                    "creates a doc (201)": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                    },
                    "creates a design doc": {
                        topic: function (res, db) {
                            db.view('horses/all', this.callback);
                        },
                        "which can be queried": status(200)
                    }
                },
                "without an id (POST)": {},
            },
            "calling save() with an array": {
                topic: function (db) {
                    db.save([{_id: 'tom'}, {_id: 'flint'}], this.callback);
                },
                "returns an array of document ids and revs": function (res) {
                    assert.equal(res[0].id, 'tom');
                    assert.equal(res[1].id, 'flint');
                },
                "should bulk insert the documents": {
                    topic: function (res, db) {
                        var promise = new(events.EventEmitter);
                        db.get('tom', function (e, tom) {
                            db.get('flint', function (e, flint) {
                                promise.emit('success', tom, flint);
                            });
                        });
                        return promise;
                    },
                    "which can then be retrieved": function (e, tom, flint) {
                        assert.ok(tom._id);
                        assert.ok(flint._id);
                    }
                }
            },
            "getting all documents": {
                topic: function (db) {
                    db.all(this.callback);
                },
                "returns a 200": status(200),
                "returns a list of all docs": function (res) {
                    assert.isArray(res);
                    assert.isNumber(res.total_rows);
                    assert.isNumber(res.offset);
                    assert.isArray(res.rows);
                },
                "which can be iterated upon": function (res) {
                    assert.isFunction(res.forEach);
                }
            },
            "updating a document (PUT)": {
                topic: function (db) {
                    var promise = new(events.EventEmitter);
                    db.get('mike', function (err, doc) {
                        db.save('mike', doc.rev,
                            {color: doc.color, age: 13}, function (err, res) {
                            if (! err) promise.emit('success', res, db);
                            else promise.emit('error', res);
                        });
                    });
                    return promise;
                },
                "returns a 201": status(201),
                "returns the revision": function (res) {
                    assert.ok(res.rev);
                    assert.match(res.rev, /^2/);
                },
            },
            "deleting a document (DELETE)": {
                topic: function (db) {
                    var promise = new(events.EventEmitter);
                    db.get('bill', function (e, res) {
                        db.remove('bill', res.rev, function (e, res) {
                            promise.emit('success', res);
                        });
                    });
                    return promise;
                },
                "returns a 200": status(200)
            },
            "querying a view": {
                topic: function (db) {
                    db.view('pigs/all', this.callback);
                },
                "returns a 200": status(200),
                "returns view results": function (res) {
                    assert.isArray(res.rows);
                    assert.equal(res.rows.length, 2);
                    assert.equal(res.total_rows, 2);
                },
                "returns an iterable object with key/val pairs": function (res) {
                    assert.isArray(res);
                    assert.length(res, 2);
                    res.forEach(function (k, v) {
                        assert.isObject(v);
                        assert.isString(k);
                        assert.ok(k === 'mike' || k === 'bill');
                    });
                },
                "with options": {

                },
                "with a start & end key": {

                }
            },
            // same as the above test, but with a temporary view
            "querying a temporary view": {
                topic: function (db) {
                    db.temporaryView({
                        map: function (doc) {
                            if (doc.color) emit(doc._id, doc);
                        }
                    }, this.callback);
                },
                "returns a 200": status(200),
                "returns view results": function (res) {
                    assert.isArray(res.rows);
                    assert.equal(res.rows.length, 2);
                    assert.equal(res.total_rows, 2);
                },
                "returns an iterable object with key/val pairs": function (res) {
                    assert.isArray(res);
                    assert.length(res, 2);
                    res.forEach(function (k, v) {
                        assert.isObject(v);
                        assert.isString(k);
                        assert.ok(k === 'mike' || k === 'bill');
                    });
                },
                "with options": {

                },
                "with a start & end key": {

                }
            },
            "putting an attachment": {
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
            },
            "getting an attachment": {
                "when it exists": {
                    topic: function (db) {
                        var promise = new(events.EventEmitter), response = {};
                        doc = {_id:'attachment-getter', _attachments:{ "foo.txt":{content_type:"text/plain", data:"aGVsbG8gd29ybGQ="} }};
                        db.save(doc, function (e, res) {
                            var streamer = db.getAttachment('attachment-getter','foo.txt');
                            streamer.addListener('response', function (res) {
                                response.headers = res.headers;
                                response.headers.status = res.statusCode;
                                response.body = "";
                            });
                            streamer.addListener('data', function (chunk) { response.body += chunk; });
                            streamer.addListener('end', function () { promise.emit('success', response); });
                        });
                        return promise;
                    },
                    "returns a 200": status(200),
                    "returns the right mime-type in the header": function (res) {
                        assert.equal(res.headers['content-type'], 'text/plain');
                    },
                    "returns the attachment in the body": function (res) {
                        assert.equal(res.body, "hello world");
                    }
                },
                "when not found": {
                    topic: function (db) {
                        var promise = new(events.EventEmitter), response = {};
                        db.save({_id:'attachment-not-found'}, function (e, res) {
                            var streamer = db.getAttachment('attachment-not-found','foo.txt');
                            streamer.addListener('response', function (res) {
                                response.headers = res.headers;
                                response.headers.status = res.statusCode;
                                promise.emit('success', response);
                            });
                        });
                        return promise;
                    },
                    "returns a 404": status(404)
                }
            },
            "cleaning up a view with viewCleanup()": {
              topic: function (db) {
                db.viewCleanup(this.callback);
              },
              "returns a 202": status(202),
              "no error is thrown and we get ok response": function (e, res) {
                assert.ok(!e);
                assert.ok(res && res.ok && res.ok === true);
              }
            }
        }
    }
}).export(module);
