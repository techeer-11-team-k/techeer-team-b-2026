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
-- ACCOUNTS 테이블 (사용자 계정) - Clerk 인증 사용
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    account_id SERIAL PRIMARY KEY,
    clerk_user_id VARCHAR(255),
    email VARCHAR(255),
    is_admin VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE accounts IS '사용자 계정 테이블 (Clerk 인증 사용)';
COMMENT ON COLUMN accounts.account_id IS 'PK';
COMMENT ON COLUMN accounts.clerk_user_id IS 'Clerk 사용자 ID';
COMMENT ON COLUMN accounts.email IS '캐시 저장용';
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
COMMENT ON COLUMN apart_details.road_address IS '도로명주소';
COMMENT ON COLUMN apart_details.jibun_address IS '구 지번 주소';
COMMENT ON COLUMN apart_details.zip_code IS '우편번호';
COMMENT ON COLUMN apart_details.code_sale_nm IS '분양/임대 등, 기본정보';
COMMENT ON COLUMN apart_details.code_heat_nm IS '지역난방/개별난방 등, 기본정보';
COMMENT ON COLUMN apart_details.total_household_cnt IS '기본정보';
COMMENT ON COLUMN apart_details.total_building_cnt IS '기본정보';
COMMENT ON COLUMN apart_details.highest_floor IS '기본정보';
COMMENT ON COLUMN apart_details.use_approval_date IS '사용승인일';
COMMENT ON COLUMN apart_details.total_parking_cnt IS '지상과 지하 합친 주차대수';
COMMENT ON COLUMN apart_details.builder_name IS '시공사';
COMMENT ON COLUMN apart_details.developer_name IS '시행사';
COMMENT ON COLUMN apart_details.manage_type IS '자치관리/위탁관리 등, 관리방식';
COMMENT ON COLUMN apart_details.hallway_type IS '계단식/복도식/혼합식 등 복도유형';
COMMENT ON COLUMN apart_details.subway_time IS '주변 지하철역까지의 도보시간';
COMMENT ON COLUMN apart_details.subway_line IS '주변 지하철 호선';
COMMENT ON COLUMN apart_details.subway_station IS '주변 지하철역';
COMMENT ON COLUMN apart_details.educationFacility IS '교육기관';
COMMENT ON COLUMN apart_details.is_deleted IS '소프트 삭제';

-- 공간 인덱스 생성 (PostGIS)
CREATE INDEX IF NOT EXISTS idx_apart_details_geometry ON apart_details USING GIST(geometry);

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

-- 기존 테이블에 remarks 컬럼이 없는 경우 추가 (하위 호환성)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales') THEN
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS remarks VARCHAR(255);
    END IF;
END $$;

COMMENT ON TABLE sales IS '매매 거래 정보 테이블';
COMMENT ON COLUMN sales.trans_id IS 'PK';
COMMENT ON COLUMN sales.apt_id IS 'FK';
COMMENT ON COLUMN sales.build_year IS '건축년도';
COMMENT ON COLUMN sales.trans_type IS '거래 유형';
COMMENT ON COLUMN sales.trans_price IS '거래가격';
COMMENT ON COLUMN sales.exclusive_area IS '전용면적 (㎡)';
COMMENT ON COLUMN sales.floor IS '층';
COMMENT ON COLUMN sales.building_num IS '건물번호';
COMMENT ON COLUMN sales.contract_date IS '계약일';
COMMENT ON COLUMN sales.is_canceled IS '취소 여부';
COMMENT ON COLUMN sales.cancel_date IS '취소일';
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
    exclusive_area DECIMAL(7, 2) NOT NULL,
    floor INTEGER NOT NULL,
    apt_seq VARCHAR(10),
    deal_date DATE NOT NULL,
    contract_date DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN,
    CONSTRAINT fk_rents_apt FOREIGN KEY (apt_id) REFERENCES apartments(apt_id)
);

COMMENT ON TABLE rents IS '전월세 거래 정보 테이블';
COMMENT ON COLUMN rents.trans_id IS 'PK';
COMMENT ON COLUMN rents.apt_id IS 'FK';
COMMENT ON COLUMN rents.build_year IS '건축년도';
COMMENT ON COLUMN rents.contract_type IS '신규 or 갱신';
COMMENT ON COLUMN rents.deposit_price IS '보증금';
COMMENT ON COLUMN rents.monthly_rent IS '월세';
COMMENT ON COLUMN rents.exclusive_area IS '전용면적 (㎡)';
COMMENT ON COLUMN rents.floor IS '층';
COMMENT ON COLUMN rents.apt_seq IS '아파트 일련번호';
COMMENT ON COLUMN rents.deal_date IS '거래일';
COMMENT ON COLUMN rents.contract_date IS '계약일';

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
COMMENT ON COLUMN house_scores.index_id IS 'PK';
COMMENT ON COLUMN house_scores.region_id IS 'FK';
COMMENT ON COLUMN house_scores.base_ym IS '해당 하는 달';
COMMENT ON COLUMN house_scores.index_value IS '2017.11=100 기준';
COMMENT ON COLUMN house_scores.index_change_rate IS '지수 변동률';
COMMENT ON COLUMN house_scores.index_type IS 'APT=아파트, HOUSE=단독주택, ALL=전체';
COMMENT ON COLUMN house_scores.data_source IS '데이터 출처';
COMMENT ON COLUMN house_scores.is_deleted IS '소프트 삭제';

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
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
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
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
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
CREATE INDEX IF NOT EXISTS idx_accounts_clerk_user_id ON accounts(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_is_deleted ON accounts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_states_region_code ON states(region_code);
CREATE INDEX IF NOT EXISTS idx_apartments_region_id ON apartments(region_id);
CREATE INDEX IF NOT EXISTS idx_apartments_kapt_code ON apartments(kapt_code);
CREATE INDEX IF NOT EXISTS idx_apartments_is_deleted ON apartments(is_deleted);
CREATE INDEX IF NOT EXISTS idx_apart_details_apt_id ON apart_details(apt_id);
CREATE INDEX IF NOT EXISTS idx_sales_apt_id ON sales(apt_id);
CREATE INDEX IF NOT EXISTS idx_sales_contract_date ON sales(contract_date);
CREATE INDEX IF NOT EXISTS idx_rents_apt_id ON rents(apt_id);
CREATE INDEX IF NOT EXISTS idx_rents_deal_date ON rents(deal_date);
CREATE INDEX IF NOT EXISTS idx_house_scores_region_id ON house_scores(region_id);
CREATE INDEX IF NOT EXISTS idx_house_scores_base_ym ON house_scores(base_ym);
CREATE INDEX IF NOT EXISTS idx_favorite_locations_account_id ON favorite_locations(account_id);
CREATE INDEX IF NOT EXISTS idx_favorite_locations_region_id ON favorite_locations(region_id);
CREATE INDEX IF NOT EXISTS idx_favorite_apartments_account_id ON favorite_apartments(account_id);
CREATE INDEX IF NOT EXISTS idx_favorite_apartments_apt_id ON favorite_apartments(apt_id);
CREATE INDEX IF NOT EXISTS idx_my_properties_account_id ON my_properties(account_id);
CREATE INDEX IF NOT EXISTS idx_my_properties_apt_id ON my_properties(apt_id);

-- ============================================================
-- APARTMENTS 테이블 (아파트 기본정보)
-- ============================================================
CREATE TABLE IF NOT EXISTS apartments (
    apt_id SERIAL PRIMARY KEY,
    apt_name VARCHAR(200) NOT NULL,
    address VARCHAR(500),
    sigungu_code VARCHAR(10),
    sigungu_name VARCHAR(50),
    dong_name VARCHAR(50),
    latitude FLOAT,
    longitude FLOAT,
    total_units INTEGER,
    build_year INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_apartments_apt_name ON apartments(apt_name);
CREATE INDEX IF NOT EXISTS idx_apartments_sigungu_code ON apartments(sigungu_code);
CREATE INDEX IF NOT EXISTS idx_apartments_dong_name ON apartments(dong_name);

-- 코멘트 추가
COMMENT ON TABLE apartments IS '아파트 기본정보 테이블 (국토교통부 API)';
COMMENT ON COLUMN apartments.apt_name IS '아파트명';
COMMENT ON COLUMN apartments.sigungu_code IS '시군구 코드';

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ 데이터베이스 초기화 완료!';
    RAISE NOTICE '   - states 테이블 생성됨';
    RAISE NOTICE '   - accounts 테이블 생성됨';
    RAISE NOTICE '   - apartments 테이블 생성됨';
    RAISE NOTICE '   - apart_details 테이블 생성됨';
    RAISE NOTICE '   - sales 테이블 생성됨';
    RAISE NOTICE '   - rents 테이블 생성됨';
    RAISE NOTICE '   - house_scores 테이블 생성됨';
    RAISE NOTICE '   - favorite_locations 테이블 생성됨';
    RAISE NOTICE '   - favorite_apartments 테이블 생성됨';
    RAISE NOTICE '   - my_properties 테이블 생성됨';
END $$;
