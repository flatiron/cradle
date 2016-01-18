cradle
======

[![Dependency Status](https://david-dm.org/flatiron/cradle.svg)](https://david-dm.org/flatiron/cradle)

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
      raw: false,
      forceSave: true,
      request: {
        //Pass through configuration to `request` library for all requests on this connection.
      }
  });
```

_Defaults to `127.0.0.1:5984`_

Note that you can also use `cradle.setup` to set a global configuration:

``` js
  cradle.setup({
    host: 'living-room.couch',
    cache: true,
    raw: false,
    forceSave: true
  });

  var c = new(cradle.Connection),
     cc = new(cradle.Connection)('173.45.66.92');
```

### creating a database ###

``` js
  var db = c.database('starwars');
  db.create(function(err){
    /* do something if there's an error */
  });
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
      console.log(doc);
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
          console.log("%s is on the %s side of the force.", row.name, row.force);
      });
  });
```

You can access the key and value of the response with forEach using two parameters. An optional third parameter will return the id like this example.

``` js
  db.view('characters/all', function (err, res) {
      res.forEach(function (key, row, id) {
          console.log("%s has view key %s.", row.name, key);
      });
  });
```

To use [View Generation Options](http://wiki.apache.org/couchdb/HTTP_view_API#View_Generation_Options) you can use the view Method with three parameters (viewname, options, callback):

``` js
  db.view('characters/all', {group: true, reduce: true} , function (err, res) {
      res.forEach(function (row) {
          console.log("%s is on the %s side of the force.", row.name, row.force);
      });
  });
```

#### Querying a row with a specific key ####
Lets suppose that you have a design document that you've created:

``` js
  db.save('_design/user', {
    views: {
      byUsername: {
        map: 'function (doc) { if (doc.resource === "User") { emit(doc.username, doc) } }'
      }
    }
  });
```

In CouchDB you could query this view directly by making an HTTP request to:

```
  /_design/user/_view/byUsername/?key="luke"
```

In `cradle` you can make this same query by using the `.view()` database function:

``` js
  db.view('user/byUsername', { key: 'luke' }, function (err, doc) {
      console.dir(doc);
  });
```

#### Querying a view with an array key

Say you create view for cars that has an array key with make and model
``` js
db.save('_design/cars', {
  views: {
    byMakeAndModel: {
      map: function (doc) {
        if (doc.resource === 'Car' && doc.make && doc.model) {
          var key = [doc.make, doc.model]
          emit(key, doc)
        }
      }
    }
  }
})
```
If you want all the cars made by *Ford* with a model name between *Rav4* and later (alphabetically sorted).
In CouchDB you could query this view directly by making an HTTP request to:
```
  /_design/cars/_view/byMakeAndModel/?startkey=["Ford"]&endkey=["Ford", "\u9999"]
```

In `cradle` you can make this same query by using the `.view()` database function with `startkey` and `endkey` options.

``` js
var util = require('util')
var opts = {
  startkey: ['Ford'],
  endkey: ['Ford', '\u9999']
}
db.view('cars/', opts, function (err, docs) {
  if (err) {
    util.error(err)
    return
  }
  util.debug(docs)
});
```
 In the options object you can also optionally specify whether or not to `group` and `reduce` the output. In this example `reduce` must be false since there is no reduce function defined for the `cars/byMakeAndModel`. With grouping and reducing the options object would look like:
``` js
var opts = {
  startkey: ['Ford'],
  endkey: ['Ford', '\u9999'],
  group: true,
  reduce: true
}
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
Note: If you must use [View Generation Options](http://wiki.apache.org/couchdb/HTTP_view_API#View_Generation_Options) on your temporary view you can use the three parameter version of the temporaryView() Method - similar to the one described above.

### creating validation ###

when saving a design document, cradle guesses you want to create a view, mention views explicitly to work around this.

``` js
  db.save('_design/laws', {
    views: {},
    validate_doc_update:
      function (newDoc, oldDoc, usrCtx) {
        if (! /^(light|dark|neutral)$/.test(newDoc.force))
          throw({forbidden: {error: "invalid value", reason: "force must be dark, light, or neutral"}})
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

### update handlers ###

Update handlers can be used by calling the `update()` method, specifying the update handler name, and optionally the document id, the query object and the document body object. Only the update handler name is a required function parameter. Note that CouchDB is able to parse query options only if the URI-encoded length is less than 8197 characters. Use the body parameter for larger objects.

``` js
  db.update('my_designdoc/update_handler_name', 'luke', undefined, { my_param: false }, function (err, res) {
      // Handle the response, specified by the update handler
  });
```

Connecting with authentication and SSL
--------------------------------------

``` js
  var connection = new(cradle.Connection)('https://couch.io', 443, {
      auth: { username: 'john', password: 'fha82l' }
  });
```

or providing a self signed CA certificate

``` js
  var connection = new(cradle.Connection)('https://couch.io', 443, {
      auth: { username: 'john', password: 'fha82l' },
      ca: fs.readFileSync('path_to_self_signed_ca.crt')
  });
```

or

``` js
  var connection = new(cradle.Connection)('couch.io', 443, {
      secure: true,
      auth: { username: 'john', password: 'fha82l' }
  });
```

Retry on Connection Issues
--------------------------

For a unreliable connection, you can have non-streaming queries automatically retry:

``` js
  var connection = new(cradle.Connection)('couch.io', 443, {
      retries: 3,
      retryTimeout: 30 * 1000
  });
```

Changes API
-----------

For a one-time `_changes` query, simply call `db.changes` with a callback:

``` js
  db.changes(function (err, list) {
      list.forEach(function (change) { console.log(change) });
  });
```

Or if you want to see changes since a specific sequence number:

``` js
  db.changes({ since: 42 }, function (err, list) {
      ...
  });
```

The callback will receive the list of changes as an *Array*. If you want to include
the affected documents, simply pass `include_docs: true` in the options.

### Streaming #

You can also *stream* changes, by calling `db.changes` without the callback. This API uses the **excellent** [follow][0] library from [IrisCouch][1]:

``` js
  var feed = db.changes({ since: 42 });

  feed.on('change', function (change) {
      console.log(change);
  });
```

In this case, it returns an instance of `follow.Feed`, which behaves very similarly to node's `EventEmitter` API. For full documentation on the options available to you when monitoring CouchDB with `.changes()` see the [follow documentation][0].

Attachments
-----------
Cradle supports writing, reading, and removing attachments. The read and write operations can be either buffered or streaming
## Writing ##
You can buffer the entire attachment body and send it all at once as a single request. The callback function will fire after the attachment upload is complete or an error occurs

**Syntax**
```js
db.saveAttachment(idData, attachmentData, callbackFunction)
```
**Example**
Say you want to save a text document as an attachment with the name 'fooAttachment.txt' and the content 'Foo document text'
``` js
var doc = <some existing document>
var id = doc._id
var rev = doc._rev
var idAndRevData = {
  id: id,
  rev: rev
}
var attachmentData = {
  name: 'fooAttachment.txt',
  'Content-Type': 'text/plain',
  body: 'Foo document text'
}
db.saveAttachment(idAndRevData, attachmentData, function (err, reply) {
  if (err) {
    console.dir(err)
    return
  }
  console.dir(reply)
})
```


### Streaming ###
You can use a read stream to upload the attachment body rather than buffering the entire body first. The callback function will fire after the streaming upload completes or an error occurs

**Syntax**
```js
var doc = savedDoc // <some saved couchdb document which has an attachment>
var id = doc._id
var rev = doc._rev
var idAndRevData = {
  id: id,
  rev: rev
}
var attachmentData = {
  name: attachmentName               // something like 'foo.txt'
  'Content-Type': attachmentMimeType // something like 'text/plain', 'application/pdf', etc.
  body: rawAttachmentBody            // something like 'foo document body text'
}
var readStream = fs.createReadStream('/path/to/file/')
var writeStream  = db.saveAttachment(idData, attachmentData, callbackFunction)
readStream.pipe(writeStream)
```
When the streaming upload is complete the callback function will fire


**Example**
Attach a pdf file with the name 'bar.pdf' located at path './data/bar.pdf' to an existing document

```js
var path = require('path')
var fs = require('fs')
// this document should already be saved in the couchdb database
var doc = {
  _id: 'fooDocumentID',
  _rev: 'fooDocumentRev'
}
var idData = {
  id: doc._id,
  rev: doc._rev
}
var filename = 'bar.pdf' // this is the filename that will be used in couchdb. It can be different from your source filename if desired
var filePath = path.join(__dirname, 'data', 'bar.pdf')
var readStream = fs.createReadStream
// note that there is no body field here since we are streaming the upload
var attachmentData = {
  name: 'fooAttachment.txt',
  'Content-Type': 'text/plain'
}
db.saveAttachment(idData, attachmentData, function (err, reply) {
  if (err) {
    console.dir(err)
    return
  }
  console.dir(reply)
}, readStream)
```


## Reading ##


### Buffered
You can buffer the entire attachment and receive it all at once. The callback function will fire after the download is complete or an error occurs. The second parameter in the callback will be the binary data of the attachment

**Syntax**
```js
db.getAttachment(documentID, attachmentName, callbackFunction)
```
**Example**
 Say you want to read back an attachment that was saved with the name 'foo.txt'
```js
var doc = <some saved document that has an attachment with name *foo.txt*>
var id = doc._id
var attachmentName = 'foo.txt'
db.getAttachment(id, attachmentName, function (err, reply) {
  if (err) {
    console.dir(err)
    return
  }
  console.dir(reply)
})
```

### Streaming
You can stream the attachment as well. If the attachment is large it can be useful to stream it to limit memory consumption. The callback function will fire once the download stream is complete. Note that there is only a single error parameter passed to the callback function. The error is null is no errors occured or an error object if there was an error downloading the attachment. There is no second parameter containing the attachment data like in the buffered read example

**Syntax**
```js
var readStream = db.getAttachment(documentID, attachmentName, callbackFunction)
```

**Example**
 Say you want to read back an attachment that was saved with the name 'foo.txt'. However the attachment foo.txt is very large so you want to stream it to disk rather than buffer the entire file into memory
```js
var doc = <some saved document that has an attachment with name *foo.txt*>
var id = doc._id
var attachmentName = 'foo.txt'
var downloadPath = path.join(__dirname, 'foo_download.txt')
var writeStream = fs.createWriteStream(downloadPath)
var readStream = db.getAttachment('piped-attachment', 'foo.txt', function (err) { // note no second reply paramter
  if (err) {
    console.dir(err)
    return
  }
  console.dir('download completed and written to file on disk at path', downloadPath)
})
readStream.pipe(writeStream)
```
## Removing
You can remove uploaded attachments with a _id and an attachment name

**Syntax**
```js
db.removeAttachment(documentID, attachmentName, callbackFunction)
```
**Example**
 Say you want to remove an attachment that was saved with the name 'foo.txt'
```js
var doc = <some saved document that has an attachment with name *foo.txt*>
var id = doc._id
var attachmentName = 'foo.txt'
db.removeAttachment(id, attachmentName, function (err, reply) {
  if (err) {
    console.dir(err)
    return
  }
  console.dir(reply)
})
```
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
- `compact()`: Compact database
- `viewCleanup()`: Cleanup old view data
- `replicate(target, options)`: Replicate this database to `target`.

### cache API ###

When cache is enabled (default is true), a document is loaded into cradle's cache when it's retrieved or saved. In the event you wish to keep caching enabled, but invalidate specific items - such as those which may have been updated elsewhere. You can use the API below.

**HAS**
```js
db.cache.has('docid');  //returns true if exists, false if not
```

**GET**
```js
db.cache.get('docid');  //returns the document from the cache
```

**PURGE**
```js
db.cache.purge('docid');  //remove this item from the cache
```

**SAVE**
```js
db.cache.save('docid', doc);  //saves the provided document into the cache
```

**Example**
This is an example from an application using express to receive a post request when a documentid has been updated.
```js
app.post('/dbcache/:id', function (req, res) {
  if(db.cache.has(req.params.id)) {
      db.cache.purge(req.params.id);
    res.send({ status:"ok", id: req.params.id, action: 'deleted'});
  }
  else {
    res.send({ status:"not found", id: req.params.id, action: "none"}, 404);
  }
});
```


[0]: https://github.com/iriscouch/follow
[1]: http://iriscouch.com


Testing
-------

After cloning the repo and installing all dependencies (using `npm install`) you can run all tests using [vows](http://vowsjs.org):

```
$ node test/helpers/seed.js
$ vows --spec
```
