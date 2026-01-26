-- ============================================================
-- 아파트 검색 및 정렬 최적화 인덱스 추가
-- 생성일: 2026-01-26
-- 설명: Apartment 모델에 추가된 복합 인덱스를 DB에 반영
-- ============================================================

-- 1. 지역별 아파트 조회 및 이름 정렬 최적화 (복합 인덱스)
-- 이미 idx_apartments_region_deleted_name 가 존재할 수 있으나, 
-- 모델 정의와 일치하는 인덱스를 명시적으로 추가합니다.
CREATE INDEX IF NOT EXISTS idx_apartments_region_name 
ON apartments(region_id, apt_name);

-- 2. 아파트 상세정보 geometry 인덱스 재확인
-- init_db.sql에 포함되어 있으나, 기존 DB 대응을 위해 추가
CREATE INDEX IF NOT EXISTS idx_apart_details_geometry 
ON apart_details USING GIST(geometry);

-- 3. 아파트명 Trigram GIN 인덱스 (모델 정의 명칭과 동기화)
-- pg_trgm 확장이 활성화되어 있어야 합니다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_apartments_name_trgm 
ON apartments USING GIN (apt_name gin_trgm_ops);

COMMENT ON INDEX idx_apartments_region_name IS '지역별 아파트 목록 조회 및 이름순 정렬 최적화';
COMMENT ON INDEX idx_apartments_name_trgm IS '아파트명 유사도 검색(LIKE %...%) 최적화';
