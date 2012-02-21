var querystring = require('querystring'),
    Args = require('vargs').Constructor,
    cradle = require('../../cradle'),
    Database = require('./index').Database;

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