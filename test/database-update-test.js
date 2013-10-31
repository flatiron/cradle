var path = require('path'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs'),
    vows = require('vows'),
    macros = require('./helpers/macros');

function shouldCallUpdate(path, id, options, originalInput) {
    return {
        topic: function(db) { db.update(path, id, options, this.callback) }
        ,
        "returns a 200/201": macros.status(id? 200 : 201),
        "defines a document id": function(res) {
            assert.ok(res.id);
        },
        "correctly parses body/form input": function(res) {
            assert.ok(res.inputType)
            assert.ok(res.parsedInput);
            assert.deepEqual(res.parsedInput, originalInput);
        }
    }
}

function shouldUpdateDocument(id, value) {
    return {
        topic: function(res) {
            db.get(id? id:res.id, this.callback);
        }
        ,
        "updates document correctly": function(doc) {
            assert.ok(doc);
        }
    }
}

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


vows.describe('cradle/database').addBatch(
    macros.database({
        "update() on void document": {
            "passing a flat(untyped) object as form": shouldCallUpdate('pigs/parsing', null, {form: flatObject}, flatObject),
            "passing a flat object in the body": shouldCallUpdate('pigs/parsing', null, {body: fullObject}, fullObject),
            "passing a full object in the body": shouldCallUpdate('pigs/parsing', null, {body: fullObject}, fullObject)
        }/*,
        "update() on existing document": {
            "passing options.body": shouldCallUpdate('pigs/jsonUpdate', 'mike', {body: object}, object),
            "passing options.form": shouldCallUpdate('pigs/formUpdate', 'bill', {form: object}, object)
        }*/
    })
).export(module);
