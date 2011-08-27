var Cache = require('./cache').Cache;
var Args = require('vargs').Constructor;

var cradle = require('cradle');
var querystring = require('querystring');

//
// Database object
//
//      Provides database functions on database `name`.
//
this.Database = function (connection, name) {
    this.connection = connection;
    this.options = connection.options;
    this.name = encodeURIComponent(name);

    // The database document cache.
    this.cache = new Cache(this.options);
};

// A wrapper around `Connection.request`,
// which prepends the database name.
this.Database.prototype.query = function (method, path /* [options], [data], [headers], [callback] */) {
    var args = Array.prototype.slice.call(arguments, 2);
    this.connection.request.apply(this.connection, [method, [this.name, path].join('/')].concat(args));
};

this.Database.prototype.exists = function (callback) {
    this.query('HEAD', '/', function (err, res, status) {
        if (err) {
            callback(err);
        } else {
            if (status === 404) {
                callback(null, false);
            } else {
                callback(null, true);
            }
        }
    });
}

// Fetch either a single document from the database, or cache,
// or multiple documents from the database.
// If it's a single doc from the db, attempt to save it to the cache.
this.Database.prototype.get = function (id, rev) {
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
        this.query('GET', id.split('/').map(querystring.escape).join('/'), options, function (err, res) {
            if (! err) that.cache.save(res.id, res.json);
            args.callback(err, res);
        });
    }
};

this.Database.prototype.save = function (/* [id], [rev], doc | [doc, ...] */) {
    var args = new(Args)(arguments),
        array = args.all.slice(0), doc, id, rev;

    if (Array.isArray(args.first)) {
        doc = args.first;
    } else {
        doc = array.pop(),
        id  = array.shift(),
        rev = array.shift();
    }
    this._save(id, rev, doc, args.callback);
};
this.Database.prototype._save = function (id, rev, doc, callback) {
    var options = this.options;
    var document = {}, that = this;

    // Bulk Insert
    if (Array.isArray(doc)) {
        document.docs = doc;
        if (options.allOrNothing) { document.all_or_nothing = true }
        this.query('POST', '/_bulk_docs', {}, document, callback);
    } else {
        // PUT a single document, with an id (Create or Update)
        if (id) {
            // Design document
            if (/^_design\/(\w|[%()\-_])+$/.test(id) && !('views' in doc)) {
                document.language = "javascript";
                document.views    =  doc;
            } else {
                document = doc;
            }
            // Try to set the '_rev' attribute of the document.
            // If it wasn't passed, attempt to retrieve it from the cache.
            rev && (document._rev = rev);

            if (document._rev) {
                this.put(id, document, callback);
            } else if (this.cache.has(id)) {
                document._rev = this.cache.get(id)._rev;
                this.put(id, document, callback);
            } else {
                // Attempt to create a new document. If it fails,
                // because an existing document with that _id exists (409),
                // perform a HEAD, to get the _rev, and try to re-save.
                this.put(id, document, function (e, res) {
                    if (e && e.headers && e.headers.status === 409) { // Conflict
                        that.head(id, function (e, headers) {
                            document._rev = headers['etag'].slice(1, -1);
                            that.put(id, document, callback);
                        });
                    } else { callback(e, res) }
                });
            }
        // POST a single document, without an id (Create)
        } else {
            this.post(doc, callback);
        }
    }
};

this.Database.prototype.merge = function (/* [id], doc */) {
    var args     = Array.prototype.slice.call(arguments),
        callback = args.pop(),
        doc      = args.pop(),
        id       = args.pop() || doc._id;

    this._merge(id, doc, callback);
};
this.Database.prototype._merge = function (id, doc, callback) {
    var that = this;
    this.get(id, function (e, res) {
        if (e) { return callback(e) }
        doc = cradle.merge({}, res.json || res, doc);
        that.save(id, res._rev, doc, callback);
    });
};

//
// PUT a document, and write through cache
//
this.Database.prototype.put = function (id, doc, callback) {
    var cache = this.cache;
    if (typeof(id) !== 'string') { throw new(TypeError)("id must be a string") }
    this.query('PUT', id.split('/').map(querystring.escape).join('/'), null, doc, function (e, res) {
        if (! e) { cache.save(id, cradle.merge({}, doc, { _rev: res.rev })) }
        callback && callback(e, res);
    });
};

//
// POST a document, and write through cache
//
this.Database.prototype.post = function (doc, callback) {
    var cache = this.cache;
    this.query('POST', '/', null, doc, function (e, res) {
        if (! e) { cache.save(res.id, cradle.merge({}, doc, { _rev: res.rev })) }
        callback && callback(e, res);
    });
};

//
// Perform a HEAD request
//
this.Database.prototype.head = function (id, callback) {
    this.query('HEAD', id.split('/').map(querystring.escape).join('/'), null, callback);
};

this.Database.prototype.insert = function () {
    throw new(Error)("`insert` is deprecated, use `save` instead");
};

this.Database.prototype.replicate = function (target, options, callback) {
    if (typeof(options) === 'function') { callback = options, options = {} }
    this.connection.replicate(cradle.merge({ source: this.name, target: target }, options), callback);
};

// Destroys a database with 'DELETE'
// we raise an exception if arguments were supplied,
// as we don't want users to confuse this function with `remove`.
this.Database.prototype.destroy = function (callback) {
    if (arguments.length > 1) {
        throw new(Error)("destroy() doesn't take any additional arguments");
    } else {
        this.query('DELETE', '/', callback);
    }
};

// Delete a document
// if the _rev wasn't supplied, we attempt to retrieve it from the
// cache. If the deletion was successful, we purge the cache.
this.Database.prototype.remove = function (id, rev) {
    var that = this, doc, args = new(Args)(arguments);

    if (typeof(rev) !== 'string') {
        if (doc = this.cache.get(id)) { rev = doc._rev }
        else                          { throw new(Error)("rev needs to be supplied") }
    }
    this.query('DELETE', id.split('/').map(querystring.escape).join('/'), {rev: rev}, function (err, res) {
        if (! err) { that.cache.purge(id) }
        args.callback(err, res);
    });
};

this.Database.prototype.create = function (callback) {
    this.query('PUT', '/', callback);
};

this.Database.prototype.info = function (callback) {
    this.query('GET', '/', callback);
};

this.Database.prototype.all = function (options, callback) {
    if (arguments.length === 1) { callback = options, options = {} }
    this.query('GET', '/_all_docs', options, callback);
};

this.Database.prototype.compact = function (design) {
    var headers = {};
    headers['Content-Type'] = "application/json";
    this.query('POST', '/_compact' + (typeof(design) === 'string' ? '/' + querystring.escape(design) : ''),
               {}, {}, headers, Args.last(arguments));
};

this.Database.prototype.viewCleanup = function (callback) {
    var headers = {};
    headers['Content-Type'] = "application/json";
    this.query('POST', '/_view_cleanup', {}, {}, headers, callback);
};

this.Database.prototype.allBySeq = function (options) {
    options = typeof(options) === 'object' ? options : {};
    this.query('GET', '/_all_docs_by_seq', options, Args.last(arguments));
};

// Query a view, passing any options to the query string.
// Some query string parameters' values have to be JSON-encoded.
this.Database.prototype.view = function (path, options) {
    var args = new(Args)(arguments);

    path = path.split('/');
    path = ['_design', path[0], '_view', path[1]].map(querystring.escape).join('/');

    if (typeof(options) === 'object') {
        ['key', 'startkey', 'endkey'].forEach(function (k) {
            if (k in options) { options[k] = JSON.stringify(options[k]) }
        });
    }

    if (options && options.keys) {
        this.query('POST', path, {}, options, args.callback);
    } else {
        this.query('GET', path, options, args.callback);
    }
};

// Query a list, passing any options to the query string.
// Some query string parameters' values have to be JSON-encoded.
this.Database.prototype.list = function (path, options) {
    var args = new(Args)(arguments);
    path = path.split('/');

    if (typeof(options) === 'object') {
        ['key', 'startkey', 'endkey'].forEach(function (k) {
            if (k in options) { options[k] = JSON.stringify(options[k]) }
        });
    }
    this.query('GET', ['_design', path[0], '_list', path[1], path[2]].map(querystring.escape).join('/'), options, args.callback);
};

this.Database.prototype.update = function(path, id, options) {
    var args = new(Args)(arguments);
    path = path.split('/');

    if (id) {
      this.query('PUT', ['_design', path[0], '_update', path[1], id].map(querystring.escape).join('/'), options, args.callback);
    } else {
      this.query('POST', ['_design', path[0], '_update', path[1]].map(querystring.escape).join('/'), options, args.callback);
    }
};

this.Database.prototype.push = function (doc) {};

this.Database.prototype.changes = function (options, callback) {
    if (typeof(options) === 'function') { callback = options, options = {}; }

    if (callback) {
        this.query('GET', '_changes', options, callback);
    } else {
        var promise = new(events.EventEmitter);

        options           = options           || {};
        options.feed      = options.feed      || 'continuous';
        options.heartbeat = options.heartbeat || 1000;

        this.connection.rawRequest('GET', [this.name, '_changes'].join('/'), options)
            .on('response', function (res) {
                var response = new(events.EventEmitter), buffer = [];
    
                res.setEncoding('utf8');
    
                response.statusCode = res.statusCode;
                response.headers    = res.headers;
    
                promise.emit('response', response);
    
                res.on('data', function (chunk) {
                    var end;
                    if (~(end = chunk.indexOf('\n'))) {
                        buffer.push(chunk.substr(0, ++end));
                        buffer.length && response.emit('data', JSON.parse(buffer.join('')));
                        buffer = [chunk.substr(end)];
                    } else {
                        buffer.push(chunk);
                    }
                }).on('end', function () {
                    response.emit('end');
                }).on('error', function (err) {
                    response.emit('error', err);
                });
            })
            .on('error', function (err) {
                promise.emit('error', err);
            });

        return promise;
    }
};

this.Database.prototype.saveAttachment = function (/* id, [rev], attachmentName, contentType, dataOrStream */) {
    var doc, pathname, headers = {}, response, body = [], resHeaders, error, db = this;

    var args = new(Args)(arguments), params = args.all;

    if (typeof(args.first) === 'object') { throw new(TypeError)("first argument must be a document id") }

    var id = params.shift(),
        dataOrStream = params.pop(),
        contentType  = params.pop(),
        attachmentName = params.pop(),
        rev = params.pop();

    if (!rev && db.cache.has(id)) {
        doc = { rev: db.cache.get(id)._rev };
    } else if (rev) {
        doc = { rev: rev };
    } else {
        doc = {};
    }

    pathname = '/' + [this.name, id, attachmentName].map(querystring.escape).join('/');
    headers['Content-Type'] = contentType;

    this.connection.rawRequest('PUT', pathname, doc, dataOrStream, headers)
        .on('response', function (res) { resHeaders = { status: res.statusCode } })
        .on('data', function (chunk) { body.push(chunk) })
        .on('end', function () {
            response = JSON.parse(body.join(''));
            response.headers = resHeaders;

            if (response.headers.status == 201) {
                if (db.cache.has(id)) {
                    cached = db.cache.store[id].document;
                    cached._rev = response.rev;
                    cached._attachments = cached._attachments || {};
                    cached._attachments[attachmentName] = { stub: true };
                }
                args.callback(null, response);
            } else {
                args.callback(response);
            }
        });
};

this.Database.prototype.getAttachment = function(docId, attachmentName) {
    var pathname, req;
    pathname = '/' + [this.name, docId, attachmentName].map(querystring.escape).join('/');
    return this.connection.rawRequest('GET', pathname);
};

this.Database.prototype.temporaryView = function (doc, callback) {
    this.query('POST', '_temp_view', null, doc, callback);
};
