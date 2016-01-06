var path = require('path'),
    assert = require('assert'),
    events = require('events'),
    vows = require('vows'),
    sinon = require('sinon'),
    proxyquire = require('proxyquire');

var reqSpy = sinon.spy();
var cradle = proxyquire('../lib/cradle', {
    request: reqSpy
});

vows.describe('cradle/raw-request').addBatch({
  'Options specified in "request" are passed directly to request library': {
    topic: new(cradle.Connection)({ request: { someOption: 'filler' }}),
    'should pass through values to "request"': function(topic) {
      var args;
      var opts = {
        moreOptions: 'moreFiller',
        path: 'path'
      };
      topic.rawRequest(opts);
      args = reqSpy.getCall(0).args[0];
      assert(args.moreOptions, 'moreFiller');
      assert(args.someOption, 'filler');
    }
  }
}).export(module);
