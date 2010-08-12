//
// HTTP response wrapper
//
//      It allows us to call array-like methods on documents
//      with a 'row' attribute.
//
this.Response = function Response(json, response) {
    var obj, headers;

    // If there's rows, this is the result
    // of a view function.
    // We want to return this as an Array.
    if (json.rows) {
        obj           = json.rows.slice(0);
        obj.__proto__ = new(Array);
        Object.keys(json).forEach(function (k) {
            Object.defineProperty(obj.__proto__, k, {
                value:      json[k],
                enumerable: false
            });
        });
    } else if (json.uuids) {
        obj           = json.uuids;
        obj.__proto__ = new(Array);
    } else if (Array.isArray(json)) {
        obj           = json.slice(0);
        obj.__proto__ = new(Array);
    } else {
        obj           = {};
        obj.__proto__ = new(Object);
        Object.keys(json).forEach(function (k) {
            obj[k] = json[k];
        });
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
        return this.json;
    },
    toString: function () {
        return JSON.stringify(this.json);
    }
};

this.collectionPrototype = {
    forEach: function (f) {
        for (var i = 0; i < this.length; i++) {
            if (f.length === 1) {
                f.call(this[i], this[i]);
            } else {
                f.call(this[i], this[i].key,
                                this[i].json || this[i].value || null,
                                this[i].id);
            }
        }
    },
    map: function (f) {
        var ary = [];
        if (f.length === 1) {
            this.forEach(function (a) { ary.push(f.call(this, a)) });
        } else {
            this.forEach(function () { ary.push(f.apply(this, arguments)) });
        }
        return ary;
    },
    toArray: function () {
        return this.map(function (k, v) { return v });
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
    return Object.defineProperties(obj.__proto__, descriptor);
};
