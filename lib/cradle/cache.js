var Response = require('./response').Response;
//
// Each database object has its own cache store.
// The cache.* methods are all wrappers around
// `cache.query`, which transparently checks if
// caching is enabled, before performing any action.
//
this.Cache = function (options) {
    this.store   = {};
    this.options = options;
};

this.Cache.prototype = {
    // API
    get:   function (id)      { return this.query('get',   id) },
    save:  function (id, doc) { return this.query('save',  id, doc) },
    purge: function (id)      { return this.query('purge', id) },
    has:   function (id)      { return this.query('has',   id) },

    _get: function (id) {
        if (this.options.raw) {
            return this.store[id];
        } else {
            if (this.store[id]) {
                if (this.store[id].json) {
                    return clone(this.store[id]);
                } else {
                    return new(Response)(clone(this.store[id]));
                }
            } else {
                return undefined;
            }
        }
    },
    _has: function (id) {
        return id in this.store;
    },
    _save: function (id, doc) {
        return this.store[id] = doc;
    },
    _purge: function (id) {
        if (id) { delete(this.store[id]) }
        else    { this.store = {} }
    },
    query: function (op, id, doc) {
        if (this.options.cache) {
            return this['_' + op](id, doc);
        } else {
            return false;
        }
    }
};

function clone(obj) {
    return Object.keys(obj).reduce(function (clone, k) {
        if (! obj.__lookupGetter__(k)) {
            clone[k] = obj[k];
        }
        return clone;
    }, {});
}
