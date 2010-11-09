var path = require('path');

require.paths.unshift(path.join(__dirname, 'cradle'));

var sys = require("sys"),
   http = require("http"),
 events = require('events'),
     fs = require("fs"),
    url = require('url');

var querystring = require('querystring');
var Args = require('vargs').Constructor;

var cradle = exports;

cradle.Response = require('response').Response;
cradle.Cache    = require('cache').Cache;

cradle.host = '127.0.0.1';
cradle.port = 5984;
cradle.options = {
    cache: true,
    raw: false,
};

cradle.setup = function (settings) {
    this.host = settings.host;
    this.port = parseInt(settings.port);
    cradle.merge(this.options, settings);

    return this;
};

cradle.Connection = function Connection(/* variable args */) {
    var args = Array.prototype.slice.call(arguments),
        host, port, remote, auth, options = {};

    if (typeof(args[0]) === 'string') {
        remote = args[0].replace('http://', '').split(':');
        host = remote[0];
        port = parseInt(remote[1]);
    }

    // An options hash was passed
    if (args.length === 1 && typeof(args[0]) === 'object') {
        options = args[0];
        host = options.host;
        port = parseInt(options.port);
        auth = options.auth;
    // The host and port were passed separately
    } else if (args.length >= 2) {
        host = args[0];
        port = parseInt(args[1]);
        options = args[2] || {};
    }

    this.host = host || cradle.host;
    this.port = port || cradle.port;
    this.auth = auth || cradle.auth;
    this.options = cradle.merge({}, cradle.options, options);

    this.socket = http.createClient(this.port, this.host);
};

//
// Connection.rawRequest()
//
//      This is a base wrapper around connections to CouchDB. Given that it handles
//      *all* requests, including those for attachments, it knows nothing about
//      JSON serialization and does not presuppose it is sending or receiving JSON
//      content
//
cradle.Connection.prototype.rawRequest = function (method, path, options, data, headers) {
    var promise = new(events.EventEmitter), request, that = this;

    // HTTP Headers
    headers = cradle.merge({ host: this.host }, headers || {});

    // Set HTTP Basic Auth
    if (this.auth) {
      headers['Authorization'] = "Basic " + new Buffer(this.auth.user + ':' + this.auth.pass).toString('base64');
    }

    path = (path || '/').replace('http://','').replace(/\/{2,}/g, '/');
    if (path.charAt(0) !== '/') { path = '/' + path }

    if (options) {
        for (var k in options) {
            if (typeof(options[k]) === 'boolean') {
                options[k] = String(options[k]);
            }
        }
        path += '?' + querystring.stringify(options);
    }

    request = this.socket.request(method.toUpperCase(), path, headers);

    if (data && data.addListener) { headers['Transfer-Encoding'] = 'chunked' }

    request.on('response', function (res) {
        promise.emit('response', res);
        res.on('data', function (chunk) { promise.emit('data', chunk) });
        res.on('end',  function () { promise.emit('end') });
    });

    if (data) {
        if (data.addListener) {
            data.on('data', function (chunk) { request.write(chunk) });
            data.on('end', function () { request.end() });
        } else {
            request.write(data, 'utf8');
            request.end();
        }
    } else {
        request.end();
    }

    return promise;
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
        headers["Content-Length"] = data.length;
        headers["Content-Type"]   = "application/json";
    }

    request = this.rawRequest(method, path, options, data, headers);

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
            var obj, response;

            if (method === 'HEAD') {
                callback(null, res.headers, res.statusCode);
            } else {
                try { obj = JSON.parse(body.join('')) }
                catch (e) { return callback(e) }

                // If the `raw` option was set, we return the parsed
                // body as-is. If not, we wrap it in a `Response` object.
                if (that.options.raw) {
                    response = obj;
                } else {
                    response = new(cradle.Response)(obj, res);
                }
                callback((response.error && response.json) || null, response);
            }
        });
    });
};

//
// The database object
//
//      We return an object with database functions,
//      closing around the `name` argument.
//
cradle.Connection.prototype.database = function (name) {
    var that = this;

    return {
        name: name,
        //
        // The database document cache.
        //
        cache: new(cradle.Cache)(that.options),

        // A wrapper around `Connection.request`,
        // which prepends the database name.
        query: function (method, path /* [options], [data], [headers], [callback] */) {
            var args = Array.prototype.slice.call(arguments, 2);
            that.request.apply(that, [method, [name, path].join('/')].concat(args));
        },
        exists: function (callback) {
            this.query('GET', '/', function (err, res) {
                if (err) {
                    if (res.headers.status === 404) {
                        callback(null, false);
                    } else {
                        callback(err, res);
                    }
                } else {
                    callback(null, true);
                }
            });
        },

        // Fetch either a single document from the database, or cache,
        // or multiple documents from the database.
        // If it's a single doc from the db, attempt to save it to the cache.
        get: function (id, rev) {
            var that = this, options = null,
                args = new(Args)(arguments);

            if (Array.isArray(id)) { // Bulk GET
                this.query('POST', '/_all_docs', { include_docs: true }, { keys: id },
                           function (err, res) { args.callback(err, res) });
            } else {
                if (rev && args.length === 2) {
                    if      (typeof(rev) === 'string') { options = { rev: rev } }
                    else if (typeof(rev) === 'object') { options = rev }
                } else if (this.cache.has(id)) {
                    return args.callback(null, this.cache.get(id));
                }
                this.query('GET', id, options, function (err, res) {
                    if (! err) that.cache.save(res.id, res.json);
                    args.callback(err, res);
                });
            }
        },

        save: function (/* [id], [rev], doc */) {
            var id, doc = {}, cached, that = this, args = new(Args)(arguments);

            // PUT a single document, with an id
            if (typeof(args.first) === 'string') {
                doc = args.last;
                doc._id = id = args.first;

                // Try to set the '_rev' attribute of the document.
                // If it wasn't passed, attempt to retrieve it from the cache.
                if (typeof(args.at(1)) === 'string') {
                    doc._rev = args.at(1);
                } else if (doc._rev || this.cache.has(id)) {
                    doc = cradle.merge({}, this.cache.get(id), doc);
                } else {
                    throw new(Error)("Couldn't save without a _rev");
                }
                this.insert(doc, args.callback);
            } else {
               this.insert.apply(arguments);
            }
        },

        put: function (id, doc, callback) {
            var cache = this.cache;
            if (typeof(id) !== 'string') { throw new(TypeError)("id must be a string") }
            this.query('PUT', id, null, doc, function (e, res) {
                if (! e) { cache.save(id, cradle.merge({}, doc, { _rev: res.rev })) }
                callback && callback(e, res);
            });
        },

        head: function (id, callback) {
            this.query('HEAD', id, null, callback);
        },

        insert: function (/* [id], doc, ... */) {
            var id, doc = {}, that = this, args = new(Args)(arguments);

            // PUT a single document, with an id
            if (typeof(args.first) === 'string') {
                id = args.first;
                // Design document
                if (/^_design\/\w+$/.test(id)) {
                    doc.language = "javascript";
                    doc.views = args.last;
                } else {
                    doc = args.last;
                }
                this.query('PUT', id, null, doc, writeThrough);

            // PUT or POST a single document
            } else if (args.length === 1 && !Array.isArray(args.first)) {
                doc = args.first;
                id = doc._id;
                if (id) {
                    this.query('PUT', id, null, doc, writeThrough);
                } else {
                    this.query('POST', '/', null, doc, writeThrough);
                }

            // Bulk insert
            } else {
                if (Array.isArray(args.first)) {
                    doc = {docs: args.first};
                    if (args.at(1) === true) { doc.all_or_nothing = true }
                } else {
                    doc = {docs: args.all};
                }
                this.query('POST', '/_bulk_docs', {}, doc, function (err, res) {
                    args.callback(err, res);
                });
            }

            function writeThrough(err, res) {
                if (! err) { that.cache.save(id, cradle.merge({}, doc, { _rev: res.rev })) }
                args.callback(err, res);
            }
        },

        // Destroys a database with 'DELETE'
        // we raise an exception if arguments were supplied,
        // as we don't want users to confuse this function with `remove`.
        destroy: function (callback) {
            if (arguments.length > 1) {
                throw new(Error)("destroy() doesn't take any additional arguments");
            } else {
                this.query('DELETE', '/', callback);
            }
        },

        // Delete a document
        // if the _rev wasn't supplied, we attempt to retrieve it from the
        // cache. If the deletion was successful, we purge the cache.
        remove: function (id, rev) {
            var that = this, doc, args = new(Args)(arguments);

            if (typeof(rev) !== 'string') {
                if (doc = this.cache.get(id)) { rev = doc._rev }
                else                          { throw new(Error)("rev needs to be supplied") }
            }
            this.query('DELETE', id, {rev: rev}, function (err, res) {
                if (! err) { that.cache.purge(id) }
                args.callback(err, res);
            });
        },
        create: function (callback) {
            this.query('PUT', '/', callback);
        },
        info: function (callback) {
            this.query('GET', '/', callback);
        },
        all: function (options, callback) {
            if (arguments.length === 1) { callback = options, options = {} }
            this.query('GET', '/_all_docs', options, callback);
        },
        compact: function (design) {
            this.query('POST', '/_compact' + (typeof(design) === 'string' ? '/' + design : ''),
                       Args.last(arguments));
        },
        viewCleanup: function (callback) {
            this.query('POST', '/_view_cleanup', callback);
        },
        allBySeq: function (options) {
            options = typeof(options) === 'object' ? options : {};
            this.query('GET', '/_all_docs_by_seq', options, Args.last(arguments));
        },

        // Query a view, passing any options to the query string.
        // Some query string parameters' values have to be JSON-encoded.
        view: function (path, options) {
            var args = new(Args)(arguments);
            path = path.split('/');

            if (typeof(options) === 'object') {
                ['key', 'startkey', 'endkey'].forEach(function (k) {
                    if (k in options) { options[k] = JSON.stringify(options[k]) }
                });
            }
            this.query('GET', ['_design', path[0], '_view', path[1]].join('/'), options, args.callback);
        },

        push: function (doc) {},

        saveAttachment: function (docOrId, attachmentName, contentType, dataOrStream) {
            var rev, id, doc, pathname, headers = {}, response, body = '', resHeaders, error, db = this;
            var args = new(Args)(arguments);

            if (typeof(docOrId) === 'string') {
                id = docOrId;
                doc = db.cache.get(id);
                if (doc) { rev = {rev: doc._rev}; }
            } else {
                id = docOrId._id;
                if (docOrId._rev) {
                    rev = { rev: docOrId._rev };
                } else { rev = {} }
            }

            pathname = '/' + [name, id, attachmentName].join('/');
            headers['Content-Type'] = contentType;

            that.rawRequest('PUT', pathname, rev, dataOrStream, headers)
                .on('response', function (res) { resHeaders = { status: res.statusCode } })
                .on('data', function (chunk) { body += chunk })
                .on('end', function () {
                    response = JSON.parse(body);
                    response.headers = resHeaders;

                    if (response.headers.status == 201 && db.cache.has(id)) {
                        cached = db.cache.store[id].document;
                        cached._rev = response.rev;
                        cached._attachments = cached._attachments || {};
                        cached._attachments[attachmentName] = {
                            content_type: contentType,
                            stub: true,
                            revpos: parseInt(response.rev.match(/^\d+/)[0])
                        };
                    }
                    args.callback(null, response);
                });
        },

        getAttachment: function(docId, attachmentName) {
            var pathname, req;
            pathname = '/' + [name, docId, attachmentName].join('/');
            return that.rawRequest('GET', pathname);
        }
    }

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
