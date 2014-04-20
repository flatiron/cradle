var assert = require('assert'),
    vows = require('vows');

var cradle = require('../lib/cradle');

vows.describe('cradle/errors').addBatch({
    'A cradle.CouchError instance': {
        topic: new(cradle.CouchError)({
            'error': 'not_found',
            'reason': 'no_db_file'
        }),
        'should be a instanceOf `Error`': function(err) {
            assert.instanceOf(err, Error);
        },
        'shold be throwable': function(err) {
            assert.throws(function() {
                throw err;
            },
            function(err){
                return err.message === 'not_found: no_db_file';
            });
        },
        'should have a `error` key of type string`': function(err) {
            assert.equal('string', typeof err.error);
        },
        'should have a reason` key of type `string`': function(err) {
            assert.equal('string', typeof err.error);
        }
    }
}).export(module);