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
    
    options = options || {};
    
    if (callback) {
        return this.query({
            method: 'GET', 
            path: '_changes',
            query: options
        }, callback);
    }

    var response = new events.EventEmitter(),
        responded = false,
        protocol,
        auth = '',
        feed;

    if (!options.db) {
        protocol = this.connection.protocol || 'http';
        
        if (this.connection.auth && this.connection.auth.username
            && this.connection.auth.password) {
            auth = this.connection.auth.username + ':' + this.connection.auth.password + '@';            
        }
        
        options.db = protocol + '://' + auth + this.connection.host + ':' + this.connection.port + '/' + this.name;
    }
        
    feed = new follow.Feed(options);
    feed.on('change', function () {
        //
        // Remark: Support the legacy `data` events. 
        //
        if (!responded) {
            responded = true;
            feed.emit('response', response);
        }
        
        response.emit.apply(response, ['data'].concat(Array.prototype.slice.call(arguments)));
    });
    
    if (options.follow !== false) {
        feed.follow();
    }
    
    return feed;
};
