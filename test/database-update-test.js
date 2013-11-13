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
                "receives options as query params": function(req) {
                    assert.ok(req.query);
                    assert.deepEqual(req.query, flatObject);
                },
                "receives empty body": function(res) {
                    assert.equal(res.body, '');
                },
                "receives empty form": function(res) {
                    assert.deepEqual(res.form, {});
                }
            },
            "called with complex options": {
                topic: function(db) {
                    db.update('pigs/echo', null, fullObject, this.callback);
                }
                ,
                "does not receive parameters": function(req) {
                    assert.notDeepEqual(req.query, fullObject);
                }
            }
        }/*,
        "update() on void document": {
            "passing a flat(untyped) object as form": shouldCallUpdate('pigs/parsing', null, {form: flatObject}, flatObject),
            "passing a flat object in the body": shouldCallUpdate('pigs/parsing', null, {body: fullObject}, fullObject),
            "passing a full object in the body": shouldCallUpdate('pigs/parsing', null, {body: fullObject}, fullObject),
            "passing both a body and a form object(ignored)": shouldCallUpdate('pigs/parsing', null, {form:flatObject, body:fullObject}, fullObject)
        }/*,
        "update() on existing document": {
            "passing a flat(untyped) object as form": shouldCallUpdate('pigs/parsing', 'mike', {form: flatObject}, flatObject),
            "passing a flat object in the body": shouldCallUpdate('pigs/parsing', 'bill', {body: fullObject}, fullObject),
            "passing a full object in the body": shouldCallUpdate('pigs/parsing', 'alex', {body: fullObject}, fullObject)
        }*/
    })
).export(module);
