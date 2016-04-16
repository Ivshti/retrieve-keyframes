# retrieve-keyframes
get time position of all keyframes in mp4/mkv/webm

## Usage

#### ``var retrieve = require("retrieve-keyframes").get``

#### ``retrieve(url, container, cb)``

**url** - URL (http) to video file

**container** - ``"matroska"`` or ``"mp4"``

**cb** - ``callback(err, times)``
