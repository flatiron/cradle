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

vows.describe('cradle/connection').addBatch({
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
        "with the port as part of the URL": {
            topic: function () { return new(cradle.Connection)("https://couch.io:418") },
            "should read the port from the URL": function (c) {
                assert.equal(c.protocol, 'https');
                assert.equal(c.options.secure, true);
                assert.equal(c.host, 'couch.io');
                assert.equal(c.port, 418);
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
                    assert.lengthOf(uuids, 42);
                }
            },
            "without count": {
                topic: function (c) { c.uuids(this.callback) },

                "returns a 200": status(200),
                "returns an array of UUIDs": function (uuids) {
                    assert.isArray(uuids);
                    assert.lengthOf(uuids, 1);
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
            "with no / in the name": {
                topic: function (c) {
                    c.database('badgers').create(this.callback);
                },
                "returns a 201": status(201),
                "creates a database": {
                    topic: function (res, c) { c.database('badgers').exists(this.callback) },
                    "it exists": function (res) { assert.ok(res) }
                }
            },
            "with a / in the name": {
                topic: function (c) {
                    c.database('madeup/ewoks').create(this.callback);
                },
                "returns a 201": status(201),
                "creates a database": {
                    topic: function (res, c) { c.database('madeup/ewoks').exists(this.callback) },
                    "it exists": function (res) { assert.ok(res) }
                }
                
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
        }
    }
}).export(module);