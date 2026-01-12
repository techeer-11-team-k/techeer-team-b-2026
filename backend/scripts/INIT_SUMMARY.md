# 데이터베이스 초기화 방법 요약

## 🎯 질문: API 엔드포인트 vs Docker exec?

**답변: 둘 다 사용하지 않고, 더 안전한 방법을 권장합니다!**

## ✅ 권장 방법 (우선순위 순)

### 1순위: Docker Entrypoint (자동 초기화) ⭐

**가장 안전하고 자동화된 방법**

```bash
# 설정: docker-compose.yml에 이미 설정됨
# 사용: 볼륨 삭제 후 재생성하면 자동 실행
docker-compose down -v
docker-compose up -d
```

**장점:**
- ✅ 컨테이너 최초 생성 시에만 실행 (안전)
- ✅ 이미 데이터가 있으면 실행 안 됨
- ✅ 완전 자동화

**단점:**
- ⚠️ 볼륨 삭제 필요 (기존 데이터 삭제됨)

---

### 2순위: Python 스크립트 (수동 실행)

**필요할 때만 안전하게 실행**

```bash
docker exec -it realestate-backend python -m app.scripts.init_db_from_sql
```

**장점:**
- ✅ 테이블 존재 여부 자동 확인
- ✅ 안전하게 실행 가능
- ✅ 상세한 로그 출력

**단점:**
- ⚠️ 수동 실행 필요

---

### 3순위: 수동 SQL 실행

**완전한 제어가 필요할 때**

```bash
docker exec -i realestate-db psql -U postgres -d realestate < backend/scripts/init_schema.sql
```

---

## ❌ 비권장: API 엔드포인트

**보안 위험이 큽니다!**

### 왜 안 되나요?

1. **무단 접근 위험**
   - 인증 버그로 인해 누구나 호출 가능할 수 있음
   - 프로덕션 환경에서 치명적

2. **실수로 실행 위험**
   - 개발자가 실수로 호출할 수 있음
   - 기존 데이터 손실 가능

3. **감사(Audit) 어려움**
   - 누가 언제 실행했는지 추적 어려움

### 만약 꼭 필요하다면?

**절대 권장하지 않지만**, 정말 필요하다면:

```python
# backend/app/api/v1/endpoints/admin.py
@router.post("/admin/init-db", dependencies=[Depends(require_admin)])
async def init_database():
    """
    ⚠️ 위험: 관리자만 실행 가능하도록 강력한 인증 필요
    """
    # 매우 강력한 인증 확인
    # IP 화이트리스트 확인
    # 이중 확인 필요
    ...
```

**하지만 여전히 권장하지 않습니다!**

---

## 📁 생성된 파일

1. **`backend/scripts/init_schema.sql`**
   - PostgreSQL 형식 SQL 스크립트
   - 모든 테이블과 관계 정의

2. **`backend/scripts/init_db_from_sql.py`**
   - Python 초기화 스크립트
   - 테이블 존재 여부 확인 후 실행

3. **`backend/scripts/README_INIT.md`**
   - 상세한 사용 가이드

4. **`docker-compose.yml`** (수정됨)
   - Docker entrypoint 설정 추가

5. **`backend/app/main.py`** (수정됨)
   - 시작 시 자동 초기화 (개발 환경)

---

## 🚀 빠른 시작

### 처음 시작하는 경우

```bash
# 1. 볼륨 삭제 (기존 데이터 없음)
docker-compose down -v

# 2. 컨테이너 시작 (자동으로 SQL 실행됨)
docker-compose up -d

# 3. 로그 확인
docker-compose logs db
docker-compose logs backend
```

### 이미 데이터가 있는 경우

```bash
# Python 스크립트로 안전하게 확인
docker exec -it realestate-backend python -m app.scripts.init_db_from_sql
```

---

## 🔒 보안 체크리스트

- [x] API 엔드포인트로 초기화하지 않음
- [x] Docker entrypoint는 컨테이너 최초 생성 시만 실행
- [x] Python 스크립트는 테이블 존재 여부 확인
- [x] 모든 SQL 파일은 읽기 전용으로 마운트
- [x] 프로덕션 환경에서는 마이그레이션 도구 사용 권장

---

## 📚 더 알아보기

자세한 내용은 `backend/scripts/README_INIT.md`를 참고하세요.
