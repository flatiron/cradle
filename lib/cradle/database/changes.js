var events = require('events'),
    querystring = require('querystring'),
    Args = require('vargs').Constructor,
    follow = require('follow'),
    cradle = require('../../cradle'),
    Database = require('./index').Database;

Database.prototype.changes = function (options, callback) {
    if (typeof(options) === 'function') { 
        callback = options;
        options = {}; 
    }
    
    if (callback) {
        return this.query({
            method: 'GET', 
            path: '_changes',
            query: options
        }, callback);
    }
    
    var feed = new follow.Feed(options),
        response = new events.EventEmitter(),
        responded = false;
    
    //
    // Remark: Support the legacy `data` events. 
    //
    feed.on('change', function () {
        if (!responded) {
            responded = true;
            feed.emit('response', response);
        }
        
        response.emit.apply(response, ['data'].concat(Array.prototype.slice.call(arguments)));
    });
    
    return feed;
};