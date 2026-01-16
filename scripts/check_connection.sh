#!/bin/bash
# ============================================================
# ?뵇 ?곌껐 ?뺤씤 ?ㅽ겕由쏀듃
# ============================================================
# ?ъ슜 諛⑸쾿: ./scripts/check_connection.sh
# ============================================================

echo "=========================================="
echo "?뵇 ?쒕퉬???곌껐 ?뺤씤 以?.."
echo "=========================================="

# ?됱긽 ?뺤쓽
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Docker 而⑦뀒?대꼫 ?곹깭 ?뺤씤
echo ""
echo "1截뤴깵 Docker 而⑦뀒?대꼫 ?곹깭 ?뺤씤"
echo "----------------------------------------"
docker-compose ps

# 2. Backend API ?곌껐 ?뺤씤
echo ""
echo "2截뤴깵 Backend API ?곌껐 ?뺤씤"
echo "----------------------------------------"
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}??Backend API ?곌껐 ?깃났${NC}"
    echo "   URL: http://localhost:8000"
    echo "   Swagger: http://localhost:8000/docs"
else
    echo -e "${RED}??Backend API ?곌껐 ?ㅽ뙣${NC}"
    echo "   Backend 而⑦뀒?대꼫媛 ?ㅽ뻾 以묒씤吏 ?뺤씤?섏꽭??
fi

# 3. Frontend ?곌껐 ?뺤씤
echo ""
echo "3截뤴깵 Frontend ?곌껐 ?뺤씤"
echo "----------------------------------------"
if curl -s http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}??Frontend ?곌껐 ?깃났${NC}"
    echo "   URL: http://localhost:3000"
else
    echo -e "${RED}??Frontend ?곌껐 ?ㅽ뙣${NC}"
    echo "   Frontend 而⑦뀒?대꼫媛 ?ㅽ뻾 以묒씤吏 ?뺤씤?섏꽭??
fi

# 4. PostgreSQL ?곌껐 ?뺤씤
echo ""
echo "4截뤴깵 PostgreSQL ?곌껐 ?뺤씤"
echo "----------------------------------------"
if docker-compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}??PostgreSQL ?곌껐 ?깃났${NC}"
    echo "   Host: localhost"
    echo "   Port: 5432"
    echo "   Database: realestate_db"
else
    echo -e "${RED}??PostgreSQL ?곌껐 ?ㅽ뙣${NC}"
    echo "   DB 而⑦뀒?대꼫媛 ?ㅽ뻾 以묒씤吏 ?뺤씤?섏꽭??
fi

# 5. Redis ?곌껐 ?뺤씤
echo ""
echo "5截뤴깵 Redis ?곌껐 ?뺤씤"
echo "----------------------------------------"
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}??Redis ?곌껐 ?깃났${NC}"
    echo "   Host: localhost"
    echo "   Port: 6379"
else
    echo -e "${RED}??Redis ?곌껐 ?ㅽ뙣${NC}"
    echo "   Redis 而⑦뀒?대꼫媛 ?ㅽ뻾 以묒씤吏 ?뺤씤?섏꽭??
fi

# 6. 理쒓렐 寃?됱뼱 ?뚯씠釉??뺤씤
echo ""
echo "6截뤴깵 ?곗씠?곕쿋?댁뒪 ?뚯씠釉??뺤씤"
echo "----------------------------------------"
TABLES=$(docker-compose exec -T db psql -U postgres -d realestate_db -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null)

if echo "$TABLES" | grep -q "recent_searches"; then
    echo -e "${GREEN}??recent_searches ?뚯씠釉?議댁옱${NC}"
else
    echo -e "${YELLOW}?좑툘 recent_searches ?뚯씠釉붿씠 ?놁뒿?덈떎${NC}"
    echo "   留덉씠洹몃젅?댁뀡???ㅽ뻾?댁빞 ?????덉뒿?덈떎"
fi

if echo "$TABLES" | grep -q "recent_views"; then
    echo -e "${GREEN}??recent_views ?뚯씠釉?議댁옱${NC}"
else
    echo -e "${YELLOW}?좑툘 recent_views ?뚯씠釉붿씠 ?놁뒿?덈떎${NC}"
    echo "   留덉씠洹몃젅?댁뀡???ㅽ뻾?댁빞 ?????덉뒿?덈떎"
fi

echo ""
echo "=========================================="
echo "???곌껐 ?뺤씤 ?꾨즺"
echo "=========================================="
