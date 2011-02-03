var path = require('path'),
    sys = require('sys'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs');

require.paths.unshift(path.join(__dirname, '..', 'lib'));

var vows = require('vows');
var cradle = require('cradle');

var document = { _rev: '2-76be', _id: 'f6av8', name: 'buzz', age: 99 };

vows.describe('cradle/Response').addBatch({
    'A cradle.Response instance': {
        'from a document': {
            topic: new(cradle.Response)(document),

            'should only have the original keys': function (topic) {
                assert.length    (Object.keys(topic), 4);
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
                assert.length      (Object.keys(topic.json), 4);
            },
            'when using a `for .. in` loop, should only return the original keys': function (topic) {
                var keys = [];
                for (var k in topic) { keys.push(k) }

                assert.length  (keys, 4);
                assert.include (keys, 'name');
                assert.include (keys, 'age');
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
    }
}).export(module);

