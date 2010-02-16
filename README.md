cradle
======

A high-level, caching, CouchDB client for Node.js

introduction
------------

Cradle is an asynchronous javascript client for [CouchDB](http://couchdb.apache.org).
It is somewhat higher-level than most other CouchDB clients, requiring a little less knowledge of CouchDB's REST API.
Cradle also has built-in write-through caching, giving you an extra level of speed.
Cradle was built from the love of CouchDB and Node.js, and tries to make the most out of this wonderful marriage of technologies. 

philosophy
----------

The key concept here is the common ground shared by CouchDB and Node.js, that is, _javascript_. The other important aspect of this marriage is the asynchronous behaviors of both these technologies. Cradle tries to make use of these symmetries, whenever it can.
Cradle's API, although closely knit with CouchDB's, isn't overly so. Whenever the API can be abstracted in a friendlier, simpler way, that's the route it take. So even though a large part of the Cradle <--> CouchDB mappings are one to one, some Cradle functions, such as `save()`, can perform more than one operation, depending on how it's used.

synopsis
--------

    var cradle = require('cradle');
    var db = new(cradle.Connection).database('starwars');
    
    db.get('vador').addCallback(function (doc) {
        doc.name; // 'Darth Vador'
        assert.equal(doc.force, 'dark');
    });

    db.save('skywalker', {
        force: 'light',
        name: 'Luke Skywalker'
    }).addCallback(function (res) {
        // Handle success
    }).addErrback(function (res) {
        // Handle error
    });
    
API
---

The key concept to remember is that all database querying functions return a *promise*, 
so getting the return value is a matter of chaining an `addCallback()` on to them.

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

_You can check if a database exists with the `exists()` method._

### fetching a document _(GET)_ ###

    db.get('vador').addCallback(function (doc) {
        sys.puts(doc);
    });

_If you want to get a specific revision for that document, you can pass it as the 2nd parameter to `get()`._

### Querying a view ###

    db.view('characters/all').addCallback(function (res) {
        res.forEach(function (row) {
            sys.puts(row.name + " is on the " + 
                     row.force + " side of the force.");
        });
    });

### creating/updating documents ###

All saving and updating can be done with the `save()` database method.

#### with an id _(PUT)_ ####

    db.save('vador',{
        name: 'darth', force: 'dark'
    }).addCallback(function (res) {
        // Success
    });

#### without an id _(POST)_ ####

    db.save({
        force: 'dark', name: 'Darth'
    }).addCallback(function (res) {
        // Success
    });

#### updating an existing document with the revision ####

    db.save('luke', '1-94B6F82', {
        force: 'dark', name: 'Luke'
    }).addCallback(function (res) {
        // Success 
    });

Note that when saving a document this way, CouchDB overwrites the existing document with the new one. If you want to update only certain fields of the document, you have to fetch it first (with `get`), make your changes, then resave it with the above method.

However, Cradle also comes with an `update` method, which attempts to merge your changes with a cached version of the document, and save it to the database:

    db.update('luke', {jedi: true}).addCallback(function (res) {
        // Success, luke is now a jedi,
        // but remains on the dark side of the force.
    });

This only works because we previously saved a full version of 'luke', and the `cache` option is enabled.

#### bulk insertion ####

If you want to insert more than one document at a time, for performance reasons, you can pass an array to `save()`:

    db.save([
        {name: 'Yoda'},
        {name: 'Han Solo'},
        {name: 'Leia'}
    ]).addCallback(function (res) {
        // Success 
    });

#### creating views ####

Here we create a design document named 'characters', with two views: 'all' and 'darkside'.

    db.save('_design/characters', {
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

    db.remove('luke', '1-94B6F82').addCallback(function () {
        // Success 
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

