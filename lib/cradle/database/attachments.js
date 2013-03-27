var querystring = require('querystring'),
    Args = require('vargs').Constructor,
    cradle = require('../../cradle'),
    Database = require('./index').Database;

Database.prototype.getAttachment = function (id, attachmentName, callback) {
    //
    // TODO: Update cache?
    //
    return this.connection.rawRequest({
        method: 'GET', 
        path: '/' + [this.name, querystring.escape(id), attachmentName].join('/'),
        encoding: null
    }, callback);
};

Database.prototype.removeAttachment = function (doc, attachmentName, callback) {
    var params,
        rev,
        id;

    if (typeof doc === 'string') {
        id = doc;
    } else {
        id  = doc.id  || doc._id;
        rev = doc.rev || doc._rev;
    }
    
    if (!id) {
        error = new(TypeError)("first argument must be a document id");
        if (!callback) { throw error }
        return callback(error);
    }
    
    if (!rev && this.cache.has(id)) {
        rev = this.cache.get(id)._rev;
    } else if (rev) {
        rev = rev.replace(/\"/g, '');
    }

    this.query({
        method: 'DELETE',
        path: [querystring.escape(id), attachmentName].join('/'),
        query: { rev: rev }
    }, callback);
};

Database.prototype.saveAttachment = function (doc, attachment, callback) {
    var attachmentName,
        options = {},
        self = this,
        params,
        error,
        rev,
        id;
    
    if (typeof doc === 'string') {
        id = doc;
    } else {
        id  = doc.id  || doc._id;
        rev = doc.rev || doc._rev;
    }

    if (!id) {
        error = new(TypeError)("Missing document id.");
        if (!callback) { throw error }
        return callback(error);
    }
    
    attachmentName = typeof attachment !== 'string'
        ? attachment.name
        : attachment;
    
    if (!rev && this.cache.has(id)) {
        params = { rev: this.cache.get(id)._rev };
    } else if (rev) {
        params = { rev: rev.replace(/\"/g, '') };
    }
    
    options.method = 'PUT';
    options.path = '/' + [this.name, querystring.escape(id), attachmentName].join('/');
    options.headers = {
        'Content-Type': attachment['content-type'] 
            || attachment['contentType']
            || attachment['Content-Type'] 
            || 'text/plain'
    };

    if (attachment['contentLength']) {
        options.headers['Content-Length'] = attachment['contentLength'];
    }
    
    if (attachment.body) {
        options.body = attachment.body;
    }
    
    if (params) {
        options.path += ('?' + querystring.stringify(params));
    }
    
    return this.connection.rawRequest(options, function (err, res, body) {
        if (err) {
            return callback(err);
        }

        var result = JSON.parse(body);
        result.headers = res.headers;
        result.headers.status = res.statusCode;

        if (result.headers.status == 201) {
            if (self.cache.has(id)) {
                cached = self.cache.store[id].document;
                cached._rev = result.rev;
                cached._attachments = cached._attachments || {};
                cached._attachments[attachmentName] = { stub: true };
            }
            
            return callback(null, result);
        }
        
        callback(result);
    });
};

//
// Alias `saveAttachment` to `addAttachment`
//
Database.prototype.addAttachment = Database.prototype.saveAttachment;
