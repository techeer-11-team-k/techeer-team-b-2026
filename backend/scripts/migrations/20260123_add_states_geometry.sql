-- 마이그레이션: states 테이블에 geometry 컬럼 추가
-- 날짜: 2026-01-23
-- 설명: states 테이블에 PostGIS geometry 컬럼을 추가하여 시군구/동의 위치 정보를 저장

-- PostGIS 확장 활성화 (이미 되어 있을 수 있음)
CREATE EXTENSION IF NOT EXISTS postgis;

-- states 테이블에 geometry 컬럼 추가
ALTER TABLE states 
ADD COLUMN IF NOT EXISTS geometry geometry(Point, 4326);

-- geometry 컬럼에 인덱스 추가 (공간 검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_states_geometry 
ON states USING GIST (geometry);

-- 컬럼 코멘트 추가
COMMENT ON COLUMN states.geometry IS '위치 정보 (PostGIS)';
