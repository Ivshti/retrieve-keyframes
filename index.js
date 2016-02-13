var mkv = require('matroska')

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
	cb( new Error("mp4 not supported yet"));
	// we need the stss box - moov.traks[<trackNum>].mdia.minf.stbl.stss
	// https://github.com/gpac/mp4box.js/blob/master/src/parsing/stss.js
	// http://wiki.multimedia.cx/?title=QuickTime_container#stss
	// we also may need stts to get their time
	// https://github.com/gpac/mp4box.js/blob/master/src/parsing/stts.js

}

module.exports = {
	get: function(url, container, cb) {
		if (typeof(container) === "undefined") container = url.match(/\.mkv/) ? "mkv" : "mp4"; // hack-ish way to infer container
		if (container === "matroska") container = mkv;
		(container === "mkv" ? getForMkv : getForMp4)(url, cb)
	},
	getForMkv: getForMkv,
	getForMp4: getForMp4
}