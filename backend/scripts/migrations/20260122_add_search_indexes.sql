-- 검색 성능 개선용 인덱스 추가 (pg_trgm + prefix)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 주소 검색용 GIN 트라이그램 인덱스
CREATE INDEX IF NOT EXISTS idx_apart_details_road_address_trgm
ON apart_details USING gin (road_address gin_trgm_ops)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

CREATE INDEX IF NOT EXISTS idx_apart_details_jibun_address_trgm
ON apart_details USING gin (jibun_address gin_trgm_ops)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

-- 숫자 제거된 주소 유사도 검색 최적화
CREATE INDEX IF NOT EXISTS idx_apart_details_road_address_trgm_no_num
ON apart_details USING gin (
  regexp_replace(coalesce(road_address, ''), '[0-9]', '', 'g') gin_trgm_ops
)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

CREATE INDEX IF NOT EXISTS idx_apart_details_jibun_address_trgm_no_num
ON apart_details USING gin (
  regexp_replace(coalesce(jibun_address, ''), '[0-9]', '', 'g') gin_trgm_ops
)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

-- PREFIX 검색 최적화용 lower(text) 패턴 인덱스
CREATE INDEX IF NOT EXISTS idx_apartments_apt_name_lower_pattern
ON apartments (lower(apt_name) text_pattern_ops)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

CREATE INDEX IF NOT EXISTS idx_apart_details_road_address_lower_pattern
ON apart_details (lower(road_address) text_pattern_ops)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);

CREATE INDEX IF NOT EXISTS idx_apart_details_jibun_address_lower_pattern
ON apart_details (lower(jibun_address) text_pattern_ops)
WHERE (is_deleted = FALSE OR is_deleted IS NULL);
