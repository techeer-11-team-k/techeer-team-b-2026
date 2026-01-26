-- ============================================================
-- 아파트 상세 정보 조회 성능 최적화 인덱스
-- 
-- 목적: 아파트 상세 정보 API 응답 속도 개선
-- 예상 효과: 쿼리 속도 30-50% 향상
-- ============================================================

-- 1. 아파트 테이블: 부분 인덱스 (is_deleted = false인 레코드만)
-- 대부분의 쿼리가 삭제되지 않은 아파트만 조회하므로 인덱스 크기 감소 + 스캔 속도 향상
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apartments_active 
ON apartments(apt_id) 
WHERE is_deleted = false OR is_deleted IS NULL;

-- 2. 매매 테이블: 최신 거래 조회용 커버링 인덱스
-- ORDER BY contract_date DESC LIMIT 1 쿼리 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_apt_latest 
ON sales(apt_id, contract_date DESC) 
INCLUDE (trans_price, exclusive_area, floor)
WHERE is_canceled = false AND (is_deleted = false OR is_deleted IS NULL);

-- 3. 전월세 테이블: 최신 거래 조회용 커버링 인덱스
-- ORDER BY deal_date DESC LIMIT 1 쿼리 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rents_apt_latest 
ON rents(apt_id, deal_date DESC) 
INCLUDE (deposit_price, monthly_rent, exclusive_area)
WHERE is_deleted = false OR is_deleted IS NULL;

-- 4. 상세정보 테이블: apt_id 인덱스 (이미 unique 제약조건으로 있지만, 명시적으로 생성)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apart_details_apt_id 
ON apart_details(apt_id);

-- 5. 상세정보 테이블: 지역 조회용 복합 인덱스 (지역별 아파트 목록 조회 최적화)
-- 먼저 apartments 테이블의 region_id + apt_id 복합 인덱스
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apartments_region_apt 
ON apartments(region_id, apt_id) 
WHERE is_deleted = false OR is_deleted IS NULL;

-- 6. 통계 조회용 복합 인덱스: 거래량 집계 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_stats 
ON sales(apt_id, contract_date) 
WHERE is_canceled = false AND (is_deleted = false OR is_deleted IS NULL);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rents_stats 
ON rents(apt_id, deal_date) 
WHERE is_deleted = false OR is_deleted IS NULL;

-- 7. 테이블 통계 업데이트 (쿼리 플래너 최적화)
ANALYZE apartments;
ANALYZE apart_details;
ANALYZE sales;
ANALYZE rents;
ANALYZE states;

-- ============================================================
-- 인덱스 생성 확인 쿼리 (실행 후 결과 확인용)
-- ============================================================
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename IN ('apartments', 'apart_details', 'sales', 'rents')
-- ORDER BY tablename, indexname;
