var mkv = require('matroska')

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

function findById(all, name) {
	return all.filter(function(x) { return x._name === name })[0]
}

function getForMkv(url, cb) {
	var decoder = new mkv.Decoder(onlySeekCuesAndTracks());
	decoder.parseEbmlIDs(url, [ mkv.Schema.byName.Cues, mkv.Schema.byName.Tracks ], function(err, doc) {
		if (err) return cb(err);

		// First, select the video track
		var videoTrackIdx = -1; // initial value
		var tracks = atPath(doc, "Segment", "Tracks");
		tracks.children.forEach(function(track) {
			if (! track.children) return;
			
			// https://matroska.org/technical/specs/index.html#Tracks
			var trackNum = findById(track.children, "TrackNumber").getUInt(); // TrackNumber
			var trackType = findById(track.children, "TrackType").getUInt(); // TrackType  (1: video, 2: audio, 3: complex, 0x10: logo, 0x11: subtitle, 0x12: buttons, 0x20: control).

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

module.exports = getForMkv
