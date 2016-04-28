/*jshint node:true */

//
// HTTP response wrapper
//
//      It allows us to call array-like methods on documents
//      with a 'row' attribute.
//
this.Response = function Response(json, response) {
    var obj, headers;

    // If there's an _id key, it's the result
    // of a document retrieval.
    // Avoid potential key collisions.
    if (!json._id) {
        // If there's rows, this is the result
        // of a view function.
        // We want to return this as an Array.
        if (json.rows) {
            obj           = json.rows.slice(0);
            obj.__proto__ = new(Array);
            if (json && typeof json === 'object') {
                Object.keys(json).forEach(function (k) {
                    Object.defineProperty(obj.__proto__, k, {
                        value:      json[k],
                        enumerable: false
                    });
                });
            }
        } else if (json.results) {
            obj = json.results.slice(0);
            obj.__proto__ = new(Array);
            obj.last_seq  = json.last_seq;
        } else if (json.uuids) {
            obj           = json.uuids;
            obj.__proto__ = new(Array);
        } else if (Array.isArray(json)) {
            obj           = json.slice(0);
            obj.__proto__ = new(Array);
        }
    }

    if (!obj) {
        obj           = {};
        obj.__proto__ = new(Object);
        if (json && typeof json === 'object') {
            Object.keys(json).forEach(function (k) {
                obj[k] = json[k];
            });
        }
    }

    // If the response was originally a document,
    // give access to it via the 'json' getter.
    if (!Array.isArray(json) && !obj.json) {
        Object.defineProperty(obj, 'json', {
            value: json,
            enumerable: false
        });
    }

    if (response) {
        headers = { status: response.statusCode };
        Object.keys(response.headers).forEach(function (k) {
            headers[k] = response.headers[k];
        });

        // Set the 'headers' special field, with the response's status code.
        exports.extend(obj, 'headers' in obj ? { _headers: headers }
                                             : {  headers: headers });
    }

    // Alias '_rev' and '_id'
    if (obj.id && obj.rev) {
        exports.extend(obj, { _id:  obj.id, _rev: obj.rev });
    } else if (obj._id && obj._rev) {
        exports.extend(obj, { id:  obj._id, rev: obj._rev });
    }

    if (Array.isArray(obj) && json.rows) {
        exports.extend(obj, exports.collectionPrototype);
    }
    exports.extend(obj, exports.basePrototype);

    // Set the constructor to be this function
    Object.defineProperty(obj, 'constructor', {
        value: arguments.callee
    });

    return obj;
};

this.basePrototype = {
    toJSON: function () {
        return this;
    },
    toString: function () {
        return JSON.stringify(this);
    }
};

this.collectionPrototype = {
    forEach: function (f) {
        for (var i = 0, value; i < this.length; i++) {
            value = this[i].doc || this[i].json || this[i].value || this[i];
            if (f.length === 1) {
                f.call(this[i], value);
            } else {
                f.call(this[i], this[i].key, value, this[i].id);
            }
        }
    },
    map: function (f) {
        var ary = [];
        if (f.length === 1) {
            this.forEach(function (a) { ary.push(f.call(this, a)); });
        } else {
            this.forEach(function () { ary.push(f.apply(this, arguments)); });
        }
        return ary;
    },
    toArray: function () {
        return this.map(function (k, v) { return v; });
    }
};

this.extend = function (obj, properties) {
    var descriptor = Object.keys(properties).reduce(function (hash, k) {
        hash[k] = {
            value: properties[k],
            enumerable: false
        };
        return hash;
    }, {});
    return Object.defineProperties(obj, descriptor);
};
