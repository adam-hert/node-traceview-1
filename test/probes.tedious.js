var tv = global.tv = require('..')
var helper = require('./helper')
var should = require('should')
var addon = tv.addon

var pkg = require('tedious/package.json')
var tedious = require('tedious')
var Connection = tedious.Connection
var Request = tedious.Request
var TYPES = tedious.TYPES

describe('probes.tedious', function () {
  var emitter
  var ctx = {}
  var cluster
  var pool
  var db

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  // Yes, this is really, actually needed.
  // Sampling may actually prevent reporting,
  // if the tests run too fast. >.<
  beforeEach(function (done) {
    helper.padTime(done)
  })

  function env (key) {
    return process.env['MSSQL_' + key]
  }

  var host = env('HOST')
  var user = env('USER')
  var pass = env('PASS')

  var checks = {
    'mssql-entry': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', 'test')
      msg.should.have.property('Flavor', 'mssql')
      msg.should.have.property('RemoteHost', host + ':1433')
    },
    'mssql-exit': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'exit')
    }
  }

  if (host && user && pass) {
    it('should support basic queries', test_basic)
    it('should support parameters', test_parameters)
    it('should support sanitization', test_sanitization)
  } else {
    it.skip('should support basic queries', test_basic)
    it.skip('should support parameters', test_parameters)
    it.skip('should support sanitization', test_sanitization)
  }

  // Query helper
  function query (fn) {
    var connection = new Connection({
      database: 'test',
      userName: user,
      password: pass,
      server: host
    })

    connection.on('connect', function (err) {
      connection.execSql(fn())
    })
  }

  function test_basic (done) {
    helper.httpTest(emitter, function (done) {
      query(function () {
        return new Request("select 42, 'hello world'", onComplete)
        function onComplete (err, count) {
          done()
        }
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', "select 42, 'hello world'")
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], done)
  }

  function test_parameters (done) {
    helper.httpTest(emitter, function (done) {
      query(function () {
        var request = new Request("select @num, @msg", onComplete)
        request.addParameter('num', TYPES.Int, '42')
        request.addParameter('msg', TYPES.VarChar, 'hello world')

        function onComplete (err, count) {
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', "select @num, @msg")
        msg.should.have.property('QueryArgs', '{"num":"42","msg":"hello world"}')
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], done)
  }

  function test_sanitization (done) {
    helper.httpTest(emitter, function (done) {
      tv.tedious.sanitizeSql = true
      query(function () {
        var request = new Request("select 42, @msg", onComplete)
        request.addParameter('msg', TYPES.VarChar, 'hello world')

        function onComplete (err, count) {
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', "select 0, @msg")
        msg.should.have.property('QueryArgs', '{}')
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], function (err) {
      tv.tedious.sanitizeSql = false
      done(err)
    })
  }

})
