var mkv = require('matroska')
var mp4box = require('mp4box')
var needle = require('needle')
var fs = require('fs')

function onlySeekCuesAndTracks() {
	return {
		skipTags: {
			SimpleBlock: true,
			Void: true,
			Block: true,
			FileData: true,
			Cluster: true
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
	var decoder = new mkv.Decoder(onlySeekCuesAndTracks());
	decoder.parseEbmlIDs(url, [ mkv.Schema.byName.Cues, mkv.Schema.byName.Tracks ], function(err, doc) {
		if (err) return cb(err);

		// First, select the video track
		var videoTrackIdx = -1; // initial value
		var tracks = atPath(doc, "Segment", "Tracks");
		tracks.children.forEach(function(track) {
			// https://matroska.org/technical/specs/index.html#Tracks
			var trackNum = track.children[0].getUInt(); // TrackNumber
			var trackType = track.children[2].getUInt(); // TrackType  (1: video, 2: audio, 3: complex, 0x10: logo, 0x11: subtitle, 0x12: buttons, 0x20: control).

			if (trackType === 1) videoTrackIdx = trackNum;
		});

		if (videoTrackIdx === -1) return cb(new Error('no video tracks found'))
			
		// Go through CuePoint(s) and filter out the ones which are from the video track
		var cues = atPath(doc, "Segment", "Cues");
		if (! (cues && cues.children && cues.children.length)) return cb(new Error("no cues found in doc -> Segment -> Cues"));

		cues = cues.children.filter(function(x) { return x._name === "CuePoint" }) 

		if (! cues.length) return cb(new Error("no CuePoints"));

		var frames = cues.filter(function(cue) {
			// children[1] is CueTrackPositions; first child of that is CueTrack
			// we need that to determine if this is a part of the video track
			return cue.children[1].children[0].getUInt() === videoTrackIdx
		}).map(function(cue) {
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
	var maxSeeks = 0;

	function toArrayBuffer(buffer) {
		var ab = new ArrayBuffer(buffer.length);
		var view = new Uint8Array(ab);
		for (var i = 0; i < buffer.length; ++i) view[i] = buffer[i];
		return ab;
	}

	function onData(buf) { 
		var b = toArrayBuffer(buf);
		b.fileStart = pos;
		pos += b.byteLength;
		box.appendBuffer(b);
		if (box.inputIsoFile.mdats.length && !box.inputIsoFile.moovStartFound) {
			var offset = box.inputIsoFile.boxes.map(function(x) { return x.size }).reduce(function(a,b) { return a+b }, 0);
			if (offset > lastOffset) {
				if (maxSeeks > 3) {
					stream.close ? stream.close() : stream.end();
					return cb(new Error('maxSeeks exceeded'));
				}
				maxSeeks++;

				stream.close ? stream.close() : stream.end();
				startStream(url, offset);
			}
		}
	}

	var stream, lastOffset = 0;

	function startStream(url, offset) {
		//console.log("open stream at "+offset);
		lastOffset = offset;
		pos = offset;
		if (/^http(s?):\/\//.test(url)) {
			// TODO: WARNING: we should check if the source supports range headers
			// and if the returned range corresponds to the requested range
			// Otherwise, we will eventually end up with a maxSeeks exception (as we would read the beginning of the file over and over, thinking it's actually the next part)
			stream = needle.get(url, { headers: { range: "bytes="+offset+"-" } })
			.on('error', cb)
			.on('end', function(e) { if (e) cb(e) })
			.on('data', onData)
		} else {
			stream = fs.createReadStream(url, { start: offset })
			.on('error', cb)
			.on('end', function() { box.flush() })
			.on('data', onData)
		}
	}

	startStream(url, 0);

	box.onError = cb;

	box.onReady = function(info) {
		box.flush();
		stream.close ? stream.close() : stream.end();

		if (!info) return cb(new Error("no info returned"));
		if (!info.videoTracks[0]) return cb(new Error("no videoTracks[0]"))

		//box.inputIsoFile.buildSampleLists();
		//var samples = box.inputIsoFile.moov.traks[0].samples;

		try {
			var track = box.inputIsoFile.moov.traks.filter(function(t) {
				return t.mdia.minf.stbl.stss
			})[0];

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
