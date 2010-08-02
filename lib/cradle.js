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

cradle.host = '127.0.0.1';
cradle.port = 5984;
cradle.options = {
    cache: true,
    raw: false,
};

cradle.setup = function (settings) {
    this.host = settings.host;
    this.port = parseInt(settings.port);
    mixin(this.options, settings);

    return this;
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
    this.options = mixin({}, cradle.options, options);

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
    headers = mixin({ host: this.host }, headers || {});

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

    request.addListener('response', function (res) {
        promise.emit('response', res);
        res.addListener('data', function (chunk) { promise.emit('data', chunk) });
        res.addListener('end',  function () { promise.emit('end') });
    });

    if (data) {
        if(data.addListener) {
            data.addListener('data', function (chunk) { request.write(chunk) });
            data.addListener('end', function () { request.end() });
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
cradle.Connection.prototype.request = function (method, path, options, data, headers) {
    var promise = new(events.EventEmitter), request, that = this, emitError = false;

    promise.addCallback = function (callback) {
        if (callback) {
            this.addListener("done", callback);
        }
        return this;
    };
    promise.addListener('newListener', function (event, listener) {
        if (event === 'error') {
            emitError = true;
        }
    });

    // HTTP Headers
    headers = mixin({ host: this.host }, headers || {});

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

    request = this.rawRequest(method, path, options, data, headers);

    //
    // Initialize the request, send the body, and finally,
    // dispatch the request.
    //
    request.addListener('response', function (res) {
        var body = '';

        res.setEncoding('utf8');
        res.addListener('data', function (chunk) {
            body += (chunk || '');
        }).addListener('end', function () {
            var obj, response;

            if (method === 'HEAD') {
                promise.emit("done", null, res.headers, res.statusCode);
                promise.emit("success", res.headers, res.statusCode);
            } else {
                try { obj = JSON.parse(body) }
                catch (e) { return promise.emitError(e) }

                // If the `raw` option was set, we return the parsed
                // body as-is. If not, we wrap it in a `Response` object.
                if (that.options.raw) {
                    response = obj;
                } else {
                    response = new(cradle.Response)(obj, res);
                }

                promise.emit("done", (response.error && response.json) || null, response);

                if (response.error && emitError) {
                    promise.emit("error", response.error);
                } else {
                    promise.emit("success", response);
                }
            }
        });
    });

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
                        case 'get'  :
                            if (that.options.raw) {
                                return this.store[id];
                            } else {
                                if (this.store[id]) {
                                    if (this.store[id].json) {
                                        return this.store[id];
                                    } else {
                                        return new(cradle.Response)(this.store[id]);
                                    }
                                } else {
                                    return undefined;
                                }
                            }
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

            this.query('GET', '/').addCallback(function (err, res) {
                if (err) {
                    if (res.headers.status === 404) {
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

        // Fetch either a single document from the database, or cache,
        // or multiple documents from the database.
        // If it's a single doc from the db, attempt to save it to the cache.
        get: function (id, rev) {
            var that = this, options = null,
                args = new(Args)(arguments);

            if (Array.isArray(id)) { // Bulk GET
                return this.query('POST', '/_all_docs', { include_docs: true }, { keys: id })
                           .addCallback(function (err, res) { args.callback(err, res) });
            } else {
                if (rev && args.length === 2) {
                    if (typeof(rev) === 'string') { options = {rev: rev} }
                    else if (typeof(rev) === 'object') { options = rev }
                } else if (this.cache.has(id)) {
                    return args.callback(null, this.cache.get(id));
                }
                return this.query('GET', id, options).addCallback(function (err, res) {
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
                    doc = mixin({}, this.cache.get(id), doc);
                } else {
                    throw new(Error)("Couldn't save without a _rev");
                }
            } else {
               this.insert.apply(arguments);
            }
            return this.insert(doc, args.callback);
        },

        put: function (id, doc) {
            var cache = this.cache, args = new(Args)(arguments);
            return this.query('PUT', id, null, doc).addCallback(function (e, res) {
                if (! e) cache.save(id, mixin({}, doc, { _rev: res.rev }));
                args.callback(e, res);
            });
        },

        head: function (id) {
            var args = new(Args)(arguments);
            return this.query('HEAD', id, null).addCallback(args.callback);
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
                return this.query('PUT', id, null, doc).addCallback(writeThrough);

            // PUT or POST a single document
            } else if (args.length === 1 && !Array.isArray(args.first)) {
                doc = args.first;
                id = doc._id;
                if (id) {
                    return this.query('PUT', id, null, doc).addCallback(writeThrough);
                } else {
                    return this.query('POST', '/', null, doc).addCallback(writeThrough);
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
                           .addCallback(function (err, res) {
                    args.callback(err, res);
                });
            }

            function writeThrough(err, res) {
                if (! err) that.cache.save(id, mixin({}, doc, { _rev: res.rev }));
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
                return this.query('DELETE', '/').addCallback(callback);
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
                       .addCallback(function (err, res) {
                if (! err) that.cache.purge(id);
                args.callback(err, res);
            });
        },
        create: function (c) {
            return this.query('PUT', '/').addCallback(c);
        },
        info: function (c) {
            return this.query('GET', '/').addCallback(c);
        },
        all: function (options) {
            return this.query('GET', '/_all_docs', typeof(options) === 'object' ? options : {})
                       .addCallback(Args.last(arguments));
        },
        compact: function (design) {
            return this.query('POST', '/_compact' + (typeof(design) === 'string' ? '/' + design : ''))
                       .addCallback(Args.last(arguments));
        },
        viewCleanup: function (c) {
            return this.query('POST', '/_view_cleanup').addCallback(c);
        },
        allBySeq: function (options) {
            return this.query('GET', '/_all_docs_by_seq', options).addCallback(c);
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
            ).addCallback(args.callback);
        },

        push: function (doc) {},

        saveAttachment: function (docOrId, attachmentName, contentType, dataOrStream) {
            var rev, id, doc, pathname, headers = {}, response, body = '', resHeaders, error, db = this;
            var args = new(Args)(arguments);
            var promise = new(events.EventEmitter);

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
                .addListener('response', function (res) { resHeaders = { status: res.statusCode } })
                .addListener('data', function (chunk) { body += chunk })
                .addListener('end', function () {
                    response = JSON.parse(body);
                    response.headers = resHeaders;

                    if (response.headers.status == 201 && db.cache.store[id]) {
                        cached = db.cache.store[id];
                        cached._rev = response.rev;
                        cached._attachments = cached._attachments || {};
                        cached._attachments[attachmentName] = {
                            content_type: contentType,
                            stub: true,
                            revpos: new(Number)(response.rev.match(/^\d+/)[0])
                        };
                    }
                    args.callback(response);
                    promise.emit("success", response);
                });
            return promise;
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
    return this.request('GET', '/_all_dbs').addCallback(c);
};
cradle.Connection.prototype.config = function (c) {
    return this.request('GET', '/_config').addCallback(c);
};
cradle.Connection.prototype.info = function (c) {
    return this.request('GET', '/').addCallback(c);
};
cradle.Connection.prototype.stats = function (c) {
    return this.request('GET', '/_stats').addCallback(c);
};
cradle.Connection.prototype.activeTasks = function (c) {
    return this.request('GET', '/_active_tasks').addCallback(c);
};
cradle.Connection.prototype.uuids = function (count, callback) {
    if (typeof(count) === 'function') { callback = count, count = null }
    return this.request('GET', '/_uuids', count ? {count: count} : {})
               .addCallback(callback);
};

function mixin(target) {
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
