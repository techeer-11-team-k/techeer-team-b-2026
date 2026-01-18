-- ============================================================
-- 마이그레이션: 통계 쿼리 성능 최적화
-- 버전: 007
-- 설명: RVOL 및 4분면 분류 통계 쿼리 최적화를 위한 인덱스 추가
-- ============================================================

-- ============================================================
-- 1. SALES 테이블: 통계 쿼리 최적화 인덱스
-- ============================================================

-- RVOL 및 4분면 분류용: contract_date + 필터 조건
-- 날짜 범위 쿼리 및 COUNT 집계 최적화
CREATE INDEX IF NOT EXISTS idx_sales_statistics_date 
ON sales(contract_date DESC) 
WHERE is_canceled = FALSE 
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND contract_date IS NOT NULL;

-- 통계 쿼리용 복합 인덱스: 날짜 범위 스캔 최적화
CREATE INDEX IF NOT EXISTS idx_sales_statistics_date_filtered 
ON sales(contract_date DESC, trans_id) 
WHERE is_canceled = FALSE 
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND contract_date IS NOT NULL;

-- ============================================================
-- 2. RENTS 테이블: 통계 쿼리 최적화 인덱스
-- ============================================================

-- RVOL 및 4분면 분류용: deal_date + 필터 조건
-- 날짜 범위 쿼리 및 COUNT 집계 최적화
CREATE INDEX IF NOT EXISTS idx_rents_statistics_date 
ON rents(deal_date DESC) 
WHERE (is_deleted = FALSE OR is_deleted IS NULL)
  AND deal_date IS NOT NULL;

-- 통계 쿼리용 복합 인덱스: 날짜 범위 스캔 최적화
CREATE INDEX IF NOT EXISTS idx_rents_statistics_date_filtered 
ON rents(deal_date DESC, trans_id) 
WHERE (is_deleted = FALSE OR is_deleted IS NULL)
  AND deal_date IS NOT NULL;

-- ============================================================
-- 3. 통계 정보 업데이트
-- ============================================================

-- 인덱스 생성 후 통계 정보 업데이트 (쿼리 플래너 최적화)
ANALYZE sales;
ANALYZE rents;
