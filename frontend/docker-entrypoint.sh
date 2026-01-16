#!/bin/sh
set -e

echo "? [Frontend Entrypoint] 시작..."

# node_modules 확인 및 설치
if [ ! -d "node_modules" ] || [ ! -f "node_modules/highcharts/package.json" ]; then
  echo "? [Frontend Entrypoint] node_modules가 없거나 highcharts가 없습니다. 설치를 시작합니다..."
  npm install --no-audit --no-fund
else
  echo "? [Frontend Entrypoint] node_modules 확인 완료"
fi

# 개발 서버 실행
echo "? [Frontend Entrypoint] 개발 서버 시작..."
exec npm run dev -- --host 0.0.0.0