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


function getForMkv(url, cb) {
	var decoder = new mkv.Decoder(onlySeekCues());
	decoder.parseEbmlIDs(url, [ mkv.Schema.byName.Cues ], function(err, doc) {
		cb(err, doc)
		// "doc -> Segment -> Cues -> CuePoint []"
	})
}

module.exports = {
	getForMkv: getForMkv
}