-- ============================================================
-- 마이그레이션 003: HOUSE_VOLUMES 테이블 추가
-- ============================================================
-- 날짜: 2026-01-17
-- 설명: 부동산 거래량 데이터를 저장하는 테이블 추가

-- HOUSE_VOLUMES 테이블 (부동산 거래량)
CREATE TABLE IF NOT EXISTS house_volumes (
    volume_id SERIAL PRIMARY KEY,
    region_id INTEGER NOT NULL,
    base_ym CHAR(6) NOT NULL,
    volume_value INTEGER NOT NULL,
    volume_area DECIMAL(5, 2),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_house_volumes_region FOREIGN KEY (region_id) REFERENCES states(region_id)
);

COMMENT ON TABLE house_volumes IS '부동산 거래량 테이블';
COMMENT ON COLUMN house_volumes.volume_id IS 'PK';
COMMENT ON COLUMN house_volumes.region_id IS 'FK';
COMMENT ON COLUMN house_volumes.base_ym IS '해당 하는 달';
COMMENT ON COLUMN house_volumes.volume_value IS '거래량 값';
COMMENT ON COLUMN house_volumes.volume_area IS '거래 면적';
COMMENT ON COLUMN house_volumes.is_deleted IS '소프트 삭제';

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_house_volumes_region_id ON house_volumes(region_id);
CREATE INDEX IF NOT EXISTS idx_house_volumes_base_ym ON house_volumes(base_ym);
