var path = require('path'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs'),
    vows = require('vows'),
    macros = require('./helpers/macros');

var cradle = require('../lib/cradle');

var flatObject = {
    string: "Simple field",
    boolean: "false",
    number: "0"
}

var fullObject = {
    simple: "Simple field",
    complex: {
        desc: "Complex object",
        bool: false,
        number: 0
    },
    array: [
        "Array", { of: "objects" }
    ]
}

vows.describe('cradle/database/update').addBatch(
    macros.database({
        "update() handler": {
            "called with simple options": {
                topic: function(db) {
                    db.update('pigs/echo', null, flatObject, this.callback);
                }
                ,
                "receives all options as query parameters": function(req) {
                    assert.ok(req.query);
                    assert.deepEqual(req.query, flatObject);
                },
                "receives empty body string": function(res) {
                    assert.equal(res.body, '');
                },
                "receives empty form object": function(res) {
                    assert.deepEqual(res.form, {});
                }
            },
            "called with complex options": {
                topic: function(db) {
                    db.update('pigs/echo', null, fullObject, this.callback);
                }
                ,
                "receives only simple option values as query parameters": function(req) {
                    assert.ok(req.query.simple);
                    assert.equal(req.query.simple, fullObject.simple);
                },
                "receives complex options as empty query parameters": function(req) {
                    assert.equal(req.query.complex, '');
                    assert.equal(req.query.array, '');
                }
            },
            "called with a simple body option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { body:"I am the body" }, this.callback);
                }
                ,
                "receives empty request body": function(req) {
                    assert.equal(req.body, '');
                },
                "receives 'body' query parameter": function(req) {
                    assert.ok(req.query.body)
                    assert.equal(req.query.body, "I am the body");
                }
            },
            "called with a (deep) complex body option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { body:fullObject }, this.callback);
                }
                ,
                "{FAIL} receives a json-encoded body string in the request": function(req) {
                    assert.ok(req.body);
                    assert.equal(req.body, JSON.stringify(fullObject));
                },
                "receives empty 'body' query parameter": function(req) {
                    assert.ok(req.query)
                    assert.equal(req.query.body, '');
                }
            },
            "called with a simple form option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { form:"I am the form" }, this.callback);
                }
                ,
                "does not receive a parsed form object in the request": function(req) {
                    assert.deepEqual(req.form, {});
                },
                "receives 'form' query parameter": function(req) {
                    assert.ok(req.query.form)
                    assert.equal(req.query.form, "I am the form");
                }
            },
            "called with a (shallow) complex form option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { form:flatObject }, this.callback);
                }
                ,
                "{FAIL} receives a parsed form object in the request": function(req) {
                    assert.ok(req.form);
                    assert.deepEqual(req.form, flatObject);
                },
                "receives empty 'form' query parameter": function(req) {
                    assert.ok(req.query.form);
                    assert.equal(req.query.form, '');
                }
            }
        }
    })
).export(module);
