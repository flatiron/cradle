var path = require('path'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs'),
    vows = require('vows');

function status(code) {
    return function (e, res) {
        assert.ok(res || e);
        assert.equal((res || e).headers.status || (res || e).status, code);
    };
}

var cradle = require('../lib/cradle');

vows.describe('cradle/database/cache').addBatch({
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
}).export(module);