var path = require('path'),
    sys = require('sys'),
    assert = require('assert'),
    events = require('events');

require.paths.unshift(path.join(__dirname, '..', 'lib'));

var vows = require('vows');
var cradle = require('cradle');

vows.describe('cradle/Cache').addBatch({
    'A cradle.Connection instance with a *cacheSize* specified': {
        topic: new(cradle.Connection)({ cache: true, cacheSize: 16 }),

        'should set the database cache size appropriately': function (topic) {
            assert.equal (topic.database('random').cache.size, 16);
        }
    },
    'A cradle.Cache instance with a *cacheSize* of `8`': {
        topic: new(cradle.Cache)({ cache: true, cacheSize: 8 }),

        'should be able to store 8 keys': function (cache) {
            for (var i = 0; i < 8; i++) { cache.save(i.toString(), {}) }
            assert.length (Object.keys(cache.store), 8);
        },
        'if more than 8 keys are set': {
            topic: function (cache) {
                cache.save('17af', {});
                return cache;
            },
            'there should still be 8 keys in the store': function (cache) {
                assert.length (Object.keys(cache.store), 8);
            }
        },
        'if an extra 8 keys are set': {
            topic: function (cache) {
                var that = this;
                setTimeout(function () {
                    for (var i = 1; i <= 8; i++) { cache.save((i * 10).toString(), 'extra') }
                    process.nextTick(function () {
                        that.callback(null, cache);
                    });
                }, 30);
            },
            'it should purge the initial 8 keys, and keep the new ones': function (cache) {
                Object.keys(cache.store).forEach(function (k) {
                    assert.equal (cache.store[k].document, 'extra');
                });
            }
        },
    },
    'Another cradle.Cache instance': {
        topic: new(cradle.Cache)({ cache: true, cacheSize: 8 }),
        'after setting 8 keys on it, accessing 3 of them, and adding 5 more': {
            topic: function (cache) {
                var that = this;
                for (var i = 0; i < 8; i++) { cache.save(i.toString(), { id: i.toString() }) }
                setTimeout(function () {
                    cache.get('2');
                    cache.get('5');
                    cache.get('1');
                    for (var i = 8; i < 13; i++) { cache.save(i.toString(), { id: i.toString() }) }
                    process.nextTick(function () {
                        that.callback(null, cache);
                    });
                }, 10);
            },
            'it should have the 3 accessed ones, with the 5 new ones': function (cache) {
                assert.length (Object.keys(cache.store), 8);
                assert.isTrue (cache.has('2'));
                assert.isTrue (cache.has('5'));
                assert.isTrue (cache.has('1'));
                for (var i = 8; i < 13; i++) { cache.has(i.toString()) }
            }
        }
    },
    'A cradle.Cache instance with a *cacheSize* of *1024*': {
        topic: new(cradle.Cache)({ cache: true, cacheSize: 1024 }),

        'setting 1025 keys': {
            topic: function (cache) {
                for (var i = 0; i < 1025; i++) { cache.save(i.toString(), {}); }
                return cache;
            },
            // 1025 - 1/8th of cache items pruned
            'should result in 897 keys': function (cache) {
                assert.equal (cache.keys, 897);
                assert.equal (Object.keys(cache.store).length, 897);
            }
        }

    }
}).export(module);

