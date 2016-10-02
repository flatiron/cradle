Database.prototype.find = function(options, callback) {
    return this.query({
        method: 'POST',
        path: "/_find",
        body: options
    }, callback);
}