/*jshint node:true */

var querystring = require('querystring'),
    Args = require('vargs').Constructor,
    cradle = require('../../cradle');

var Database = exports.Database = function (name, connection) {
    this.connection = connection;
    this.name = encodeURIComponent(name);
    this.cache = new (cradle.Cache)(connection.options);
    this.cacheFeed = null;
    if (connection.options.cache === 'follow') {
       var self = this;
       this.exists(function(err, result) {
           if (result === true)
               self.configureCacheFeed();
       });
    }
};

Database.prototype.configureCacheFeed = function () {
    if (this.cacheFeed) {
        this.cacheFeed.stop();
        this.cacheFeed = null;
    }
    // For any entry already in the cache, update it if it changes
    // remotely.
    if (this.connection.options.cache === 'follow') {
        var self = this;
        this.changes(function (err, list) {
            var lastSeq = 0;
            if (list && list.length !== 0)
                lastSeq = list[list.length - 1]["seq"];
            self.cacheFeed = self.changes({ since: lastSeq, include_docs: true });
            self.cacheFeed.on('change', function (change) {
                var id = change["id"];
                if (id && 'doc' in change && self.cache.has(id))
                    self.cache.save(id, change["doc"]);
            });
        });
    }
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
    if (typeof(options) === 'function') {
        callback = options;
        options = {};
    }
    this.connection.replicate(cradle.merge({ source: this.name, target: target }, options), callback);
};

Database.prototype.info = function (callback) {
    this.query({ method: 'GET' }, callback);
};

Database.prototype.create = function (callback) {
    var self = this;
    this.query({ method: 'PUT' }, function () {
        self.configureCacheFeed();
        callback.apply(this, arguments);
    });
};

Database.prototype.maxRevisions = function (revisions, callback) {
    if (typeof(revisions) === 'function') {
        callback = revisions;
        var options = {
            method: 'GET',
            path: '_revs_limit'
        };
        options.path = [this.name, options.path].filter(Boolean).join('/');
        this.connection.rawRequest(options, function(err, res) {
            if (err) {
                return callback && callback(true, null);
            } else {
                return callback && callback(null, parseInt(res.body, 10));
            }
        });
    } else {
        this.query({
            method: 'PUT',
            path: '_revs_limit',
            body: !Number.isNaN(revisions) ? parseInt(revisions, 10) : 1000
        }, callback);
    }
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
        path: '/'
    }, callback);
};

//
// Extend the Database prototype with Couch features
//
require('./attachments');
require('./changes');
require('./documents');
require('./views');
