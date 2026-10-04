#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node node_modules/vite/bin/vite.js build --config vite.demo.config.ts "$@"
