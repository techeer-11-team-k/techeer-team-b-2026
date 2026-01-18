#!/bin/sh
set -e

echo "🚀 [Frontend Entrypoint] 시작..."

# node_modules 확인 및 설치
# highcharts와 highcharts-react-official 모두 확인
if [ ! -d "node_modules" ] || [ ! -f "node_modules/highcharts/package.json" ] || [ ! -f "node_modules/highcharts-react-official/package.json" ]; then
  echo "📦 [Frontend Entrypoint] node_modules가 없거나 필수 패키지가 없습니다. 설치를 진행합니다..."
  npm install --no-audit --no-fund
else
  echo "✅ [Frontend Entrypoint] node_modules 확인 완료"
fi

# 개발 서버 시작
echo "🌐 [Frontend Entrypoint] 개발 서버 시작..."
exec npm run dev -- --host 0.0.0.0
