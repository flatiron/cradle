var path = require('path');

require.paths.unshift(path.join(__dirname, 'cradle'));

var sys = require("sys"),
   http = require("http"),
   https = require("https"),
 events = require('events'),
     fs = require("fs"),
    url = require('url'),
 buffer = require('buffer');

var querystring = require('querystring');

var cradle = exports;

cradle.extend   = require('response').extend;
cradle.Database = require('database').Database;
cradle.Response = require('response').Response;
cradle.Cache    = require('cache').Cache;

cradle.host = '127.0.0.1';
cradle.port = 5984;
cradle.auth = null;
cradle.options = {
    cache: true,
    raw: false,
    timeout: 0,
    secure: false,
    headers: {}
};

cradle.setup = function (settings) {
    this.host = settings.host;
    this.auth = settings.auth;
    this.port = parseInt(settings.port);
    cradle.merge(this.options, settings);

    return this;
};

var protocolPattern = /^(https?):\/\//;

cradle.Connection = function Connection(/* variable args */) {
    var args = Array.prototype.slice.call(arguments),
        host, port, remote, auth, options = {};

    args.forEach(function (a) {
        if (typeof(a) === 'number' || (typeof(a) === 'string' && /^\d{2,5}$/.test(a))) {
            port = parseInt(a);
        } else if (typeof(a) === 'object') {
            options = a;
            host = host || options.host;
            port = port || options.port;
            auth = options.auth;
        } else {
            host = a;
        }
    });

    this.host = host || cradle.host;
    this.port = port || cradle.port;
    this.auth = auth || cradle.auth;
    this.options = cradle.merge({}, cradle.options, options);

    this.options.secure = this.options.secure || this.options.ssl;

    if (protocolPattern.test(this.host)) {
        this.protocol = this.host.match(protocolPattern)[1];
        this.host     = this.host.replace(protocolPattern, '');
    }

    if (this.protocol === 'https') this.options.secure = true;

    if (this.auth && this.auth.user) { // Deprecation warning
        console.log('Warning: "user" & "pass" parameters ignored. Use "username" & "password"');
    }
    if (this.options.ssl) { // Deprecation warning
        console.log('Warning: "ssl" option is deprecated. Use "secure" instead.');
    }

    this.socket = (this.options.secure) ? https : http;
};

//
// Connection.rawRequest()
//
//      This is a base wrapper around connections to CouchDB. Given that it handles
//      *all* requests, including those for attachments, it knows nothing about
//      JSON serialization and does not presuppose it is sending or receiving JSON
//      content
//
//      By default, the request will be attempted once. Set the `retry` option to
//      change this behavior:
//
//        `retry === 0`: don't retry
//        `retry > 0`: retry `retry` times
//        `retry < 0`: always retry
//
cradle.Connection.prototype.rawRequest = function (method, path, options, data, headers) {
    var promise = new(events.EventEmitter), request, retry, that = this;

    // Default to trying once
    retry = retry || 1;

    // HTTP Headers
    headers = headers || {};

    // Set HTTP Basic Auth
    if (this.auth) {
        headers['Authorization'] = "Basic " + new Buffer(this.auth.username + ':' + this.auth.password).toString('base64');
    }

    // Set client-wide headers
    for (var h in this.options.headers) {
        headers[h] = this.options.headers[h];
    }

    path = (path || '/').replace(/https?:\/\//, '').replace(/\/{2,}/g, '/');
    if (path.charAt(0) !== '/') { path = '/' + path }

    if (options) {
        for (var k in options) {
            if (typeof(options[k]) === 'boolean') {
                options[k] = String(options[k]);
            }
        }
        path += '?' + querystring.stringify(options);
    }

    headers['Connection'] = 'keep-alive';

    if (data && data.on) { headers['Transfer-Encoding'] = 'chunked' }

    this._rawRequest(promise, {
        host:    this.host,
        port:    this.port,
        method:  method.toUpperCase(),
        path:    path,
        headers: headers
    }, data, retry);

    return promise;
}

cradle.Connection.prototype._rawRequest = function (promise, options, data, retry) {
    var request = this.socket.request(options), that = this;

    request.on('response', function (res) {
        promise.emit('response', res);
        res.on('data', function (chunk) { promise.emit('data', chunk) });
        res.on('end',  function () { promise.emit('end') });
    });
    request.on('error', function (err) {
        if (retry-- && (
            // Hack to work around http Agent hack for no response
            err.message === 'socket hang up' ||
            // Ignore broken pipe
            err.code === 'EPIPE' ||
            // Ignore connection reset
            err.code === 'ECONNRESET'
            ))
        {
          return that._rawRequest(promise, options, data, retry);
        }
        promise.emit('error', err);
        promise.emit('end');
    });


    if (data) {
        if (data.on) {
            data.on('data', function (chunk) { request.write(chunk) });
            data.on('end', function () { request.end() });
        } else {
            request.write(data, 'utf8');
            request.end();
        }
    } else {
        request.end();
    }
}

//
// Connection.close()
//
//      Close all underlying sockets associated with the agent for the connection.
//
cradle.Connection.prototype.close = function () {
  var agent = this.socket.getAgent(this.host, this.port);
  agent.sockets.forEach(function (socket) {
      socket.end();
  });
}

//
// Connection.request()
//
//      This is the entry point for all requests to CouchDB, at this point,
//      the database name has been embed in the url, by one of the wrappers.
//
cradle.Connection.prototype.request = function (method, path, /* [options], [data], [headers] */ callback) {
    var request, that = this, args = Array.prototype.slice.call(arguments, 2);

    if (typeof(callback = args.pop()) !== 'function') {
        args.push(callback);
        callback = function () {};
    }

    var options = args.shift() || {},
        data    = args.shift() || null,
        headers = cradle.merge({ host: this.host }, args.shift() || {});

    //
    // Handle POST/PUT data. We also convert functions to strings,
    // so they can be used in _design documents.
    //
    if (data) {
        data = JSON.stringify(data, function (k, val) {
            if (typeof(val) === 'function') {
                return val.toString();
            } else { return val }
        });
        headers["Content-Length"] = Buffer.byteLength(data);
        headers["Content-Type"]   = "application/json";
    }

    if (method === "DELETE" && headers["Content-Length"] === undefined) {
        headers["Content-Length"] = 0;
    }

    request = that.rawRequest(method, path, options, data, headers);

    //
    // Initialize the request, send the body, and finally,
    // dispatch the request.
    //
    request.on('response', function (res) {
        var body = [];

        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            chunk && body.push(chunk);
        }).on('end', function () {
            var json, response;

            if (method === 'HEAD') {
                callback(null, res.headers, res.statusCode);
            } else {
                try { json = JSON.parse(body.join('')) }
                catch (e) { return callback(e) }


                if (json.error) {
                    cradle.extend(json, { headers: res.headers });
                    json.headers.status = res.statusCode;
                    callback(json);
                } else {
                    // If the `raw` option was set, we return the parsed
                    // body as-is. If not, we wrap it in a `Response` object.
                    callback(null, that.options.raw ? json : new(cradle.Response)(json, res));
                }
            }
        });
    });
    request.on('error', function(err) {
        return callback(err);
    });
};

//
// The database object
//
//      We return an object with database functions,
//      closing around the `name` argument.
//
cradle.Connection.prototype.database = function (name) {
    return new cradle.Database(this, name);
};

//
// Wrapper functions for the server API
//
cradle.Connection.prototype.databases = function (c) {
    this.request('GET', '/_all_dbs', c);
};
cradle.Connection.prototype.config = function (c) {
    this.request('GET', '/_config', c);
};
cradle.Connection.prototype.info = function (c) {
    this.request('GET', '/', c);
};
cradle.Connection.prototype.stats = function (c) {
    this.request('GET', '/_stats', c);
};
cradle.Connection.prototype.activeTasks = function (c) {
    this.request('GET', '/_active_tasks', c);
};
cradle.Connection.prototype.uuids = function (count, callback) {
    if (typeof(count) === 'function') { callback = count, count = null }
    this.request('GET', '/_uuids', count ? {count: count} : {}, callback);
};
cradle.Connection.prototype.replicate = function (options, callback) {
    this.request('POST', '/_replicate', null, options, callback);
};

cradle.merge = function (target) {
    var objs = Array.prototype.slice.call(arguments, 1);
    objs.forEach(function(o) {
        Object.keys(o).forEach(function (attr) {
            if (! o.__lookupGetter__(attr)) {
                target[attr] = o[attr];
            }
        });
    });
    return target;
}
