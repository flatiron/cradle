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
    var promise = new(events.Promise);
    var request = client.request(method, url, {});

    if (doc) { request.sendBody(JSON.stringify(doc)) }

    request.finish(function (res) {
        var body = '';

        res.setBodyEncoding('utf8');
        res.addListener('body', function (chunk) {
            body += (chunk || '');
        }).addListener('complete', function () {
            var obj, response;

            try { obj = JSON.parse(body) }
            catch (e) { return promise.emitError(e) }

            promise.emitSuccess(obj);
        });
    });
    return promise;
}

vows.tell("Cradle", {
    setup: function () {
        r('GET', '/_all_dbs').wait().forEach(function (db) {
            r('DELETE', '/' + db).wait();
        });
        r('PUT', '/rabbits');
        r('PUT', '/pigs').wait();
        r('PUT', '/pigs/_design/pigs', {
            _id: '_design/pigs', views: {
                all: { map: "function (doc) { if (doc.color) emit(null, doc) }" }
            }
        });
        r('PUT', '/pigs/mike', {color: 'pink'});
        r('PUT', '/pigs/bill', {color: 'blue'}).wait();
    },
    "Default connection settings": {
        setup: function () {
            cradle.setup({
                host: "http://cloudhead.io",
                port: 4242
            });
            return new(cradle.Connection);
        },
        "should be carried on to new Connections": function (c) {
            assert.equal(c.host, "http://cloudhead.io");
            assert.equal(c.port, 4242);
        }
    },
    "A Cradle connection": {
        setup: function () {
            return new(cradle.Connection)('127.0.0.1', 5984);
        },
        "queried for information": {
            setup: function (c) { return c.info() },

            "returns a 200": status(200),
            "returns the version number": function (info) {
                //sys.debug(sys.inspect(info))
                assert.ok(info);
                assert.match(info.version, /\d+\.\d+\.\d+/);
            }
        },
        "getting the list of databases": {
            setup: function (c) { return c.databases() },
            "returns an empty list": function (dbs) {
                assert.equal(dbs.length, 2);
                assert.ok(dbs instanceof Array);
            }
        },
        "create()": {
            setup: function (c) { return c.database('badgers').create() },
            "returns a 201": status(201),
            "creates a database": {
                setup: function (res, c) { return c.database('badgers').exists() },
                "it exists": function (res) { assert.ok(res) }
            }
        },
        "destroy()": {
            setup: function (c) { return c.database('rabbits').destroy() },
            "returns a 200": status(200),
            "destroys a database": {
                setup: function (res, c) { return c.database('rabbits').exists() },
                "it doesn't exist anymore": function (res) { assert.ok(! res) }
            }
        },
        "a database": {
            setup: function (c) { return c.database('pigs') },

            "info()": {
                setup: function (db) { return db.info() },
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
            "inserting a document": {
                "with an id (PUT)": {
                    setup: function (db) {
                        return db.save('joe', {gender: 'male'});
                    },
                    "returns a 201": status(201),
                    "returns the revision": function (res) {
                        assert.ok(res.rev);
                    }
                },
                "without an id (POST)": {}
            },
            "bulk inserting documents": {
            },
            "getting all documents": {
                setup: function (db) {
                    return db.all();
                },
                "returns a 200": status(200),
                "returns a list of all docs": function (res) {
                    assert.ok(res.rows);
                }
            },
            "updating a document (PUT)": {
                setup: function (db) {
                    var promise = new(events.Promise);
                    db.get('mike').addCallback(function (doc) {
                        db.save('mike', doc.rev,
                            {color: doc.color, age: 13}).addCallback(function (res) {
                            promise.emitSuccess(res); 
                        });
                    });
                    return promise;
                },
                "returns a 201": status(201),
                "returns the revision": function (res) {
                    assert.ok(res.rev);
                    assert.match(res.rev, /^2/);
                },

                "returns the updated document": function (res) {
                    //assert.equal(res.age, 13);
                }
            },
            "deleting a document (DELETE)": {
                setup: function (db) {
                    var promise = new(events.Promise);
                    db.get('bill').addCallback(function (res) {
                        db.remove('bill', res.rev).addCallback(function (res) {
                            promise.emitSuccess(res);
                        });
                    });
                    return promise;
                },
                "returns a 200": status(200)
            },
            "querying a view": {
                setup: function (db) {
                    return db.view('pigs/all');
                },
                "returns a 200": status(200),
                "returns view results": function (res) {
                    assert.ok(res.rows);
                    assert.equal(res.rows.length, 2);
                },
                "with options": {
                
                },
                "with a start & end key": {
                
                }
            }
        }
    }
});
