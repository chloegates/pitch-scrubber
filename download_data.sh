#!/bin/bash

# Ensure data directory exists
mkdir -p data

echo "Downloading match_data.json..."
curl -L -o data/2017461_match.json "https://raw.githubusercontent.com/SkillCorner/opendata/master/data/matches/2017461/2017461_match.json"

echo "Downloading tracking data (this may take a while)..."
# Note: Since the tracking data is often large and stored in Git LFS, downloading the raw file via curl might just get the pointer.
# If so, you may need to clone the repo with git lfs:
# git clone --depth 1 https://github.com/SkillCorner/opendata.git
curl -L -o data/2017461_tracking_extrapolated.jsonl "https://media.githubusercontent.com/media/SkillCorner/opendata/master/data/matches/2017461/2017461_tracking_extrapolated.jsonl"

echo "Done!"
