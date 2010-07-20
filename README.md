cradle
======

A high-level, caching, CouchDB client for Node.js

introduction
------------

Cradle is an asynchronous javascript client for [CouchDB](http://couchdb.apache.org).
It is somewhat higher-level than most other CouchDB clients, requiring a little less knowledge of CouchDB's REST API.
Cradle also has built-in write-through caching, giving you an extra level of speed, and making document _updates_ and _deletion_ easier.
Cradle was built from the love of CouchDB and Node.js, and tries to make the most out of this wonderful marriage of technologies.

philosophy
----------

The key concept here is the common ground shared by CouchDB and Node.js, that is, _javascript_. The other important aspect of this marriage is the asynchronous behaviors of both these technologies. Cradle tries to make use of these symmetries, whenever it can.
Cradle's API, although closely knit with CouchDB's, isn't overly so. Whenever the API can be abstracted in a friendlier, simpler way, that's the route it takes. So even though a large part of the `Cradle <--> CouchDB` mappings are one to one, some Cradle functions, such as `insert()`, can perform more than one operation, depending on how they are used.

synopsis
--------

    var cradle = require('cradle');
    var db = new(cradle.Connection).database('starwars');

    db.get('vador', function (err, doc) {
        doc.name; // 'Darth Vador'
        assert.equal(doc.force, 'dark');
    });

    db.insert('skywalker', {
        force: 'light',
        name: 'Luke Skywalker'
    }, function (err, res) {
        if (err) {
            // Handle error
        } else {
            // Handle success
        }
    });

installation
------------

    $ npm install cradle

API
---

Cradle's API builds right on top of Node's asynch API. Every asynch method takes a callback as its last argument. The return value is an `event.EventEmitter`, so listeners can also be optionally added.

### Opening a connection ###

    new(cradle.Connection)('http://living-room.couch', 5984, {
        cache: true,
        raw: false
    });

_Defaults to `127.0.0.1:5984`_

Note that you can also use `cradle.setup` to set a global configuration:

    cradle.setup({host: 'http://living-room.couch',
                  options: {cache: true, raw: false}});
    var c = new(cradle.Connection),
       cc = new(cradle.Connection)('173.45.66.92');

### creating a database ###

    var db = c.database('starwars');
    db.create();

> You can check if a database exists with the `exists()` method.

### fetching a document _(GET)_ ###

    db.get('vador', function (err, doc) {
        sys.puts(doc);
    });

> If you want to get a specific revision for that document, you can pass it as the 2nd parameter to `get()`.

Cradle is also able to fetch multiple documents if you have a list of ids, just pass an array to `get`:

    db.get(['luke', 'vador'], function (err, doc) { ... });

### Querying a view ###

    db.view('characters/all', function (err, res) {
        res.forEach(function (row) {
            sys.puts(row.name + " is on the " +
                     row.force + " side of the force.");
        });
    });

### creating/updating documents ###

In general, document creation is done with the `insert()` method, while updating/overwriting is done with `save()`.

#### creating with an id _(PUT)_ ####

    db.insert('vador', {
        name: 'darth', force: 'dark'
    }, function (err, res) {
        // Handle response
    });

#### creating without an id _(POST)_ ####

    db.insert({
        force: 'dark', name: 'Darth'
    }, function (err, res) {
        // Handle response
    });

#### updating an existing document with the revision ####

    db.save('luke', '1-94B6F82', {
        force: 'dark', name: 'Luke'
    }, function (err, res) {
        // Handle response
    });

Note that when saving a document this way, CouchDB overwrites the existing document with the new one. If you want to update only certain fields of the document, you have to fetch it first (with `get`), make your changes, then resave it with the above method.

However, if a `_rev` isn't explicitly passed, and Cradle has a cached version of the document in storage, it will try to merge your changes, and save the new version to the database.

    db.save('luke', {jedi: true}, function (err, res) {
        // Luke is now a jedi,
        // but remains on the dark side of the force.
    });

This only works because we previously saved a full version of 'luke', and the `cache` option is enabled.

#### bulk insertion ####

If you want to insert more than one document at a time, for performance reasons, you can pass an array to `insert()`:

    db.insert([
        {name: 'Yoda'},
        {name: 'Han Solo'},
        {name: 'Leia'}
    ], function (err, res) {
        // Handle response
    });

#### creating views ####

Here we create a design document named 'characters', with two views: 'all' and 'darkside'.

    db.insert('_design/characters', {
        all: {
            map: function (doc) {
                if (doc.name) emit(doc.name, doc);
            }
        },
        darkside: {
            map: function (doc) {
                if (doc.name && doc.force == 'dark') {
                    emit(null, doc);
                }
            }
        }
    });

These views can later be queried with `db.view('characters/all')`, for example.

### removing documents _(DELETE)_ ###

To remove a document, you call the `remove()` method, passing the latest document revision.

    db.remove('luke', '1-94B6F82', function (err, res) {
        // Handle response
    });


If `remove` is called without a revision, and the document was recently fetched from the database, it will attempt to use the cached document's revision, providing caching is enabled.

Other API methods
-----------------

### CouchDB Server level ###

    new(cradle.Connection).*

- `databases()`: Get list of databases
- `config()`: Get server config
- `info()`: Get server information
- `stats()`: Statistics overview
- `activeTasks()`: Get list of currently active tasks
- `uuids(count)`: Get _count_ list of UUIDs

### database level ###

    new(cradle.Connection).database('starwars').*

- `info()`: Database information
- `all()`: Get all documents
- `allBySeq()`: Get all documents by sequence
- `compact()`: Compact database
- `viewCleanup()`: Cleanup old view data

