'use strict';

function promisify(options, key) {
  let obj = options[key];
  return obj ? promisifyAll(obj) : undefined;
}

module.exports = function(promisifyAll, options) {
  ['cradle', 'client', 'db'].reduce(function(key, result) {
    result[key] = promisify(options, key);
    return result
  }, {})
}

// Usage
var P = require('bluebird')
const promisedLand = require('cradle/promised-land');
const promised = promisedLand(P.promisifyAll, {cradle, client, db});

// promised.db
// promised.client
// promised.cradle
