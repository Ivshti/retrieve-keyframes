#!/usr/bin/env bash
ffprobe -select_streams v -show_frames -show_entries frame=media_type,pkt_dts_time,pkt_pts_time,key_frame -of csv "$1" | grep -n --color=auto frame,1

