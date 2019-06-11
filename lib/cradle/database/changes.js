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

    var self = this;
    // Keep a consistent object for return to the client, even if
    // this feed is restarted due to error.
    feed.on('error', function (err) {
        if (feed.dead && options.follow !== false) {
          console.error(self.name, 'ERROR: Cradle changes feed died, restarting', err.message || err);
          setTimeout(function() {
              console.error(self.name, 'RECOVERY: Restarting feed that died with', err.message || err);
              feed.restart();
              feed.emit('recover', err);
          }, 1000);
        }
    });

    if (options.follow !== false) {
        feed.follow();
    }
    
    return feed;
};
