var http = require('http'),
    events = require('events');

var client = http.createClient(5984, '127.0.0.1');

function r(method, url, doc) {
    var promise = new(events.EventEmitter);
    var request = client.request(method, url, {});

    if (doc) { request.write(JSON.stringify(doc)) }

    request.addListener('response', function (res) {
        var body = '';

        res.setEncoding('utf8');
        res.addListener('data', function (chunk) {
            body += (chunk || '');
        }).addListener('end', function () {
            var obj, response;

            try { obj = JSON.parse(body) }
            catch (e) { return promise.emit('error', e) }

            promise.emit('success', obj);
        });
    });
    request.end();
    return promise;
}

['rabbits', 'pigs','badgers'].forEach(function (db) {
    r('DELETE', '/' + db).addListener('success', function () {
        if (db === 'pigs') {
            r('PUT', '/pigs').addListener('success', function () {
                r('PUT', '/pigs/_design/pigs', {
                    _id: '_design/pigs', views: {
                        all: { map: "function (doc) { if (doc.color) emit(doc._id, doc) }" }
                    }
                });
                r('PUT', '/pigs/mike', {color: 'pink'});
                r('PUT', '/pigs/bill', {color: 'blue'});
            });
        } else if (db === 'rabbits') {
            r('PUT', '/rabbits').addListener('success', function () {
                r('PUT', '/rabbits/alex', {color: 'blue'});
            });
        }
    });
});
