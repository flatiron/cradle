/*jshint node:true */

var util = require('util');

// create custom Error object for better callback(err, ...) support
// accepts an JSON object from CouchDB's REST errors
function CouchError (err) {
	// ensure proper stack trace
	Error.call(this);
	Error.captureStackTrace(this, this.constructor);

	this.name = this.constructor.name;
	this.message = err.error + ': ' + err.reason;

	// add properties from CouchDB error response to Error object
	for (var k in err) {
		if (err.hasOwnProperty(k)) {
			this[k] = err[k];
		}
	}
    this.headers = err.headers;
}
// CouchError instanceof Error
util.inherits(CouchError, Error);


// export
this.CouchError = CouchError;
