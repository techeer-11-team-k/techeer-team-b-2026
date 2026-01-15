# ============================================================
# 🔍 연결 확인 스크립트 (PowerShell)
# ============================================================
# 사용 방법: .\scripts\check_connection.ps1
# ============================================================

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🔍 서비스 연결 확인 중..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Docker 컨테이너 상태 확인
Write-Host ""
Write-Host "1️⃣ Docker 컨테이너 상태 확인" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
docker-compose ps

# 2. Backend API 연결 확인
Write-Host ""
Write-Host "2️⃣ Backend API 연결 확인" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Backend API 연결 성공" -ForegroundColor Green
    Write-Host "   URL: http://localhost:8000" -ForegroundColor Gray
    Write-Host "   Swagger: http://localhost:8000/docs" -ForegroundColor Gray
} catch {
    Write-Host "❌ Backend API 연결 실패" -ForegroundColor Red
    Write-Host "   Backend 컨테이너가 실행 중인지 확인하세요" -ForegroundColor Gray
}

# 3. Frontend 연결 확인
Write-Host ""
Write-Host "3️⃣ Frontend 연결 확인" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Frontend 연결 성공" -ForegroundColor Green
    Write-Host "   URL: http://localhost:3000" -ForegroundColor Gray
} catch {
    Write-Host "❌ Frontend 연결 실패" -ForegroundColor Red
    Write-Host "   Frontend 컨테이너가 실행 중인지 확인하세요" -ForegroundColor Gray
}

# 4. PostgreSQL 연결 확인
Write-Host ""
Write-Host "4️⃣ PostgreSQL 연결 확인" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
$dbCheck = docker-compose exec -T db pg_isready -U postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL 연결 성공" -ForegroundColor Green
    Write-Host "   Host: localhost" -ForegroundColor Gray
    Write-Host "   Port: 5432" -ForegroundColor Gray
    Write-Host "   Database: realestate_db" -ForegroundColor Gray
} else {
    Write-Host "❌ PostgreSQL 연결 실패" -ForegroundColor Red
    Write-Host "   DB 컨테이너가 실행 중인지 확인하세요" -ForegroundColor Gray
}

# 5. Redis 연결 확인
Write-Host ""
Write-Host "5️⃣ Redis 연결 확인" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
$redisCheck = docker-compose exec -T redis redis-cli ping 2>&1
if ($redisCheck -match "PONG") {
    Write-Host "✅ Redis 연결 성공" -ForegroundColor Green
    Write-Host "   Host: localhost" -ForegroundColor Gray
    Write-Host "   Port: 6379" -ForegroundColor Gray
} else {
    Write-Host "❌ Redis 연결 실패" -ForegroundColor Red
    Write-Host "   Redis 컨테이너가 실행 중인지 확인하세요" -ForegroundColor Gray
}

# 6. 최근 검색어 테이블 확인
Write-Host ""
Write-Host "6️⃣ 데이터베이스 테이블 확인" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
$tables = docker-compose exec -T db psql -U postgres -d realestate_db -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>&1

if ($tables -match "recent_searches") {
    Write-Host "✅ recent_searches 테이블 존재" -ForegroundColor Green
} else {
    Write-Host "⚠️ recent_searches 테이블이 없습니다" -ForegroundColor Yellow
    Write-Host "   마이그레이션을 실행해야 할 수 있습니다" -ForegroundColor Gray
}

if ($tables -match "recent_views") {
    Write-Host "✅ recent_views 테이블 존재" -ForegroundColor Green
} else {
    Write-Host "⚠️ recent_views 테이블이 없습니다" -ForegroundColor Yellow
    Write-Host "   마이그레이션을 실행해야 할 수 있습니다" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ 연결 확인 완료" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
