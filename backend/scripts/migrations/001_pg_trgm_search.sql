-- ============================================================
-- 마이그레이션: pg_trgm 기반 아파트명 유사도 검색
-- 버전: 001
-- 설명: pg_trgm 확장, 정규화 함수, GIN 인덱스 추가
-- ============================================================

-- pg_trgm 확장 설치
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 아파트명 정규화 함수 생성
-- 이미 존재하면 덮어쓰기 (OR REPLACE)
CREATE OR REPLACE FUNCTION normalize_apt_name(name TEXT) RETURNS TEXT AS $$
BEGIN
    IF name IS NULL THEN RETURN ''; END IF;
    
    -- 소문자 변환, 브랜드명 통일, 공백/특수문자 제거, '아파트' 접미사 제거
    RETURN LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(name, 'e편한세상', '이편한세상', 'gi'),
                '[\s\-\(\)\[\]·]', '', 'g'
            ),
            '아파트$', '', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_apt_name(TEXT) IS '아파트명 정규화 함수 - 유사도 검색을 위해 공백, 특수문자 제거 및 브랜드명 통일';

-- pg_trgm GIN 인덱스 (아파트명 원본)
CREATE INDEX IF NOT EXISTS idx_apartments_apt_name_trgm 
ON apartments USING gin (apt_name gin_trgm_ops);

-- pg_trgm GIN 인덱스 (정규화된 아파트명 - 표현식 인덱스)
CREATE INDEX IF NOT EXISTS idx_apartments_apt_name_normalized_trgm 
ON apartments USING gin (normalize_apt_name(apt_name) gin_trgm_ops);
