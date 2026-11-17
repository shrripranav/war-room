#!/bin/zsh
# Double-click to start the War Room. Keep this window open while the committee runs.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8765/chair.html") &
python3 -m http.server 8765
