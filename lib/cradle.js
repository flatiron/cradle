var path = require('path');

require.paths.unshift(path.join(__dirname, 'vendor'),
                      path.join(__dirname, 'cradle'));

var sys = require("sys"),
   http = require("http"),
 events = require('events'),
     fs = require("fs"),
    url = require('url');

var querystring = require('querystring');

var cradle = exports;

cradle.host = '127.0.0.1';
cradle.port = 5984;
cradle.options = {
    cache: true,
    raw: false,
};

cradle.setup = function (settings) {
    this.host = settings.host;
    this.port = parseInt(settings.port);
    process.mixin(this.options, settings);

    return this;
};

//
// Holds arguments to the public interfaces.
// It helps us deal with variable arguments,
// or ommitted callbacks.
//
function Args(arguments) {
    this.array = Array.prototype.slice.call(arguments);
    this.__defineGetter__('length', function () {
        if (this.callbackGiven()) {
            return this.array.length - 1;
        } else {
            return this.array.length;
        }
    });
    this.callbackGiven = function () {
        return typeof(this.at(-1)) === 'function';
    };
    this.at = function (n) {
        if (n < 0) {
            return this.array[this.array.length + n];
        } else {
            return this.array[n];
        }
    };
    this.__defineGetter__('all', function () {
        if (this.callbackGiven()) {
            return this.array.slice(0, -1);
        } else {
            return this.array;
        }
    });
    this.__defineGetter__('last', function () {
        if (typeof(this.at(-1)) === 'function') {
            return this.at(-2);
        } else {
            return this.at(-1);
        }
    });
    this.__defineGetter__('first', function () {
        return this.array[0];
    });
    this.callback = this.callbackGiven() ? this.at(-1)
                                         : function () {};
}
Args.last = function (args) {
    return args[args.length - 1];
};

cradle.Connection = function Connection(/* variable args */) {
    var args = Array.prototype.slice.call(arguments),
        host, port, remote, options = {};

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
    // The host and port were passed separately
    } else if (args.length >= 2) {
        host = args[0];
        port = parseInt(args[1]);
        options = args[2] || {};
    }

    this.host = host || cradle.host;
    this.port = port || cradle.port;
    this.options = process.mixin({}, cradle.options, options);

    this.socket = http.createClient(this.port, this.host);
};

//
// Connection.request()
//
//      This is the entry point for all requests to CouchDB, at this point,
//      the database name has been embed in the url, by one of the wrappers.
//
cradle.Connection.prototype.request = function (method, path, options, data, headers) {
    var promise = new(events.EventEmitter), request, that = this;

    path = (path || '/').replace('http://', '').replace(/\/{2,}/g, '/');
    if (path.charAt(0) !== '/') { path = '/' + path }

    // HTTP Headers
    headers = process.mixin({ host: this.host }, headers || {});

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
        headers["Content-Type"] = "application/json";
    }

    // Query string
    if (options) {
        for (var k in options) {
            if (typeof(options[k]) === 'boolean') {
                options[k] = String(options[k]);
            }
        }
        path += '?' + querystring.stringify(options);
    }

    //
    // Initialize the request, send the body, and finally,
    // dispatch the request.
    //
    request = this.socket.request(method.toUpperCase(), path, headers);

    if (data) { request.write(data, 'utf8') }

    request.addListener('response', function (res) {
        var body = '';

        res.setBodyEncoding('utf8');
        res.addListener('data', function (chunk) {
            body += (chunk || '');
        }).addListener('end', function () {
            var obj, response;

            try { obj = JSON.parse(body) }
            catch (e) { return promise.emitError(e) }

            // If the `raw` option was set, we return the parsed
            // body as-is. If not, we wrap it in a `Response` object.
            if (that.options.raw) {
                response = obj;
            } else {
                response = new(cradle.Response)(res, obj);
            }

            promise.emit("done", response.error || null, response);

            if (response.error) {
                promise.emit("error", response.error);
            } else {
                promise.emit("success", response);
            }
        });
    });
    request.close();

    return promise;
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
        // The database query cache.
        //
        // Each database object has its own cache store.
        // The cache.* methods are all wrappers around
        // `cache.query`, which transparently checks if
        // caching is enabled, before performing any action.
        //
        cache: {
            store: {},
            get: function (id) {
                return this.query('get', id);
            },
            save: function (id, doc) {
                return this.query('save', id, doc);
            },
            purge: function (id) {
                return this.query('purge', id);
            },
            has: function (id) {
                return this.query('has', id);
            },
            query: function (op, id, doc) {
                if (that.options.cache) {
                    switch (op) {
                        case 'has'  : return id in this.store;
                        case 'get'  : return this.store[id];
                        case 'save' : return this.store[id] = doc;
                        case 'purge': if (id) { delete(this.store[id]) }
                                      else { this.store = {} };
                                      break;
                    }
                } else { return false }
            }
        },

        // A wrapper around `Connection.request`,
        // which prepends the database name.
        query: function (method, path, options, data, headers) {
            return that.request(
                method, [name, path].join('/'), options, data, headers
            );
        },
        exists: function () {
            var promise = new(events.EventEmitter),
                args = new(Args)(arguments);

            this.query('GET', '/').addListener('done', function (err, res) {
                if (err) {
                    if (res._headers.status === 404) {
                        args.callback(null, false);
                        promise.emit("success", false);
                    } else {
                        args.callback(err, res);
                        promise.emit("error", res);
                    }
                } else {
                    args.callback(null, true);
                    promise.emit("success", true);
                }
            });
            return promise;
        },

        // Fetch a single document from the database, or cache.
        // If it's from the db, attempt to save it to the cache.
        get: function (id, rev) {
            var that = this, options = null,
                args = new(Args)(arguments);

            if (rev && args.length === 2) {
                if (typeof(rev) === 'string') { options = {rev: rev} }
                else if (typeof(rev) === 'object') { options = rev }
            } else if (this.cache.has(id)) {
                args.callback(null, this.cache.get(id));
            }

            return this.query('GET', id, options).addListener('done', function (err, res) {
                if (! err) that.cache.save(res.id, res.doc);
                args.callback(err, res);
            });
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
                    doc = process.mixin(true, {}, this.cache.get(id), doc);
                } else {
                    sys.puts(sys.inspect(doc))
                    throw new(Error)("Couldn't save without a _rev");
                }
            } else {
               this.insert.apply(arguments);
            }
            return this.insert(doc, args.callback);
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
                return this.query('PUT', id, null, doc).addListener('done', writeThrough);

            // PUT or POST a single document
            } else if (args.length === 1 && !Array.isArray(args.first)) {
                doc = args.first;
                id = doc._id;
                if (id) {
                    return this.query('PUT', id, null, doc).addListener('done', writeThrough);
                } else {
                    return this.query('POST', '/', null, doc).addListener('done', writeThrough);
                }

            // Bulk insert
            } else {
                if (Array.isArray(args.first)) {
                    doc = {docs: args.first};
                    if (args.at(1) === true) { doc.all_or_nothing = true }
                } else {
                    doc = {docs: args.all};
                }
                return this.query('POST', '/_bulk_docs', {}, doc)
                           .addListener('done', function (err, res) {
                    args.callback(err, res);
                });
            }

            function writeThrough(err, res) {
                if (! err) that.cache.save(id, process.mixin({}, doc, { _rev: res.rev }));
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
                return this.query('DELETE', '/').addListener('done', callback);
            }
        },

        // Delete a document
        // if the _rev wasn't supplied, we attempt to retrieve it from the
        // cache. If the deletion was successful, we purge the cache.
        remove: function (id, rev) {
            var that = this, doc, args = new(Args)(arguments);

            if (typeof(rev) !== 'string') {
                if (doc = this.cache.get(id)) { rev = doc._rev }
                else { throw new(Error)("rev needs to be supplied") }
            }
            return this.query('DELETE', id, {rev: rev})
                       .addListener('done', function (err, res) {
                if (! err) that.cache.purge(id);
                args.callback(err, res);
            });
        },
        create: function (c) {
            return this.query('PUT', '/').addListener('done', c);
        },
        info: function (c) {
            return this.query('GET', '/').addListener('done', c);
        },
        all: function (options) {
            return this.query('GET', '/_all_docs', typeof(options) === 'object' ? options : {})
                       .addListener('done', Args.last(arguments));
        },
        compact: function (design) {
            return this.query('POST', '/_compact' + (typeof(design) === 'string' ? '/' + design : ''))
                       .addListener('done', Args.last(arguments));
        },
        viewCleanup: function (c) {
            return this.query('POST', '/_view_cleanup').addListener('done', c);
        },
        allBySeq: function (options) {
            return this.query('GET', '/_all_docs_by_seq', options).addListener('done', c);
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
            return this.query(
                'GET', ['_design', path[0], '_view', path[1]].join('/'), options
            ).addListener('done', args.callback);
        },

        push: function (doc) {}
    }

};

//
// Wrapper functions for the server API
//
cradle.Connection.prototype.databases = function (c) {
    return this.request('GET', '/_all_dbs').addListener('done', c);
};
cradle.Connection.prototype.config = function (c) {
    return this.request('GET', '/_config').addListener('done', c);
};
cradle.Connection.prototype.info = function (c) {
    return this.request('GET', '/').addListener('done', c);
};
cradle.Connection.prototype.stats = function (c) {
    return this.request('GET', '/_stats').addListener('done', c);
};
cradle.Connection.prototype.activeTasks = function (c) {
    return this.request('GET', '/_active_tasks').addListener('done', c);
};
cradle.Connection.prototype.uuids = function (count) {
    return this.request('GET', '/_uuids', count ? {count: count} : {});
};

//
// HTTP response wrapper
//
//      It allows us to call array-like methods on documents
//      with a 'row' attribute.
//
cradle.Response = function Response(response, json) {
    var that = this;

    this._headers = {
        status: response.statusCode
    };

    this.doc = json;

    if (json instanceof Array) {
        return json;
    }

    Object.keys(json).forEach(function (k) {
        that.__defineGetter__(k, function () { return json[k] });
    });

    if (!this.id && this._id) this.id = this._id;
    if (!this.rev && this._rev) this.rev = this._rev;

    if (this.rows) {
        this.forEach = function (f) { return that.rows.forEach(f) };
        this.map = function (f) { return that.rows.map(f) };
    }
    this.toString = function () { return sys.inspect(this.doc) };
};

