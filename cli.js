#!/usr/bin/env node

var retrieveKeyframes = require('./')

var file = process.argv[2]
var fn = file.match('.mp4$') ? retrieveKeyframes.getForMp4 : (file.match('.mkv$') ? retrieveKeyframes.getForMkv : null)

if (! fn) {
	console.error('pass a mkv or mp4 file')
	process.exit(1)
}

fn(file, function(err, res) {
	if (err) return console.error(err)

	res.forEach(function(frame) { console.log(frame) })
})
