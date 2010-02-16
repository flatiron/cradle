var path = require('path');

require.paths.unshift(path.join(__dirname, 'vendor'),
                      path.join(__dirname, 'cradle'));

var sys = require("sys"),
   http = require("http"),
 events = require('events'),
  posix = require("posix"),
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

cradle.Promise = function Promise(promise) {
    var f = function (callback) {
        return promise.addCallback(callback);
    };
    f.promise = promise;
    f.__proto__ = cradle.Promise.prototype;
    
    return f;
};

['addCallback', 'addErrback', 'addListener', 'wait'].forEach(function (method) {
    cradle.Promise.prototype[method] = function (callback) {
        return cradle.Promise(this.promise[method](callback));
    };  
});

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

cradle.Connection.prototype.request = function (method, path, options, data, headers) {
    var promise = new(events.Promise), request, that = this;

    path = (path || '/').replace('http://', '').replace(/\/{2,}/g, '/');
    headers = process.mixin({ host: this.host }, headers || {});

    if (data) {
        data = JSON.stringify(data, function (k, val) {
            if (typeof(val) === 'function') {
                return val.toString();
            } else { return val }
        });
        headers["Content-Length"] = data.length;
        headers["Content-Type"] = "application/json";
    }
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

    if (data) { request.sendBody(data, 'utf8') }

    request.finish(function (res) {
        var body = '';

        res.setBodyEncoding('utf8');
        res.addListener('body', function (chunk) {
            body += (chunk || '');
        }).addListener('complete', function () {
            var obj, response;

            try { obj = JSON.parse(body) }
            catch (e) { return promise.emitError(e) }

            if (that.options.raw) {
                response = obj;
            } else {
                response = new(cradle.Response)(res, obj);
            }

            if (response.error) {
                promise.emitError(response);
            } else {
                promise.emitSuccess(response);
            }
        });
    });

    return promise;
};

cradle.Connection.prototype.database = function (name) {
    var that = this;
    
    return {
        name: name,
        //
        // Database query cache
        //
        cache: {
            store: {},
            get: function (id) {
                return this.query('get', id);
            },
            save: function (id, doc) {
                return this.query('save', id, doc);
            },
            purge: function () {
                return this.query('purge');
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
        query: function (method, path, options, data, headers) {
            return that.request(
                method, [name, path].join('/'), options, data, headers
            );
        },
        exists: function () {
            var promise = new(events.Promise);

            this.query('GET', '/').addCallback(function (res) {
                promise.emitSuccess(true);
            }).addErrback(function (res) {
                if (res._headers.status === 404) {
                    promise.emitSuccess(false);
                } else if (res._headers.status === 200) {
                    promise.emitError(res);
                }
            });
            return promise;
        },
        get: function (id, rev) {
            var that = this, options = {}, promise;

            if (rev) {
                if (typeof(rev) === 'string') { options = {rev: rev} }
                else if (typeof(rev) === 'object') { options = rev }
            } else {
                if (this.cache.has(id)) {
                    promise = new(events.Promise); 
                    process.nextTick(function () {
                        promise.emitSuccess(this.cache.get(id));
                    });
                    return promise;
                }
            }

            return this.query('GET', id, options).addCallback(function (res) {
                that.cache.save(res.id, res.doc);
            });
        },
        save: function (/* [id], [rev], doc, ... */) {
            var id, doc = {}, that = this, args = Array.prototype.slice.call(arguments);

            // PUT a single document, with an id
            if (typeof(args[0]) === 'string' && args.length > 1) {
                id = args[0];
                // Design document
                if (/^_design\/\w+$/.test(id)) {
                    doc.language = "javascript";
                    doc.views = args[args.length - 1];
                } else {
                    doc = args[args.length - 1];
                }
                // _rev
                if (typeof(args[1]) === 'string') { doc._rev = args[1] }
                else if (!doc._rev && this.cache.has(id)) {
                    doc._rev = this.cache.get(id)._rev;
                }

                return this.query('PUT', id, {}, doc).addCallback(writeThrough);
            // POST a single document
            } else if (args.length === 1 && !Array.isArray(args[0])) {
                doc = args[0];
                return this.query('POST', '/', {}, doc).addCallback(writeThrough);
            // Bulk insert
            } else {
                if (Array.isArray(args[0])) {
                    doc = {docs: args[0]};
                    if (args[1] === true) { doc.all_or_nothing = true }
                } else {
                    doc = {docs: args};    
                }
                return this.query('POST', '/_bulk_docs', {}, doc);
            }

            function writeThrough(res) {
                that.cache.save(id, process.mixin({}, doc, { _rev: res.rev })); 
            }
        },
        update: function (id, obj) {
            var doc = this.cache.get(id);
            if (doc) {
                return this.save(id, process.mixin(true, {}, doc, obj));
            } else {
                throw new(Error)(id + " wasn't found in cache-store, couldn't update");
            }
        },
        destroy: function () {
            if (arguments.length > 0) {
                throw new(Error)("destroy() doesn't take any arguments");
            } else {
                return this.query('DELETE', '/');
            }
        },
        remove: function (id, rev) {
            var that = this, doc;
            if (! rev) {
                if (doc = this.cache.get(id)) { rev = doc._rev }
                else { throw new(Error)("rev needs to be supplied") }
            }
            return this.query('DELETE', id, {rev: rev}).addCallback(function (res) {
                that.cache.purge(id);
            });
        },
        create: function () {
            return this.query('PUT', '/');
        },
        info: function () {
            return this.query('GET', '/');
        },
        all: function (options) {
            return this.query('GET', '/_all_docs', options);
        },
        compact: function (design) {
            return this.query('POST', '/_compact' + (design ? '/' + design : ''));
        },
        viewCleanup: function () {
            return this.query('POST', '/_view_cleanup');
        },
        allBySeq: function (options) {
            return this.query('GET', '/_all_docs_by_seq', options);
        },
        view: function (path, options) {
            path = path.split('/');

            if (options) {
                ['key', 'startkey', 'endkey'].forEach(function (k) {
                    if (k in options) { options[k] = JSON.stringify(options[k]) }
                });
            }

            return this.query(
                'GET', ['_design', path[0], '_view', path[1]].join('/'), options
            );
        },

        push: function (doc) {}
    }

};

cradle.Connection.prototype.databases = function () {
    return this.request('GET', '/_all_dbs');
};
cradle.Connection.prototype.config = function () {
    return this.request('GET', '/_config');
};
cradle.Connection.prototype.info = function () {
    return this.request('GET', '/');
};
cradle.Connection.prototype.stats = function () {
    return this.request('GET', '/_stats');
};
cradle.Connection.prototype.activeTasks = function () {
    return this.request('GET', '/_active_tasks');
};
cradle.Connection.prototype.uuids = function (count) {
    return this.request('GET', '/_uuids', count ? {count: count} : {});
};

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



