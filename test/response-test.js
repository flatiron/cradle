var path = require('path'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs'),
    vows = require('vows');

var cradle = require('../lib/cradle');
var document = { _rev: '2-76be', _id: 'f6av8', name: 'buzz', age: 99 };

var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

var extend = function (o, key, value) {
    var result = clone(o);
    result[key] = value;
    return result;
};

vows.describe('cradle/response').addBatch({
    'A cradle.Response instance': {
        'from a document': {
            topic: new(cradle.Response)(document),

            'should only have the original keys': function (topic) {
                assert.lengthOf  (Object.keys(topic), 4);
                assert.equal     (topic.name, 'buzz');
                assert.equal     (topic.age, 99);
                assert.deepEqual (document, topic);
            },
            'should own the keys': function (topic) {
                assert.include (topic, 'name');
                assert.include (topic, 'age');
            },
            'should return the original document, when `json` is called': function (topic) {
                assert.isObject    (topic.json);
                assert.deepEqual   (topic.json, document);
                assert.isUndefined (topic.json.json);
                assert.isUndefined (topic.headers);
                assert.lengthOf    (Object.keys(topic.json), 4);
            },
            'when using a `for .. in` loop, should only return the original keys': function (topic) {
                var keys = [];
                for (var k in topic) { keys.push(k) }

                assert.lengthOf (keys, 4);
                assert.include  (keys, 'name');
                assert.include  (keys, 'age');
            },
            'should stringify': function (topic) {
                var expected = JSON.stringify(document);
                assert.equal (topic.toString(),      expected);
                assert.equal (JSON.stringify(topic), expected);
            },
            'should respond to both `id` and `_id`': function (topic) {
                assert.equal (topic.id,  'f6av8');
                assert.equal (topic._id, 'f6av8');
            },
            'should respond to both `rev` and `_rev`': function (topic) {
                assert.equal (topic.rev,  '2-76be');
                assert.equal (topic._rev, '2-76be');
            },
            'should have Response as its constructor': function (topic) {
                assert.equal (topic.constructor, cradle.Response);
            },
            'when modifying & adding keys': {
                topic: function (response) {
                    response.hair = 'blue';
                    response.age = 88;
                    return response;
                },
                'should return the modified document with toJSON': function (response) {
                    var json = JSON.parse(JSON.stringify(response));
                    assert.equal(json.age, 88);
                    assert.equal(json.hair, 'blue');
                }
            }
        }
    },

    'A tricky cradle.Response instance': {
        'from a document with an id property': {
            topic: new(cradle.Response)(extend(document, 'id', '10009')),

            'should have preserved the original id value': function (topic) {
                assert.equal(topic.id, '10009');
            },

            'should keep the id property enumerable': function (topic) {
                assert(Object.keys(topic).indexOf('id') >= 0);
            }
        }
    }
}).export(module);
