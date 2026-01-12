# 🐳 Docker 설정 가이드

Docker를 사용하여 백엔드를 실행하는 방법을 설명합니다.

## 📋 목차
1. [Docker란?](#docker란)
2. [Docker Compose 사용](#docker-compose-사용)
3. [개별 컨테이너 실행](#개별-컨테이너-실행)
4. [문제 해결](#문제-해결)

---

## Docker란?

**Docker**는 애플리케이션을 컨테이너로 패키징하여 실행하는 도구입니다.

### 장점
- ✅ 환경 일관성: 개발/프로덕션 환경 동일
- ✅ 의존성 관리: 필요한 모든 도구가 포함됨
- ✅ 쉬운 배포: 한 번 빌드하면 어디서든 실행 가능

---

## Docker Compose 사용

**Docker Compose**는 여러 컨테이너를 한 번에 관리하는 도구입니다.

### 프로젝트 구조

```
프로젝트 루트/
├── docker-compose.yml    # 컨테이너 설정
├── backend/
│   └── Dockerfile        # 백엔드 이미지 정의
└── .env                  # 환경 변수
```

### 1. 모든 서비스 시작

```bash
docker-compose up
```

**또는 백그라운드 실행**:
```bash
docker-compose up -d
```

**실행되는 서비스**:
- `realestate-backend`: FastAPI 백엔드 서버
- `realestate-db`: PostgreSQL 데이터베이스
- `realestate-redis`: Redis 캐시

---

### 2. 특정 서비스만 시작

```bash
# 백엔드만 시작
docker-compose up backend

# 데이터베이스만 시작
docker-compose up db
```

---

### 3. 서비스 중지

```bash
# 서비스 중지 (컨테이너 유지)
docker-compose stop

# 서비스 중지 및 컨테이너 제거
docker-compose down
```

---

### 4. 로그 확인

```bash
# 모든 서비스 로그
docker-compose logs

# 백엔드 로그만
docker-compose logs backend

# 실시간 로그 (tail -f)
docker-compose logs -f backend
```

---

### 5. 컨테이너 상태 확인

```bash
docker-compose ps
```

**출력 예시**:
```
NAME                    STATUS          PORTS
realestate-backend      Up 5 minutes    0.0.0.0:8000->8000/tcp
realestate-db           Up 5 minutes    0.0.0.0:5432->5432/tcp
realestate-redis        Up 5 minutes    0.0.0.0:6379->6379/tcp
```

---

## 개별 컨테이너 실행

### 백엔드만 실행 (로컬 개발)

Docker 없이 로컬에서 직접 실행할 수도 있습니다.

#### 1. 가상 환경 생성 (선택)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

#### 2. 의존성 설치

```bash
cd backend
pip install -r requirements.txt
```

#### 3. 환경 변수 설정

`.env` 파일을 생성하고 필요한 환경 변수를 설정합니다.

#### 4. 서버 실행

```bash
# 개발 모드 (자동 리로드)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 프로덕션 모드
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 데이터베이스 초기화

### 1. Docker Compose로 DB 실행

```bash
docker-compose up -d db
```

### 2. 초기화 SQL 실행

```bash
# 방법 1: docker exec 사용
docker exec -i realestate-db psql -U postgres -d realestate < backend/scripts/init_db.sql

# 방법 2: psql 직접 사용 (로컬에 PostgreSQL이 설치된 경우)
psql -U postgres -d realestate -f backend/scripts/init_db.sql
```

---

## 문제 해결

### Q1. "port is already allocated" 에러

**원인**: 포트가 이미 사용 중

**해결 방법**:
1. 사용 중인 포트 확인:
   ```bash
   # Windows
   netstat -ano | findstr :8000
   
   # Linux/Mac
   lsof -i :8000
   ```

2. `docker-compose.yml`에서 포트 변경:
   ```yaml
   ports:
     - "8001:8000"  # 8000 → 8001로 변경
   ```

---

### Q2. "Cannot connect to database" 에러

**원인**: 데이터베이스가 아직 시작되지 않음

**해결 방법**:
1. DB 컨테이너 상태 확인:
   ```bash
   docker-compose ps db
   ```

2. DB 로그 확인:
   ```bash
   docker-compose logs db
   ```

3. DB 재시작:
   ```bash
   docker-compose restart db
   ```

---

### Q3. "Module not found" 에러

**원인**: Python 패키지가 설치되지 않음

**해결 방법**:
1. 백엔드 컨테이너 재빌드:
   ```bash
   docker-compose build backend
   docker-compose up backend
   ```

2. 또는 로컬에서 의존성 설치:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

---

### Q4. 환경 변수가 적용되지 않아요

**원인**: `.env` 파일이 없거나 Docker Compose가 읽지 못함

**해결 방법**:
1. `.env` 파일이 프로젝트 루트에 있는지 확인
2. Docker Compose 재시작:
   ```bash
   docker-compose down
   docker-compose up
   ```

---

## 유용한 명령어

### 컨테이너 내부 접속

```bash
# 백엔드 컨테이너 접속
docker-compose exec backend bash

# 데이터베이스 컨테이너 접속
docker-compose exec db psql -U postgres -d realestate
```

### 컨테이너 재시작

```bash
# 특정 서비스 재시작
docker-compose restart backend

# 모든 서비스 재시작
docker-compose restart
```

### 이미지 재빌드

```bash
# 캐시 없이 재빌드
docker-compose build --no-cache backend

# 모든 서비스 재빌드
docker-compose build --no-cache
```

### 볼륨 확인

```bash
# 볼륨 목록
docker volume ls

# 볼륨 상세 정보
docker volume inspect realestate-db-data
```

---

## 📚 추가 자료

- [환경 변수 가이드](./environment_variables.md)
- [프로젝트 구조](./project_structure.md)
- [Docker 공식 문서](https://docs.docker.com/)

---

**마지막 업데이트**: 2026-01-11
