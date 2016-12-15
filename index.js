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
	var arg // string
	var data = args.shift() // object
	if (! data) return
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
		if (err) return cb(err);
		
		var cues = atPath(doc, "Segment", "Cues");
		if (! (cues && cues.children && cues.children.length)) return cb(new Error("no cues found in doc -> Segment -> Cues"));

		cues = cues.children.filter(function(x) { return x._name === "CuePoint" }) 

		if (! cues.length) return cb(new Error("no CuePoints"));

		var frames = cues.map(function(cue) {
			// children[0] is CueTime
			// judging by this muxer, timestamp is pts: https://www.ffmpeg.org/doxygen/0.6/matroskaenc_8c-source.html#l00373
			var t = cue.children[0].getUInt()
			return { timestamp: t, pts: t, dts: t }
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
	.on('end', function(e) { box.flush(); if (e) cb(e) })
	.on('data', function(buf) { 
		var b = toArrayBuffer(buf);
		b.fileStart = pos;
		pos += b.byteLength;
		box.appendBuffer(b);
	})

	box.onError = cb;
	box.onReady = function(info) {
		box.flush();
		stream.end();

		if (!info) return cb(new Error("no info returned"));
		if (!info.videoTracks[0]) return cb(new Error("no videoTracks[0]"))

		//box.inputIsoFile.buildSampleLists();
		//var samples = box.inputIsoFile.moov.traks[0].samples;

		try {
			var track = box.inputIsoFile.moov.traks[0];

			//var stsz = track.mdia.minf.stbl.stsz; // sample table sizes - that's in bytes
			var stts = track.mdia.minf.stbl.stts; // sample table time to sample map
			var ctts = track.mdia.minf.stbl.ctts; // Composition Time Offset  - used to convert DTS to PTS
			var mdhd = track.mdia.mdhd; // media header

			// from stts documentation at https://wiki.multimedia.cx/?title=QuickTime_container#stss
			//    duration = (sample_count1 * sample_time_delta1 + ... + sample_countN * sample_time_deltaN ) / timescale
			var allDts = [ ];
			iterateCounts(stts.sample_counts, stts.sample_deltas, function(delta, idx) { allDts.push(idx * delta) });

			// use ctts to build pts - https://wiki.multimedia.cx/?title=QuickTime_container#ctts
			//console.log(track.mdia.minf.stbl.ctts.sample_counts.length, track.mdia.minf.stbl.ctts.sample_offsets.length, mdhd)
			var allPts = [];
			if (ctts) iterateCounts(ctts.sample_counts, ctts.sample_offsets, function(offset, idx) { allPts.push(allDts[idx] + offset) });

			// we need the stss box - moov.traks[<trackNum>].mdia.minf.stbl.stss - http://wiki.multimedia.cx/?title=QuickTime_container#stss
			// stss - "Sync samples are also known as keyframes or intra-coded frames."
			var frames = track.mdia.minf.stbl.stss.sample_numbers.map(function(x) { 
				// WARNING: in the BBB video, to match ffmpeg we need x+1, in the other, we need x-1; wtf?
				// samples[x].dts/mdhd.timescale
				var dts = allDts[x-1] / mdhd.timescale * 1000;
				var pts = ctts ? allPts[x-1] / mdhd.timescale * 1000 : dts;
				return { dts: dts, pts: pts, timestamp: pts, index: x }
			});

			if (frames[0] && frames[0].index !== 1) frames.unshift({ timestamp: 0, dts: 0, index: 1 }); // http://bit.ly/1MKue5R - there's a keyframe at the beginning

			cb(null, frames);
		} catch(e) { cb(e) }
	}
}

function iterateCounts(counts, values, fn) {
	var idx = 0;
	counts.forEach(function(count, i) {
		for (var j = 0; j!=count; j++) { fn(values[i], idx++) }
	})
}

module.exports = {
	get: function(url, container, cb) {
		if (typeof(container) === "undefined") container = url.match(/\.mkv/) ? "mkv" : "mp4"; // hack-ish way to infer container
		if (container === "matroska") container = "mkv";
		(container === "mkv" ? getForMkv : getForMp4)(url, cb)
	},
	getForMkv: getForMkv,
	getForMp4: getForMp4
}
