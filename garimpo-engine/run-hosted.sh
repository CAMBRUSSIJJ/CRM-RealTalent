#!/bin/sh
set -eu
# The platform can override HOME. Browser and Go driver were installed under this
# fixed non-root home at image build time; use the same paths on every cold start.
export HOME=/home/garimpo
export XDG_CACHE_HOME=/home/garimpo/.cache
export PLAYWRIGHT_BROWSERS_PATH=/home/garimpo/.cache/ms-playwright
exec python -m garimpo.hosted
