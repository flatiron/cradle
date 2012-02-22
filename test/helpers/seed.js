var assert = require('assert'),
    fs = require('fs'),
    path = require('path'),
    async = require('async'),
    request = require('request');
    
var databases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'databases.json'), 'utf8'));

var seed = exports;

seed.createDatabase = function (name, callback) {
  request({
    method: 'PUT',
    url: 'http://127.0.0.1:5984/' + encodeURIComponent(name)
  }, callback);
};

seed.deleteDatabase = function (name, callback) {
  request({
    method: 'DELETE',
    url: 'http://127.0.0.1:5984/' + encodeURIComponent(name)
  }, callback);
};

seed.seedDatabase = function (name, callback) {
  console.log('Seeding ' + name);
  seed.deleteDatabase(name, function (err, res, body) {
    if (!databases[name]) {
      return callback(err);
    }
    
    function putDoc (doc, next) {
      request({
        method: 'PUT',
        url: 'http://127.0.0.1:5984/' + encodeURIComponent(name) + '/' + doc._id,
        body: JSON.stringify(doc)
      }, next);
    }
    
    seed.createDatabase(name, function () {
      async.forEach(databases[name], putDoc, callback);
    });
  });
};

seed.requireSeed = function () {
  return {
    "Tests require database seeding": {
      topic: function () {
        async.forEach(Object.keys(databases), seed.seedDatabase, this.callback)
      },
      "should respond with no errors": function (err) {
        assert.isTrue(!err);
      }
    }
  }
};

if (!module.parent) {
    async.forEachSeries(Object.keys(databases), seed.seedDatabase, function (err) {
        return err 
            ? console.log('Error seeding database: ' + err.message)
            : console.log('Database seed completed.');
    });
}