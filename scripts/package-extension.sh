#!/usr/bin/env sh
set -eu

node "$(dirname "$0")/package-extensions.mjs" "${1:-all}"
