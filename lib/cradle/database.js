var querystring = require('querystring'),
    cradle = require('../cradle');

var Database = exports.Database = function (name, connection) {
    this.connection = connection;
    this.name = encodeURIComponent(name);
    this.cache = new (cradle.Cache)(connection.options);
}

// A wrapper around `Connection.request`,
// which prepends the database name.
Database.prototype.query = function (method, path /* [options], [data], [headers], [callback] */) {
    var args = Array.prototype.slice.call(arguments, 2);
    this.connection.request.apply(this.connection, {
      method: method, 
      path: [this.name, path].join('/')].concat(args));
};

Database.prototype.exists = function (callback) {
    this.query({ method: 'HEAD' }, function (err, res, status) {
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
},

// Fetch either a single document from the database, or cache,
// or multiple documents from the database.
// If it's a single doc from the db, attempt to save it to the cache.
Database.prototype.get = function (id, rev) {
    var args = Array.prototype.slice.call(arguments),
        options = null,
        that = this;

    if (Array.isArray(id)) { // Bulk GET
        this.query({
            method: 'POST', 
            path: '/_all_docs', 
            query: { include_docs: true }, 
            data: { keys: id },
        }, function (err, res) { 
            args.callback(err, res) 
        });
    } else {
        if (rev && args.length === 2) {
            if      (typeof(rev) === 'string') { options = { rev: rev } }
            else if (typeof(rev) === 'object') { options = rev }
        } else if (this.cache.has(id)) {
            return args.callback(null, this.cache.get(id));
        }
        this.query({
            path: cradle.escape(id),
            query: options
        }, function (err, res) {
            if (! err) that.cache.save(res.id, res.json);
            args.callback(err, res);
        });
    }
};

Database.prototype.save = function (/* [id], [rev], doc | [doc, ...] */) {
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

Database.prototype._save = function (id, rev, doc, callback) {
    var options = this.connection.options;
    var document = {}, that = this;

    // Bulk Insert
    if (Array.isArray(doc)) {
        document.docs = doc;
        if (options.allOrNothing) { document.all_or_nothing = true }
        this.query({
            method: 'POST', 
            path: '/_bulk_docs', 
            data: document
        }, callback);
    } else {
        // PUT a single document, with an id (Create or Update)
        if (id) {
            // Design document
            if (/^_design\/(\w|%|\-)+$/.test(id) && !('views' in doc)) {
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
                        that.head(id, function (e, headers, res) {
                            if (res === 404 || !headers['etag']) {
                                return callback({ reason: 'not_found' });
                            }

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

Database.prototype.merge = function (/* [id], doc */) {
    var args     = Array.prototype.slice.call(arguments),
        callback = args.pop(),
        doc      = args.pop(),
        id       = args.pop() || doc._id;

    this._merge(id, doc, callback);
};

Database.prototype._merge = function (id, doc, callback) {
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
Database.prototype.put = function (id, doc, callback) {
    var cache = this.cache;
    if (typeof(id) !== 'string') { throw new(TypeError)("id must be a string") }
    this.query({
        method: 'PUT', 
        path: cradle.escape(id), 
        data: doc
    }, function (e, res) {
        if (! e) { cache.save(id, cradle.merge({}, doc, { _id: id, _rev: res.rev })) }
        callback && callback(e, res);
    });
};

//
// POST a document, and write through cache
//
Database.prototype.post = function (doc, callback) {
    var cache = this.cache;
    this.query({
        method: 'POST', 
        path: '/', 
        data: doc
    }, function (e, res) {
        if (! e) { cache.save(res.id, cradle.merge({}, doc, { _id: res.id, _rev: res.rev })) }
        callback && callback(e, res);
    });
};

//
// Perform a HEAD request
//
Database.prototype.head = function (id, callback) {
    this.query({
        method: 'HEAD', 
        path, cradle.escape(id)
    }, callback);
};

Database.prototype.insert = function () {
    throw new Error("`insert` is deprecated, use `save` instead");
};

Database.prototype.replicate = function (target, options, callback) {
    if (typeof(options) === 'function') { callback = options, options = {} }
    this.connection.replicate(cradle.merge({ source: name, target: target }, options), callback);
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

// Delete a document
// if the _rev wasn't supplied, we attempt to retrieve it from the
// cache. If the deletion was successful, we purge the cache.
Database.prototype.remove = function (id, rev) {
    var that = this, doc, args = new(Args)(arguments);

    if (typeof(rev) !== 'string') {
        if (doc = this.cache.get(id)) { rev = doc._rev }
        else                          { throw new(Error)("rev needs to be supplied") }
    }
    this.query({
        method: 'DELETE', 
        path: cradle.escape(id), 
        data: { rev: rev }
    }, function (err, res) {
        if (! err) { that.cache.purge(id) }
        args.callback(err, res);
    });
};

Database.prototype.create = function (callback) {
    this.query({ method: 'PUT' }, callback);
};

Database.prototype.info = function (callback) {
    this.query({ method: 'GET' }, callback);
};

Database.prototype.all = function (options, callback) {
    if (arguments.length === 1) { 
      callback = options; 
      options = {};
    }
    
    return this.query({
        method: 'GET', 
        path: '/_all_docs', 
        query: options
    }, callback);
};

Database.prototype.compact = function (design) {
    var headers = {};
    headers['Content-Type'] = "application/json";
    this.query({
        method: 'POST',
        path: '/_compact' + (typeof(design) === 'string' ? '/' + querystring.escape(design) : ''),
        headers: headers
    }, Args.last(arguments));
};

Database.prototype.viewCleanup = function (callback) {
    var headers = {};
    headers['Content-Type'] = "application/json";
    this.query({
        method: 'POST', 
        path: '/_view_cleanup', 
        headers: headers
    }, callback);
};

Database.prototype.allBySeq = function (options) {
    options = typeof(options) === 'object' ? options : {};
    this.query({
        path: '/_all_docs_by_seq', 
        query: options
    }, Args.last(arguments));
};

// Query a view, passing any options to the query string.
// Some query string parameters' values have to be JSON-encoded.
Database.prototype.view = function (path, options) {
    var args = new(Args)(arguments);

    path = path.split('/');
    path = ['_design', path[0], '_view', path[1]].map(querystring.escape).join('/');

    if (typeof(options) === 'object') {
        ['key', 'startkey', 'endkey'].forEach(function (k) {
            if (k in options) { options[k] = JSON.stringify(options[k]) }
        });
    }

    if (options && options.keys) {
        return this.query({
            method: 'POST', 
            path: path, 
            query: options
          }, args.callback);
    } else {
        return this.query({
            method: 'GET', 
            path: path, 
            query: options
        }, args.callback);
    }
};

// Query a list, passing any options to the query string.
// Some query string parameters' values have to be JSON-encoded.
Database.prototype.list = function (path, options) {
    var args = new(Args)(arguments);
    path = path.split('/');

    if (typeof(options) === 'object') {
        ['key', 'startkey', 'endkey'].forEach(function (k) {
            if (k in options) { options[k] = JSON.stringify(options[k]) }
        });
    }
    this.query({
      method: 'GET', 
      path: ['_design', path[0], '_list', path[1], path[2]].map(querystring.escape).join('/'), 
      query: options, 
    }, args.callback);
};

Database.prototype.update = function (path, id, options) {
    var args = new(Args)(arguments);
    path = path.split('/');

    if (id) {
      return this.query({
        method: 'PUT', 
        path: ['_design', path[0], '_update', path[1], id].map(querystring.escape).join('/'), 
        query: options
      }, args.callback);
    } 
    
    return this.query({
        method: 'POST', 
        path: ['_design', path[0], '_update', path[1]].map(querystring.escape).join('/'), 
        query: options, 
    }, args.callback);
},

Database.prototype.push = function (doc) {},

Database.prototype.changes = function (options, callback) {
    var promise = new(events.EventEmitter);

    if (typeof(options) === 'function') { callback = options, options = {}; }

    if (callback) {
        return this.query({
            method: 'GET', 
            path: '_changes',
            query: options
        }, callback);
    } 

    options           = options           || {};
    options.feed      = options.feed      || 'continuous';
    options.heartbeat = options.heartbeat || 1000;

    that.rawRequest('GET', [name, '_changes'].join('/'), options).on('response', function (res) {
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
            reponse.emit('error', err);
        })
    }).on('error', function (err) {
        promise.emit('error', err);
    });
    
    return promise;
};

Database.prototype.saveAttachment = function (/* id, [rev], attachmentName, contentType, dataOrStream */) {
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

Database.prototype.getAttachment = function (docId, attachmentName) {
    var pathname, req;
    pathname = '/' + [this.name, docId, attachmentName].map(querystring.escape).join('/');
    return this.connection.rawRequest('GET', pathname);
};

Database.prototype.temporaryView = function (doc, callback) {
    return this.query({
        method: 'POST', 
        path: '_temp_view', 
        data: doc
    }, callback);
};
