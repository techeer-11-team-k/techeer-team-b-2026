-- 금리 지표 테이블 생성
-- Migration: 20260122_add_interest_rates.sql

-- 테이블 생성
CREATE TABLE IF NOT EXISTS interest_rates (
    rate_id SERIAL PRIMARY KEY,
    rate_type VARCHAR(50) NOT NULL UNIQUE,
    rate_label VARCHAR(50) NOT NULL,
    rate_value NUMERIC(5, 2) NOT NULL,
    change_value NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    trend VARCHAR(10) NOT NULL DEFAULT 'stable',
    base_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_interest_rates_type ON interest_rates(rate_type);
CREATE INDEX IF NOT EXISTS idx_interest_rates_base_date ON interest_rates(base_date);

-- 코멘트 추가
COMMENT ON TABLE interest_rates IS '금리 지표 정보';
COMMENT ON COLUMN interest_rates.rate_id IS 'PK';
COMMENT ON COLUMN interest_rates.rate_type IS '금리 유형 (base_rate, mortgage_fixed, mortgage_variable, jeonse_loan)';
COMMENT ON COLUMN interest_rates.rate_label IS '표시명 (기준금리, 주담대(고정), 주담대(변동), 전세대출)';
COMMENT ON COLUMN interest_rates.rate_value IS '금리 값 (%)';
COMMENT ON COLUMN interest_rates.change_value IS '전월 대비 변동폭 (%)';
COMMENT ON COLUMN interest_rates.trend IS '추세 (up, down, stable)';
COMMENT ON COLUMN interest_rates.base_date IS '기준일';
COMMENT ON COLUMN interest_rates.description IS '설명';

-- 초기 데이터 삽입 (2024년 12월 기준)
INSERT INTO interest_rates (rate_type, rate_label, rate_value, change_value, trend, base_date, description)
VALUES 
    ('base_rate', '기준금리', 3.50, 0.00, 'stable', '2024-12-01', '한국은행 기준금리'),
    ('mortgage_fixed', '주담대(고정)', 4.21, -0.12, 'down', '2024-12-01', '주택담보대출 고정금리 평균'),
    ('mortgage_variable', '주담대(변동)', 4.85, 0.08, 'up', '2024-12-01', '주택담보대출 변동금리 평균'),
    ('jeonse_loan', '전세대출', 4.15, -0.05, 'down', '2024-12-01', '전세자금대출 평균')
ON CONFLICT (rate_type) DO UPDATE SET
    rate_label = EXCLUDED.rate_label,
    rate_value = EXCLUDED.rate_value,
    change_value = EXCLUDED.change_value,
    trend = EXCLUDED.trend,
    base_date = EXCLUDED.base_date,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;
