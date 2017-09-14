var getForMkv = require('./mkv')
var getForMp4 = require('./mp4')

module.exports = {
	get: function(url, container, cb) {
		if (typeof(container) === "undefined") container = url.match(/\.mkv/) ? "mkv" : "mp4"; // hack-ish way to infer container
		if (container === "matroska") container = "mkv";
		(container === "mkv" ? getForMkv : getForMp4)(url, cb)
	},
	getForMkv: getForMkv,
	getForMp4: getForMp4
}
