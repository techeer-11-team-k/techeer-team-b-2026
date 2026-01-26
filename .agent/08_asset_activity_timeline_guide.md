# 🛠 자산 활동 타임라인 차트 구현 가이드

> **목표**: 사용자의 아파트 구매/삭제 및 가격 변동 이력을 시각적으로 보여주는 타임라인 차트 구현
> 
> **대상 독자**: 초보 개발자도 따라할 수 있도록 단계별로 상세히 설명

---

## 📋 목차

1. [개요 및 목표](#개요-및-목표)
2. [1단계: DB 스키마 생성 및 모델링](#1단계-db-스키마-생성-및-모델링)
3. [2단계: 백엔드 로그 생성 로직 구현](#2단계-백엔드-로그-생성-로직-구현)
4. [3단계: 프론트엔드 UI 컴포넌트 구조 잡기](#3단계-프론트엔드-ui-컴포넌트-구조-잡기)
5. [4단계: 상세 요약 카드 인터랙션 구현](#4단계-상세-요약-카드-인터랙션-구현)
6. [5단계: 초기 데이터 마이그레이션 스크립트](#5단계-초기-데이터-마이그레이션-스크립트)
7. [추가 구현 단계 (고급 기능)](#추가-구현-단계-고급-기능)
   - [추가 1단계: 과거 데이터 기반 가격 변동 로그 생성](#추가-1단계-과거-데이터-기반-가격-변동-로그-생성-마이그레이션-스크립트)
   - [추가 2단계: 실시간 업데이트 트리거 구현](#추가-2단계-실시간-업데이트-트리거-구현)
   - [추가 3단계: 프론트엔드 GitHub 스타일 타임라인 구현](#추가-3단계-프론트엔드-github-스타일-타임라인-구현-보완)
   - [추가 4단계: 상세 요약 카드 인터랙션 구현](#추가-4단계-상세-요약-카드-인터랙션-구현-보완)
8. [최종 체크리스트](#최종-체크리스트)

---

## 개요 및 목표

### 왜 이 기능이 필요한가?

사용자가 자신의 자산(아파트) 활동 내역을 시간순으로 볼 수 있으면:
- 언제 아파트를 추가했는지
- 언제 가격이 올랐는지/내렸는지
- 관심 목록에 추가한 아파트의 가격 변동 추이

이런 정보를 한눈에 파악할 수 있어 투자 결정에 도움이 됩니다.

### 전체 아키텍처 흐름

```
[사용자 액션] → [백엔드 API] → [DB 저장] → [프론트엔드 조회] → [타임라인 UI 표시]
     ↓              ↓              ↓              ↓
  아파트 추가    로그 생성    asset_activity_logs   React 컴포넌트
  가격 변동      배치 작업    테이블에 저장         타임라인 렌더링
```

---

## 1단계: DB 스키마 생성 및 모델링

### 🎯 목표
자산 활동 내역을 저장할 데이터베이스 테이블을 만듭니다.

### 📝 구현 단계

#### 1-1. SQLAlchemy 모델 생성

**파일 위치**: `backend/app/models/asset_activity_log.py`

**왜 이 위치인가?**
- 프로젝트에서 모든 모델은 `backend/app/models/` 폴더에 있음
- 기존 `my_property.py`, `apartment.py`와 같은 구조로 통일성 유지

**Cursor 프롬프트**:
```
backend/app/models/ 폴더에 asset_activity_log.py 파일을 생성해줘.

SQLAlchemy 모델을 작성해줘:
- 테이블명: asset_activity_logs
- 필드:
  - id: Integer, PK, 자동증가
  - account_id: Integer, FK (accounts.account_id 참조), nullable=False
  - apt_id: Integer, FK (apartments.apt_id 참조)
  - category: String(20), nullable=False (MY_ASSET 또는 INTEREST)
  - event_type: String(20), nullable=False (ADD, DELETE, PRICE_UP, PRICE_DOWN)
  - price_change: Integer, nullable=True (가격 변동액, 만원 단위)
  - previous_price: Integer, nullable=True (변동 전 가격)
  - current_price: Integer, nullable=True (변동 후 가격)
  - created_at: DateTime, nullable=False, default=현재시간
  - metadata: Text, nullable=True (추가 정보를 JSON 문자열로 저장)

기존 모델들(my_property.py, apartment.py)의 스타일을 참고해서 작성해줘.
Base 클래스를 상속받고, relationship도 추가해줘.
```

#### 1-2. 모델을 __init__.py에 등록

**파일 위치**: `backend/app/models/__init__.py`

**왜 필요한가?**
- 다른 파일에서 `from app.models import AssetActivityLog` 형태로 import 하기 위해

**Cursor 프롬프트**:
```
backend/app/models/__init__.py 파일을 열어서 AssetActivityLog를 import 목록에 추가해줘.
기존 패턴을 따라서 추가하면 돼.
```

#### 1-3. 데이터베이스 마이그레이션 파일 생성

**파일 위치**: `backend/scripts/migrations/YYYYMMDD_add_asset_activity_logs.sql`

**왜 마이그레이션 파일을 만드는가?**

이 프로젝트는 **마이그레이션 시스템**을 사용하고 있습니다:

1. **마이그레이션 파일의 역할**:
   - 데이터베이스 스키마 변경 이력을 관리
   - 다른 개발자나 프로덕션 환경에서도 동일한 변경사항 적용 가능
   - 버전 관리 (Git)로 변경 이력 추적
   - 롤백 시 이전 상태로 되돌릴 수 있음

**Cursor 프롬프트**:
```
backend/scripts/migrations/ 폴더에 새로운 마이그레이션 SQL 파일을 생성해줘.
파일명: 20260125_add_asset_activity_logs.sql

PostgreSQL 문법으로 asset_activity_logs 테이블을 생성하는 SQL을 작성해줘:
- 위에서 정의한 모델과 동일한 구조
- IF NOT EXISTS 사용 (중복 실행 방지)
- 인덱스 추가: account_id, apt_id, created_at에 인덱스 생성 (조회 성능 향상)
- 코멘트 추가: 각 컬럼에 설명 코멘트 추가

기존 마이그레이션 파일들(20260122_add_interest_rates.sql 등)의 스타일을 참고해서 작성해줘.
```

**예상 SQL 구조**:
```sql
-- asset_activity_logs 테이블 생성
CREATE TABLE asset_activity_logs (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(account_id),
    apt_id INTEGER REFERENCES apartments(apt_id),
    category VARCHAR(20) NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    price_change INTEGER,
    previous_price INTEGER,
    current_price INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    CONSTRAINT check_category CHECK (category IN ('MY_ASSET', 'INTEREST')),
    CONSTRAINT check_event_type CHECK (event_type IN ('ADD', 'DELETE', 'PRICE_UP', 'PRICE_DOWN'))
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX idx_asset_activity_logs_account_id ON asset_activity_logs(account_id);
CREATE INDEX idx_asset_activity_logs_apt_id ON asset_activity_logs(apt_id);
CREATE INDEX idx_asset_activity_logs_created_at ON asset_activity_logs(created_at DESC);
```

#### 1-4. 마이그레이션 실행

**프로젝트의 마이그레이션 실행 방법**:

이 프로젝트에는 두 가지 실행 방법이 있습니다:

**방법 1: 자동 마이그레이션 (권장)**
```bash
# 로컬에서 실행
python backend/scripts/auto_migrate.py

# Docker 컨테이너에서 실행
docker exec -it realestate-backend python /app/scripts/auto_migrate.py
```
- 모든 미적용 마이그레이션을 자동으로 실행
- 이미 적용된 마이그레이션은 건너뜀
- `_migrations` 테이블에 기록됨

**방법 2: 개별 마이그레이션 실행**
```bash
# 로컬에서 실행
python backend/scripts/run_migration.py migrations/20260125_add_asset_activity_logs.sql

# Docker 컨테이너에서 실행
docker exec -it realestate-backend python /app/scripts/run_migration.py migrations/20260125_add_asset_activity_logs.sql
```
- 특정 마이그레이션 파일만 실행
- 테스트나 수동 실행 시 유용

**참고: `db_admin.py`는 마이그레이션 실행과 무관합니다**
- `db_admin.py`는 데이터베이스 관리 UI/기능을 제공하는 파일
- 마이그레이션 실행은 `auto_migrate.py` 또는 `run_migration.py`를 사용

**검증 방법**:
```sql
-- 테이블이 생성되었는지 확인
\dt asset_activity_logs

-- 테이블 구조 확인
\d asset_activity_logs

-- 마이그레이션 적용 여부 확인
SELECT * FROM _migrations WHERE name LIKE '%asset_activity%';
```

### ✅ 1단계 완료 체크리스트
- [ ] `asset_activity_log.py` 모델 파일 생성 완료
- [ ] `__init__.py`에 모델 등록 완료
- [ ] 마이그레이션 SQL 파일 생성 완료
- [ ] 데이터베이스에 테이블 생성 완료
- [ ] 테이블 구조 확인 완료

---

## 2단계: 백엔드 로그 생성 로직 구현

### 🎯 목표
사용자가 아파트를 추가/삭제하거나 가격이 변동될 때 자동으로 로그를 남기는 로직을 구현합니다.

### 📚 배경 지식

**서비스 레이어란?**
- 비즈니스 로직을 처리하는 코드
- API 엔드포인트에서 호출되어 실제 작업 수행
- 예: "아파트 추가" → DB에 저장 + 로그 생성

**배치 작업이란?**
- 정기적으로 자동 실행되는 작업
- 예: 매일 새벽 3시에 가격 변동 체크

### 📝 구현 단계

#### 2-1. Pydantic 스키마 생성

**파일 위치**: `backend/app/schemas/asset_activity_log.py`

**왜 필요한가?**
- API 요청/응답 데이터의 형식을 정의
- 데이터 검증 (예: category는 반드시 'MY_ASSET' 또는 'INTEREST')
- 타입 안정성 보장

**Cursor 프롬프트**:
```
backend/app/schemas/ 폴더에 asset_activity_log.py 파일을 생성해줘.

Pydantic 스키마를 작성해줘:
1. AssetActivityLogCreate: 로그 생성용 (모든 필드 optional)
2. AssetActivityLogResponse: API 응답용 (모든 필드 포함)
3. AssetActivityLogFilter: 필터링용 (category, event_type, 날짜 범위)

기존 schemas 파일들(my_property.py 등)의 스타일을 참고해서 작성해줘.
```
```

#### 2-2. 서비스 함수 생성

**파일 위치**: `backend/app/services/asset_activity_service.py`

**왜 서비스 레이어를 분리하는가?**
- API 엔드포인트와 비즈니스 로직 분리
- 재사용성 향상 (여러 API에서 같은 로직 사용 가능)
- 테스트 용이성

**Cursor 프롬프트**:
```
backend/app/services/ 폴더에 asset_activity_service.py 파일을 생성해줘.

다음 함수들을 작성해줘:

1. create_activity_log(db, log_data: AssetActivityLogCreate) -> AssetActivityLog
   - 로그를 생성하는 기본 함수
   - DB 세션과 로그 데이터를 받아서 저장

2. log_apartment_added(db, account_id: int, apt_id: int, category: str) -> None
   - 아파트 추가 시 호출
   - category는 'MY_ASSET' 또는 'INTEREST'
   - event_type은 'ADD'

3. log_apartment_deleted(db, account_id: int, apt_id: int, category: str) -> None
   - 아파트 삭제 시 호출
   - event_type은 'DELETE'

4. log_price_change(db, account_id: int, apt_id: int, category: str, 
                     previous_price: int, current_price: int) -> None
   - 가격 변동 시 호출
   - previous_price와 current_price 차이 계산해서 price_change에 저장
   - 상승이면 event_type='PRICE_UP', 하락이면 'PRICE_DOWN'

5. get_user_activity_logs(db, account_id: int, category: Optional[str] = None,
                          start_date: Optional[datetime] = None,
                          end_date: Optional[datetime] = None,
                          limit: int = 100) -> List[AssetActivityLog]
   - 사용자의 활동 로그 조회
   - 필터링 옵션: category, 날짜 범위
   - 최신순으로 정렬 (created_at DESC)
   - limit으로 개수 제한

기존 서비스 파일들의 패턴을 참고해서 작성해줘.
SQLAlchemy 세션 사용법도 기존 코드 참고.
```

**예상 코드 구조**:
```python
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from app.models.asset_activity_log import AssetActivityLog
from app.schemas.asset_activity_log import AssetActivityLogCreate

def create_activity_log(db: Session, log_data: AssetActivityLogCreate) -> AssetActivityLog:
    """활동 로그 생성"""
    db_log = AssetActivityLog(**log_data.dict())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def log_apartment_added(db: Session, account_id: int, apt_id: int, category: str):
    """아파트 추가 로그"""
    log_data = AssetActivityLogCreate(
        account_id=account_id,
        apt_id=apt_id,
        category=category,
        event_type='ADD'
    )
    create_activity_log(db, log_data)

# ... 나머지 함수들
```

#### 2-3. 기존 API에 로그 생성 로직 추가

**파일 위치**: `backend/app/api/routers/my_property.py` (또는 해당 API 파일)

**왜 필요한가?**
- 사용자가 아파트를 추가/삭제할 때 자동으로 로그가 남아야 함
- 기존 API 코드를 수정해서 로그 생성 함수 호출 추가

**Cursor 프롬프트**:
```
backend/app/api/routers/ 폴더에서 my_property 관련 API 파일을 찾아줘.
(또는 아파트 추가/삭제 API가 있는 파일)

아파트 추가 API 엔드포인트에서:
- 기존 로직 실행 후
- asset_activity_service.log_apartment_added() 호출 추가

아파트 삭제 API 엔드포인트에서:
- 기존 로직 실행 후
- asset_activity_service.log_apartment_deleted() 호출 추가

기존 코드 스타일을 유지하면서 추가해줘.
```

#### 2-4. 배치 작업 구현 (가격 변동 체크)

**파일 위치**: `backend/app/services/price_monitor_service.py`

**왜 배치 작업이 필요한가?**
- 실거래가 API에서 새 가격을 가져와서 기존 가격과 비교
- 변동이 있으면 자동으로 로그 생성
- 사용자가 직접 확인하지 않아도 자동으로 기록

**배치 실행 방법 선택**:
1. **APScheduler 사용** (추천)
   - Python 기반 스케줄러
   - FastAPI 앱 시작 시 함께 실행
2. **Cron Job 사용**
   - OS 레벨 스케줄러
   - 별도 스크립트로 실행

**Cursor 프롬프트 (APScheduler 방식)**:
```
backend/app/services/ 폴더에 price_monitor_service.py 파일을 생성해줘.

다음 함수를 작성해줘:

1. check_price_changes(db: Session) -> None
   - my_properties 테이블의 모든 아파트 조회
   - 각 아파트의 current_market_price와 최신 실거래가 비교
   - 가격 변동이 있으면 log_price_change() 호출
   - 가격 변동 기준: 1% 이상 변동 시에만 기록 (또는 설정 가능하게)

2. get_latest_apartment_price(apt_id: int) -> Optional[int]
   - 실거래가 API 호출해서 최신 가격 가져오기
   - 기존 API 호출 코드 참고

그리고 backend/app/main.py 또는 앱 시작 파일에서:
- APScheduler 설정 추가
- 매일 새벽 3시에 check_price_changes() 실행하도록 스케줄 등록

APScheduler 설치 필요: pip install apscheduler
requirements.txt에도 추가해줘.
```

**예상 코드 구조**:
```python
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from app.db.session import SessionLocal

def check_price_changes():
    """가격 변동 체크 배치 작업"""
    db = SessionLocal()
    try:
        # my_properties 조회
        # 각각에 대해 가격 비교
        # 변동 있으면 로그 생성
        pass
    finally:
        db.close()

# main.py에서
scheduler = BackgroundScheduler()
scheduler.add_job(
    check_price_changes,
    'cron',
    hour=3,
    minute=0
)
scheduler.start()
```

**💡 직접 판단/추가할 내용**:
- **배치 주기**: 매일 새벽 3시 권장 (트래픽이 적은 시간대)
- **가격 변동 기준**: 
  - 옵션 1: 1원이라도 변동 시 기록 (모든 변동 추적)
  - 옵션 2: 1% 이상 변동 시에만 기록 (중요한 변동만 추적)
  - 옵션 3: 설정 가능하게 (환경변수로 조정)
- **에러 처리**: API 호출 실패 시 재시도 로직 추가 고려

### ✅ 2단계 완료 체크리스트
- [ ] Pydantic 스키마 생성 완료
- [ ] 서비스 함수 생성 완료
- [ ] 기존 API에 로그 생성 로직 추가 완료
- [ ] 배치 작업 구현 완료
- [ ] 배치 작업 테스트 완료 (수동 실행으로 확인)

---

## 3단계: 프론트엔드 UI 컴포넌트 구조 잡기

### 🎯 목표
GitHub Contribution Timeline 스타일의 타임라인 UI를 만듭니다.

### 📚 배경 지식

**React 컴포넌트란?**
- UI의 재사용 가능한 조각
- 예: 버튼, 카드, 타임라인 등

**Tailwind CSS란?**
- 유틸리티 기반 CSS 프레임워크
- `className="bg-blue-500 text-white"` 형태로 스타일 적용

**Lucide React란?**
- 아이콘 라이브러리 (이미 프로젝트에 설치됨)
- `import { Plus, Minus } from 'lucide-react'` 형태로 사용

### 📝 구현 단계

#### 3-1. API 호출 함수 생성

**파일 위치**: `frontend/src/lib/assetActivityApi.ts` (또는 기존 API 파일)

**왜 필요한가?**
- 백엔드 API를 호출해서 로그 데이터 가져오기
- 프론트엔드와 백엔드 통신

**Cursor 프롬프트**:
```
frontend/src/lib/ 폴더에 assetActivityApi.ts 파일을 생성해줘.
(또는 기존 API 파일에 추가)

다음 함수들을 작성해줘:

1. fetchActivityLogs(accountId: number, filters?: {
   category?: 'MY_ASSET' | 'INTEREST' | 'ALL',
   startDate?: string,
   endDate?: string
}) -> Promise<ActivityLog[]>

2. ActivityLog 타입 정의:
   - id, accountId, aptId, category, eventType, priceChange, 
     previousPrice, currentPrice, createdAt, metadata

기존 API 파일들(apartmentApi.ts, myPropertyApi.ts 등)의 패턴을 참고해서 작성해줘.
```

**예상 코드 구조**:
```typescript
// types.ts 또는 assetActivityApi.ts 내부
export interface ActivityLog {
  id: number;
  accountId: number;
  aptId: number | null;
  category: 'MY_ASSET' | 'INTEREST';
  eventType: 'ADD' | 'DELETE' | 'PRICE_UP' | 'PRICE_DOWN';
  priceChange: number | null;
  previousPrice: number | null;
  currentPrice: number | null;
  createdAt: string;
  metadata: string | null;
}

// assetActivityApi.ts
import { api } from './api'; // 기존 API 설정

export async function fetchActivityLogs(
  accountId: number,
  filters?: {
    category?: 'MY_ASSET' | 'INTEREST' | 'ALL';
    startDate?: string;
    endDate?: string;
  }
): Promise<ActivityLog[]> {
  const params = new URLSearchParams();
  if (filters?.category && filters.category !== 'ALL') {
    params.append('category', filters.category);
  }
  // ... 나머지 필터
  
  const response = await api.get(`/asset-activity-logs/${accountId}?${params}`);
  return response.data;
}
```

#### 3-2. 타임라인 컴포넌트 생성

**파일 위치**: `frontend/components/views/AssetActivityTimeline.tsx`

**왜 이 위치인가?**
- 기존 `HousingDemand.tsx`와 같은 views 폴더에 위치
- 페이지 단위 컴포넌트는 views에 배치

**Cursor 프롬프트**:
```
frontend/components/views/ 폴더에 AssetActivityTimeline.tsx 파일을 생성해줘.

GitHub Contribution Timeline 스타일의 타임라인 UI를 만들어줘:

1. 레이아웃:
   - 좌측: 수직선 (타임라인 라인)
   - 우측: 날짜별 이벤트 리스트
   - 각 이벤트는 아이콘 + 텍스트로 표시

2. 필터 탭:
   - 상단에 [전체, 내 아파트, 관심 목록] 탭
   - 클릭 시 해당 카테고리만 필터링

3. 색상 구분:
   - MY_ASSET: 진한 파란색 (#2563eb 또는 blue-600)
   - INTEREST: 연한 보라색 (#a855f7 또는 purple-400)
   - 이벤트 타입별 아이콘:
     - ADD: Plus 아이콘 (초록색)
     - DELETE: X 아이콘 (빨간색)
     - PRICE_UP: TrendingUp 아이콘 (초록색)
     - PRICE_DOWN: TrendingDown 아이콘 (빨간색)

4. 날짜 그룹핑:
   - 같은 날짜의 이벤트들을 그룹화
   - 날짜 헤더 표시 (예: "2025년 1월 25일")

5. 무한 스크롤 또는 페이지네이션:
   - 초기 50개 로드
   - 스크롤 시 추가 로드 (또는 페이지 버튼)

Tailwind CSS와 Lucide React 사용.
기존 HousingDemand.tsx의 스타일을 참고해서 작성해줘.
```

**예상 컴포넌트 구조**:
```typescript
import React, { useState, useEffect } from 'react';
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchActivityLogs, ActivityLog } from '../../lib/assetActivityApi';

type FilterCategory = 'ALL' | 'MY_ASSET' | 'INTEREST';

export const AssetActivityTimeline: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const accountId = getCurrentUserId(); // Clerk에서 가져오기
      const data = await fetchActivityLogs(accountId, {
        category: filter === 'ALL' ? undefined : filter
      });
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  // 날짜별 그룹핑
  const groupedLogs = groupByDate(logs);

  return (
    <div className="container mx-auto p-6">
      {/* 필터 탭 */}
      <div className="flex gap-2 mb-6">
        {['전체', '내 아파트', '관심 목록'].map((label, idx) => (
          <button
            key={idx}
            onClick={() => setFilter(['ALL', 'MY_ASSET', 'INTEREST'][idx] as FilterCategory)}
            className={`px-4 py-2 rounded ${
              filter === ['ALL', 'MY_ASSET', 'INTEREST'][idx]
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 타임라인 */}
      <div className="relative">
        {/* 수직선 */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300" />
        
        {/* 이벤트 리스트 */}
        <div className="space-y-6">
          {Object.entries(groupedLogs).map(([date, dateLogs]) => (
            <div key={date}>
              <h3 className="text-lg font-semibold mb-4">{date}</h3>
              {dateLogs.map((log) => (
                <TimelineItem key={log.id} log={log} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TimelineItem: React.FC<{ log: ActivityLog }> = ({ log }) => {
  const getIcon = () => {
    switch (log.eventType) {
      case 'ADD': return <Plus className="w-5 h-5 text-green-500" />;
      case 'DELETE': return <X className="w-5 h-5 text-red-500" />;
      case 'PRICE_UP': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'PRICE_DOWN': return <TrendingDown className="w-5 h-5 text-red-500" />;
    }
  };

  const getCategoryColor = () => {
    return log.category === 'MY_ASSET' ? 'bg-blue-600' : 'bg-purple-400';
  };

  return (
    <div className="flex items-start gap-4 relative pl-12">
      {/* 아이콘 */}
      <div className={`absolute left-6 ${getCategoryColor()} rounded-full p-2 text-white`}>
        {getIcon()}
      </div>
      
      {/* 텍스트 */}
      <div className="flex-1">
        <p className="text-sm text-gray-700">
          {getEventDescription(log)}
        </p>
        <p className="text-xs text-gray-500">{formatTime(log.createdAt)}</p>
      </div>
    </div>
  );
};
```

**💡 직접 판단/추가할 내용**:
- **아이콘 라이브러리**: Lucide React 사용 (이미 설치됨)
- **색상 대비**: 시각장애인/색약 사용자 고려
  - MY_ASSET: 파란색 + 아이콘으로 구분
  - INTEREST: 보라색 + 다른 아이콘 모양
  - 텍스트 라벨도 함께 표시 권장

### ✅ 3단계 완료 체크리스트
- [ ] API 호출 함수 생성 완료
- [ ] 타임라인 컴포넌트 기본 구조 완료
- [ ] 필터 탭 구현 완료
- [ ] 날짜 그룹핑 구현 완료
- [ ] 색상 및 아이콘 적용 완료
- [ ] 반응형 디자인 확인 완료

---

## 4단계: 상세 요약 카드 인터랙션 구현

### 🎯 목표
타임라인 항목 클릭 시 상세 정보를 보여주는 카드를 표시합니다.

### 📚 배경 지식

**Framer Motion이란?**
- React 애니메이션 라이브러리 (이미 프로젝트에 설치됨)
- 부드러운 애니메이션 효과 추가 가능

**상태 관리란?**
- 어떤 항목이 선택되었는지 기억
- `useState`로 선택된 항목 ID 저장

### 📝 구현 단계

#### 4-1. 상세 카드 컴포넌트 생성

**Cursor 프롬프트**:
```
AssetActivityTimeline.tsx 파일에 상세 카드 컴포넌트를 추가해줘.

1. TimelineItem에 onClick 이벤트 추가
   - 클릭 시 선택된 로그 ID를 state에 저장

2. DetailCard 컴포넌트 생성:
   - 선택된 로그 정보 표시
   - 가격 변동 폭 표시:
     - 상승: 초록색 텍스트, + 기호, "▲ +500만원" 형태
     - 하락: 빨간색 텍스트, - 기호, "▼ -300만원" 형태
   - 아파트 정보 표시 (아파트명, 지역 등)
   - 이벤트 타입에 따른 설명 텍스트

3. Framer Motion 애니메이션:
   - 카드가 나타날 때: fadeIn + slideUp 효과
   - 카드가 사라질 때: fadeOut 효과
   - AnimatePresence 사용

4. 카드 위치:
   - 타임라인 바로 아래에 표시 (선택된 항목 다음)
   - 또는 고정 위치 (화면 하단 또는 사이드바)

GitHub PR 상세 보기 스타일 참고.
```

**예상 코드 구조**:
```typescript
import { motion, AnimatePresence } from 'framer-motion';

// TimelineItem 수정
const TimelineItem: React.FC<{ 
  log: ActivityLog;
  isSelected: boolean;
  onSelect: (logId: number) => void;
}> = ({ log, isSelected, onSelect }) => {
  return (
    <div 
      className={`flex items-start gap-4 relative pl-12 cursor-pointer ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={() => onSelect(log.id)}
    >
      {/* ... 기존 코드 ... */}
    </div>
  );
};

// DetailCard 컴포넌트
const DetailCard: React.FC<{ log: ActivityLog | null }> = ({ log }) => {
  if (!log) return null;

  const getPriceChangeDisplay = () => {
    if (log.eventType === 'PRICE_UP' || log.eventType === 'PRICE_DOWN') {
      const isUp = log.eventType === 'PRICE_UP';
      const change = Math.abs(log.priceChange || 0);
      return (
        <div className={`text-lg font-semibold ${isUp ? 'text-green-600' : 'text-red-600'}`}>
          {isUp ? '▲' : '▼'} {change.toLocaleString()}만원
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-md mt-4"
    >
      <h4 className="font-semibold mb-2">{getEventTitle(log)}</h4>
      {getPriceChangeDisplay()}
      <div className="mt-2 text-sm text-gray-600">
        <p>이전 가격: {log.previousPrice?.toLocaleString()}만원</p>
        <p>현재 가격: {log.currentPrice?.toLocaleString()}만원</p>
      </div>
      {/* 아파트 정보 등 추가 */}
    </motion.div>
  );
};

// 메인 컴포넌트에서 사용
const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

// 타임라인 렌더링 부분
{logs.map((log) => (
  <div key={log.id}>
    <TimelineItem 
      log={log}
      isSelected={selectedLogId === log.id}
      onSelect={setSelectedLogId}
    />
    <AnimatePresence>
      {selectedLogId === log.id && (
        <DetailCard log={log} />
      )}
    </AnimatePresence>
  </div>
))}
```

**💡 직접 판단/추가할 내용**:
- **카드 위치**: 
  - 옵션 1: 선택된 항목 바로 아래 (타임라인 내부)
  - 옵션 2: 화면 우측 사이드바 (고정 위치)
  - 옵션 3: 모달로 표시
- **닫기 버튼**: X 버튼 추가하여 카드 닫기 가능하게

### ✅ 4단계 완료 체크리스트
- [ ] 상세 카드 컴포넌트 생성 완료
- [ ] 클릭 이벤트 연결 완료
- [ ] Framer Motion 애니메이션 적용 완료
- [ ] 가격 변동 표시 완료
- [ ] 아파트 정보 표시 완료
- [ ] 반응형 디자인 확인 완료

---

## 5단계: 초기 데이터 마이그레이션 스크립트

### 🎯 목표
기존에 있던 `my_properties` 데이터를 `asset_activity_logs`에 ADD 이벤트로 한꺼번에 넣습니다.

### 📚 배경 지식

**마이그레이션이란?**
- 데이터를 한 형태에서 다른 형태로 변환
- 예: 기존 테이블 데이터를 새 테이블로 복사

**왜 필요한가?**
- 기능 출시 전에 이미 있는 데이터도 타임라인에 표시
- 사용자가 "내가 추가한 아파트가 왜 안 보이지?" 하는 문제 방지

### 📝 구현 단계

#### 5-1. 마이그레이션 스크립트 생성

**파일 위치**: `backend/scripts/migrate_existing_properties_to_logs.py`

**Cursor 프롬프트**:
```
backend/scripts/ 폴더에 migrate_existing_properties_to_logs.py 파일을 생성해줘.

다음 기능을 구현해줘:

1. my_properties 테이블의 모든 레코드 조회
   - is_deleted=False인 것만 (삭제되지 않은 것만)

2. 각 레코드에 대해:
   - asset_activity_logs에 ADD 이벤트 생성
   - account_id, apt_id, category='MY_ASSET', event_type='ADD'
   - created_at은 my_properties의 created_at 사용 (없으면 현재 시간)
   - current_price는 my_properties의 current_market_price 사용

3. 진행 상황 출력:
   - "처리 중: X/Y"
   - 완료 후 "총 X개 레코드 마이그레이션 완료"

4. 중복 방지:
   - 이미 로그가 있는 경우 스킵 (account_id + apt_id + event_type='ADD' 조합으로 체크)

5. 에러 처리:
   - 개별 레코드 처리 실패 시에도 계속 진행
   - 실패한 레코드 ID 기록

기존 스크립트 파일들의 패턴을 참고해서 작성해줘.
```

**예상 코드 구조**:
```python
"""
기존 my_properties 데이터를 asset_activity_logs로 마이그레이션

실행 방법:
    python backend/scripts/migrate_existing_properties_to_logs.py
"""
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.my_property import MyProperty
from app.models.asset_activity_log import AssetActivityLog
from datetime import datetime

def migrate_existing_properties():
    """기존 my_properties를 asset_activity_logs로 마이그레이션"""
    db: Session = SessionLocal()
    
    try:
        # 모든 활성 my_properties 조회
        properties = db.query(MyProperty).filter(
            MyProperty.is_deleted == False
        ).all()
        
        total = len(properties)
        success_count = 0
        skip_count = 0
        error_count = 0
        errors = []
        
        print(f"총 {total}개의 레코드를 처리합니다...")
        
        for idx, property in enumerate(properties, 1):
            try:
                # 중복 체크
                existing_log = db.query(AssetActivityLog).filter(
                    AssetActivityLog.account_id == property.account_id,
                    AssetActivityLog.apt_id == property.apt_id,
                    AssetActivityLog.event_type == 'ADD',
                    AssetActivityLog.category == 'MY_ASSET'
                ).first()
                
                if existing_log:
                    skip_count += 1
                    print(f"[{idx}/{total}] 스킵 (이미 존재): property_id={property.property_id}")
                    continue
                
                # 로그 생성
                log = AssetActivityLog(
                    account_id=property.account_id,
                    apt_id=property.apt_id,
                    category='MY_ASSET',
                    event_type='ADD',
                    current_price=property.current_market_price,
                    created_at=property.created_at or datetime.now()
                )
                
                db.add(log)
                success_count += 1
                print(f"[{idx}/{total}] 처리 완료: property_id={property.property_id}")
                
            except Exception as e:
                error_count += 1
                error_msg = f"property_id={property.property_id}: {str(e)}"
                errors.append(error_msg)
                print(f"[{idx}/{total}] 오류: {error_msg}")
        
        # 커밋
        db.commit()
        
        # 결과 출력
        print("\n" + "="*50)
        print("마이그레이션 완료!")
        print(f"성공: {success_count}개")
        print(f"스킵: {skip_count}개")
        print(f"오류: {error_count}개")
        
        if errors:
            print("\n오류 상세:")
            for error in errors:
                print(f"  - {error}")
        
    except Exception as e:
        db.rollback()
        print(f"치명적 오류: {str(e)}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_existing_properties()
```

#### 5-2. 스크립트 실행

**실행 방법**:
```bash
# 프로젝트 루트에서
cd backend
python scripts/migrate_existing_properties_to_logs.py
```

**검증 방법**:
```sql
-- 마이그레이션 결과 확인
SELECT 
    category,
    event_type,
    COUNT(*) as count
FROM asset_activity_logs
GROUP BY category, event_type;

-- 특정 사용자의 로그 확인
SELECT * FROM asset_activity_logs 
WHERE account_id = [사용자ID]
ORDER BY created_at DESC
LIMIT 10;
```

### ✅ 5단계 완료 체크리스트
- [ ] 마이그레이션 스크립트 생성 완료
- [ ] 스크립트 실행 완료
- [ ] 데이터 검증 완료
- [ ] 오류 없이 모든 레코드 마이그레이션 완료

---

## 추가 구현 단계 (고급 기능)

> **참고**: 기본 구현(1-5단계)이 완료된 후, 더 풍성한 타임라인을 위해 아래 단계들을 추가로 구현할 수 있습니다.

---

### 추가 1단계: 과거 데이터 기반 가격 변동 로그 생성 (마이그레이션 스크립트)

#### 🎯 목표
타임라인을 풍성하게 만들기 위해 기존 실거래가 데이터를 바탕으로 과거 가격 변동 이력을 로그로 변환합니다.

#### 📚 배경 지식

**왜 필요한가?**
- 현재는 아파트 추가/삭제 시점의 로그만 있음
- 과거 가격 변동 이력이 없어 타임라인이 빈약함
- 실거래가 히스토리를 활용하여 과거 이벤트를 재구성

**마이그레이션 vs 배치 작업**
- 마이그레이션: 과거 데이터를 한 번만 변환 (일회성)
- 배치 작업: 앞으로 들어오는 데이터를 정기적으로 처리 (지속적)

#### 📝 구현 단계

**파일 위치**: `backend/scripts/migrate_price_history_to_logs.py`

**Cursor 프롬프트**:
```
현재 프로젝트에 log_price_change() 함수는 있지만 호출되는 곳이 없어. 매일 새벽 배치 작업을 수행하는 대신, 기존 데이터의 과거 이력을 바탕으로 타임라인 로그를 생성하는 마이그레이션 스크립트를 작성해줘.

1. my_properties와 favorite_apartments에 등록된 모든 아파트를 조회한다.

2. 해당 아파트들의 과거 1년 실거래가 히스토리를 가져온다. (기존 DB의 실거래가 테이블 혹은 연결된 API 활용)

3. 이전 실거래가 대비 1% 이상 변동이 있을 때마다 log_price_change()를 호출하여 asset_activity_logs에 저장한다.

4. 이때 로그의 created_at은 현재 시간이 아니라 실거래가 발생일로 설정해야 해.

5. 아파트가 많으니 1초에 5개씩 처리하는 로직을 넣어줘.

6. 이미 같은 날짜에 동일한 변동 로그가 있다면 생략하는 로직을 넣어줘.
```

**예상 코드 구조**:
```python
"""
과거 실거래가 데이터를 기반으로 가격 변동 로그 생성

실행 방법:
    python backend/scripts/migrate_price_history_to_logs.py
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.core.config import settings
from app.models.my_property import MyProperty
from app.models.favorite import FavoriteApartment
from app.models.sale import Sale  # 실거래가 테이블
from app.models.asset_activity_log import AssetActivityLog
from app.services.asset_activity_service import create_activity_log
from app.schemas.asset_activity_log import AssetActivityLogCreate

async def migrate_price_history():
    """과거 실거래가 데이터를 기반으로 가격 변동 로그 생성"""
    # 1. my_properties와 favorite_apartments의 모든 아파트 ID 수집
    # 2. 각 아파트별로 과거 1년 실거래가 조회
    # 3. 가격 변동이 1% 이상인 경우만 로그 생성
    # 4. created_at은 실거래가 발생일로 설정
    #    - create_activity_log() 대신 직접 모델 생성하거나
    #    - 서비스 함수를 수정하여 created_at 파라미터 추가
    # 5. 중복 체크 (같은 날짜, 같은 아파트, 같은 변동)
    
    # 예시: 직접 모델 생성 방식 (created_at 지정 가능)
    log_data = AssetActivityLogCreate(...)
    db_log = AssetActivityLog(
        **log_data.dict(),
        created_at=sale_date  # 실거래가 발생일
    )
    db.add(db_log)
    # 또는 서비스 함수 수정 후 사용
    pass
```

**⚠️ 주의사항**:
- 현재 `create_activity_log()` 서비스 함수는 `created_at`을 항상 현재 시간으로 설정합니다.
- 마이그레이션에서는 실거래가 발생일을 사용해야 하므로:
  - **방법 1 (권장)**: 서비스 함수에 `created_at` 파라미터를 추가하여 옵셔널로 받을 수 있게 수정
  - **방법 2**: 마이그레이션 스크립트에서만 직접 모델을 생성하되, 서비스 함수의 로직(로깅 등)은 유지

**💡 직접 판단/추가할 내용**:
- **서비스 레이어 사용**: `log_price_change()` 서비스 함수를 사용하는 것이 맞습니다. 하지만 현재 함수는 `created_at`을 현재 시간으로 설정하므로, 마이그레이션 스크립트에서는 다음 중 하나를 선택해야 합니다:
  - 옵션 1: 서비스 함수를 수정하여 `created_at`을 파라미터로 받을 수 있게 함 (권장)
  - 옵션 2: 마이그레이션 스크립트에서 직접 `create_activity_log()`를 호출하되, 모델 생성 시 `created_at`을 실거래가 발생일로 지정
- **API 호출량 제한**: 아파트가 많을 경우 Rate Limit 방지를 위해 1초에 5개씩 처리
- **중복 방지**: 같은 날짜에 동일한 변동 로그가 있으면 스킵
- **가격 변동 기준**: 1% 이상 변동 시에만 기록 (환경변수로 조정 가능)
- **기간 설정**: 과거 1년 데이터만 처리 (더 길게 설정 가능)

**✅ 완료 체크리스트**:
- [ ] 마이그레이션 스크립트 생성 완료
- [ ] 실거래가 테이블에서 데이터 조회 로직 구현
- [ ] 가격 변동 계산 및 1% 이상 필터링 로직 구현
- [ ] 중복 체크 로직 구현
- [ ] created_at을 실거래가 발생일로 설정
- [ ] API 호출량 제한 로직 구현 (1초에 5개)
- [ ] 스크립트 실행 및 검증 완료

---

### 추가 2단계: 실시간 업데이트 트리거 구현

#### 🎯 목표
매일 새벽 전체 데이터를 전수 조사하는 배치 작업 대신, 실거래가 데이터가 새로 업데이트되는 시점에 자동으로 로그를 생성합니다.

#### 📚 배경 지식

**배치 작업 vs 실시간 트리거**
- **배치 작업**: 정해진 시간에 모든 데이터를 확인 (비효율적, 서버 부하)
- **실시간 트리거**: 데이터가 업데이트될 때만 처리 (효율적, 즉시 반영)

**왜 실시간 트리거가 좋은가?**
- 서버 부하 감소 (전수 조사 불필요)
- 즉시 반영 (사용자가 빠르게 확인 가능)
- 정확한 시점 기록 (데이터 업데이트 시점과 일치)

#### 📝 구현 단계

**파일 위치**: 실거래가 데이터 수집/업데이트 로직이 있는 파일

**Cursor 프롬프트**:
```
실거래가 데이터가 시스템에 새로 업데이트되는 시점에 로그를 남기고 싶어.

1. 실거래가 데이터를 수집하거나 업데이트하는 로직(함수)을 찾아줘.

2. 해당 로직 끝에, 기존 가격과 새 가격을 비교하여 1% 이상 차이가 나면 log_price_change()를 자동으로 호출하는 트리거 기능을 추가해줘.

3. my_properties와 favorite_apartments에 등록된 아파트만 체크하면 돼.

4. 이미 같은 날짜에 동일한 변동 로그가 있다면 생략하는 로직을 넣어줘.
```

**예상 코드 구조**:
```python
# 실거래가 데이터 수집/업데이트 함수 내부
async def collect_sale_data(apt_id: int, new_price: int):
    """실거래가 데이터 수집 및 업데이트"""
    # 1. 기존 실거래가 데이터 저장/업데이트
    # ... 기존 로직 ...
    
    # 2. 가격 변동 로그 생성 (트리거)
    # my_properties와 favorite_apartments에 등록된 아파트인지 확인
    # 기존 가격과 새 가격 비교
    # 1% 이상 변동 시 log_price_change() 호출
    pass
```

**💡 직접 판단/추가할 내용**:
- **트리거 위치**: 실거래가 데이터를 저장하는 함수의 끝부분
- **가격 비교 기준**: 1% 이상 변동 시에만 로그 생성
- **중복 방지**: 같은 날짜에 이미 로그가 있으면 스킵
- **카테고리 구분**: MY_ASSET과 INTEREST 모두 체크

**✅ 완료 체크리스트**:
- [ ] 실거래가 데이터 수집/업데이트 로직 위치 확인
- [ ] 가격 비교 로직 추가
- [ ] log_price_change() 호출 추가
- [ ] 중복 체크 로직 구현
- [ ] 테스트 및 검증 완료

---

### 추가 3단계: 프론트엔드 GitHub 스타일 타임라인 구현 (보완)

#### 🎯 목표
기존 3단계를 보완하여 GitHub Contribution Timeline과 유사한 시각적 디자인을 구현합니다.

#### 📝 구현 단계

**파일 위치**: `frontend/components/views/AssetActivityTimeline.tsx` (기존 파일 수정)

**Cursor 프롬프트**:
```
자산 분석 페이지에 GitHub의 Contribution Timeline 스타일의 차트를 구현해줘.

1. asset_activity_logs 데이터를 월별로 그룹화해서 보여줘.

2. 색상 구분:
   - MY_ASSET 로그는 진한 파란색(Primary) 칩을 사용해줘.
   - INTEREST 로그는 연한 보라색(Secondary) 칩을 사용해줘.

3. 아이콘 적용:
   - ADD: 초록색 집 모양 아이콘
   - DELETE: 빨간색 X 아이콘
   - PRICE_UP: 빨간색 상승 화살표
   - PRICE_DOWN: 파란색 하락 화살표

4. 상단에 [전체, 내 아파트, 관심 목록]을 필터링할 수 있는 탭 버튼을 추가해줘.

5. GitHub Contribution Timeline처럼 월별 그리드 형태로 표시해줘.
```
- **레이아웃**: GitHub처럼 월별 그리드 형태
- **색상**: Primary/Secondary 색상 사용 (Tailwind CSS)
- **아이콘**: Lucide React의 Home, X, TrendingUp, TrendingDown 사용
- **필터 탭**: 기존 필터 기능을 탭 버튼 형태로 개선

**✅ 완료 체크리스트**:
- [ ] 월별 그룹화 로직 구현
- [ ] 색상 구분 적용 (Primary/Secondary)
- [ ] 아이콘 적용 (ADD, DELETE, PRICE_UP, PRICE_DOWN)
- [ ] 필터 탭 버튼 UI 구현
- [ ] GitHub 스타일 레이아웃 적용 (선택사항)

---

### 추가 4단계: 상세 요약 카드 인터랙션 구현 (보완)

#### 🎯 목표
기존 4단계를 보완하여 GitHub PR 상세 카드와 유사한 디자인으로 구현합니다.

#### 📝 구현 단계

**파일 위치**: `frontend/components/views/AssetActivityTimeline.tsx` (기존 파일 수정)

**Cursor 프롬프트**:
```
타임라인의 개별 이벤트를 클릭했을 때 나타나는 상세 요약 카드를 만들어줘.

1. 이미지의 GitHub PR 상세 카드와 유사한 디자인으로 구현해줘.

2. 카드 내부에는 다음 정보를 깔끔하게 표시해줘:
   - 아파트 이름
   - 변동 금액 (예: +5,000만원)
   - 변동률 (%)
   - 현재가 정보

3. 상승은 빨간색, 하락은 파란색 텍스트로 강조해줘.

4. 클릭한 항목 바로 아래 혹은 적절한 위치에 부드러운 애니메이션과 함께 나타나도록 해줘.

5. Framer Motion을 사용해서 나타날 때 부드러운 애니메이션을 넣어줘.
```

**예상 UI 구조**:
```
┌─────────────────────────────────────┐
│  래미안 강남파크                      │
│  ───────────────────────────────    │
│  가격 변동: +5,000만원 (↑ 5.2%)     │
│  이전가: 95,000만원                  │
│  현재가: 100,000만원                 │
│  발생일: 2025-01-15                  │
└─────────────────────────────────────┘
```

**💡 직접 판단/추가할 내용**:
- **카드 위치**: 클릭한 항목 바로 아래 (인라인) 또는 우측 사이드바
- **애니메이션**: Framer Motion의 `AnimatePresence`와 `motion.div` 사용
- **색상**: 상승(빨간색), 하락(파란색) - 기존 가이드와 반대일 수 있음 (확인 필요)
- **닫기 버튼**: X 버튼 추가하여 카드 닫기 가능

**✅ 완료 체크리스트**:
- [ ] 상세 카드 컴포넌트 생성/수정 완료
- [ ] GitHub PR 스타일 디자인 적용
- [ ] 아파트 정보 표시 완료
- [ ] 가격 변동 정보 표시 완료 (금액, 변동률)
- [ ] 색상 강조 적용 (상승/하락)
- [ ] Framer Motion 애니메이션 적용
- [ ] 클릭 이벤트 연결 완료
- [ ] 닫기 버튼 추가 완료

---

## 최종 체크리스트

### 🚩 사용자 확인 사항

#### 1. 데이터 무결성
- [ ] **중복 처리 정책 결정**
  - 아파트를 삭제했다가 다시 추가할 경우, 타임라인에 중복으로 보일 수 있음
  - 옵션 1: 중복 허용 (모든 이력 보존)
  - 옵션 2: 최신 상태만 남기기 (이전 ADD 로그 삭제)
  - **권장**: 옵션 1 (모든 이력 보존 - 투명성)

#### 2. 색상 가이드
- [ ] **색상 대비 확인**
  - 상승(초록) / 하락(빨강) 색상이 서비스 전체 톤앤매너와 일치하는지
  - '내 아파트'와 '관심 목록'의 색상 대비가 충분한지
  - **접근성**: 색약 사용자도 구분 가능한지 (아이콘 + 텍스트 라벨 함께 사용)

#### 3. 성능 최적화
- [ ] **대용량 데이터 처리**
  - 사용자 활동이 수천 개가 넘을 경우 대비
  - 옵션 1: 무한 스크롤 (Infinite Scroll)
  - 옵션 2: 페이지네이션 (페이지 버튼)
  - 옵션 3: 날짜 범위 필터 (최근 1개월, 3개월 등)
  - **권장**: 옵션 3 + 옵션 1 조합

#### 4. API 엔드포인트
- [ ] **백엔드 API 라우터 생성**
  - `GET /api/asset-activity-logs/{account_id}` - 로그 조회
  - 필터링 쿼리 파라미터: `category`, `start_date`, `end_date`, `limit`
  - 응답 형식: JSON 배열

#### 5. 에러 처리
- [ ] **프론트엔드 에러 처리**
  - API 호출 실패 시 에러 메시지 표시
  - 로딩 상태 표시
  - 빈 데이터 상태 처리 (활동 내역이 없을 때)

#### 6. 테스트
- [ ] **기능 테스트**
  - 아파트 추가 시 로그 생성 확인
  - 아파트 삭제 시 로그 생성 확인
  - 가격 변동 시 로그 생성 확인 (배치 작업)
  - 타임라인 UI 표시 확인
  - 필터링 동작 확인
  - 상세 카드 표시 확인

---

## 🎓 학습 포인트 정리

### 백엔드
1. **SQLAlchemy 모델링**: 데이터베이스 테이블을 Python 클래스로 정의
2. **서비스 레이어 패턴**: 비즈니스 로직을 별도 레이어로 분리
3. **배치 작업**: 정기적으로 실행되는 작업 구현
4. **마이그레이션**: 기존 데이터를 새 구조로 변환

### 프론트엔드
1. **React 컴포넌트 구조**: 재사용 가능한 UI 컴포넌트 설계
2. **상태 관리**: useState로 선택 상태 관리
3. **애니메이션**: Framer Motion으로 부드러운 UI 효과
4. **API 통신**: 백엔드와 데이터 주고받기

### 데이터베이스
1. **외래키 관계**: 테이블 간 참조 관계 설정
2. **인덱스**: 조회 성능 향상을 위한 인덱스 생성
3. **제약 조건**: 데이터 무결성 보장 (CHECK 제약)

---

## 📞 도움이 필요할 때

### 문제 해결 가이드

1. **테이블이 생성되지 않을 때**
   - 마이그레이션 SQL 파일이 올바른지 확인
   - PostgreSQL 접속 정보 확인
   - 에러 메시지 확인

2. **로그가 생성되지 않을 때**
   - API 엔드포인트에서 서비스 함수 호출 확인
   - DB 세션 커밋 확인
   - 에러 로그 확인

3. **타임라인이 표시되지 않을 때**
   - 브라우저 개발자 도구 콘솔 확인
   - API 응답 데이터 확인
   - React 컴포넌트 렌더링 확인

4. **배치 작업이 실행되지 않을 때**
   - APScheduler 설정 확인
   - 서버 로그 확인
   - 스케줄 시간 확인

---

## 🎉 완료!

이 가이드를 따라하면 자산 활동 타임라인 차트 기능을 완성할 수 있습니다.

각 단계를 차근차근 진행하고, 문제가 생기면 해당 단계의 "문제 해결 가이드"를 참고하세요.

**행운을 빕니다!** 🚀
