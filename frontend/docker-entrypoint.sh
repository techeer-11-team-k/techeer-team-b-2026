#!/bin/sh
set -e

# node_modules가 없으면 npm install 실행
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Expo 개발 서버 실행
echo "🚀 Starting Expo development server..."
exec npx expo start --web