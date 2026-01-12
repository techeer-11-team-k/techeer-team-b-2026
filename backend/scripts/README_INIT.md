# 데이터베이스 초기화 가이드

이 문서는 데이터베이스 스키마를 초기화하는 여러 방법을 설명합니다.

## 📋 목차

1. [방법 1: Docker Entrypoint (권장)](#방법-1-docker-entrypoint-권장)
2. [방법 2: Python 스크립트 실행](#방법-2-python-스크립트-실행)
3. [방법 3: 수동 SQL 실행](#방법-3-수동-sql-실행)
4. [보안 고려사항](#보안-고려사항)

---

## 방법 1: Docker Entrypoint (권장) ✅

**가장 안전하고 자동화된 방법입니다.**

### 작동 방식

PostgreSQL 컨테이너가 **처음 생성될 때만** `/docker-entrypoint-initdb.d/` 디렉토리의 SQL 파일을 자동 실행합니다.

### 설정

`docker-compose.yml`에 이미 설정되어 있습니다:

```yaml
volumes:
  - ./backend/scripts/init_schema.sql:/docker-entrypoint-initdb.d/01-init_schema.sql:ro
```

### 사용 방법

```bash
# 데이터베이스 컨테이너를 완전히 삭제하고 재생성
docker-compose down -v  # -v 옵션으로 볼륨도 삭제
docker-compose up -d db

# 또는 전체 서비스 재시작
docker-compose down -v
docker-compose up -d
```

### 장점

- ✅ **자동 실행**: 컨테이너 생성 시 자동으로 실행
- ✅ **안전함**: 이미 데이터가 있으면 실행되지 않음
- ✅ **표준 방식**: PostgreSQL 공식 권장 방법

### 주의사항

- ⚠️ **이미 데이터가 있는 경우 실행되지 않습니다** (PostgreSQL의 기본 동작)
- ⚠️ 볼륨을 삭제하면 기존 데이터가 모두 사라집니다

---

## 방법 2: Python 스크립트 실행

**수동으로 실행할 수 있는 안전한 방법입니다.**

### 사용 방법

```bash
# Docker 컨테이너에서 실행
docker exec -it realestate-backend python -m app.scripts.init_db_from_sql

# 또는 로컬에서 실행 (환경 변수 설정 필요)
python backend/scripts/init_db_from_sql.py
```

### 작동 방식

1. `accounts` 테이블 존재 여부 확인
2. 테이블이 없으면 `init_schema.sql` 파일 실행
3. 테이블이 이미 있으면 건너뜀

### 장점

- ✅ **안전함**: 이미 테이블이 있으면 실행하지 않음
- ✅ **수동 제어**: 필요할 때만 실행 가능
- ✅ **에러 처리**: 상세한 로그 출력

---

## 방법 3: 수동 SQL 실행

**직접 SQL을 실행하고 싶을 때 사용합니다.**

### 사용 방법

```bash
# Docker 컨테이너에서 직접 실행
docker exec -i realestate-db psql -U postgres -d realestate < backend/scripts/init_schema.sql

# 또는 컨테이너 내부에서 실행
docker exec -it realestate-db psql -U postgres -d realestate
# psql 프롬프트에서:
\i /docker-entrypoint-initdb.d/01-init_schema.sql
```

### 장점

- ✅ **완전한 제어**: SQL을 직접 확인하고 실행
- ✅ **디버깅 용이**: 에러 메시지를 직접 확인 가능

---

## 보안 고려사항

### ❌ API 엔드포인트로 초기화하지 마세요

API 엔드포인트를 통한 데이터베이스 초기화는 **보안 위험이 큽니다**:

1. **무단 접근 위험**: 인증을 우회할 수 있는 버그가 있으면 위험
2. **실수로 실행**: 프로덕션 환경에서 실수로 호출할 위험
3. **데이터 손실**: 기존 데이터를 덮어쓸 위험

### ✅ 권장 방법

1. **개발 환경**: Docker Entrypoint (방법 1) 또는 Python 스크립트 (방법 2)
2. **프로덕션 환경**: 
   - 마이그레이션 도구 사용 (Alembic 등)
   - 또는 수동 SQL 실행 (방법 3)을 관리자만 실행

---

## 파일 구조

```
backend/
├── scripts/
│   ├── init_schema.sql          # PostgreSQL 형식 SQL 스크립트
│   ├── init_db_from_sql.py      # Python 초기화 스크립트
│   └── README_INIT.md           # 이 문서
└── app/
    └── main.py                  # 시작 시 자동 초기화 (개발 환경)
```

---

## 문제 해결

### Q: 테이블이 생성되지 않아요

1. **로그 확인**:
   ```bash
   docker-compose logs db
   docker-compose logs backend
   ```

2. **수동 실행 시도**:
   ```bash
   docker exec -it realestate-backend python -m app.scripts.init_db_from_sql
   ```

3. **SQL 파일 직접 확인**:
   ```bash
   docker exec -i realestate-db psql -U postgres -d realestate < backend/scripts/init_schema.sql
   ```

### Q: 이미 테이블이 있는데 다시 초기화하고 싶어요

⚠️ **주의**: 기존 데이터가 모두 삭제됩니다!

```bash
# 1. 볼륨 삭제 (데이터 모두 삭제)
docker-compose down -v

# 2. 컨테이너 재생성
docker-compose up -d
```

### Q: 특정 테이블만 다시 생성하고 싶어요

SQL 파일을 수정하거나, psql에서 직접 실행:

```bash
docker exec -it realestate-db psql -U postgres -d realestate

# psql 프롬프트에서:
DROP TABLE IF EXISTS accounts CASCADE;
-- 그 다음 init_schema.sql의 해당 부분만 실행
```

---

## 추가 정보

- PostgreSQL 공식 문서: [Initialization Scripts](https://www.postgresql.org/docs/current/docker-postgres.html#docker-postgres-initdb)
- SQLAlchemy 문서: [Creating and Dropping Database Tables](https://docs.sqlalchemy.org/en/20/core/metadata.html#creating-and-dropping-database-tables)
