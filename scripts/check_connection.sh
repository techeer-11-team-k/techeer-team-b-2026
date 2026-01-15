#!/bin/bash
# ============================================================
# 🔍 연결 확인 스크립트
# ============================================================
# 사용 방법: ./scripts/check_connection.sh
# ============================================================

echo "=========================================="
echo "🔍 서비스 연결 확인 중..."
echo "=========================================="

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Docker 컨테이너 상태 확인
echo ""
echo "1️⃣ Docker 컨테이너 상태 확인"
echo "----------------------------------------"
docker-compose ps

# 2. Backend API 연결 확인
echo ""
echo "2️⃣ Backend API 연결 확인"
echo "----------------------------------------"
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✅ Backend API 연결 성공${NC}"
    echo "   URL: http://localhost:8000"
    echo "   Swagger: http://localhost:8000/docs"
else
    echo -e "${RED}❌ Backend API 연결 실패${NC}"
    echo "   Backend 컨테이너가 실행 중인지 확인하세요"
fi

# 3. Frontend 연결 확인
echo ""
echo "3️⃣ Frontend 연결 확인"
echo "----------------------------------------"
if curl -s http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}✅ Frontend 연결 성공${NC}"
    echo "   URL: http://localhost:3000"
else
    echo -e "${RED}❌ Frontend 연결 실패${NC}"
    echo "   Frontend 컨테이너가 실행 중인지 확인하세요"
fi

# 4. PostgreSQL 연결 확인
echo ""
echo "4️⃣ PostgreSQL 연결 확인"
echo "----------------------------------------"
if docker-compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL 연결 성공${NC}"
    echo "   Host: localhost"
    echo "   Port: 5432"
    echo "   Database: realestate_db"
else
    echo -e "${RED}❌ PostgreSQL 연결 실패${NC}"
    echo "   DB 컨테이너가 실행 중인지 확인하세요"
fi

# 5. Redis 연결 확인
echo ""
echo "5️⃣ Redis 연결 확인"
echo "----------------------------------------"
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis 연결 성공${NC}"
    echo "   Host: localhost"
    echo "   Port: 6379"
else
    echo -e "${RED}❌ Redis 연결 실패${NC}"
    echo "   Redis 컨테이너가 실행 중인지 확인하세요"
fi

# 6. 최근 검색어 테이블 확인
echo ""
echo "6️⃣ 데이터베이스 테이블 확인"
echo "----------------------------------------"
TABLES=$(docker-compose exec -T db psql -U postgres -d realestate_db -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null)

if echo "$TABLES" | grep -q "recent_searches"; then
    echo -e "${GREEN}✅ recent_searches 테이블 존재${NC}"
else
    echo -e "${YELLOW}⚠️ recent_searches 테이블이 없습니다${NC}"
    echo "   마이그레이션을 실행해야 할 수 있습니다"
fi

if echo "$TABLES" | grep -q "recent_views"; then
    echo -e "${GREEN}✅ recent_views 테이블 존재${NC}"
else
    echo -e "${YELLOW}⚠️ recent_views 테이블이 없습니다${NC}"
    echo "   마이그레이션을 실행해야 할 수 있습니다"
fi

echo ""
echo "=========================================="
echo "✅ 연결 확인 완료"
echo "=========================================="
