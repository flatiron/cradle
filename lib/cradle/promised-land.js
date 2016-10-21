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

