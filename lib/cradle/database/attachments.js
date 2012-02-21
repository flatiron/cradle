var querystring = require('querystring'),
    Args = require('vargs').Constructor,
    cradle = require('../../cradle'),
    Database = require('./index').Database;

Database.prototype.getAttachment = function (docId, attachmentName) {
    var pathname, req;
    pathname = '/' + [this.name, docId, attachmentName].map(querystring.escape).join('/');
    return this.connection.rawRequest('GET', pathname);
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
