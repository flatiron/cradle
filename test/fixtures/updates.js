// Execute a document update passing a JSON object in the request body
exports.parsing = function(doc, req)
{
	// Either update an existing document or create a new one
	var doc = doc || { _id:req.uuid }
	var res = {
		ok: true,
		id: doc._id,
		inputType: req.headers['Content-Type'] || req.headers['Content-type'],
		reqBody: req.query.body,
		reqForm: req.query.form,
		parsedInput: null
	};
	// If received and parsed a form
	if(res.inputType.indexOf('application/x-www-form-urlencoded') == 0)
	{	// Take the couchdb parsed object
		res.parsedInput = req.form;
	}
	else if(res.inputType.indexOf('application/json') == 0)
	{	// Otherwise try to parse the body as json
		try {
			res.parsedInput = JSON.parse(req.body);
		} catch(err) {
			return [null, toJSON({err:'bad_request', reason:err})];
		}
	}
	// Straightly copy the values from the input into the document
	for(var f in res.parsedInput) {
		doc[f] = res.parsedInput[f];
	}
	// Save doc and return request info to the client
	return [doc, toJSON(res)];
}
