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

function shouldQueryView(topic, rows, total) {
    return {
        topic: topic,
        "returns a 200": status(200),
        "returns view results": function (res) {
            assert.isArray(res.rows);
            assert.equal(res.rows.length, rows.length);
            assert.equal(res.total_rows, total || rows.length);
        },
        "returns an iterable object with key/val pairs": function (res) {
            assert.isArray(res);
            assert.lengthOf(res, rows.length);
            res.forEach(function (k, v) {
                assert.isObject(v);
                assert.isString(k);
                assert.notEqual(rows.indexOf(k), -1);
            });
        },
    }
}

var cradle = require('../lib/cradle');

vows.describe('cradle/database/view').addBatch({
    "Database": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false}).database('pigs');
        },
        "querying a view": {
            "with no options": shouldQueryView(
                function (db) {
                    db.view('pigs/all', this.callback);
                },
                ['bill', 'mike', 'alex']
            ),
            "with a single key": shouldQueryView(
                function (db) {
                    db.view('pigs/all', { key: 'bill' }, this.callback);
                },
                ['bill'],
                3
            ),
            "with a startKey and endKey": shouldQueryView(
                function (db) {
                    db.view('pigs/all', { startkey: 'b', endkey: 'r' }, this.callback);
                },
                ['bill', 'mike'],
                3
            ),
            "with keys": shouldQueryView(
                function (db) {
                    db.view('pigs/all', { keys: ['mike', 'bill'] }, this.callback);
                },
                ['mike', 'bill'],
                3
            ),
            "with a `keys` body": shouldQueryView(
                function (db) {
                    db.view('pigs/all', { body: { keys: ['mike', 'bill'] } }, this.callback);
                },
                ['mike', 'bill'],
                3
            )
        },
        // same as the above test, but with a temporary view
        "querying a temporary view": {
            "with no options": shouldQueryView(
                function (db) {
                    db.temporaryView({
                        map: function (doc) {
                            if (doc.color) emit(doc._id, doc);
                        }
                    }, this.callback);
                },
                ['mike', 'bill', 'alex']
            )
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
}).addBatch({
    "Database": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false}).database('pigs');
        },
        "querying a temporary view": {
            "with a single key": shouldQueryView(
                function (db) {
                    db.temporaryView({
                        map: function (doc) {
                            if (doc.color) emit(doc._id, doc);
                        }
                    }, { key: 'mike' }, this.callback);
                },
                ['mike'],
                3
            )
        }
    }
}).addBatch({
    "Database": {
        topic: function () {
            return new(cradle.Connection)('127.0.0.1', 5984, {cache: false}).database('pigs');
        },
        "querying a temporary view": {
            "with a startKey and endKey": shouldQueryView(
                function (db) {
                    db.temporaryView({
                        map: function (doc) {
                            if (doc.color) emit(doc._id, doc);
                        }
                    }, { startkey: 'b', endkey: 'zzzz' }, this.callback);
                },
                ['mike', 'bill'],
                3
            )
        }
    }
}).export(module);