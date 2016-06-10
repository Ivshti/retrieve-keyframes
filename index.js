var mkv = require('matroska')
var mp4box = require('mp4box')
var needle = require('needle')

function onlySeekCues() {
	return {
		skipTags: {
			SimpleBlock: true,
			Void: true,
			Block: true,
			FileData: true,
			Cluster: true,
			Tracks: true
		}
	};
}

function atPath() {
	var args = Array.prototype.slice.call(arguments)
	var arg
	var data = args.shift()
	while (arg = args.shift()) {
		if (! arg) return data;
		if (! data.children) return;
		data = data.children.filter(function(x) { return x._name === arg })[0]
		if (! data) return
	}
	return data
}
function getForMkv(url, cb) {
	var decoder = new mkv.Decoder(onlySeekCues());
	decoder.parseEbmlIDs(url, [ mkv.Schema.byName.Cues ], function(err, doc) {
		var cues = atPath(doc, "Segment", "Cues");
		if (! (cues && cues.children && cues.children.length)) return cb(new Error("no cues found in doc -> Segment -> Cues"));

		cues = cues.children.filter(function(x) { return x._name === "CuePoint" }) 

		if (! cues.length) return cb(new Error("no CuePoints"));

		cb(null, cues.map(function(cue) {
			// children[0] is CueTime
			return cue.children[0].getUInt()
		}))
		// "doc -> Segment -> Cues -> CuePoint []"
	})
}

function getForMp4(url, cb) {	
	var box = new mp4box.MP4Box();
	var err, res, pos = 0;

	function toArrayBuffer(buffer) {
		var ab = new ArrayBuffer(buffer.length);
		var view = new Uint8Array(ab);
		for (var i = 0; i < buffer.length; ++i) view[i] = buffer[i];
		return ab;
	}

	var stream = needle.get(url)
	.on('error', cb)
	.on('data', function(buf) { 
		var b = toArrayBuffer(buf);
		b.fileStart = pos;
		pos+=b.byteLength;
		box.appendBuffer(b);
	})

	box.onError = cb;
	box.onReady = function(info) {
		box.flush();
		stream.end();

		if (!info) return cb(new Error("no info returned"));
		if (!info.videoTracks[0]) return cb(new Error("no videoTracks[0]"))

		try {
			// stss - "Sync samples are also known as keyframes or intra-coded frames."
			// WARNING: ffmpeg reads key_frame=1 at best_effort_timestamp and pts_time exactly 1ms after what stss gives us; research why
			var track = box.inputIsoFile.moov.traks[0];
			var stsz = track.mdia.minf.stbl.stsz;
			if (stsz.sample_size) {
				cb(new Error("mp4 uniform size of stsz"));
			} else {
				var sizes = stsz.sample_sizes;
				var ratio = stsz.size / stsz.sample_count;
				cb(null, track.mdia.minf.stbl.stss.sample_numbers.map(function(x) { return (x-1)*ratio*10 }));
			}
		} catch(e) { cb(e) }
	}

	
	// we need the stss box - moov.traks[<trackNum>].mdia.minf.stbl.stss
	// https://github.com/gpac/mp4box.js/blob/master/src/parsing/stss.js
	// http://wiki.multimedia.cx/?title=QuickTime_container#stss
	// "Sync samples are also known as keyframes or intra-coded frames."
	// we also may need stts to get their time
	// https://github.com/gpac/mp4box.js/blob/master/src/parsing/stts.js

}

//getForMp4("http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4", function(err, res) { console.log(err,res) })

//getForMp4("http://ia902508.us.archive.org/17/items/CartoonClassics/Krazy_Kat_-_Keeping_Up_With_Krazy.mp4", function(err, res) { console.log(err,res) });

module.exports = {
	get: function(url, container, cb) {
		if (typeof(container) === "undefined") container = url.match(/\.mkv/) ? "mkv" : "mp4"; // hack-ish way to infer container
		if (container === "matroska") container = "mkv";
		(container === "mkv" ? getForMkv : getForMp4)(url, cb)
	},
	getForMkv: getForMkv,
	getForMp4: getForMp4
}
