var debug = require('debug')('node-oboe:__init')
var cls = require('continuation-local-storage')
var extend = require('util')._extend
var os = require('os')

var Layer = require('./layer')
var Event = require('./event')
var oboe = require('./addon')
require('./require-patch')

//
// Expose lower-level components
//
exports.addon = oboe
exports.Layer = Layer
exports.Event = Event


//
// Abstract settings with setters and getters
//
var traceMode, sampleRate, sampleSource
var modeMap = {
  through: oboe.TRACE_THROUGH,
  always: oboe.TRACE_ALWAYS,
  never: oboe.TRACE_NEVER
}

// Adjust tracing mode
Object.defineProperty(exports, 'traceMode', {
  get: function () { return traceMode },
  set: function (value) {
    if (typeof value !== 'number') {
      value = modeMap[value]
    }
    debug('set tracing mode to ' + value)
    oboe.Context.setTracingMode(value)
    traceMode = value
  }
})

// Adjust sample rate
Object.defineProperty(exports, 'sampleRate', {
  get: function () { return sampleRate },
  set: function (value) {
    debug('set sample rate to ' + value)
    oboe.Context.setDefaultSampleRate(value)
    sampleRate = value
  }
})

// Adjust sample source
Object.defineProperty(exports, 'sampleSource', {
  get: function () { return sampleSource },
  set: function (value) {
    sampleSource = value
  }
})

// Sugar to detect if the current mode is of a particular type
Object.keys(modeMap).forEach(function (mode) {
  Object.defineProperty(exports, mode, {
    get: function () { return traceMode === modeMap[mode] }
  })
})


//
// Set default settings
//
exports.traceMode = 'through'


//
// Load config file, if present
//
try {
  var config = require(process.cwd() + '/oboe.json')
  extend(exports, config)
} catch (e) {
}


//
// Create reporter instance
//
exports.reporter = new oboe.UdpReporter('127.0.0.1')


//
// Use continuation-local-storage to follow traces through a request
//
exports.requestStore = cls.createNamespace('oboe-request-store')

// Detect if there is a running trace
Object.defineProperty(exports, 'tracing', {
  get: function () { return !!exports.trace }
})
Object.defineProperty(exports, 'trace', {
  get: function () { return exports.requestStore.get('lastEvent') }
})


//
// Some helper methods
//
exports.sample = sample
function sample (layer, xtrace, meta) {
  var rv = oboe.Context.sampleRequest(layer, xtrace || '', meta || '')
  if ( ! rv[0]) return false
  exports.sampleSource = rv[1]
  exports.sampleRate = rv[2]
  return rv
}

// Send __Init event
exports.requestStore.run(function () {
  var layer = new Layer('nodejs', null, {
    '__Init': 1,
    'Layer': 'nodejs',
    'Label': 'entry',
    'Node.Version': process.versions.node,
    'Node.V8.Version': process.versions.v8,
    'Node.LibUV.Version': process.versions.uv,
    'Node.OpenSSL.Version': process.versions.openssl,
    'Node.Ares.Version': process.versions.ares,
    'Node.ZLib.Version': process.versions.zlib,
    'Node.HTTPParser.Version': process.versions.http_parser,
    'Node.Oboe.Version': require('../package.json').version,
  })
  layer.enter()
  layer.exit()
})