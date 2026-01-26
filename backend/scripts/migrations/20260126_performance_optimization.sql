-- ============================================================
-- 성능 최적화 마이그레이션
-- 생성일: 2026-01-26
-- 설명: 검색, 아파트 상세정보, 통계 로직 성능 개선
-- ============================================================

-- ============================================================
-- 1. Materialized Views 생성 (통계 쿼리 성능 개선)
-- ============================================================

-- 월별 거래량 통계 Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_transaction_stats AS
SELECT 
    DATE_TRUNC('month', contract_date) AS month,
    region_id,
    'sale' AS transaction_type,
    COUNT(*) AS transaction_count,
    AVG(trans_price) AS avg_price,
    MIN(trans_price) AS min_price,
    MAX(trans_price) AS max_price,
    AVG(exclusive_area) AS avg_area
FROM sales
JOIN apartments ON sales.apt_id = apartments.apt_id
WHERE sales.is_canceled = FALSE 
  AND (sales.is_deleted = FALSE OR sales.is_deleted IS NULL)
  AND apartments.is_deleted = FALSE
  AND sales.contract_date IS NOT NULL
GROUP BY month, region_id

UNION ALL

SELECT 
    DATE_TRUNC('month', deal_date) AS month,
    region_id,
    'rent' AS transaction_type,
    COUNT(*) AS transaction_count,
    AVG(deposit_price) AS avg_price,
    MIN(deposit_price) AS min_price,
    MAX(deposit_price) AS max_price,
    AVG(exclusive_area) AS avg_area
FROM rents
JOIN apartments ON rents.apt_id = apartments.apt_id
WHERE (rents.is_deleted = FALSE OR rents.is_deleted IS NULL)
  AND apartments.is_deleted = FALSE
  AND rents.deal_date IS NOT NULL
GROUP BY month, region_id;

-- Materialized View 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_mv_monthly_stats_month 
ON mv_monthly_transaction_stats(month DESC);

CREATE INDEX IF NOT EXISTS idx_mv_monthly_stats_region 
ON mv_monthly_transaction_stats(region_id);

CREATE INDEX IF NOT EXISTS idx_mv_monthly_stats_type 
ON mv_monthly_transaction_stats(transaction_type);

CREATE INDEX IF NOT EXISTS idx_mv_monthly_stats_month_region_type 
ON mv_monthly_transaction_stats(month DESC, region_id, transaction_type);

-- ============================================================
-- 2. 복합 인덱스 최적화
-- ============================================================

-- 아파트 상세 검색용 복합 인덱스 (매매)
CREATE INDEX IF NOT EXISTS idx_sales_apt_date_price 
ON sales(apt_id, contract_date DESC, trans_price)
WHERE is_canceled = FALSE AND (is_deleted = FALSE OR is_deleted IS NULL);

-- 통계 조회용 복합 인덱스 (매매)
CREATE INDEX IF NOT EXISTS idx_sales_region_date_canceled
ON sales(region_id, contract_date DESC, is_canceled)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

-- 전세/월세 구분 인덱스
CREATE INDEX IF NOT EXISTS idx_rents_apt_date_type
ON rents(apt_id, deal_date DESC, monthly_rent)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

-- 아파트 검색용 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_apartments_region_deleted_name
ON apartments(region_id, is_deleted, apt_name)
WHERE is_deleted = FALSE;

-- 아파트 상세정보 조회용 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_apart_details_apt_deleted
ON apart_details(apt_id, is_deleted)
WHERE is_deleted = FALSE;

-- ============================================================
-- 3. 일일 통계 테이블 생성 (배치 집계 최적화)
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_statistics (
    stat_date DATE NOT NULL,
    region_id INTEGER,
    transaction_type VARCHAR(10) NOT NULL,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    avg_price DECIMAL(12, 2),
    total_amount DECIMAL(15, 2),
    avg_area DECIMAL(7, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (stat_date, region_id, transaction_type),
    CONSTRAINT fk_daily_stats_region FOREIGN KEY (region_id) REFERENCES states(region_id)
);

COMMENT ON TABLE daily_statistics IS '일일 거래 통계 테이블 (증분 집계용)';
COMMENT ON COLUMN daily_statistics.stat_date IS '통계 날짜';
COMMENT ON COLUMN daily_statistics.region_id IS '지역 ID (NULL이면 전국)';
COMMENT ON COLUMN daily_statistics.transaction_type IS '거래 유형 (sale, rent)';

-- 일일 통계 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_stats_date 
ON daily_statistics(stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_stats_region_date 
ON daily_statistics(region_id, stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_stats_type_date 
ON daily_statistics(transaction_type, stat_date DESC);

-- ============================================================
-- 4. 기존 인덱스 최적화 (필요시)
-- ============================================================

-- sales 테이블 인덱스 추가 (통계 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_sales_contract_date_apt_id
ON sales(contract_date DESC, apt_id)
WHERE is_canceled = FALSE AND (is_deleted = FALSE OR is_deleted IS NULL);

-- rents 테이블 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_rents_deal_date_apt_id
ON rents(deal_date DESC, apt_id)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

-- ============================================================
-- 5. 통계 함수 생성 (선택적, 성능 향상)
-- ============================================================

-- Materialized View 갱신 함수
CREATE OR REPLACE FUNCTION refresh_monthly_transaction_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_transaction_stats;
END;
$$ LANGUAGE plpgsql;

-- 일일 통계 계산 함수
CREATE OR REPLACE FUNCTION calculate_daily_statistics(target_date DATE)
RETURNS void AS $$
BEGIN
    -- 매매 통계
    INSERT INTO daily_statistics (stat_date, region_id, transaction_type, transaction_count, avg_price, total_amount, avg_area)
    SELECT 
        target_date,
        apartments.region_id,
        'sale'::VARCHAR,
        COUNT(*)::INTEGER,
        AVG(sales.trans_price),
        SUM(sales.trans_price),
        AVG(sales.exclusive_area)
    FROM sales
    JOIN apartments ON sales.apt_id = apartments.apt_id
    WHERE sales.contract_date = target_date
      AND sales.is_canceled = FALSE
      AND (sales.is_deleted = FALSE OR sales.is_deleted IS NULL)
      AND apartments.is_deleted = FALSE
    GROUP BY apartments.region_id
    ON CONFLICT (stat_date, region_id, transaction_type)
    DO UPDATE SET
        transaction_count = EXCLUDED.transaction_count,
        avg_price = EXCLUDED.avg_price,
        total_amount = EXCLUDED.total_amount,
        avg_area = EXCLUDED.avg_area,
        updated_at = CURRENT_TIMESTAMP;
    
    -- 전월세 통계
    INSERT INTO daily_statistics (stat_date, region_id, transaction_type, transaction_count, avg_price, total_amount, avg_area)
    SELECT 
        target_date,
        apartments.region_id,
        'rent'::VARCHAR,
        COUNT(*)::INTEGER,
        AVG(rents.deposit_price),
        SUM(rents.deposit_price),
        AVG(rents.exclusive_area)
    FROM rents
    JOIN apartments ON rents.apt_id = apartments.apt_id
    WHERE rents.deal_date = target_date
      AND (rents.is_deleted = FALSE OR rents.is_deleted IS NULL)
      AND apartments.is_deleted = FALSE
    GROUP BY apartments.region_id
    ON CONFLICT (stat_date, region_id, transaction_type)
    DO UPDATE SET
        transaction_count = EXCLUDED.transaction_count,
        avg_price = EXCLUDED.avg_price,
        total_amount = EXCLUDED.total_amount,
        avg_area = EXCLUDED.avg_area,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. 초기 Materialized View 갱신
-- ============================================================

REFRESH MATERIALIZED VIEW mv_monthly_transaction_stats;

-- ============================================================
-- 완료 메시지
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '성능 최적화 마이그레이션 완료';
    RAISE NOTICE '- Materialized Views 생성 완료';
    RAISE NOTICE '- 복합 인덱스 생성 완료';
    RAISE NOTICE '- 일일 통계 테이블 생성 완료';
    RAISE NOTICE '- 통계 함수 생성 완료';
END $$;
