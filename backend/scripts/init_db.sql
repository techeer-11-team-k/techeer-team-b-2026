-- ============================================================
-- 🏠 부동산 분석 플랫폼 - 데이터베이스 초기화 스크립트
-- ============================================================
-- 사용법: psql -U postgres -d realestate -f init_db.sql
-- 또는 Docker 컨테이너에서 실행:
-- docker exec -i realestate-db psql -U postgres -d realestate < init_db.sql

-- ============================================================
-- PostGIS 확장 활성화 (공간 데이터 지원)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- pg_trgm 확장 활성화 (유사도 검색 지원)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 함수 정의
-- ============================================================

-- 1. 아파트명 정규화 함수 (유사도 검색용)
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

-- 2. 지하철 거리 파싱 함수
CREATE OR REPLACE FUNCTION parse_subway_time_max_minutes(subway_time_text TEXT)
RETURNS INTEGER AS $$
DECLARE
    max_time INTEGER := NULL;
    numbers INTEGER[];
    num INTEGER;
BEGIN
    -- NULL 또는 빈 문자열 체크
    IF subway_time_text IS NULL OR subway_time_text = '' THEN
        RETURN NULL;
    END IF;
    
    -- 정규식으로 모든 숫자 추출
    -- 예: "5~10분이내" → [5, 10]
    SELECT ARRAY(
        SELECT (regexp_matches(subway_time_text, '\d+', 'g'))[1]::INTEGER
    ) INTO numbers;
    
    -- 숫자가 없으면 NULL 반환
    IF array_length(numbers, 1) IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- 최대값 찾기
    max_time := numbers[1];
    FOREACH num IN ARRAY numbers
    LOOP
        IF num > max_time THEN
            max_time := num;
        END IF;
    END LOOP;
    
    RETURN max_time;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION parse_subway_time_max_minutes(TEXT) IS '지하철 거리 파싱 함수 - subway_time 필드에서 최대 시간(분) 추출';

-- ============================================================
-- STATES 테이블 (지역 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS states (
    region_id SERIAL PRIMARY KEY,
    region_name VARCHAR(20) NOT NULL,
    region_code CHAR(10) NOT NULL,
    city_name VARCHAR(40) NOT NULL,
    geometry GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE states IS '지역 정보 테이블';
COMMENT ON COLUMN states.region_id IS 'PK';
COMMENT ON COLUMN states.region_name IS '시군구명 (예: 강남구, 해운대구)';
COMMENT ON COLUMN states.region_code IS '시도코드 2자리 + 시군구 3자리 + 동코드 5자리';
COMMENT ON COLUMN states.geometry IS '위치 정보 (PostGIS)';
COMMENT ON COLUMN states.is_deleted IS '삭제 여부 (소프트 삭제)';

-- ============================================================
-- ACCOUNTS 테이블 (사용자 계정) - Clerk 인증 사용
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    account_id SERIAL PRIMARY KEY,
    clerk_user_id VARCHAR(255),
    email VARCHAR(255),
    is_admin VARCHAR(255),
    is_dark_mode BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE accounts IS '사용자 계정 테이블 (Clerk 인증 사용)';
COMMENT ON COLUMN accounts.account_id IS 'PK';
COMMENT ON COLUMN accounts.clerk_user_id IS 'Clerk 사용자 ID';
COMMENT ON COLUMN accounts.email IS '캐시 저장용';
COMMENT ON COLUMN accounts.is_dark_mode IS '다크모드 활성화 여부';
COMMENT ON COLUMN accounts.is_deleted IS '소프트 삭제';

-- ============================================================
-- APARTMENTS 테이블 (아파트 기본 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS apartments (
    apt_id SERIAL PRIMARY KEY,
    region_id INTEGER NOT NULL,
    apt_name VARCHAR(100) NOT NULL,
    kapt_code VARCHAR(20) NOT NULL,
    is_available VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_apartments_region FOREIGN KEY (region_id) REFERENCES states(region_id)
);

COMMENT ON TABLE apartments IS '아파트 단지 기본 정보 테이블';
COMMENT ON COLUMN apartments.apt_id IS 'PK';
COMMENT ON COLUMN apartments.region_id IS 'FK';
COMMENT ON COLUMN apartments.apt_name IS '아파트 단지명';
COMMENT ON COLUMN apartments.kapt_code IS '국토부 단지코드';
COMMENT ON COLUMN apartments.is_available IS 'Default=0, 거래 내역 있으면 1';
COMMENT ON COLUMN apartments.is_deleted IS '소프트 삭제';

-- ============================================================
-- APART_DETAILS 테이블 (아파트 상세 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS apart_details (
    apt_detail_id SERIAL PRIMARY KEY,
    apt_id INTEGER NOT NULL,
    road_address VARCHAR(200) NOT NULL,
    jibun_address VARCHAR(200) NOT NULL,
    zip_code CHAR(5),
    code_sale_nm VARCHAR(20),
    code_heat_nm VARCHAR(20),
    total_household_cnt INTEGER NOT NULL,
    total_building_cnt INTEGER,
    highest_floor INTEGER,
    use_approval_date DATE,
    total_parking_cnt INTEGER,
    builder_name VARCHAR(100),
    developer_name VARCHAR(100),
    manage_type VARCHAR(20),
    hallway_type VARCHAR(20),
    subway_time VARCHAR(200),
    subway_line VARCHAR(200),
    subway_station VARCHAR(200),
    educationFacility VARCHAR(200),
    geometry GEOMETRY(Point, 4326),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_apart_details_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id)
);

COMMENT ON TABLE apart_details IS '아파트 단지 상세 정보 테이블';
COMMENT ON COLUMN apart_details.apt_detail_id IS 'PK';
COMMENT ON COLUMN apart_details.apt_id IS 'FK';
COMMENT ON COLUMN apart_details.subway_time IS '주변 지하철역까지의 도보시간';
COMMENT ON COLUMN apart_details.is_deleted IS '소프트 삭제';

-- 공간 인덱스 생성 (PostGIS)
CREATE INDEX IF NOT EXISTS idx_apart_details_geometry ON apart_details USING GIST(geometry);

-- 지하철 거리 파싱 함수 인덱스
CREATE INDEX IF NOT EXISTS idx_apart_details_subway_time_parsed 
ON apart_details(apt_id) 
WHERE is_deleted = FALSE
  AND subway_time IS NOT NULL
  AND subway_time != ''
  AND parse_subway_time_max_minutes(subway_time) IS NOT NULL;

-- ============================================================
-- SALES 테이블 (매매 거래 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
    trans_id SERIAL PRIMARY KEY,
    apt_id INTEGER NOT NULL,
    build_year VARCHAR(255),
    trans_type VARCHAR(10) NOT NULL,
    trans_price INTEGER,
    exclusive_area DECIMAL(7, 2) NOT NULL,
    floor INTEGER NOT NULL,
    building_num VARCHAR(10),
    contract_date DATE,
    is_canceled BOOLEAN NOT NULL,
    cancel_date DATE,
    remarks VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN,
    CONSTRAINT fk_sales_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id)
);

COMMENT ON TABLE sales IS '매매 거래 정보 테이블';
COMMENT ON COLUMN sales.trans_id IS 'PK';
COMMENT ON COLUMN sales.apt_id IS 'FK';
COMMENT ON COLUMN sales.remarks IS '비고 (아파트 이름 등 참고용)';

-- ============================================================
-- RENTS 테이블 (전월세 거래 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS rents (
    trans_id SERIAL PRIMARY KEY,
    apt_id INTEGER NOT NULL,
    build_year VARCHAR(255),
    contract_type BOOLEAN,
    deposit_price INTEGER,
    monthly_rent INTEGER,
    rent_type VARCHAR(20),
    exclusive_area DECIMAL(7, 2) NOT NULL,
    floor INTEGER NOT NULL,
    apt_seq VARCHAR(10),
    deal_date DATE NOT NULL,
    contract_date DATE,
    remarks VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN,
    CONSTRAINT fk_rents_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id)
);

COMMENT ON TABLE rents IS '전월세 거래 정보 테이블';
COMMENT ON COLUMN rents.trans_id IS 'PK';
COMMENT ON COLUMN rents.apt_id IS 'FK';
COMMENT ON COLUMN rents.rent_type IS '전월세 구분 (JEONSE, MONTHLY_RENT)';
COMMENT ON COLUMN rents.remarks IS '비고 (아파트 이름 등 참고용)';

-- ============================================================
-- HOUSE_SCORES 테이블 (부동산 지수)
-- ============================================================
CREATE TABLE IF NOT EXISTS house_scores (
    index_id SERIAL PRIMARY KEY,
    region_id INTEGER NOT NULL,
    base_ym CHAR(6) NOT NULL,
    index_value DECIMAL(8, 2) NOT NULL,
    index_change_rate DECIMAL(5, 2),
    index_type VARCHAR(10) NOT NULL DEFAULT 'APT',
    data_source VARCHAR(50) NOT NULL DEFAULT 'KB부동산',
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_house_scores_region FOREIGN KEY (region_id) REFERENCES states(region_id),
    CONSTRAINT chk_index_type CHECK (index_type IN ('APT', 'HOUSE', 'ALL'))
);

COMMENT ON TABLE house_scores IS '부동산 지수 테이블';

-- ============================================================
-- HOUSE_VOLUMES 테이블 (부동산 거래량)
-- ============================================================
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

-- ============================================================
-- POPULATION_MOVEMENTS 테이블 (인구 이동 매트릭스)
-- ============================================================
CREATE TABLE IF NOT EXISTS population_movements (
    movement_id SERIAL PRIMARY KEY,
    base_ym CHAR(6) NOT NULL,
    from_region_id INTEGER NOT NULL,
    to_region_id INTEGER NOT NULL,
    movement_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_population_movements_from_region FOREIGN KEY (from_region_id) REFERENCES states(region_id),
    CONSTRAINT fk_population_movements_to_region FOREIGN KEY (to_region_id) REFERENCES states(region_id),
    CONSTRAINT uk_population_movements_ym_from_to UNIQUE (base_ym, from_region_id, to_region_id)
);

COMMENT ON TABLE population_movements IS '인구 이동 매트릭스 테이블 (지역 간 이동 흐름: 출발지 → 도착지)';
COMMENT ON COLUMN population_movements.base_ym IS '기준 년월 (YYYYMM)';
COMMENT ON COLUMN population_movements.from_region_id IS '출발 지역 ID';
COMMENT ON COLUMN population_movements.to_region_id IS '도착 지역 ID';
COMMENT ON COLUMN population_movements.movement_count IS '이동 인구 수 (명)';

CREATE INDEX IF NOT EXISTS idx_population_movements_ym_from_to ON population_movements(base_ym, from_region_id, to_region_id);
CREATE INDEX IF NOT EXISTS idx_population_movements_base_ym ON population_movements(base_ym);
CREATE INDEX IF NOT EXISTS idx_population_movements_from_region ON population_movements(from_region_id);
CREATE INDEX IF NOT EXISTS idx_population_movements_to_region ON population_movements(to_region_id);

-- ============================================================
-- INTEREST_RATES 테이블 (금리 지표)
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_interest_rates_type ON interest_rates(rate_type);
CREATE INDEX IF NOT EXISTS idx_interest_rates_base_date ON interest_rates(base_date);

COMMENT ON TABLE interest_rates IS '금리 지표 정보';
COMMENT ON COLUMN interest_rates.rate_id IS 'PK';
COMMENT ON COLUMN interest_rates.rate_type IS '금리 유형 (base_rate, mortgage_fixed, mortgage_variable, jeonse_loan)';
COMMENT ON COLUMN interest_rates.rate_label IS '표시명 (기준금리, 주담대(고정), 주담대(변동), 전세대출)';
COMMENT ON COLUMN interest_rates.rate_value IS '금리 값 (%)';
COMMENT ON COLUMN interest_rates.change_value IS '전월 대비 변동폭 (%)';
COMMENT ON COLUMN interest_rates.trend IS '추세 (up, down, stable)';
COMMENT ON COLUMN interest_rates.base_date IS '기준일';
COMMENT ON COLUMN interest_rates.description IS '설명';

-- ============================================================
-- FAVORITE_LOCATIONS 테이블 (즐겨찾기 지역)
-- ============================================================
CREATE TABLE IF NOT EXISTS favorite_locations (
    favorite_id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_favorite_locations_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT fk_favorite_locations_region FOREIGN KEY (region_id) REFERENCES states(region_id)
);

-- ============================================================
-- FAVORITE_APARTMENTS 테이블 (즐겨찾기 아파트)
-- ============================================================
CREATE TABLE IF NOT EXISTS favorite_apartments (
    favorite_id SERIAL PRIMARY KEY,
    apt_id INTEGER NOT NULL,
    account_id INTEGER,
    nickname VARCHAR(50),
    memo TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_favorite_apartments_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id),
    CONSTRAINT fk_favorite_apartments_account FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

-- ============================================================
-- MY_PROPERTIES 테이블 (내 부동산)
-- ============================================================
CREATE TABLE IF NOT EXISTS my_properties (
    property_id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    apt_id INTEGER NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    exclusive_area DECIMAL(6, 2) NOT NULL,
    current_market_price INTEGER,
    purchase_price INTEGER,
    loan_amount INTEGER,
    purchase_date TIMESTAMP,
    risk_checked_at TIMESTAMP,
    memo TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_my_properties_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT fk_my_properties_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id)
);

COMMENT ON COLUMN my_properties.purchase_price IS '구매가 (만원)';
COMMENT ON COLUMN my_properties.loan_amount IS '대출 금액 (만원)';
COMMENT ON COLUMN my_properties.purchase_date IS '매입일';

-- ============================================================
-- RECENT_SEARCHES 테이블 (최근 검색어)
-- ============================================================
CREATE TABLE IF NOT EXISTS recent_searches (
    search_id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    query VARCHAR(255) NOT NULL,
    search_type VARCHAR(20) NOT NULL DEFAULT 'apartment',
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_recent_searches_account FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

-- ============================================================
-- RECENT_VIEWS 테이블 (최근 본 아파트)
-- ============================================================
CREATE TABLE IF NOT EXISTS recent_views (
    view_id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    apt_id INTEGER NOT NULL,
    viewed_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_recent_views_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT fk_recent_views_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id)
);

-- ============================================================
-- 인덱스 생성 (성능 최적화)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_clerk_user_id ON accounts(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_is_deleted ON accounts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_states_region_code ON states(region_code);
CREATE INDEX IF NOT EXISTS idx_states_geometry ON states USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_apartments_region_id ON apartments(region_id);
CREATE INDEX IF NOT EXISTS idx_apartments_kapt_code ON apartments(kapt_code);
CREATE INDEX IF NOT EXISTS idx_apartments_is_deleted ON apartments(is_deleted);
CREATE INDEX IF NOT EXISTS idx_apart_details_apt_id ON apart_details(apt_id);
CREATE INDEX IF NOT EXISTS idx_apart_details_household_cnt ON apart_details(total_household_cnt);
CREATE INDEX IF NOT EXISTS idx_apart_details_building_cnt ON apart_details(total_building_cnt);
CREATE INDEX IF NOT EXISTS idx_apart_details_builder_name ON apart_details(builder_name);
CREATE INDEX IF NOT EXISTS idx_apart_details_is_deleted ON apart_details(is_deleted);
CREATE INDEX IF NOT EXISTS idx_sales_apt_id ON sales(apt_id);
CREATE INDEX IF NOT EXISTS idx_sales_contract_date ON sales(contract_date);
CREATE INDEX IF NOT EXISTS idx_rents_apt_id ON rents(apt_id);
CREATE INDEX IF NOT EXISTS idx_rents_deal_date ON rents(deal_date);
CREATE INDEX IF NOT EXISTS idx_house_scores_region_id ON house_scores(region_id);
CREATE INDEX IF NOT EXISTS idx_house_scores_base_ym ON house_scores(base_ym);
CREATE INDEX IF NOT EXISTS idx_house_volumes_region_id ON house_volumes(region_id);
CREATE INDEX IF NOT EXISTS idx_house_volumes_base_ym ON house_volumes(base_ym);
CREATE INDEX IF NOT EXISTS idx_favorite_locations_account_id ON favorite_locations(account_id);
CREATE INDEX IF NOT EXISTS idx_favorite_locations_region_id ON favorite_locations(region_id);
CREATE INDEX IF NOT EXISTS idx_favorite_apartments_account_id ON favorite_apartments(account_id);
CREATE INDEX IF NOT EXISTS idx_favorite_apartments_apt_id ON favorite_apartments(apt_id);
CREATE INDEX IF NOT EXISTS idx_my_properties_account_id ON my_properties(account_id);
CREATE INDEX IF NOT EXISTS idx_my_properties_apt_id ON my_properties(apt_id);
CREATE INDEX IF NOT EXISTS idx_recent_searches_account_id ON recent_searches(account_id);
CREATE INDEX IF NOT EXISTS idx_recent_searches_created_at ON recent_searches(created_at);
CREATE INDEX IF NOT EXISTS idx_recent_views_account_id ON recent_views(account_id);
CREATE INDEX IF NOT EXISTS idx_recent_views_apt_id ON recent_views(apt_id);
CREATE INDEX IF NOT EXISTS idx_recent_views_viewed_at ON recent_views(viewed_at);

-- pg_trgm 인덱스 (아파트명 유사도 검색용)
CREATE INDEX IF NOT EXISTS idx_apartments_apt_name_trgm 
ON apartments USING gin (apt_name gin_trgm_ops);

-- 정규화된 아파트명에 대한 표현식 인덱스
CREATE INDEX IF NOT EXISTS idx_apartments_apt_name_normalized_trgm 
ON apartments USING gin (normalize_apt_name(apt_name) gin_trgm_ops);

-- ============================================================
-- 시퀀스 재동기화 (데이터 백업/복원 후 시퀀스 동기화)
-- ============================================================
DO $$
DECLARE
    max_id INTEGER;
    new_seq_val BIGINT;
BEGIN
    -- apart_details
    SELECT COALESCE(MAX(apt_detail_id), 0) INTO max_id FROM apart_details;
    new_seq_val := setval('apart_details_apt_detail_id_seq', max_id + 1, false);
    RAISE NOTICE '✅ apart_details 시퀀스 재동기화 완료: 최대값=%, 새 시퀀스값=%', max_id, new_seq_val;
    
    -- accounts
    SELECT COALESCE(MAX(account_id), 0) INTO max_id FROM accounts;
    new_seq_val := setval('accounts_account_id_seq', max_id + 1, false);
    
    -- sales
    SELECT COALESCE(MAX(trans_id), 0) INTO max_id FROM sales;
    new_seq_val := setval('sales_trans_id_seq', max_id + 1, false);
    
    -- rents
    SELECT COALESCE(MAX(trans_id), 0) INTO max_id FROM rents;
    new_seq_val := setval('rents_trans_id_seq', max_id + 1, false);
END $$;

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ 데이터베이스 초기화 완료 (최신 스키마 적용)';
    RAISE NOTICE '   - 모든 테이블 생성됨 (accounts, rents, population_movements 포함)';
    RAISE NOTICE '   - 인덱스 및 함수 생성됨';
    RAISE NOTICE '   - 시퀀스 동기화 준비 완료';
END $$;