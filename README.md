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
Cradle's API, although closely knit with CouchDB's, isn't overly so. Whenever the API can be abstracted in a friendlier, simpler way, that's the route it takes. So even though a large part of the `Cradle <--> CouchDB` mappings are one to one, some Cradle functions, such as `save()`, can perform more than one operation, depending on how they are used.

synopsis
--------

``` js
  var cradle = require('cradle');
  var db = new(cradle.Connection)().database('starwars');

  db.get('vader', function (err, doc) {
      doc.name; // 'Darth Vader'
      assert.equal(doc.force, 'dark');
  });

  db.save('skywalker', {
      force: 'light',
      name: 'Luke Skywalker'
  }, function (err, res) {
      if (err) {
          // Handle error
      } else {
          // Handle success
      }
  });
```

installation
------------

``` bash
  $ npm install cradle
```

API
---

Cradle's API builds right on top of Node's asynch API. Every asynch method takes a callback as its last argument. The return value is an `event.EventEmitter`, so listeners can also be optionally added.

### Opening a connection ###

``` js
  new(cradle.Connection)('http://living-room.couch', 5984, {
      cache: true,
      raw: false
  });
```

_Defaults to `127.0.0.1:5984`_

Note that you can also use `cradle.setup` to set a global configuration:

``` js
  cradle.setup({
    host: 'living-room.couch',
    cache: true, 
    raw: false
  });

  var c = new(cradle.Connection),
     cc = new(cradle.Connection)('173.45.66.92');
```

### creating a database ###

``` js
  var db = c.database('starwars');
  db.create();
```

#### checking for database existence ####

You can check if a database exists with the `exists()` method.

``` js
  db.exists(function (err, exists) {
    if (err) {
      console.log('error', err);
    } else if (exists) {
      console.log('the force is with you.');
    } else {
      console.log('database does not exists.');
      db.create();
      /* populate design documents */
    }
  });
```

### destroy a database ###

``` js
  db.destroy(cb);
```

### fetching a document _(GET)_ ###

``` js
  db.get('vader', function (err, doc) {
      sys.puts(doc);
  });
```

> If you want to get a specific revision for that document, you can pass it as the 2nd parameter to `get()`.

Cradle is also able to fetch multiple documents if you have a list of ids, just pass an array to `get`:

``` js
  db.get(['luke', 'vader'], function (err, doc) { ... });
```

### Querying a view ###

``` js
  db.view('characters/all', function (err, res) {
      res.forEach(function (row) {
          sys.puts(row.name + " is on the " +
                   row.force + " side of the force.");
      });
  });
```

#### Querying a row with a specific key ####
Lets suppose that you have a design document that you've created:

``` js
  db.save('_design/user', {
    views: {
      byUsername: {
        map: 'function (doc) { if (doc.resource === 'User') { emit(doc.username, doc) } }'
      }
    }
  });
```

In CouchDB you could query this view directly by making an HTTP request to:

```
  /_design/User/_view/byUsername/?key="luke"
```

In `cradle` you can make this same query by using the `.view()` database function: 

``` js
  db.view('user/byUsername', { key: 'luke' }, function (err, doc) {
      console.dir(doc);
  });
```

### creating/updating documents ###

In general, document creation is done with the `save()` method, while updating is done with `merge()`.

#### creating with an id _(PUT)_ ####

``` js
  db.save('vader', {
      name: 'darth', force: 'dark'
  }, function (err, res) {
      // Handle response
  });
```

#### creating without an id _(POST)_ ####

``` js
  db.save({
      force: 'dark', name: 'Darth'
  }, function (err, res) {
      // Handle response
  });
```

#### updating an existing document with the revision ####

``` js
  db.save('luke', '1-94B6F82', {
      force: 'dark', name: 'Luke'
  }, function (err, res) {
      // Handle response
  });
```

Note that when saving a document this way, CouchDB overwrites the existing document with the new one. If you want to update only certain fields of the document, you have to fetch it first (with `get`), make your changes, then resave the modified document with the above method.

If you only want to update one or more attributes, and leave the others untouched, you can use the `merge()` method:

``` js
  db.merge('luke', {jedi: true}, function (err, res) {
      // Luke is now a jedi,
      // but remains on the dark side of the force.
  });
```

Note that we didn't pass a `_rev`, this only works because we previously saved a full version of 'luke', and the `cache` option is enabled.

#### bulk insertion ####

If you want to insert more than one document at a time, for performance reasons, you can pass an array to `save()`:

``` js
  db.save([
      { name: 'Yoda' },
      { name: 'Han Solo' },
      { name: 'Leia' }
  ], function (err, res) {
      // Handle response
  });
```

#### creating views ####

Here we create a design document named 'characters', with two views: 'all' and 'darkside'.

``` js
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
```

These views can later be queried with `db.view('characters/all')`, for example.

Here we create a temporary view. WARNING: do not use this in production as it is
extremely slow (use it to test views).

``` js
  db.temporaryView({
      map: function (doc) {
        if (doc.color) emit(doc._id, doc);
      }
    }, function (err, res) {
      if (err) console.log(err);
      console.log(res);
  });
```

### creating validation ###

when saving a design document, cradle guesses you want to create a view, mention views explicitly to work around this.

``` js
  db.save('_design/laws', {
    views: {},
    validate_doc_update: 
      function (newDoc, oldDoc, usrCtx) {
        if(! /^(light|dark|neutral)$/(newDoc.force))
          throw { error: "invalid value", reason:"force must be dark, light, or neutral" }
      }
    }
  });
```

### removing documents _(DELETE)_ ###

To remove a document, you call the `remove()` method, passing the latest document revision.

``` js
  db.remove('luke', '1-94B6F82', function (err, res) {
      // Handle response
  });
```


If `remove` is called without a revision, and the document was recently fetched from the database, it will attempt to use the cached document's revision, providing caching is enabled.

Connecting with authentication and SSL
--------------------------------------

``` js
  var connection = new(cradle.Connection)('https://couch.io', 443, {
      auth: { username: 'john', password: 'fha82l' }
  });
```

or

``` js
  var connection = new(cradle.Connection)('couch.io', 443, {
      secure: true,
      auth: { username: 'john', password: 'fha82l' }
  });
```

Changes API
-----------

For a one-time `_changes` query, simply call `db.changes` with a callback:

``` js
  db.changes(function (list) {
      list.forEach(function (change) { console.log(change) });
  });
```

Or if you want to see changes since a specific sequence number:

``` js
  db.changes({ since: 42 }, function (list) {
      ...
  });
```

The callback will receive the list of changes as an *Array*. If you want to include
the affected documents, simply pass `include_docs: true` in the options.

### Streaming #

You can also *stream* changes, by calling `db.changes` without the callback:

``` js
  db.changes({ since: 42 }).on('response', function (res) {
      res.on('data', function (change) {
          console.log(change);
      });
      res.on('end', function () { ... });
  });
```

In this case, it returns an `EventEmitter`, which behaves very similarly to node's `Stream` API.


Other API methods
-----------------

### CouchDB Server level ###

``` js
  new(cradle.Connection)().*
```

- `databases()`: Get list of databases
- `config()`: Get server config
- `info()`: Get server information
- `stats()`: Statistics overview
- `activeTasks()`: Get list of currently active tasks
- `uuids(count)`: Get _count_ list of UUIDs
- `replicate(options)`: Replicate a database.

### database level ###

``` js
  new(cradle.Connection)().database('starwars').*
```

- `info()`: Database information
- `all()`: Get all documents
- `allBySeq()`: Get all documents by sequence
- `compact()`: Compact database
- `viewCleanup()`: Cleanup old view data
- `replicate(target, options)`: Replicate this database to `target`.

