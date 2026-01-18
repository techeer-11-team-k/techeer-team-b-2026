-- ============================================================
-- 마이그레이션: AI 검색 성능 최적화
-- 버전: 006
-- 설명: AI 자연어 검색(detailed_search) 쿼리 최적화를 위한 전세/월세 전용 인덱스 추가
--       전세 조건이 있을 때 쿼리 실행 시간을 대폭 단축하기 위한 인덱스
-- ============================================================

-- ============================================================
-- 1. RENTS 테이블: 전세 거래 전용 인덱스 (AI 검색 최적화)
-- ============================================================

-- 전세 거래 전용 인덱스: apt_id + deal_date + deposit_price
-- AI 검색에서 전세 조건이 있을 때 사용되는 서브쿼리 최적화
-- WHERE 조건: monthly_rent IS NULL OR monthly_rent = 0 (전세만)
--            AND deposit_price IS NOT NULL (보증금 데이터 있음)
--            AND is_deleted = FALSE (삭제되지 않은 거래만)
--            AND exclusive_area > 0 (면적 데이터 있음)
CREATE INDEX IF NOT EXISTS idx_rents_jeonse_ai_search 
ON rents(apt_id, deal_date DESC, deposit_price) 
WHERE (monthly_rent IS NULL OR monthly_rent = 0)
  AND deposit_price IS NOT NULL
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND exclusive_area > 0
  AND (remarks != '더미' OR remarks IS NULL);

-- 전세 거래 전용 인덱스 (지역 필터링용): deal_date + deposit_price + apt_id
-- region_id로 필터링할 때 사용 (서브쿼리 후 JOIN 최적화)
CREATE INDEX IF NOT EXISTS idx_rents_jeonse_date_price_apt 
ON rents(deal_date DESC, deposit_price, apt_id) 
WHERE (monthly_rent IS NULL OR monthly_rent = 0)
  AND deposit_price IS NOT NULL
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND exclusive_area > 0
  AND (remarks != '더미' OR remarks IS NULL);

-- ============================================================
-- 2. RENTS 테이블: 월세 거래 전용 인덱스 (AI 검색 최적화)
-- ============================================================

-- 월세 거래 전용 인덱스: apt_id + deal_date + deposit_price + monthly_rent
-- AI 검색에서 월세 조건이 있을 때 사용되는 서브쿼리 최적화
-- WHERE 조건: monthly_rent > 0 (월세만)
--            AND deposit_price IS NOT NULL (보증금 데이터 있음)
CREATE INDEX IF NOT EXISTS idx_rents_wolse_ai_search 
ON rents(apt_id, deal_date DESC, deposit_price, monthly_rent) 
WHERE monthly_rent > 0
  AND deposit_price IS NOT NULL
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND exclusive_area > 0
  AND (remarks != '더미' OR remarks IS NULL);

-- ============================================================
-- 3. RENTS 테이블: 전세/월세 통합 인덱스 (AI 검색 최적화)
-- ============================================================

-- 전세/월세 통합 인덱스: apt_id + deal_date + deposit_price + monthly_rent
-- 전세와 월세 조건이 모두 있을 때 사용
-- WHERE 조건: deposit_price IS NOT NULL (보증금 데이터 있음)
CREATE INDEX IF NOT EXISTS idx_rents_rent_ai_search 
ON rents(apt_id, deal_date DESC, deposit_price, monthly_rent) 
WHERE deposit_price IS NOT NULL
  AND (is_deleted = FALSE OR is_deleted IS NULL)
  AND exclusive_area > 0
  AND (remarks != '더미' OR remarks IS NULL);

-- ============================================================
-- 4. APARTMENTS 테이블: 지역 + 전세 데이터 존재 여부 인덱스
-- ============================================================

-- 지역별 전세 데이터가 있는 아파트 조회 최적화
-- INNER JOIN 최적화를 위한 인덱스
-- 이미 idx_apartments_region_apt_name이 있지만, 전세 조건이 있을 때 추가 최적화
-- (기존 인덱스와 중복될 수 있지만, 쿼리 플래너가 선택적으로 사용)

-- ============================================================
-- 5. 통계 정보 업데이트
-- ============================================================

-- 테이블 통계 정보 업데이트 (쿼리 플래너 최적화)
-- 새로운 인덱스가 생성되었으므로 통계 정보를 업데이트하여 쿼리 플래너가 최적의 인덱스를 선택하도록 함
ANALYZE rents;
ANALYZE apartments;

-- ============================================================
-- 완료 메시지
-- ============================================================
-- 마이그레이션 완료: AI 검색 성능 최적화 완료!
--   - 전세 거래 전용 인덱스 추가 (idx_rents_jeonse_ai_search)
--   - 월세 거래 전용 인덱스 추가 (idx_rents_wolse_ai_search)
--   - 전세/월세 통합 인덱스 추가 (idx_rents_rent_ai_search)
--   - 지역 필터링 최적화 인덱스 추가 (idx_rents_jeonse_date_price_apt)
--   - 통계 정보 업데이트 완료
-- 
-- 기대 효과:
--   - AI 검색 쿼리 실행 시간 대폭 단축 (16초 → 목표: 2초 이하)
--   - 전세 조건이 있을 때 서브쿼리 성능 향상
--   - GROUP BY apt_id 최적화
--   - INNER JOIN 성능 향상
