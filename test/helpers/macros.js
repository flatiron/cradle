var assert = require('assert'),
    cradle = require('../../');

var macros = exports;

macros.database = function (options, tests) {
    if (arguments.length === 1) {
        tests = options;
        options = { cache: false };
    }

    tests.topic = function () {
        return new(cradle.Connection)('127.0.0.1', 5984, options).database('pigs');
    };
    return {
        'A `cradle.Connection`': tests
    };
};

macros.status = function (code) {
    return function (e, res, body) {
        assert.ok(res || e);
        assert.equal((res || e).headers.status || (res || e).statusCode, code);
    };
};
