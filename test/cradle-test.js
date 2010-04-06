var path = require('path'),
    sys = require('sys'),
    assert = require('assert'),
    events = require('events'),
    http = require('http');

require.paths.unshift(path.join(__dirname, '..', 'lib'),
                      path.join(__dirname, 'vendor', 'vows', 'lib'));

var vows = require('vows'),
    cradle = require('cradle');

function status(code) {
    return function (res) {
        assert.equal(res._headers.status, code);
    };
}

var client = http.createClient(5984, '127.0.0.1');

function r(method, url, doc) {
    var promise = new(events.EventEmitter);
    var request = client.request(method, url, {});

    if (doc) { request.write(JSON.stringify(doc)) }

    request.addListener('response', function (res) {
        var body = '';

        res.setBodyEncoding('utf8');
        res.addListener('data', function (chunk) {
            body += (chunk || '');
        }).addListener('end', function () {
            var obj, response;

            try { obj = JSON.parse(body) }
            catch (e) { return promise.emit('error', e) }

            promise.emit('success', obj);
        });
    });
    request.close();
    return promise;
}

vows.tell("Cradle", {
    setup: function () {
        ['rabbits', 'pigs','badgers'].forEach(function (db) {
            r('DELETE', '/' + db);
        });
        r('PUT', '/rabbits');
        r('PUT', '/pigs');
        r('PUT', '/pigs/_design/pigs', {
            _id: '_design/pigs', views: {
                all: { map: "function (doc) { if (doc.color) emit(doc._id, doc) }" }
            }
        });
        r('PUT', '/pigs/mike', {color: 'pink'});
        r('PUT', '/rabbits/alex', {color: 'blue'});
        r('PUT', '/pigs/bill', {color: 'blue'});
        process.loop();
    },
    "Default connection settings": {
        setup: function () {
            cradle.setup({
                host: "http://cloudhead.io",
                port: 4242,
                milk: 'white'
            });
            return new(cradle.Connection);
        },
        "should be carried on to new Connections": function (c) {
            assert.equal(c.host, "http://cloudhead.io");
            assert.equal(c.port, 4242);
            assert.equal(c.options.milk, 'white');
            assert.equal(c.options.cache, true);
        },
        "with just a {} passed to a new Connection object": {
            setup: function () { return new(cradle.Connection)({milk: 'green'}) },
            "should override the defaults": function (c) {
                assert.equal(c.options.milk, 'green');
                assert.equal(c.port, 4242);
            }
        },
        "with a host and port passed to Connection": {
            setup: function () { return new(cradle.Connection)("255.255.0.0", 9696) },
            "should override the defaults": function (c) {
                assert.equal(c.host, '255.255.0.0');
                assert.equal(c.port, 9696);
            }
        },
        "with a host and port passed as a string to Connection": {
            setup: function () { return new(cradle.Connection)("8.8.8.8:4141") },
            "should override the defaults": function (c) {
                assert.equal(c.host, '8.8.8.8');
                assert.equal(c.port, 4141);
            }
        },
        "with a host, port and options passed to Connection": {
            setup: function () { return new(cradle.Connection)("4.4.4.4", 911, {raw: true}) },
            "should override the defaults": function (c) {
                assert.equal(c.host, '4.4.4.4');
                assert.equal(c.port, 911);
                assert.equal(c.options.raw, true);
            }
        }
    },

    //
    // Cache
    //
    "A Cradle connection (cache)": {
        setup: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: true}).database('pigs');
        },
        "insert()": {
            setup: function (db) {
                var promise = new(events.EventEmitter);
                db.insert('bob', {ears: true}, function () { promise.emit('success', db) });
                return promise;
            },
            "should write through the cache": function (db) {
                assert.ok(db.cache.has('bob'));
                assert.ok(db.cache.get('bob')._rev);
            },
            "and": {
                setup: function (db) {
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
                "caches the updated document": function (res, doc) {
                    assert.ok(doc);
                    assert.equal(doc.size, 12);
                    assert.equal(doc.ears, true);
                }
            }
        },
        "remove()": {
            setup: function (db) {
                var promise = new(events.EventEmitter);
                db.insert('bruno', {}, function () {
                    promise.emit('success', db);
                });
                return promise;
            },
            "shouldn't ask for a revision": {
                setup: function (db) {
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
        }
    },
    "Connection": {
        setup: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false});
        },
        "getting server info": {
            info: function (c) { return c.info() },

            "returns a 200": status(200),
            "returns the version number": function (info) {
                assert.ok(info);
                assert.match(info.version, /\d+\.\d+\.\d+/);
            }
        },
        "getting the list of databases": {
            setup: function (c) { 
                var promise = new(events.EventEmitter);
                c.databases(function(err, res){ promise.emit('success', res); });
                return promise;
            },
            "should contain the 'rabbits' and 'pigs' databases": function (dbs) {
                assert.ok(dbs.indexOf('rabbits') >= 0 );
                assert.ok(dbs.indexOf('pigs') >= 0 );
                assert.ok(dbs instanceof Array);
            }
        },
        "create()": {
            setup: function (c) { 
                var promise = new(events.EventEmitter);
                c.database('badgers').create(function(err, res){ promise.emit('success', res); });
                return promise;
            },
            "returns a 201": status(201),
            "creates a database": {
                setup: function (res, c) { return c.database('badgers').exists() },
                "it exists": function (res) { assert.ok(res) }
            }
        },
        "destroy()": {
            setup: function (c) { 
                var promise = new(events.EventEmitter);
                c.database('rabbits').destroy(function(err, res){ promise.emit('success', res);});
                return promise;
            },
            "returns a 200": status(200),
            "destroys a database": {
                setup: function (res, c) { 
                    return c.database('rabbits').exists();
                },
                "it doesn't exist anymore": function (res) { assert.ok(! res) }
            }
        },
        "database()": {
            setup: function (c) { return c.database('pigs') },

            "info()": {
                setup: function (db) { 
                    var promise = new(events.EventEmitter);
                    db.info(function(err, res){ promise.emit('success', res);});
                    return promise;
                },
                "returns a 200": status(200),
                "returns database info": function (info) {
                    assert.equal(info['db_name'], 'pigs');
                }
            },
            "fetching a document by id (GET)": {
                setup: function (db) { return db.get('mike') },
                "returns a 200": status(200),
                "returns the document": function (res) {
                    assert.equal(res.id, 'mike');
                }
            },
            "insert()": {
                "with an id & doc": {
                    setup: function (db) {
                        return db.insert('joe', {gender: 'male'});
                    },
                    "creates a new document (201)": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                    }
                },
                "with a '_design' id": {
                    setup: function (_, db) {
                        return db.insert('_design/horses', {
                            all: {
                                map: function (doc) {
                                    if (doc.speed == 72) emit(null, doc);
                                }
                            }
                        });
                    },
                    "creates a doc (201)": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                    },
                    "creates a design doc": {
                        setup: function (res, _, db) {
                            return db.view('horses/all');
                        },
                        "which can be queried": status(200)
                    }
                },
                "without an id (POST)": {},
            },
            "calling insert() with an array": {
                setup: function (db) {
                    return db.insert([{_id: 'tom'}, {_id: 'flint'}]);
                },
                "returns an array of document ids and revs": function (res) {
                    assert.equal(res[0].id, 'tom');
                    assert.equal(res[1].id, 'flint');
                },
                "should bulk insert the documents": {
                    setup: function (res, db) {
                        var promise = new(events.EventEmitter);
                        db.get('tom', function (e, tom) {
                            db.get('flint', function (e, flint) {
                                promise.emit('success', tom, flint);
                            });
                        });
                        return promise;
                    },
                    "which can then be retrieved": function (tom, flint) {
                        assert.ok(tom._id);
                        assert.ok(flint._id);
                    }
                }
            },
            "calling insert() with multiple documents": {
                setup: function (db) {
                    return db.insert({_id: 'pop'}, {_id: 'cap'}, {_id: 'ee'});
                },
                "returns an array of document ids and revs": function (res) {
                    assert.equal(res[0].id, 'pop');
                    assert.equal(res[1].id, 'cap');
                    assert.equal(res[2].id, 'ee');
                }
            },
            "getting all documents": {
                setup: function (db) {
                    var promise = new(events.EventEmitter);
                    db.all(function(err, res){ promise.emit('success', res);});
                    return promise;
                },
                "returns a 200": status(200),
                "returns a list of all docs": function (res) {
                    assert.ok(res.rows);
                }
            },
            "updating a document (PUT)": {
                setup: function (db) {
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
                setup: function (db) {
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
                setup: function (db) {
                    var promise = new(events.EventEmitter);
                    db.view('pigs/all', function(err, res){ promise.emit('success', res); });
                    return promise;
                },
                "returns a 200": status(200),
                "returns view results": function (res) {
                    assert.ok(res.rows);
                    assert.equal(res.rows.length, 2);
                    assert.equal(res.total_rows, 2);
                },
                "returns an iterable object": function (res) {
                    res.forEach(function (k, v) {
                        assert.ok(v);
                        assert.ok(k === 'mike' || k === 'bill');
                    });
                },
                "with options": {

                },
                "with a start & end key": {

                }
            }
        }
    }
});
