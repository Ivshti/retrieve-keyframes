# retrieve-keyframes
get time position of all keyframes in mp4/mkv/webm

## Usage

#### ``var retrieve = require("retrieve-keyframes").get``

#### ``retrieve(url, container, cb)``

**url** - URL (http) to video file

**container** - ``"matroska"`` or ``"mp4"``

**cb** - ``callback(err, frames)``

##### ``frames`` is an array of objects: `{ index: Number, timestamp: Number }`; the index is the numeric index of the frame, applicable when we use mp4; the timestamp is the pts value of the frame 