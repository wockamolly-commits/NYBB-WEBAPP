#!/usr/bin/env bash
#
# Build the landing hero loop from the brand food film.
#
# The source is not in this repository. It is the video published on
# nybuffalobrads.com.ph: 1920x1080, 60 fps, HEVC, 26.9 s, 37 MB, with audio.
# Point SRC at your copy.
#
# Two things make the source unusable as shipped. HEVC in an MP4 plays in Safari
# and in almost no other browser, so Chrome and Firefox would show nothing. And
# 37 MB is roughly forty times what a hero should cost on a phone.
#
# The cut is 12s to 19s, which is the sequence that earns the space: crisp fried
# wings, the buffalo sauce pour, the sauced wings. Audio is dropped outright
# because the hero autoplays, and an autoplaying video with a soundtrack cannot
# autoplay at all under browser policy.
#
# Output: public/video/hero.mp4 (~890 KB), hero.webm (~540 KB),
#         hero-poster.webp (~39 KB).

set -euo pipefail

SRC="${1:-$HOME/Desktop/nybb-vid.mp4}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/video"
START=12
LENGTH=7

mkdir -p "$OUT"

# H.264 high profile with yuv420p, which is the combination every browser and
# every phone decodes in hardware. faststart moves the index to the front so
# playback can begin before the file has finished arriving.
ffmpeg -y -ss "$START" -t "$LENGTH" -i "$SRC" \
  -an -vf "fps=30,scale=1280:-2" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow \
  -movflags +faststart \
  "$OUT/hero.mp4"

# VP9 is offered first in the markup: it is about 40 percent smaller here and
# Chrome and Firefox take it, leaving the MP4 for Safari and older devices.
ffmpeg -y -ss "$START" -t "$LENGTH" -i "$SRC" \
  -an -vf "fps=30,scale=1280:-2" \
  -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
  "$OUT/hero.webm"

# The poster is the frame the server renders, so it is chosen for how it looks
# still, not for where the cut starts.
ffmpeg -y -ss 18.4 -i "$SRC" -frames:v 1 -vf "scale=1280:-2" \
  -c:v libwebp -quality 78 \
  "$OUT/hero-poster.webp"

ls -la "$OUT"
