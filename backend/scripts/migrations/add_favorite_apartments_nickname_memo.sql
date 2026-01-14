-- ============================================================
-- 마이그레이션: favorite_apartments 테이블에 nickname과 memo 컬럼 추가
-- 날짜: 2026-01-14
-- 설명: 즐겨찾기 아파트에 메모와 별명 기능을 추가하기 위한 마이그레이션
-- ============================================================

-- nickname 컬럼 추가 (NULL 허용, VARCHAR(50))
ALTER TABLE favorite_apartments 
ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);

-- memo 컬럼 추가 (NULL 허용, TEXT)
ALTER TABLE favorite_apartments 
ADD COLUMN IF NOT EXISTS memo TEXT;

-- 컬럼 코멘트 추가
COMMENT ON COLUMN favorite_apartments.nickname IS '별칭 (예: 우리집, 투자용)';
COMMENT ON COLUMN favorite_apartments.memo IS '메모';
