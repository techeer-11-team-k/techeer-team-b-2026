-- 자산 활동 내역 로그 테이블 생성
-- Migration: 20260125_add_asset_activity_logs.sql

-- 테이블 생성
CREATE TABLE IF NOT EXISTS asset_activity_logs (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(account_id),
    apt_id INTEGER REFERENCES apartments(apt_id),
    category VARCHAR(20) NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    price_change INTEGER,
    previous_price INTEGER,
    current_price INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    CONSTRAINT check_category CHECK (category IN ('MY_ASSET', 'INTEREST')),
    CONSTRAINT check_event_type CHECK (event_type IN ('ADD', 'DELETE', 'PRICE_UP', 'PRICE_DOWN'))
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_asset_activity_logs_account_id ON asset_activity_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_asset_activity_logs_apt_id ON asset_activity_logs(apt_id);
CREATE INDEX IF NOT EXISTS idx_asset_activity_logs_created_at ON asset_activity_logs(created_at DESC);

-- 코멘트 추가
COMMENT ON TABLE asset_activity_logs IS '자산 활동 내역 로그';
COMMENT ON COLUMN asset_activity_logs.id IS 'PK';
COMMENT ON COLUMN asset_activity_logs.account_id IS 'FK - accounts.account_id';
COMMENT ON COLUMN asset_activity_logs.apt_id IS 'FK - apartments.apt_id';
COMMENT ON COLUMN asset_activity_logs.category IS '카테고리 (MY_ASSET: 내 아파트, INTEREST: 관심 목록)';
COMMENT ON COLUMN asset_activity_logs.event_type IS '이벤트 타입 (ADD, DELETE, PRICE_UP, PRICE_DOWN)';
COMMENT ON COLUMN asset_activity_logs.price_change IS '가격 변동액 (만원 단위)';
COMMENT ON COLUMN asset_activity_logs.previous_price IS '변동 전 가격 (만원 단위)';
COMMENT ON COLUMN asset_activity_logs.current_price IS '변동 후 가격 (만원 단위)';
COMMENT ON COLUMN asset_activity_logs.created_at IS '생성 일시';
COMMENT ON COLUMN asset_activity_logs.metadata IS '추가 정보 (JSON 문자열)';
