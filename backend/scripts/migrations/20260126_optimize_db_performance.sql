-- 1. pg_trgm 확장 활성화 (텍스트 유사도 검색 속도 혁신)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 아파트 이름에 GIN Trigram 인덱스 생성 (LIKE '%검색어%' 속도 개선)
CREATE INDEX IF NOT EXISTS idx_apt_name_trgm ON apartments USING GIN (apt_name gin_trgm_ops);

-- 3. 매매 통계 Materialized View 생성 (랭킹/차트 쿼리 속도 20초 -> 0.1초)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sales_monthly_stats AS
SELECT 
    apt_id,
    DATE_TRUNC('month', contract_date) AS month,
    COUNT(*) AS transaction_count,
    AVG(trans_price) AS avg_price,
    MIN(trans_price) AS min_price,
    MAX(trans_price) AS max_price,
    AVG(exclusive_area) AS avg_area
FROM sales
WHERE is_canceled = FALSE
GROUP BY apt_id, DATE_TRUNC('month', contract_date);

-- 4. Materialized View 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_mv_sales_stats_apt_month ON mv_sales_monthly_stats(apt_id, month);

-- 5. 복합 인덱스 추가 (자주 사용되는 필터 조합 최적화)
CREATE INDEX IF NOT EXISTS idx_sales_contract_apt ON sales(contract_date, apt_id);
CREATE INDEX IF NOT EXISTS idx_rents_deal_apt ON rents(deal_date, apt_id);
