#!/bin/sh
set -e

# Runs as root on every container start. Volume mounts land owned by root
# regardless of what the image had at that path (a mount shadows the image
# layer), so this has to happen at runtime, every boot, not just at build
# time — including on a pre-existing deployment whose named volumes were
# created back when the container itself ran as root.
chown -R node:node /app/tmp/uploads /app/tmp/hls /app/public/thumbnails /app/public/captions

exec su node -s /bin/sh -c "$1"
