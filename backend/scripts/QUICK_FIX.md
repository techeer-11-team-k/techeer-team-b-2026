# 데이터베이스 오류 빠른 해결 가이드

## 🔴 오류: "database \"realestate\" does not exist"

이 오류는 PostgreSQL 데이터베이스가 아직 생성되지 않았을 때 발생합니다.

## ✅ 해결 방법

### 방법 1: 수동으로 데이터베이스 생성 (가장 빠름)

```bash
# Docker 컨테이너에서 직접 생성
docker exec realestate-db psql -U postgres -c "CREATE DATABASE realestate;"
```

### 방법 2: Python 스크립트 사용

```bash
# 데이터베이스 생성 스크립트 실행
docker exec -it realestate-backend python -m app.scripts.create_database
```

### 방법 3: Docker Compose 재시작 (볼륨 삭제)

⚠️ **주의**: 기존 데이터가 모두 삭제됩니다!

```bash
# 볼륨 삭제 후 재시작
docker-compose down -v
docker-compose up -d

# 데이터베이스가 자동으로 생성됩니다
```

### 방법 4: SQL 파일 직접 실행

```bash
# psql로 직접 연결하여 생성
docker exec -it realestate-db psql -U postgres

# psql 프롬프트에서:
CREATE DATABASE realestate;
\q
```

## 🔍 확인 방법

데이터베이스가 생성되었는지 확인:

```bash
docker exec realestate-db psql -U postgres -c "\l" | grep realestate
```

## 📝 참고

- PostgreSQL 컨테이너는 `POSTGRES_DB` 환경변수로 지정된 데이터베이스를 자동 생성해야 하지만, 때로는 볼륨에 이전 데이터가 있으면 생성되지 않을 수 있습니다.
- 백엔드 시작 시 자동으로 데이터베이스를 생성하도록 수정했습니다 (`main.py`).
- 다음부터는 백엔드가 시작될 때 자동으로 데이터베이스를 생성합니다.
