#!/bin/sh
# Fake RTSP camera feeds for docker-compose (dev/demo only, "fake-rtsp" profile).
# Loops each video found in $VIDEO_DIR over RTSP to the mediamtx service.
# Mirrors scripts/dev/start-fake-rtsp.ps1 (the native-Windows equivalent) — keep
# both lists in sync when adding/removing streams. Missing files are skipped
# with a warning rather than failing the container, since temp/ only ever holds
# whatever fixtures a given machine actually downloaded.

MEDIAMTX_HOST="${MEDIAMTX_HOST:-mediamtx}"
VIDEO_DIR="${VIDEO_DIR:-/videos}"

paths="office-cam:office.mp4 plant-cam:plant.mp4 road-cam:road.mp4 street-cam:street.mp4 stairs-cam:stairs.mp4 stairs-people-cam:stairs_people.mp4 use-phone-4-cam:use_phone_4.MOV construction-workers-cam:construction_workers.mp4 construction-site-cam:construction_site.mp4 construction-ppe-cam:construction_ppe.mp4"

pids=""
cleanup() {
  echo "Stopping fake RTSP pushes..."
  kill $pids 2>/dev/null
  exit 0
}
trap cleanup TERM INT

started=0
for entry in $paths; do
  path="${entry%%:*}"
  file="${entry#*:}"
  source="$VIDEO_DIR/$file"

  if [ ! -f "$source" ]; then
    echo "skip $path: $source not found"
    continue
  fi

  rtsp_url="rtsp://$MEDIAMTX_HOST:8554/$path"
  echo "pushing $source -> $rtsp_url"
  # Downscale + cap fps so many streams can encode at once without maxing CPU;
  # -g 10 @10fps = keyframe every ~1s so captureRtspFrame gets a frame quickly.
  ffmpeg -loglevel warning -stream_loop -1 -re -i "$source" \
    -an -vf scale=640:-2 -r 10 -c:v libx264 -pix_fmt yuv420p \
    -tune zerolatency -g 10 -keyint_min 10 -preset ultrafast \
    -f rtsp "$rtsp_url" &
  pids="$pids $!"
  started=$((started + 1))
done

if [ "$started" -eq 0 ]; then
  echo "No source videos found in $VIDEO_DIR — nothing to push."
  exit 1
fi

echo "$started fake RTSP stream(s) running."
wait
