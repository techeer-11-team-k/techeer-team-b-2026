#!/bin/sh
set -e
cd /app
# 볼륨 마운트된 node_modules와 package.json 동기화 (vite-plugin-pwa 등 신규 의존성 반영)
npm ci 2>/dev/null || npm install
exec npm run dev
