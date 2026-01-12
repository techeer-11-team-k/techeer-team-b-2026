-- ============================================================
-- 🏠 부동산 분석 플랫폼 - 데이터베이스 스키마 초기화
-- ============================================================
-- 이 파일은 PostgreSQL 형식으로 작성되었습니다.
-- Docker entrypoint 또는 수동 실행으로 사용할 수 있습니다.
-- ============================================================

-- PostGIS 확장 활성화 (공간 데이터 지원)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- STATES 테이블 (지역 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS states (
    region_id SERIAL PRIMARY KEY,
    region_name VARCHAR(20) NOT NULL,
    region_code CHAR(10) NOT NULL,
    city_name VARCHAR(40) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE states IS '지역 정보 테이블';
COMMENT ON COLUMN states.region_id IS 'PK';
COMMENT ON COLUMN states.region_name IS '시군구명 (예: 강남구, 해운대구)';
COMMENT ON COLUMN states.region_code IS '시도코드 2자리 + 시군구 3자리 + 동코드 5자리';
COMMENT ON COLUMN states.is_deleted IS '삭제 여부 (소프트 삭제)';

-- ============================================================
-- ACCOUNTS 테이블 (사용자 계정)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    account_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(20) NOT NULL,
    profile_image_url VARCHAR(500),
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_admin VARCHAR(255)
);

COMMENT ON TABLE accounts IS '사용자 계정 테이블';
COMMENT ON COLUMN accounts.account_id IS 'PK';
COMMENT ON COLUMN accounts.email IS '로그인 ID, UNIQUE';
COMMENT ON COLUMN accounts.password IS 'bcrypt 등으로 암호화';
COMMENT ON COLUMN accounts.is_deleted IS '소프트 삭제';

-- ============================================================
-- APARTMENTS 테이블 (아파트 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS apartments (
    apt_id SERIAL PRIMARY KEY,
    region_id INTEGER NOT NULL,
    apt_name VARCHAR(100) NOT NULL,
    kapt_code VARCHAR(20) NOT NULL,
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
    geometry GEOMETRY(Point, 4326) NOT NULL,
    subway_time VARCHAR(100),
    subway_line VARCHAR(100),
    subway_station VARCHAR(100),
    educationFacility VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_apartments_region FOREIGN KEY (region_id) REFERENCES states(region_id)
);

COMMENT ON TABLE apartments IS '아파트 단지 정보 테이블';
COMMENT ON COLUMN apartments.apt_id IS 'PK';
COMMENT ON COLUMN apartments.region_id IS 'FK';
COMMENT ON COLUMN apartments.apt_name IS '아파트 단지명';
COMMENT ON COLUMN apartments.kapt_code IS '국토부 단지코드';
COMMENT ON COLUMN apartments.road_address IS '카카오 API';
COMMENT ON COLUMN apartments.jibun_address IS '카카오 API';
COMMENT ON COLUMN apartments.geometry IS 'PostGIS 공간 데이터';
COMMENT ON COLUMN apartments.is_deleted IS '소프트 삭제';

-- 공간 인덱스 생성 (PostGIS)
CREATE INDEX IF NOT EXISTS idx_apartments_geometry ON apartments USING GIST(geometry);

-- ============================================================
-- TRANSACTIONS 테이블 (거래 정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    trans_id SERIAL PRIMARY KEY,
    apt_id INTEGER NOT NULL,
    trans_type VARCHAR(10) NOT NULL,
    rent_type VARCHAR(10),
    trans_price INTEGER,
    deposit_price INTEGER,
    monthly_rent INTEGER,
    exclusive_area DECIMAL(7, 2) NOT NULL,
    floor INTEGER NOT NULL,
    building_num VARCHAR(10),
    unit_num VARCHAR(10),
    deal_date DATE NOT NULL,
    contract_date DATE,
    is_renewal_right BOOLEAN,
    is_canceled BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_date DATE,
    data_source VARCHAR(50) NOT NULL DEFAULT '국토부실거래가',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_transactions_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id),
    CONSTRAINT chk_trans_type CHECK (trans_type IN ('SALE', 'JEONSE', 'MONTHLY'))
);

COMMENT ON TABLE transactions IS '부동산 거래 정보 테이블';
COMMENT ON COLUMN transactions.trans_id IS 'PK';
COMMENT ON COLUMN transactions.apt_id IS 'FK';
COMMENT ON COLUMN transactions.trans_type IS 'SALE=매매, JEONSE=전세, MONTHLY=월세';
COMMENT ON COLUMN transactions.rent_type IS 'NEW=신규, RENEWAL=갱신, 전월세만 해당';
COMMENT ON COLUMN transactions.data_source IS '이거 보시는 분은 출처를 혹시 어디서 가져오는지 확인좀';

-- ============================================================
-- HOUSE_SCORE 테이블 (부동산 지수)
-- ============================================================
CREATE TABLE IF NOT EXISTS house_score (
    index_id SERIAL PRIMARY KEY,
    region_id INTEGER NOT NULL,
    base_ym CHAR(6) NOT NULL,
    index_value DECIMAL(8, 2) NOT NULL,
    index_change_rate DECIMAL(5, 2),
    index_type VARCHAR(10) NOT NULL DEFAULT 'APT',
    data_source VARCHAR(50) NOT NULL DEFAULT 'KB부동산',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_house_score_region FOREIGN KEY (region_id) REFERENCES states(region_id),
    CONSTRAINT chk_index_type CHECK (index_type IN ('APT', 'HOUSE', 'ALL'))
);

COMMENT ON TABLE house_score IS '부동산 지수 테이블';
COMMENT ON COLUMN house_score.index_id IS 'PK';
COMMENT ON COLUMN house_score.region_id IS 'FK';
COMMENT ON COLUMN house_score.base_ym IS '해당 하는 달';
COMMENT ON COLUMN house_score.index_value IS '2017.11=100 기준';
COMMENT ON COLUMN house_score.index_type IS 'APT=아파트, HOUSE=단독주택, ALL=전체';
COMMENT ON COLUMN house_score.is_deleted IS '소프트 삭제';

-- ============================================================
-- FAVORITE_LOCATIONS 테이블 (즐겨찾기 지역)
-- ============================================================
CREATE TABLE IF NOT EXISTS favorite_locations (
    favorite_id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_favorite_locations_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT fk_favorite_locations_region FOREIGN KEY (region_id) REFERENCES states(region_id)
);

COMMENT ON TABLE favorite_locations IS '사용자 즐겨찾기 지역 테이블';
COMMENT ON COLUMN favorite_locations.favorite_id IS 'PK';
COMMENT ON COLUMN favorite_locations.account_id IS 'FK';
COMMENT ON COLUMN favorite_locations.region_id IS 'FK';
COMMENT ON COLUMN favorite_locations.is_deleted IS '소프트 삭제';

-- ============================================================
-- FAVORITE_APARTMENTS 테이블 (즐겨찾기 아파트)
-- ============================================================
CREATE TABLE IF NOT EXISTS favorite_apartments (
    favorite_id SERIAL PRIMARY KEY,
    apt_id INTEGER NOT NULL,
    account_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_favorite_apartments_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id),
    CONSTRAINT fk_favorite_apartments_account FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

COMMENT ON TABLE favorite_apartments IS '사용자 즐겨찾기 아파트 테이블';
COMMENT ON COLUMN favorite_apartments.favorite_id IS 'PK';
COMMENT ON COLUMN favorite_apartments.apt_id IS 'FK';
COMMENT ON COLUMN favorite_apartments.account_id IS 'FK';
COMMENT ON COLUMN favorite_apartments.is_deleted IS '소프트 삭제';

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
    risk_checked_at TIMESTAMP,
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_my_properties_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT fk_my_properties_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id)
);

COMMENT ON TABLE my_properties IS '사용자 소유 부동산 테이블';
COMMENT ON COLUMN my_properties.property_id IS 'PK';
COMMENT ON COLUMN my_properties.account_id IS 'FK';
COMMENT ON COLUMN my_properties.apt_id IS 'FK';
COMMENT ON COLUMN my_properties.nickname IS '예: 우리집, 투자용';
COMMENT ON COLUMN my_properties.exclusive_area IS '전용면적 (㎡)';
COMMENT ON COLUMN my_properties.current_market_price IS '단위 : 만원';
COMMENT ON COLUMN my_properties.is_deleted IS '소프트 삭제';

-- ============================================================
-- 인덱스 생성 (성능 최적화)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_is_deleted ON accounts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_states_region_code ON states(region_code);
CREATE INDEX IF NOT EXISTS idx_apartments_region_id ON apartments(region_id);
CREATE INDEX IF NOT EXISTS idx_apartments_kapt_code ON apartments(kapt_code);
CREATE INDEX IF NOT EXISTS idx_transactions_apt_id ON transactions(apt_id);
CREATE INDEX IF NOT EXISTS idx_transactions_deal_date ON transactions(deal_date);
CREATE INDEX IF NOT EXISTS idx_house_score_region_id ON house_score(region_id);
CREATE INDEX IF NOT EXISTS idx_house_score_base_ym ON house_score(base_ym);
CREATE INDEX IF NOT EXISTS idx_favorite_locations_account_id ON favorite_locations(account_id);
CREATE INDEX IF NOT EXISTS idx_favorite_apartments_account_id ON favorite_apartments(account_id);
CREATE INDEX IF NOT EXISTS idx_my_properties_account_id ON my_properties(account_id);

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ 데이터베이스 스키마 초기화 완료!';
    RAISE NOTICE '   - states 테이블 생성됨';
    RAISE NOTICE '   - accounts 테이블 생성됨';
    RAISE NOTICE '   - apartments 테이블 생성됨';
    RAISE NOTICE '   - transactions 테이블 생성됨';
    RAISE NOTICE '   - house_score 테이블 생성됨';
    RAISE NOTICE '   - favorite_locations 테이블 생성됨';
    RAISE NOTICE '   - favorite_apartments 테이블 생성됨';
    RAISE NOTICE '   - my_properties 테이블 생성됨';
END $$;
