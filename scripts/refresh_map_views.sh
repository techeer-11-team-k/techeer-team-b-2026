#!/bin/bash
# refresh_map_views.sh
# 지도 관련 Materialized View를 갱신하는 스크립트
# 사용법: 매일 새벽 3시에 cron으로 실행

# 컨테이너 이름 설정 (필요 시 수정)
DB_CONTAINER="realestate-db"
DB_USER="sa"
DB_NAME="realestate"

# 스크립트 디렉토리 및 로그 파일
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_DIR}/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/refresh_map_views.log"

# 타임스탬프 함수
timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

echo "[$(timestamp)] Starting Materialized View refresh..." >> "$LOG_FILE" 2>/dev/null || echo "[$(timestamp)] Starting..."

# Docker 컨테이너가 실행 중인지 확인
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[$(timestamp)] ERROR: Container ${DB_CONTAINER} is not running" >> "$LOG_FILE" 2>/dev/null
    exit 1
fi

# Materialized View 갱신 실행
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT refresh_map_materialized_views();" >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "[$(timestamp)] Materialized View refresh completed successfully" >> "$LOG_FILE" 2>/dev/null || echo "[$(timestamp)] Completed!"
else
    echo "[$(timestamp)] ERROR: Materialized View refresh failed" >> "$LOG_FILE" 2>/dev/null || echo "[$(timestamp)] Failed!"
    exit 1
fi
