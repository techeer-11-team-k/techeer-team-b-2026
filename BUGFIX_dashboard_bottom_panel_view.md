# 버그 수정: dashboard_bottom_panel_view 컬럼 누락

## 문제 상황

**에러 메시지:**
```
column accounts.dashboard_bottom_panel_view does not exist
```

**원인:**
- 모델(`backend/app/models/account.py`)에는 `dashboard_bottom_panel_view` 컬럼이 정의되어 있음
- 하지만 실제 데이터베이스에는 컬럼이 존재하지 않음
- 마이그레이션이 실행되지 않았거나, `init_db.sql`이 적용되지 않음

## 해결 방법

### 방법 1: 자동 마이그레이션 실행 (권장)

Docker를 사용하는 경우, 백엔드 컨테이너를 재시작하면 자동으로 마이그레이션이 실행됩니다:

```bash
# 백엔드 컨테이너 재시작
docker-compose restart backend

# 또는 전체 재시작
docker-compose down
docker-compose up -d
```

백엔드가 시작될 때 `docker_entrypoint.sh`가 자동으로 `auto_migrate.py`를 실행하여 새 마이그레이션을 적용합니다.

### 방법 2: 수동 마이그레이션 실행

Docker 컨테이너에서 직접 마이그레이션을 실행할 수 있습니다:

```bash
# 마이그레이션 실행
docker-compose exec backend python /app/scripts/auto_migrate.py

# 또는 수정 스크립트 실행
docker-compose exec backend python /app/scripts/fix_dashboard_bottom_panel_view.py
```

### 방법 3: 직접 SQL 실행

Docker 컨테이너의 데이터베이스에 직접 접속하여 SQL을 실행할 수 있습니다:

```bash
# PostgreSQL에 접속
docker-compose exec db psql -U postgres -d realestate

# 또는 사용자명이 다른 경우
docker-compose exec db psql -U sa -d realestate
```

그 다음 다음 SQL을 실행:

```sql
-- 컬럼 추가
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS dashboard_bottom_panel_view VARCHAR(32) NOT NULL DEFAULT 'regionComparison';

-- 컬럼 코멘트 추가
COMMENT ON COLUMN accounts.dashboard_bottom_panel_view IS 
'대시보드 하단 우측 카드 뷰 (policyNews|transactionVolume|marketPhase|regionComparison)';
```

## 생성된 파일

1. **마이그레이션 파일**: `backend/scripts/migrations/20260126_add_dashboard_bottom_panel_view.sql`
   - 자동 마이그레이션 시스템이 이 파일을 감지하여 실행합니다.

2. **수정 스크립트**: `backend/scripts/fix_dashboard_bottom_panel_view.py`
   - 컬럼이 없을 때 자동으로 추가하는 스크립트입니다.

## 확인 방법

마이그레이션이 성공적으로 적용되었는지 확인:

```bash
# 데이터베이스에 접속
docker-compose exec db psql -U postgres -d realestate

# 컬럼 확인
\d accounts

# 또는 SQL로 확인
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'accounts' 
AND column_name = 'dashboard_bottom_panel_view';
```

## 예상 결과

마이그레이션 성공 후:
- ✅ `accounts` 테이블에 `dashboard_bottom_panel_view` 컬럼이 추가됨
- ✅ 기본값: `'regionComparison'`
- ✅ API 호출 시 에러가 발생하지 않음

## 추가 참고

- 마이그레이션 추적 테이블: `_migrations`
- 자동 마이그레이션 스크립트: `backend/scripts/auto_migrate.py`
- Docker 엔트리포인트: `backend/scripts/docker_entrypoint.sh`
