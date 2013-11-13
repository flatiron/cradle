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
            "called with a simple 'body' option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { body:"I am the body" }, this.callback);
                }
                ,
                "receives empty request body": function(req) {
                    assert.equal(req.body, '');
                },
                "correctly receives the option as a query parameter": function(req) {
                    assert.ok(req.query.body)
                    assert.equal(req.query.body, "I am the body");
                }
            },
            "called with a (deep) complex 'body' option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { body:fullObject }, this.callback);
                }
                ,
                "receives a json-encoded request": function(req) {
                    assert.ok(req.headers['Content-Type'] == 'application/json'
                    || req.headers['Content-type'] == 'application/json');
                },
                "correctly receives the body object in the request": function(req) {
                    assert.ok(req.body);
                    assert.deepEqual(JSON.parse(req.body), fullObject);
                },
                "receives a empty 'body' query parameter": function(req) {
                    assert.ok(req.query)
                    assert.equal(req.query.body, '');
                }
            },
            "called with a simple 'form' option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { form:"I am the form" }, this.callback);
                }
                ,
                "does not receive a parsed form object in the request": function(req) {
                    assert.deepEqual(req.form, {});
                },
                "correctly receives the options as a query parameter": function(req) {
                    assert.ok(req.query.form)
                    assert.equal(req.query.form, "I am the form");
                }
            },
            "called with a (shallow) complex 'form' option": {
                topic: function(db) {
                    db.update('pigs/echo', null, { form:flatObject }, this.callback);
                }
                ,
                "receives a x-www-form-urlencoded request": function(req) {
                    assert.ok(
                        req.headers['Content-Type'].indexOf('application/x-www-form-urlencoded') == 0
                     || req.headers['Content-type'].indexOf('application/x-www-form-urlencoded') == 0
                    );
                },
                "correctly receives the form object in the request": function(req) {
                    assert.ok(req.form);
                    assert.deepEqual(req.form, flatObject);
                },
                "receives empty 'form' query parameter": function(req) {
                    assert.equal(req.query.form, '');
                }
            }
        }
    })
).export(module);
