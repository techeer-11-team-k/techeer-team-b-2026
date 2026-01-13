-- educationFacility 컬럼 길이 확장: VARCHAR(100) -> VARCHAR(200)
-- 실행 방법: psql 또는 데이터베이스 클라이언트에서 실행

ALTER TABLE apart_details 
ALTER COLUMN educationfacility TYPE VARCHAR(200);

COMMENT ON COLUMN apart_details.educationfacility IS '교육기관 (최대 200자)';
