# 백엔드 성능 최적화 가이드

## 개요
현재 백엔드의 검색, 아파트 상세정보, 통계 로직을 분석하여 속도를 개선할 수 있는 10가지 기술을 정리했습니다.

---

## 1. Redis 통계 캐싱 전략 (드롭다운 필터 고려)

### 현재 상태
- 통계 API는 일부만 캐싱되어 있음
- 드롭다운 필터 조합에 대한 캐싱이 부족함
- TTL이 6시간으로 고정되어 있어 데이터 갱신 시 캐시 무효화가 어려움

### 개선 방안
```python
# 통계 캐시 키 생성 함수 (모든 필터 조합 고려)
def generate_statistics_cache_key(
    endpoint: str,
    region_type: str,
    city_name: Optional[str] = None,
    transaction_type: str = "sale",
    max_years: int = 10,
    **kwargs
) -> str:
    """모든 필터 조합을 고려한 통계 캐시 키 생성"""
    key_parts = [
        "statistics",
        endpoint,
        region_type,
        city_name or "all",
        transaction_type,
        str(max_years)
    ]
    # 추가 필터 파라미터 포함
    for key, value in sorted(kwargs.items()):
        if value is not None:
            key_parts.append(f"{key}:{value}")
    
    return generate_hash_key(":".join(key_parts))

# 통계 데이터 사전 계산 및 캐싱
async def precompute_all_statistics_combinations(db: AsyncSession):
    """모든 통계 조합을 사전 계산하여 Redis에 저장"""
    region_types = ["전국", "수도권", "지방5대광역시"]
    transaction_types = ["sale", "rent"]
    max_years_options = [1, 3, 5, 10]
    
    # 지방5대광역시의 경우 각 도시별로도 계산
    cities = ["부산광역시", "대구광역시", "광주광역시", "대전광역시", "울산광역시"]
    
    for region_type in region_types:
        for transaction_type in transaction_types:
            for max_years in max_years_options:
                # 전국/수도권
                cache_key = generate_statistics_cache_key(
                    "transaction-volume",
                    region_type,
                    None,
                    transaction_type,
                    max_years
                )
                data = await calculate_transaction_volume(
                    db, region_type, transaction_type, max_years
                )
                await set_to_cache(cache_key, data, ttl=21600)  # 6시간
                
                # 지방5대광역시의 경우 각 도시별
                if region_type == "지방5대광역시":
                    for city in cities:
                        cache_key = generate_statistics_cache_key(
                            "transaction-volume",
                            region_type,
                            city,
                            transaction_type,
                            max_years
                        )
                        data = await calculate_transaction_volume(
                            db, region_type, transaction_type, max_years, city_name=city
                        )
                        await set_to_cache(cache_key, data, ttl=21600)
```

### 구현 포인트
- **모든 필터 조합 사전 계산**: 서버 시작 시 또는 스케줄러로 주기적으로 모든 통계 조합 계산
- **해시 기반 캐시 키**: 필터 조합을 해시하여 고정 길이 키 생성
- **캐시 무효화 전략**: 데이터 업데이트 시 관련 통계 캐시만 선택적으로 무효화
- **TTL 전략**: 통계 데이터는 6시간, 실시간 데이터는 1시간으로 구분

---

## 2. Materialized Views 활용

### 현재 상태
- 일부 Materialized View가 있지만 활용도가 낮음
- 통계 계산 시 매번 복잡한 집계 쿼리 실행

### 개선 방안
```sql
-- 월별 거래량 통계 Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_transaction_stats AS
SELECT 
    DATE_TRUNC('month', contract_date) AS month,
    region_id,
    transaction_type,
    COUNT(*) AS transaction_count,
    AVG(trans_price) AS avg_price,
    MIN(trans_price) AS min_price,
    MAX(trans_price) AS max_price,
    AVG(exclusive_area) AS avg_area
FROM (
    SELECT 
        contract_date,
        apt_id,
        trans_price,
        exclusive_area,
        'sale' AS transaction_type
    FROM sales
    WHERE is_canceled = FALSE 
      AND is_deleted = FALSE
      AND contract_date IS NOT NULL
    UNION ALL
    SELECT 
        deal_date AS contract_date,
        apt_id,
        deposit_price AS trans_price,
        exclusive_area,
        'rent' AS transaction_type
    FROM rents
    WHERE is_deleted = FALSE
      AND deal_date IS NOT NULL
) transactions
JOIN apartments ON transactions.apt_id = apartments.apt_id
WHERE apartments.is_deleted = FALSE
GROUP BY month, region_id, transaction_type;

-- 인덱스 생성
CREATE INDEX idx_mv_monthly_stats_month ON mv_monthly_transaction_stats(month);
CREATE INDEX idx_mv_monthly_stats_region ON mv_monthly_transaction_stats(region_id);
CREATE INDEX idx_mv_monthly_stats_type ON mv_monthly_transaction_stats(transaction_type);

-- 주기적 갱신 (스케줄러로 실행)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_transaction_stats;
```

### 구현 포인트
- **CONCURRENTLY 옵션**: 뷰 갱신 중에도 쿼리 가능
- **주기적 갱신**: 매일 새벽 또는 데이터 업데이트 후 자동 갱신
- **인덱스 최적화**: 자주 조회되는 컬럼에 인덱스 생성

---

## 3. 복합 인덱스 최적화

### 현재 상태
- 단일 컬럼 인덱스는 있지만 복합 인덱스가 부족
- WHERE 절의 다중 조건 쿼리 성능 저하

### 개선 방안
```sql
-- 아파트 상세 검색용 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_sales_apt_date_price 
ON sales(apt_id, contract_date DESC, trans_price)
WHERE is_canceled = FALSE AND is_deleted = FALSE;

-- 통계 조회용 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_sales_region_date_canceled
ON sales(region_id, contract_date DESC, is_canceled)
WHERE is_deleted = FALSE;

-- 전세/월세 구분 인덱스
CREATE INDEX IF NOT EXISTS idx_rents_apt_date_type
ON rents(apt_id, deal_date DESC, monthly_rent)
WHERE is_deleted = FALSE;

-- 아파트 검색용 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_apartments_region_deleted_name
ON apartments(region_id, is_deleted, apt_name)
WHERE is_deleted = FALSE;
```

### 구현 포인트
- **WHERE 절 조건 활용**: Partial Index로 필요한 데이터만 인덱싱
- **컬럼 순서**: 자주 필터링되는 컬럼을 앞에 배치
- **정렬 최적화**: ORDER BY에 사용되는 컬럼을 인덱스에 포함

---

## 4. Connection Pooling 최적화

### 현재 상태
- 기본 Connection Pool 설정 사용
- 동시 요청 시 연결 부족 가능성

### 개선 방안
```python
# backend/app/core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# 최적화된 Connection Pool 설정
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,              # 기본 연결 수 증가 (기본 5)
    max_overflow=40,            # 최대 추가 연결 수 (기본 10)
    pool_timeout=30,           # 연결 대기 시간
    pool_recycle=1800,         # 30분마다 연결 재사용
    pool_pre_ping=True,        # 연결 유효성 사전 확인
    echo=False,
    future=True
)

# 세션 팩토리 설정
async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,    # 커밋 후 객체 만료 방지
    autocommit=False,
    autoflush=False
)
```

### 구현 포인트
- **pool_size**: 예상 동시 요청 수의 1.5~2배
- **max_overflow**: 트래픽 급증 대비
- **pool_recycle**: 장시간 연결로 인한 문제 방지
- **pool_pre_ping**: 연결 끊김 자동 감지 및 재연결

---

## 5. 쿼리 최적화 (서브쿼리 → JOIN)

### 현재 상태
- 일부 쿼리에서 서브쿼리 남용
- N+1 문제 일부 존재

### 개선 방안
```python
# Before: 서브쿼리 사용
stmt = select(Apartment).where(
    Apartment.apt_id.in_(
        select(Sale.apt_id)
        .where(Sale.contract_date >= date_from)
        .group_by(Sale.apt_id)
    )
)

# After: JOIN 사용 (더 빠름)
stmt = (
    select(Apartment)
    .join(Sale, Apartment.apt_id == Sale.apt_id)
    .where(Sale.contract_date >= date_from)
    .group_by(Apartment.apt_id)
    .having(func.count(Sale.trans_id) > 0)
)

# 배치 조회로 N+1 문제 해결
# Before: 루프 내 개별 쿼리
for apt_id in apt_ids:
    detail = await get_apart_detail(db, apt_id)

# After: 배치 조회
details = await db.execute(
    select(ApartDetail)
    .where(ApartDetail.apt_id.in_(apt_ids))
)
detail_map = {d.apt_id: d for d in details.scalars().all()}
```

### 구현 포인트
- **JOIN 우선**: 서브쿼리보다 JOIN이 일반적으로 빠름
- **배치 조회**: 여러 개별 쿼리를 하나의 배치 쿼리로 통합
- **selectinload**: SQLAlchemy의 관계 로딩 최적화

---

## 6. 비동기 배치 처리

### 현재 상태
- 일부 작업이 순차 처리됨
- 통계 계산 시 병렬 처리 부족

### 개선 방안
```python
import asyncio
from typing import List

async def calculate_statistics_parallel(
    db: AsyncSession,
    region_types: List[str],
    transaction_types: List[str]
) -> Dict[str, Any]:
    """여러 통계를 병렬로 계산"""
    tasks = []
    
    for region_type in region_types:
        for transaction_type in transaction_types:
            task = calculate_transaction_volume(
                db, region_type, transaction_type, max_years=10
            )
            tasks.append((f"{region_type}_{transaction_type}", task))
    
    # 병렬 실행
    results = await asyncio.gather(*[task for _, task in tasks])
    
    # 결과 매핑
    return {
        key: result 
        for (key, _), result in zip(tasks, results)
    }

# Redis 캐시 배치 저장
async def batch_cache_statistics(statistics_data: Dict[str, Any]):
    """통계 데이터를 배치로 Redis에 저장"""
    pipe = redis_client.pipeline()
    
    for cache_key, data in statistics_data.items():
        pipe.setex(cache_key, 21600, orjson.dumps(data))
    
    await pipe.execute()  # 한 번에 실행
```

### 구현 포인트
- **asyncio.gather**: 독립적인 작업 병렬 실행
- **Redis Pipeline**: 여러 명령을 한 번에 실행하여 네트워크 오버헤드 감소
- **세션 관리**: 각 병렬 작업에 별도 세션 사용 고려

---

## 7. 데이터베이스 파티셔닝 (대용량 데이터)

### 현재 상태
- sales, rents 테이블이 시간이 지날수록 커짐
- 전체 테이블 스캔 발생 가능

### 개선 방안
```sql
-- 월별 파티셔닝 (PostgreSQL 10+)
CREATE TABLE sales_partitioned (
    LIKE sales INCLUDING ALL
) PARTITION BY RANGE (contract_date);

-- 월별 파티션 생성
CREATE TABLE sales_2024_01 PARTITION OF sales_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE sales_2024_02 PARTITION OF sales_partitioned
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- 인덱스는 각 파티션에 자동 생성됨
-- 오래된 파티션은 아카이빙 또는 삭제 가능
```

### 구현 포인트
- **파티셔닝 전략**: 날짜 기반 파티셔닝이 통계 쿼리에 적합
- **자동 파티션 생성**: 스케줄러로 매월 새 파티션 생성
- **파티션 프루닝**: 쿼리 플래너가 필요한 파티션만 스캔

---

## 8. 캐시 무효화 전략

### 현재 상태
- 데이터 업데이트 시 관련 캐시 무효화가 불완전
- 통계 캐시가 오래된 데이터 제공 가능

### 개선 방안
```python
async def invalidate_statistics_cache(
    region_id: Optional[int] = None,
    apt_id: Optional[int] = None,
    transaction_type: Optional[str] = None
):
    """통계 캐시 무효화 (선택적)"""
    patterns = []
    
    # 지역별 통계 캐시 무효화
    if region_id:
        # 해당 지역의 모든 통계 캐시 삭제
        patterns.append(f"realestate:statistics:*:region:{region_id}:*")
    
    # 아파트별 통계 캐시 무효화
    if apt_id:
        patterns.append(f"realestate:statistics:*:apt:{apt_id}:*")
    
    # 거래 유형별 통계 캐시 무효화
    if transaction_type:
        patterns.append(f"realestate:statistics:*:type:{transaction_type}:*")
    
    # 패턴 매칭으로 일괄 삭제
    for pattern in patterns:
        await delete_cache_pattern(pattern)

# 데이터 업데이트 시 자동 무효화
@event.listens_for(Sale, 'after_update')
async def invalidate_sale_cache(mapper, connection, target):
    """매매 데이터 업데이트 시 관련 캐시 무효화"""
    await invalidate_statistics_cache(
        apt_id=target.apt_id,
        transaction_type="sale"
    )
```

### 구현 포인트
- **선택적 무효화**: 필요한 캐시만 삭제하여 성능 유지
- **패턴 매칭**: Redis SCAN으로 관련 캐시 일괄 삭제
- **이벤트 리스너**: SQLAlchemy 이벤트로 자동 무효화

---

## 9. 배치 집계 최적화

### 현재 상태
- 통계 계산 시 매번 전체 데이터 집계
- 반복 계산되는 통계가 많음

### 개선 방안
```python
# 증분 집계 테이블
CREATE TABLE daily_statistics (
    stat_date DATE NOT NULL,
    region_id INTEGER,
    transaction_type VARCHAR(10),
    transaction_count INTEGER,
    avg_price DECIMAL(12, 2),
    total_amount DECIMAL(15, 2),
    PRIMARY KEY (stat_date, region_id, transaction_type)
);

# 일일 집계 배치 작업
async def calculate_daily_statistics(db: AsyncSession, target_date: date):
    """특정 날짜의 통계를 계산하여 저장"""
    # 매매 통계
    sale_stats = await db.execute(
        select(
            Apartment.region_id,
            func.count(Sale.trans_id).label('count'),
            func.avg(Sale.trans_price).label('avg_price'),
            func.sum(Sale.trans_price).label('total')
        )
        .join(Apartment, Sale.apt_id == Apartment.apt_id)
        .where(
            Sale.contract_date == target_date,
            Sale.is_canceled == False,
            Sale.is_deleted == False
        )
        .group_by(Apartment.region_id)
    )
    
    # 일일 통계 저장
    for row in sale_stats:
        await db.execute(
            insert(daily_statistics).values(
                stat_date=target_date,
                region_id=row.region_id,
                transaction_type='sale',
                transaction_count=row.count,
                avg_price=row.avg_price,
                total_amount=row.total
            )
            .on_conflict_do_update(
                index_elements=['stat_date', 'region_id', 'transaction_type'],
                set_={
                    'transaction_count': row.count,
                    'avg_price': row.avg_price,
                    'total_amount': row.total
                }
            )
        )

# 월별 통계는 일일 통계 집계로 계산
async def get_monthly_statistics_from_daily(
    db: AsyncSession,
    start_date: date,
    end_date: date,
    region_id: Optional[int] = None
):
    """일일 통계를 집계하여 월별 통계 계산 (빠름)"""
    stmt = select(
        func.sum(daily_statistics.transaction_count).label('total_count'),
        func.avg(daily_statistics.avg_price).label('avg_price'),
        func.sum(daily_statistics.total_amount).label('total_amount')
    ).where(
        daily_statistics.stat_date >= start_date,
        daily_statistics.stat_date <= end_date
    )
    
    if region_id:
        stmt = stmt.where(daily_statistics.region_id == region_id)
    
    return await db.execute(stmt)
```

### 구현 포인트
- **증분 집계**: 매일 집계하여 저장, 월별 통계는 일일 통계 합산
- **UPSERT 사용**: 중복 계산 방지
- **스케줄러**: 매일 새벽 전날 통계 계산

---

## 10. 데이터베이스 설정 튜닝

### 현재 상태
- PostgreSQL 기본 설정 사용
- 메모리 및 쿼리 최적화 설정 부족

### 개선 방안
```sql
-- PostgreSQL 설정 최적화 (postgresql.conf)
-- 메모리 설정
shared_buffers = 256MB              # 전체 RAM의 25%
effective_cache_size = 768MB        # 전체 RAM의 75%
work_mem = 16MB                     # 정렬/해시 작업용
maintenance_work_mem = 128MB        # VACUUM, CREATE INDEX용

-- 쿼리 최적화
random_page_cost = 1.1              # SSD 사용 시 (기본 4.0)
effective_io_concurrency = 200      # SSD 병렬 I/O
max_parallel_workers_per_gather = 4 # 병렬 쿼리 워커 수
max_parallel_workers = 8              # 전체 병렬 워커 수

-- WAL 설정 (쓰기 성능)
wal_buffers = 16MB
max_wal_size = 2GB
min_wal_size = 1GB

-- 연결 설정
max_connections = 100                # Connection Pool과 조정
```

### 구현 포인트
- **메모리 할당**: 서버 RAM에 맞게 조정
- **SSD 최적화**: random_page_cost 낮춤
- **병렬 처리**: 멀티코어 활용
- **모니터링**: pg_stat_statements로 쿼리 성능 추적

---

## 우선순위별 구현 계획

### Phase 1: 즉시 적용 가능 (1-2주)
1. **Redis 통계 캐싱 전략** - 가장 큰 성능 향상 기대
2. **Connection Pooling 최적화** - 설정 변경만으로 적용 가능
3. **복합 인덱스 최적화** - 쿼리 성능 즉시 개선

### Phase 2: 중기 개선 (1개월)
4. **Materialized Views 활용** - 통계 쿼리 속도 대폭 개선
5. **쿼리 최적화** - 서브쿼리 → JOIN 전환
6. **캐시 무효화 전략** - 데이터 정합성 보장

### Phase 3: 장기 개선 (2-3개월)
7. **비동기 배치 처리** - 병렬 처리로 전체 응답 시간 단축
8. **배치 집계 최적화** - 증분 집계로 계산 시간 단축
9. **데이터베이스 파티셔닝** - 대용량 데이터 처리 최적화
10. **데이터베이스 설정 튜닝** - 시스템 레벨 최적화

---

## 모니터링 및 측정

### 성능 지표
- **응답 시간**: P50, P95, P99 지연 시간
- **캐시 히트율**: Redis 캐시 적중률 (목표: 80% 이상)
- **데이터베이스 쿼리 시간**: EXPLAIN ANALYZE로 측정
- **동시 연결 수**: Connection Pool 사용률

### 도구
- **PostgreSQL**: `pg_stat_statements`, `EXPLAIN ANALYZE`
- **Redis**: `INFO stats`, `SLOWLOG`
- **FastAPI**: APM 도구 (New Relic, Datadog 등)

---

## 통계 API 캐싱 적용 예시

### 기존 코드 (statistics.py)
```python
@router.get("/transaction-volume")
async def get_transaction_volume(
    region_type: str,
    transaction_type: str = "sale",
    max_years: int = 10,
    city_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    # 간단한 캐시 키 (필터 조합 미고려)
    cache_key = build_cache_key(
        "statistics", "volume", region_type, transaction_type, str(max_years)
    )
    
    cached_data = await get_from_cache(cache_key)
    if cached_data:
        return cached_data
    
    # DB에서 계산...
```

### 개선된 코드 (캐싱 서비스 사용)
```python
from app.services.statistics_cache_service import statistics_cache_service

@router.get("/transaction-volume")
async def get_transaction_volume(
    region_type: str,
    transaction_type: str = "sale",
    max_years: int = 10,
    city_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    # 1. 캐시에서 조회 (모든 필터 조합 고려)
    cached_data = await statistics_cache_service.get_cached_statistics(
        endpoint="transaction-volume",
        region_type=region_type,
        city_name=city_name,
        transaction_type=transaction_type,
        max_years=max_years
    )
    
    if cached_data:
        return TransactionVolumeResponse(**cached_data)
    
    # 2. 캐시 미스: DB에서 계산
    data = await calculate_transaction_volume(
        db, region_type, city_name, transaction_type, max_years
    )
    
    # 3. 계산 결과를 캐시에 저장
    await statistics_cache_service.cache_statistics(
        endpoint="transaction-volume",
        data=data.model_dump(),
        region_type=region_type,
        city_name=city_name,
        transaction_type=transaction_type,
        max_years=max_years
    )
    
    return data
```

### FastAPI 앱 시작 시 스케줄러 등록
```python
# backend/app/main.py
from app.services.statistics_cache_scheduler import start_statistics_scheduler

@app.on_event("startup")
async def startup_event():
    # 통계 캐시 스케줄러 시작
    await start_statistics_scheduler()
    logger.info("통계 캐시 스케줄러가 시작되었습니다")
```

### 수동 통계 사전 계산 (관리자용)
```python
# 관리자 API 또는 CLI 명령어
@router.post("/admin/precompute-statistics")
async def precompute_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: Account = Depends(get_admin_user)
):
    """모든 통계 조합을 사전 계산"""
    results = await statistics_cache_service.precompute_all_statistics(db)
    return {"success": True, "results": results}
```

---

## 참고 자료
- PostgreSQL Performance Tips: https://www.postgresql.org/docs/current/performance-tips.html
- Redis Caching Strategies: https://redis.io/blog/query-caching-redis
- SQLAlchemy Connection Pooling: https://docs.sqlalchemy.org/en/20/core/pooling.html
