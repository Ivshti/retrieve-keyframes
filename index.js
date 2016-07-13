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

		var frames = cues.map(function(cue) {
			// children[0] is CueTime
			// judging by this muxer, timestamp is pts: https://www.ffmpeg.org/doxygen/0.6/matroskaenc_8c-source.html#l00373
			return { timestamp: cue.children[0].getUInt() }
		})

		//if (frames[0] && frames[0].timestamp !== 0) frames.unshift({ timestamp: 0 })
		
		cb(null, frames)
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
			var track = box.inputIsoFile.moov.traks[0];
			//var stsz = track.mdia.minf.stbl.stsz; // sample table sizes - that's in bytes
			var stts = track.mdia.minf.stbl.stts; // sample table time to sample map
			var mdhd = track.mdia.mdhd; // media header

			// we need the stss box - moov.traks[<trackNum>].mdia.minf.stbl.stss - http://wiki.multimedia.cx/?title=QuickTime_container#stss
			// "Sync samples are also known as keyframes or intra-coded frames."
			// This would give us the frame number

			// from stts documentation at https://wiki.multimedia.cx/?title=QuickTime_container#stss
			//    duration = (sample_count1 * sample_time_delta1 + ... + sample_countN * sample_time_deltaN ) / timescale
			//    now, replace sample_count with our sample index-1 and we get the exact timestamp of our frame IN SECONDS
			
			var frames = track.mdia.minf.stbl.stss.sample_numbers.map(function(x) { return { 
					// WARNING: in the BBB video, to match ffmpeg we need x+1, in the other, we need x-1; wtf?
					timestamp: Math.round( ((x-1) * stts.sample_deltas[0] / mdhd.timescale) * 1000 ), // warning: hardcoded to first track 
					index: x
			} });

			if (frames[0] && frames[0].index !== 1) frames.unshift({ timestamp: 0, index: 1 }); // http://bit.ly/1MKue5R - there's a keyframe at the beginning

			cb(null, frames);
		} catch(e) { cb(e) }
	}
}

//getForMp4("http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4", function(err, res) { console.log(err,res) })
//getForMp4("http://ia902508.us.archive.org/17/items/CartoonClassics/Krazy_Kat_-_Keeping_Up_With_Krazy.mp4", function(err, res) { console.log(err,res) });
// ffprobe -select_streams v:0 -show_frames -of compact -i http://ia902508.us.archive.org/17/items/CartoonClassics/Krazy_Kat_-_Keeping_Up_With_Krazy.mp4  | grep 'key_frame=1' | head -n 50

// getForMkv("http://jell.yfish.us/media/jellyfish-3-mbps-hd-h264.mkv", function(err, res) { console.log(err, res) })

module.exports = {
	get: function(url, container, cb) {
		if (typeof(container) === "undefined") container = url.match(/\.mkv/) ? "mkv" : "mp4"; // hack-ish way to infer container
		if (container === "matroska") container = "mkv";
		(container === "mkv" ? getForMkv : getForMp4)(url, cb)
	},
	getForMkv: getForMkv,
	getForMp4: getForMp4
}
