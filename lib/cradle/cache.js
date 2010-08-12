var Response = require('./response').Response;
//
// Each database object has its own cache store.
// The cache.* methods are all wrappers around
// `cache.query`, which transparently checks if
// caching is enabled, before performing any action.
//
this.Cache = function (options) {
    var that = this;

    this.store   = {};
    this.options = options;
    this.size = options.cacheSize || 0;
    this.keys = 0;
};

this.Cache.prototype = {
    // API
    get:   function (id)      { return this.query('get',   id) },
    save:  function (id, doc) { return this.query('save',  id, doc) },
    purge: function (id)      { return this.query('purge', id) },
    has:   function (id)      { return this.query('has',   id) },

    _get: function (id) {
        var entry;

        if (id in this.store) {
            entry = this.store[id];
            entry.atime = Date.now();

            if (this.options.raw) {
                return entry.document;
            } else {
                // If the document is already wrapped in a `Response`,
                // just return it. Else, wrap it first. We clone the documents
                // before returning them, to protect them from modification.
                if (entry.document.toJSON) {
                    return clone(entry.document);
                } else {
                    return new(Response)(clone(entry.document));
                }
            }
        }
    },
    _has: function (id) {
        return id in this.store;
    },
    _save: function (id, doc) {
        if (! this._has(id)) {
            this.keys ++;
            this.prune();
        }

        return this.store[id] = {
            atime:    Date.now(),
            document: doc
        };
    },
    _purge: function (id) {
        if (id) {
            delete(this.store[id]);
            this.keys --;
        } else {
            this.store = {};
        }
    },
    query: function (op, id, doc) {
        if (this.options.cache) {
            return this['_' + op](id, doc);
        } else {
            return false;
        }
    },
    prune: function () {
        var that = this;
        if (this.size && this.keys > this.size) {
            process.nextTick(function () {
                var store  = that.store,
                    keys   = Object.keys(store),
                    pruned = Math.ceil(that.size / 8);

                keys.sort(function (a, b) {
                    return store[a].atime > store[b].atime ? 1 : -1;
                });

                for (var i = 0; i < pruned; i++) {
                    delete(store[keys[i]]);
                }
                that.keys -= pruned;
            });
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
