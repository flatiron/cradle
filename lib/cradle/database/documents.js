/*jshint node:true */

var querystring = require('querystring'),
    Args = require('vargs').Constructor,
    cradle = require('../../cradle'),
    Database = require('./index').Database;

//
// Perform a HEAD request
//
Database.prototype.head = function (id, callback) {
    this.query({
        method: 'HEAD',
        path: cradle.escape(id)
    }, callback);
};

// Fetch either a single document from the database, or cache,
// or multiple documents from the database.
// If it's a single doc from the db, attempt to save it to the cache.
Database.prototype.get = function (id, rev) {
    var args = new (Args)(arguments),
        options = null,
        that = this;

    if (Array.isArray(id)) { // Bulk GET
        this.query({
            method: 'POST',
            path: '/_all_docs',
            query: { include_docs: true },
            body: { keys: id },
        }, function (err, res) {
            args.callback(err, res);
        });
    } else {
        if (rev && args.length === 2) {
            if (typeof(rev) === 'string') {
                options = {
                    rev: rev
                };
            } else if (typeof(rev) === 'object') {
                options = rev;
            }
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

//
// PUT a document, and write through cache
//
Database.prototype.put = function (id, doc, callback) {
    var cache = this.cache;
    if (typeof(id) !== 'string') {
        throw new(TypeError)("id must be a string");
    }
    this.query({
        method: 'PUT',
        path: cradle.escape(id),
        body: doc
    }, function (e, res) {
        if (! e) {
            cache.save(id, cradle.merge({}, doc, { _id: id, _rev: res.rev }));
        }
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
        body: doc
    }, function (e, res) {
        if (! e) {
            cache.save(res.id, cradle.merge({}, doc, { _id: res.id, _rev: res.rev }));
        }
        callback && callback(e, res);
    });
};

Database.prototype.save = function (/* [id], [rev], doc | [doc, ...] */) {
    var args = new(Args)(arguments),
        array = args.all.slice(0), doc, id, rev;

    if (Array.isArray(args.first)) {
        doc = args.first;
    } else {
        doc = array.pop();
        id  = array.shift();
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
        if (options.allOrNothing) {
            document.all_or_nothing = true;
        }
        this.query({
            method: 'POST',
            path: '/_bulk_docs',
            body: document
        }, callback);
    } else {
        if (!id && doc._id) {
            id = doc._id;
        }

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
                    if (e && e.headers && e.headers.status === 409 && options.forceSave) { // Conflict
                        that.head(id, function (e, headers, res) {
                            if (res === 404 || !headers.etag) {
                                return callback({ reason: 'not_found' });
                            }

                            document._rev = headers.etag.slice(1, -1);
                            that.put(id, document, callback);
                        });
                    } else {
                        callback(e, res);
                    }
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
        if (e) {
            return callback(e);
        }
        doc = cradle.merge({}, res.json || res, doc);
        that.save(id, res._rev, doc, callback);
    });
};

Database.prototype.insert = function () {
    throw new Error("`insert` is deprecated, use `save` instead");
};

// Update document handler
// body is an optional parameter for passing data in the body which is not limited by the
// 8197 characters limit of the query parameter
Database.prototype.update = function (path, id, options, body) {
    var args = new(Args)(arguments);
    path = path.split('/');

    if (id) {
      return this.query({
        method: 'PUT',
        path: ['_design', path[0], '_update', path[1], id].map(querystring.escape).join('/'),
        query: options,
        body: body
      }, args.callback);
    }

    return this.query({
        method: 'POST',
        path: ['_design', path[0], '_update', path[1]].map(querystring.escape).join('/'),
        query: options,
        body: body
    }, args.callback);
};

// Delete a document
// If the _rev wasn't supplied, we attempt to retrieve it from the
// cache. Otherwise, we attempt to get the _rev first. If the deletion
// was successful, we purge the cache.
Database.prototype.remove = function (id, rev) {
    var that = this, doc, args = new(Args)(arguments);

    //
    // Removes the document with `id` at `rev`.
    //
    function remove() {
        that.query({
            method: 'DELETE',
            path: cradle.escape(id),
            query: { rev: rev }
        }, function (err, res) {
            if (! err) {
                that.cache.purge(id);
            }
            args.callback(err, res);
        });
    }

    if (typeof(rev) !== 'string') {
        if (doc = this.cache.get(id)) {
            rev = doc._rev;
        }
        else {
            return this.get(id, function (err, _doc) {
                if (err) {
                    return args.callback(err);
                }
                else if (!_doc._rev) {
                    return args.callback(new Error('No _rev found for ' + id));
                }

                rev = _doc._rev;
                remove();
            });
        }
    }

    remove();
};
