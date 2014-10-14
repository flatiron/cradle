var path = require('path'),
    assert = require('assert'),
    events = require('events'),
    http = require('http'),
    fs = require('fs'),
    vows = require('vows');

var cradle = require('../lib/cradle');
var document = { _rev: '2-76be', _id: 'f6av8', name: 'buzz', age: 99 };
var view = { rows: [ { key: 'key1', value: 10 }, { key: 'key2', value: 0 }, { key: 'key3', value: false } ] };

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
        },
        'from a view': {
            topic: new(cradle.Response)(view),

            'should correctly handle rows with falsy values in iterator': function (topic) {
                var values = topic.toArray();

                assert.lengthOf(values, 3);

                for (var i=0; i < values.length; i++)
                {
                    var value = values[i];
                    switch (i) {
                        case 0:
                            assert.equal(value, 10);
                            break;
                        case 1:
                            assert.equal(value, 0);
                            break;
                        case 2:
                            assert.equal(value, false);
                            break;
                    }
                }
            }
        }
    }
}).export(module);

