var querystring = require('querystring'),
    Args = require('vargs').Constructor,
    cradle = require('../../cradle');

var Database = exports.Database = function (name, connection) {
    this.connection = connection;
    this.name = encodeURIComponent(name);
    this.cache = new (cradle.Cache)(connection.options);
};

// A wrapper around `Connection.request`,
// which prepends the database name.
Database.prototype.query = function (options, callback) {
    options.path = [this.name, options.path].filter(Boolean).join('/');
    return this.connection.request(options, callback);
};

Database.prototype.exists = function (callback) {
    this.query({ method: 'HEAD' }, function (err, res, status) {
        if (err) {
            callback(err);
        } else {
            if (status < 200 || status > 300) {
                callback(null, false);
            } else {
                callback(null, true);
            }
        }
    });
};

Database.prototype.replicate = function (target, options, callback) {
    if (typeof(options) === 'function') { callback = options, options = {} }
    this.connection.replicate(cradle.merge({ source: this.name, target: target }, options), callback);
};

Database.prototype.info = function (callback) {
    this.query({ method: 'GET' }, callback);
};

Database.prototype.create = function (callback) {
    this.query({ method: 'PUT' }, callback);
};

// Destroys a database with 'DELETE'
// we raise an exception if arguments were supplied,
// as we don't want users to confuse this function with `remove`.
Database.prototype.destroy = function (callback) {
    if (arguments.length > 1) {
        throw new(Error)("destroy() doesn't take any additional arguments");
    } 
    
    this.query({
        method: 'DELETE', 
        path: '/', 
    }, callback);    
};

//
// Extend the Database prototype with Couch features
//
require('./attachments');
require('./changes');
require('./documents');
require('./views');