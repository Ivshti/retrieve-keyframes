#!/usr/bin/env node

var retrieveKeyframes = require('./')

var file = process.argv[2]
var fn = file.match('.mp4$') ? retrieveKeyframes.getForMp4 : (file.match('.mkv$') || file.match('.webm$') ? retrieveKeyframes.getForMkv : null)

var isSeconds = process.argv.some(function(arg) { return arg === '--seconds' })

if (! fn) {
	console.error('pass a mkv or mp4 file')
	process.exit(1)
}

fn(file, function(err, res) {
	if (err) return console.error(err)

	if (isSeconds) res.forEach(function(frame) { console.log((frame.timestamp / 1000).toFixed(6)) })
	else res.forEach(function(frame) { console.log(frame) })
})