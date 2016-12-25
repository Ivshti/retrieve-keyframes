# retrieve-keyframes
get time position of all keyframes in mp4/mkv/webm

## Usage

#### ``var retrieve = require("retrieve-keyframes").get``

#### ``retrieve(url, container, cb)``

**url** - URL (http) to video file

**container** - ``"matroska"`` or ``"mp4"``

**cb** - ``callback(err, frames)``

##### ``frames`` is an array of objects: `{ index: Number, timestamp: Number }`; the index is the numeric index of the frame, applicable when we use mp4; the timestamp is the pts value of the frame 



## Examples

```bash
./cli.js http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4
```

```bash
./cli.js http://jell.yfish.us/media/jellyfish-3-mbps-hd-h264.mkv
```


## Comparison with ffprobe

A script is included - `keyframes.sh` - to compare results to ffprobe. All the results match so far, with the exception that ffmpeg likes to pick either `dts` or `pts` and consider that value as both `pts` and `dts`.

