var cradle = require('../../');

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
