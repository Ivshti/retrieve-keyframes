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


//getForMp4("http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4", function(err, res) { console.log(err,res) })
//getForMp4("http://ia902508.us.archive.org/17/items/CartoonClassics/Krazy_Kat_-_Keeping_Up_With_Krazy.mp4", function(err, res) { console.log(err,res) });
// ffprobe -select_streams v:0 -show_frames -of compact -i http://ia902508.us.archive.org/17/items/CartoonClassics/Krazy_Kat_-_Keeping_Up_With_Krazy.mp4  | grep 'key_frame=1' | head -n 50

// getForMkv("http://jell.yfish.us/media/jellyfish-3-mbps-hd-h264.mkv", function(err, res) { console.log(err, res) })
