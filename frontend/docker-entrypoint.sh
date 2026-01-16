#!/bin/sh
set -e

echo "?뵩 [Frontend Entrypoint] ?쒖옉..."

# node_modules ?뺤씤 諛??ㅼ튂
if [ ! -d "node_modules" ] || [ ! -f "node_modules/highcharts/package.json" ]; then
  echo "?벀 [Frontend Entrypoint] node_modules媛 ?녾굅??highcharts媛 ?놁뒿?덈떎. ?ㅼ튂瑜??쒖옉?⑸땲??.."
  npm install --no-audit --no-fund
else
  echo "??[Frontend Entrypoint] node_modules ?뺤씤 ?꾨즺"
fi

# 媛쒕컻 ?쒕쾭 ?ㅽ뻾
echo "?? [Frontend Entrypoint] 媛쒕컻 ?쒕쾭 ?쒖옉..."
exec npm run dev -- --host 0.0.0.0
