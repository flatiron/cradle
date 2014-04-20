var events = require('events'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),
    http = require('http'),
    https = require('https'),
    querystring = require('querystring'),
    request = require('request');

var cradle = exports;

cradle.extend   = require('./cradle/response').extend;
cradle.Response = require('./cradle/response').Response;
cradle.Cache    = require('./cradle/cache').Cache;
cradle.Database = require('./cradle/database').Database;
cradle.CouchError = require('./cradle/errors').CouchError;

cradle.host = '127.0.0.1';
cradle.port = 5984;
cradle.auth = null;
cradle.options = {
    cache: true,
    raw: false,
    secure: false,
    retries: 0,
    retryTimeout: 10e3,
    forceSave: true,
    headers: {}
};

cradle.setup = function (settings) {
    this.host = settings.host;
    this.auth = settings.auth;
    if (settings.port) {
        this.port = parseInt(settings.port, 10);
    }
    cradle.merge(this.options, settings);

    return this;
};

var protocolPattern = /^(https?):\/\//;

cradle.Connection = function Connection(/* variable args */) {
    var args = Array.prototype.slice.call(arguments),
        options = {},
        remote,
        match,
        host, 
        port, 
        auth;

    args.forEach(function (a) {
        if (typeof(a) === 'number' || (typeof(a) === 'string' && /^\d{2,5}$/.test(a))) {
            port = parseInt(a);
        } else if (typeof(a) === 'object') {
            options = a;
            host = host || options.hostname || options.host;
            port = port || options.port;
            auth = options.auth;
        } else {
            host = a;
            
            if (match = host.match(/^(.+)\:(\d{2,5})$/)) {
                host = match[1];
                port = parseInt(match[2]);
            }
        }
    });

    if (typeof auth == "string") {
        // probaby via a url.parse()
        var userpass = auth.split(":");
        auth = {};
        auth.username = userpass[0];
        auth.password = userpass[1] || null;
    }

    this.host    = host || cradle.host;
    this.port    = port || cradle.port;
    this.auth    = auth || cradle.auth;
    this.options = cradle.merge({}, cradle.options, options);

    this.options.maxSockets = this.options.maxSockets || 20;
    this.options.secure     = this.options.secure     || this.options.ssl;

    if (protocolPattern.test(this.host)) {
        this.protocol = this.host.match(protocolPattern)[1];
        this.host     = this.host.replace(protocolPattern, '');
    }

    if (this.protocol === 'https') this.options.secure = true;

    if (!this.protocol) {
        this.protocol = (this.options.secure) ? 'https' : 'http';
    }

    if (this.auth && this.auth.user) { // Deprecation warning
        console.log('Warning: "user" & "pass" parameters ignored. Use "username" & "password"');
    }
    if (this.options.ssl) { // Deprecation warning
        console.log('Warning: "ssl" option is deprecated. Use "secure" instead.');
    }

    this.transport = (this.options.secure) ? https : http;
    this.agent = new (this.transport.Agent)({
        host: this.host,
        port: this.port
    });
    
    this.agent.maxSockets = this.options.maxSockets;
};

//
// Connection.rawRequest()
//
//      This is a base wrapper around connections to CouchDB. Given that it handles
//      *all* requests, including those for attachments, it knows nothing about
//      JSON serialization and does not presuppose it is sending or receiving JSON
//      content
//
// OLDAPI: function (method, path, options, data, headers)
// 
cradle.Connection.prototype.rawRequest = function (options, callback) {
    var promise = new(events.EventEmitter), 
        self = this;

    // HTTP Headers
    options.headers = options.headers || {};

    // Set HTTP Basic Auth
    if (this.auth) {
        options.headers['Authorization'] = "Basic " + new Buffer(this.auth.username + ':' + this.auth.password).toString('base64');
    }

    // Set client-wide headers
    Object.keys(this.options.headers).forEach(function (header) {
        options.headers[header] = self.options.headers[header];
    });
            
    if (options.query && Object.keys(options.query).length) {
        for (var k in options.query) {
            if (typeof(options.query[k]) === 'boolean') {
                options.query[k] = String(options.query[k]);
            }
        }
        options.path += '?' + querystring.stringify(options.query);
    }

    options.headers['Connection'] = options.headers['Connection'] || 'keep-alive';
    options.agent = this.agent;
    options.uri = this._url(options.path);
    delete options.path;

    return request(options, callback || function () { });
};

//
// Connection.close()
//
//      Close all underlying sockets associated with the agent for the connection.
//
cradle.Connection.prototype.close = function () {
  this.agent.sockets.forEach(function (socket) {
      socket.end();
  });
}

//
// Connection.request()
//
//      This is the entry point for all requests to CouchDB, at this point,
//      the database name has been embed in the url, by one of the wrappers.
//
cradle.Connection.prototype.request = function (options, callback) {
    var headers = cradle.merge({ host: this.host }, options.headers || {}),
        self = this;

    callback = callback || function () {};

    // HTTP Headers
    options.headers = options.headers || {};
    
    //
    // Handle POST/PUT data. We also convert functions to strings,
    // so they can be used in _design documents.
    //
    if (options.body) {
        options.body = JSON.stringify(options.body, function (k, val) {
            if (typeof(val) === 'function') {
                return val.toString();
            } else { return val }
        });
        options.headers["Content-Length"] = Buffer.byteLength(options.body);
        options.headers["Content-Type"]   = "application/json";
    }

    if (options.method === "DELETE" && !options.headers["Content-Length"]) {
        options.headers["Content-Length"] = 0;
    }

    var attempts = 0;
    return this.rawRequest(options, function _onResponse(err, res, body) {
        attempts++;
        if (err) {
            if (self.options.retries &&
              (!options.method || options.method.toLowerCase() === 'get' || options.body) &&
              String(err.code).indexOf('ECONN') === 0 && attempts <= self.options.retries
            ) {
              return setTimeout(
                  self.rawRequest.bind(self, options, _onResponse),
                  self.options.retryTimeout
              );
            }
            return callback(err);
        }
        else if (options.method === 'HEAD') {
            return callback(null, res.headers, res.statusCode);
        }
        else if (body && body.error) {
            cradle.extend(body, { headers: res.headers });
            body.headers.status = res.statusCode;
            return callback(new cradle.CouchError(body));
        }
      
        try { body = JSON.parse(body) }
        catch (err) { }
      
        if (body && body.error) {
            cradle.extend(body, { headers: res.headers });
            body.headers.status = res.statusCode;
            return callback(new cradle.CouchError(body));
        }
      
        callback(null, self.options.raw ? body : new cradle.Response(body, res));
    });
};

//
// The database object
//
//      We return an object with database functions,
//      closing around the `name` argument.
//
cradle.Connection.prototype.database = function (name) {
    return new cradle.Database(name, this)
};

//
// Wrapper functions for the server API
//
cradle.Connection.prototype.databases = function (callback) {
    this.request({ path: '/_all_dbs' }, callback);
};
cradle.Connection.prototype.config = function (callback) {
    this.request({ path: '/_config' }, callback);
};
cradle.Connection.prototype.info = function (callback) {
    this.request({ path: '/' }, callback);
};
cradle.Connection.prototype.stats = function (callback) {
    this.request({ path: '/_stats' }, callback);
};
cradle.Connection.prototype.activeTasks = function (callback) {
    this.request({ path: '/_active_tasks' }, callback);
};
cradle.Connection.prototype.uuids = function (count, callback) {
    if (typeof(count) === 'function') { 
        callback = count; 
        count = null;
    }
    
    this.request({ 
        method: 'GET', 
        path: '/_uuids', 
        query: count ? { count: count } : {}
    }, callback);
};
cradle.Connection.prototype.replicate = function (options, callback) {
    this.request({
        method: 'POST', 
        path: '/_replicate', 
        body: options
    }, callback);
};

cradle.Connection.prototype._url = function (path) {
    var url = (this.protocol || 'http') + '://' + this.host;
    if (this.port !== 443 && this.port !== 80) {
        url += ':' + this.port;
    }
    
    url += path[0] === '/' ? path : ('/' + path);
    return url;
}

cradle.escape = function (id) {
    return ['_design', '_changes', '_temp_view'].indexOf(id.split('/')[0]) === -1
        ? querystring.escape(id)
        : id;
};

cradle.merge = function (target) {
    var objs = Array.prototype.slice.call(arguments, 1);
    objs.forEach(function (o) {
        Object.keys(o).forEach(function (attr) {
            if (! o.__lookupGetter__(attr)) {
                target[attr] = o[attr];
            }
        });
    });
    return target;
};
