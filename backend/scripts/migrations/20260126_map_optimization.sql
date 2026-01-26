-- 20260126_map_optimization.sql
-- 지도 오버레이 성능 최적화를 위한 Materialized View 및 인덱스 생성

-- ============================================================================
-- Phase 1: 동별 가격 Materialized View (매매)
-- ============================================================================

-- 기존 뷰가 있다면 삭제
DROP MATERIALIZED VIEW IF EXISTS mv_dong_sale_prices CASCADE;

-- 동별 매매 평균 가격 (최근 6개월)
CREATE MATERIALIZED VIEW mv_dong_sale_prices AS
SELECT 
    st.region_id,
    st.region_name,
    st.city_name,
    ST_X(st.geometry)::FLOAT as lng,
    ST_Y(st.geometry)::FLOAT as lat,
    AVG(s.trans_price)::FLOAT as avg_price,
    MIN(s.trans_price)::FLOAT as min_price,
    MAX(s.trans_price)::FLOAT as max_price,
    COUNT(s.trans_id)::INT as transaction_count,
    'sale' as transaction_type
FROM states st
JOIN apartments a ON a.region_id = st.region_id
JOIN sales s ON s.apt_id = a.apt_id
WHERE s.contract_date >= CURRENT_DATE - INTERVAL '6 months'
  AND s.is_canceled = FALSE
  AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)
  AND (a.is_deleted = FALSE OR a.is_deleted IS NULL)
  AND st.is_deleted = FALSE
  AND st.geometry IS NOT NULL
  AND s.trans_price IS NOT NULL
GROUP BY st.region_id, st.region_name, st.city_name, st.geometry;

-- 동별 매매 가격 뷰 인덱스
CREATE INDEX idx_mv_dong_sale_prices_region ON mv_dong_sale_prices (region_id);
CREATE INDEX idx_mv_dong_sale_prices_city ON mv_dong_sale_prices (city_name);
CREATE INDEX idx_mv_dong_sale_prices_count ON mv_dong_sale_prices (transaction_count DESC);

-- ============================================================================
-- Phase 2: 동별 가격 Materialized View (전세)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_dong_jeonse_prices CASCADE;

-- 동별 전세 평균 가격 (최근 6개월)
CREATE MATERIALIZED VIEW mv_dong_jeonse_prices AS
SELECT 
    st.region_id,
    st.region_name,
    st.city_name,
    ST_X(st.geometry)::FLOAT as lng,
    ST_Y(st.geometry)::FLOAT as lat,
    AVG(r.deposit_price)::FLOAT as avg_price,
    MIN(r.deposit_price)::FLOAT as min_price,
    MAX(r.deposit_price)::FLOAT as max_price,
    COUNT(r.trans_id)::INT as transaction_count,
    'jeonse' as transaction_type
FROM states st
JOIN apartments a ON a.region_id = st.region_id
JOIN rents r ON r.apt_id = a.apt_id
WHERE r.deal_date >= CURRENT_DATE - INTERVAL '6 months'
  AND (r.monthly_rent = 0 OR r.monthly_rent IS NULL)
  AND (r.is_deleted = FALSE OR r.is_deleted IS NULL)
  AND (a.is_deleted = FALSE OR a.is_deleted IS NULL)
  AND st.is_deleted = FALSE
  AND st.geometry IS NOT NULL
  AND r.deposit_price IS NOT NULL
GROUP BY st.region_id, st.region_name, st.city_name, st.geometry;

-- 동별 전세 가격 뷰 인덱스
CREATE INDEX idx_mv_dong_jeonse_prices_region ON mv_dong_jeonse_prices (region_id);
CREATE INDEX idx_mv_dong_jeonse_prices_city ON mv_dong_jeonse_prices (city_name);
CREATE INDEX idx_mv_dong_jeonse_prices_count ON mv_dong_jeonse_prices (transaction_count DESC);

-- ============================================================================
-- Phase 3: 아파트별 가격 Materialized View (매매)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_apartment_sale_prices CASCADE;

-- 아파트별 매매 평균 가격 (최근 6개월)
CREATE MATERIALIZED VIEW mv_apartment_sale_prices AS
SELECT 
    a.apt_id,
    a.apt_name,
    ad.road_address,
    ad.jibun_address,
    ST_X(ad.geometry)::FLOAT as lng,
    ST_Y(ad.geometry)::FLOAT as lat,
    AVG(s.trans_price)::FLOAT as avg_price,
    MIN(s.trans_price)::FLOAT as min_price,
    MAX(s.trans_price)::FLOAT as max_price,
    AVG(s.trans_price / NULLIF(s.exclusive_area, 0) * 3.3)::FLOAT as price_per_pyeong,
    COUNT(s.trans_id)::INT as transaction_count
FROM apartments a
JOIN apart_details ad ON a.apt_id = ad.apt_id
JOIN sales s ON a.apt_id = s.apt_id
WHERE s.contract_date >= CURRENT_DATE - INTERVAL '6 months'
  AND s.is_canceled = FALSE
  AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)
  AND (a.is_deleted = FALSE OR a.is_deleted IS NULL)
  AND (ad.is_deleted = FALSE OR ad.is_deleted IS NULL)
  AND ad.geometry IS NOT NULL
  AND s.trans_price IS NOT NULL
  AND s.exclusive_area IS NOT NULL
  AND s.exclusive_area > 0
GROUP BY a.apt_id, a.apt_name, ad.road_address, ad.jibun_address, ad.geometry;

-- 아파트별 매매 가격 뷰 공간 인덱스
CREATE INDEX idx_mv_apartment_sale_prices_geom 
ON mv_apartment_sale_prices USING GIST (ST_SetSRID(ST_MakePoint(lng, lat), 4326));
CREATE INDEX idx_mv_apartment_sale_prices_apt ON mv_apartment_sale_prices (apt_id);
CREATE INDEX idx_mv_apartment_sale_prices_count ON mv_apartment_sale_prices (transaction_count DESC);

-- ============================================================================
-- Phase 4: 아파트별 가격 Materialized View (전세)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_apartment_jeonse_prices CASCADE;

-- 아파트별 전세 평균 가격 (최근 6개월)
CREATE MATERIALIZED VIEW mv_apartment_jeonse_prices AS
SELECT 
    a.apt_id,
    a.apt_name,
    ad.road_address,
    ad.jibun_address,
    ST_X(ad.geometry)::FLOAT as lng,
    ST_Y(ad.geometry)::FLOAT as lat,
    AVG(r.deposit_price)::FLOAT as avg_price,
    MIN(r.deposit_price)::FLOAT as min_price,
    MAX(r.deposit_price)::FLOAT as max_price,
    AVG(r.deposit_price / NULLIF(r.exclusive_area, 0) * 3.3)::FLOAT as price_per_pyeong,
    COUNT(r.trans_id)::INT as transaction_count
FROM apartments a
JOIN apart_details ad ON a.apt_id = ad.apt_id
JOIN rents r ON a.apt_id = r.apt_id
WHERE r.deal_date >= CURRENT_DATE - INTERVAL '6 months'
  AND (r.monthly_rent = 0 OR r.monthly_rent IS NULL)
  AND (r.is_deleted = FALSE OR r.is_deleted IS NULL)
  AND (a.is_deleted = FALSE OR a.is_deleted IS NULL)
  AND (ad.is_deleted = FALSE OR ad.is_deleted IS NULL)
  AND ad.geometry IS NOT NULL
  AND r.deposit_price IS NOT NULL
  AND r.exclusive_area IS NOT NULL
  AND r.exclusive_area > 0
GROUP BY a.apt_id, a.apt_name, ad.road_address, ad.jibun_address, ad.geometry;

-- 아파트별 전세 가격 뷰 공간 인덱스
CREATE INDEX idx_mv_apartment_jeonse_prices_geom 
ON mv_apartment_jeonse_prices USING GIST (ST_SetSRID(ST_MakePoint(lng, lat), 4326));
CREATE INDEX idx_mv_apartment_jeonse_prices_apt ON mv_apartment_jeonse_prices (apt_id);
CREATE INDEX idx_mv_apartment_jeonse_prices_count ON mv_apartment_jeonse_prices (transaction_count DESC);

-- ============================================================================
-- Phase 5: 지도 쿼리 최적화 인덱스 추가
-- ============================================================================

-- apart_details: geometry 공간 인덱스 (삭제되지 않은 데이터만)
DROP INDEX IF EXISTS idx_apart_details_geom_active;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apart_details_geom_active
ON apart_details USING GIST (geometry)
WHERE (is_deleted = FALSE OR is_deleted IS NULL) AND geometry IS NOT NULL;

-- states: geometry 공간 인덱스 (삭제되지 않은 데이터만)
DROP INDEX IF EXISTS idx_states_geom_active;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_states_geom_active
ON states USING GIST (geometry)
WHERE is_deleted = FALSE AND geometry IS NOT NULL;

-- sales: 지도 쿼리용 복합 인덱스
DROP INDEX IF EXISTS idx_sales_map_query_v2;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_map_query_v2
ON sales (apt_id, contract_date DESC)
INCLUDE (trans_price, exclusive_area)
WHERE is_canceled = FALSE AND (is_deleted = FALSE OR is_deleted IS NULL) AND trans_price IS NOT NULL;

-- rents: 지도 쿼리용 복합 인덱스
DROP INDEX IF EXISTS idx_rents_map_query_v2;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rents_map_query_v2
ON rents (apt_id, deal_date DESC)
INCLUDE (deposit_price, exclusive_area, monthly_rent)
WHERE (is_deleted = FALSE OR is_deleted IS NULL) AND deposit_price IS NOT NULL;

-- states: region_code 앞 5자리 기반 인덱스 (시군구 집계용)
DROP INDEX IF EXISTS idx_states_sigungu_code;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_states_sigungu_code
ON states (SUBSTRING(region_code, 1, 5))
WHERE is_deleted = FALSE AND region_code IS NOT NULL;

-- ============================================================================
-- 통계 정보 갱신
-- ============================================================================

ANALYZE mv_dong_sale_prices;
ANALYZE mv_dong_jeonse_prices;
ANALYZE mv_apartment_sale_prices;
ANALYZE mv_apartment_jeonse_prices;
ANALYZE apart_details;
ANALYZE states;
ANALYZE sales;
ANALYZE rents;

-- ============================================================================
-- Materialized View 새로고침 함수 생성
-- ============================================================================

-- 모든 지도 관련 MV를 새로고침하는 함수
-- 새벽 시간에 실행 시 일반 REFRESH 사용 (잠시 락 발생)
CREATE OR REPLACE FUNCTION refresh_map_materialized_views()
RETURNS void AS $$
BEGIN
    RAISE NOTICE 'Refreshing mv_dong_sale_prices...';
    REFRESH MATERIALIZED VIEW mv_dong_sale_prices;
    
    RAISE NOTICE 'Refreshing mv_dong_jeonse_prices...';
    REFRESH MATERIALIZED VIEW mv_dong_jeonse_prices;
    
    RAISE NOTICE 'Refreshing mv_apartment_sale_prices...';
    REFRESH MATERIALIZED VIEW mv_apartment_sale_prices;
    
    RAISE NOTICE 'Refreshing mv_apartment_jeonse_prices...';
    REFRESH MATERIALIZED VIEW mv_apartment_jeonse_prices;
    
    RAISE NOTICE 'All materialized views refreshed successfully!';
END;
$$ LANGUAGE plpgsql;

-- 사용 예: SELECT refresh_map_materialized_views();
-- 권장: 매일 새벽 3시에 cron으로 실행
