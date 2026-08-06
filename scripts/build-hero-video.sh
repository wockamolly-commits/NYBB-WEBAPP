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
# THE LEFT 21 PERCENT IS CROPPED OFF, AND IT IS NOT OPTIONAL.
# ============================================================================
# The film carries the wordmark composited into its top left corner, in every
# frame of its entire run. Measured on the shipped 1280x720 derivative the mark
# occupies x 37-240, y 12-125, and it is pixel-identical at 0.2s, 1.5s, 3.0s,
# 4.5s, 6.0s and 6.9s, so it is a static overlay rather than an animated title
# and a fixed crop removes it for good.
#
# It has to go because the site draws its own Wordmark in the header directly
# above it. Uncropped, the page opens on two copies of the same logo, one crisp
# on parchment and one smeared under the hero scrim, and because the video is
# object-cover the burnt-in one also crops by viewport, landing as "RK / LO / S"
# at 768px wide. components/brand/Wordmark.tsx is careful about the mark's
# ground and none of that care can reach a logo baked into pixels.
#
# The crop is expressed against the input's own width rather than as pixels, so
# it survives being handed a different master. On the documented 1920x1080
# source it takes 403px off the left, against a mark that ends at x 360, and it
# was validated end to end: cropping the equivalent column off a real frame
# takes the mark's yellow pixel count from 2865 to 0.
#
# CHOOSING THE SECONDS IS STILL A JOB FOR EYES.
# ============================================================================
# Cropping is mechanical. Frame choice is not, and this cut has form: the
# original 12s-19s window includes a near-white background behind the sauce
# pour, which is what drove brand orange down to 2.2:1 in the hero and is the
# reason the kicker is no longer set in it. When re-cutting, prefer seconds
# whose left half stays dark, since that is the half the headline sits on, and
# re-run the hero contrast measurement afterwards rather than assuming.
#
# Output: public/video/hero.mp4, hero.webm, hero-poster.webp.

set -euo pipefail

SRC="${1:-$HOME/Desktop/nybb-vid.mp4}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/video"
START=12
LENGTH=7

# Take the left 21 percent off, then scale. Order matters: cropping after a
# scale would be measuring against a width this script does not control.
CROP="crop=iw*0.79:ih:iw*0.21:0"

mkdir -p "$OUT"

# H.264 high profile with yuv420p, which is the combination every browser and
# every phone decodes in hardware. faststart moves the index to the front so
# playback can begin before the file has finished arriving.
ffmpeg -y -ss "$START" -t "$LENGTH" -i "$SRC" \
  -an -vf "$CROP,fps=30,scale=1280:-2" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow \
  -movflags +faststart \
  "$OUT/hero.mp4"

# VP9 is offered first in the markup: it is about 40 percent smaller here and
# Chrome and Firefox take it, leaving the MP4 for Safari and older devices.
ffmpeg -y -ss "$START" -t "$LENGTH" -i "$SRC" \
  -an -vf "$CROP,fps=30,scale=1280:-2" \
  -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
  "$OUT/hero.webm"

# The poster is the frame the server renders, so it is chosen for how it looks
# still, not for where the cut starts.
ffmpeg -y -ss 18.4 -i "$SRC" -frames:v 1 -vf "$CROP,scale=1280:-2" \
  -c:v libwebp -quality 78 \
  "$OUT/hero-poster.webp"

ls -la "$OUT"
