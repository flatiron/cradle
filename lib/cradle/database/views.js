var querystring = require('querystring'),
    Args = require('vargs').Constructor,
    cradle = require('../../cradle'),
    Database = require('./index').Database;

Database.prototype.all = function (options, callback) {
    if (arguments.length === 1) { 
      callback = options; 
      options = {};
    }
    
    return this._getOrPostView('/_all_docs', options, callback);
};

// Query a view, passing any options to the query string.
// Some query string parameters' values have to be JSON-encoded.
Database.prototype.view = function (path, options) {
    var callback = new(Args)(arguments).callback,
        body;

    path = path.split('/');
    path = ['_design', path[0], '_view', path[1]].map(querystring.escape).join('/');

    return this._getOrPostView(path, options, callback);
};

Database.prototype.temporaryView = function (doc, options, callback) {
    if (!callback && typeof options === 'function') {
        callback = options;
        options = null;
    }
    
    if (options && typeof options === 'object') {
        ['key', 'keys', 'startkey', 'endkey'].forEach(function (k) {
            if (k in options) { options[k] = JSON.stringify(options[k]) }
        });
    }
    
    return this.query({
        method: 'POST', 
        path: '_temp_view',
        query: options,
        body: doc
    }, callback);
};

Database.prototype.viewCleanup = function (callback) {
    this.query({
        method: 'POST', 
        path: '/_view_cleanup', 
        headers: { 
            'Content-Type': 'application/json'
        }
    }, callback);
};

Database.prototype.compact = function (design) {
    this.query({
        method: 'POST',
        path: '/_compact' + (typeof(design) === 'string' ? '/' + querystring.escape(design) : ''),
        headers: { 
            'Content-Type': 'application/json'
        }
    }, Args.last(arguments));
};

// Query a list, passing any options to the query string.
// Some query string parameters' values have to be JSON-encoded.
Database.prototype.list = function (path, options) {
    var callback = new(Args)(arguments).callback;
        path = path.split('/');

    this._getOrPostView(
        ['_design', path[0], '_list', path[1], path[2]].map(querystring.escape).join('/'),
        options,
        callback
    );
};

//
// Helper function which parses options and makes either a `GET`
// or `POST` request to `path` depending on if `options.keys` or
// `options.body` is present.
//
Database.prototype._getOrPostView = function (path, options, callback) {
    options = parseOptions(options);
    
    if (options && options.body) {
        body = options.body;
        delete options.body;
        
        return this.query({
            method: 'POST', 
            path: path, 
            query: options,
            body: body
        }, callback);
    } 

    return this.query({
        method: 'GET', 
        path: path, 
        query: options
    }, callback);
}

//
// Helper function for parsing and stringifying complex options
// to pass to CouchDB. 
//
function parseOptions(options) {
    if (options && typeof options === 'object') {
        ['key', 'startkey', 'endkey'].forEach(function (k) {
            if (k in options) { options[k] = JSON.stringify(options[k]) }
        });
    }
    
    if (options && options.keys) {
        options.body = options.body || {};
        options.body.keys = options.keys;
        delete options.keys;
    }
    
    return options;
}
