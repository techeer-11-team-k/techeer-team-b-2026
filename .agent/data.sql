CREATE TABLE `MY_PROPERTIES` (
	`property_id`	int	NOT NULL	COMMENT 'PK',
	`apt_id`	int	NOT NULL,
	`user_id`	bigint	NOT NULL,
	`nickname`	varchar(50)	NOT NULL	COMMENT '예: 우리집, 투자용',
	`exclusive_area`	decimal(6, 2)	NOT NULL	COMMENT '전용면적 (㎡)',
	`current_market_price`	int	NULL	COMMENT '단위 : 만원',
	`risk_checked_at`	timestamp	NULL,
	`memo`	text	NULL,
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0	COMMENT '소프트 삭제'
);

CREATE TABLE `APARTMENTS` (
	`apt_id`	int	NOT NULL	COMMENT 'PK',
	`dong_id`	int	NOT NULL	COMMENT '법정동 코드 (FK)',
	`apt_name`	varchar(100)	NOT NULL	COMMENT '아파트 단지명',
	`road_address`	varchar(200)	NOT NULL	COMMENT '카카오 API',
	`jibun_address`	varchar(200)	NOT NULL	COMMENT '카카오 API',
	`zip_code`	char(5)	NULL	COMMENT '카카오 API',
	`code_sale_nm`	varchar(20)	NULL	COMMENT '분양/임대 등, 기본정보',
	`code_heat_nm`	varchar(20)	NULL	COMMENT '지역난방/개별난방 등, 기본정보',
	`total_household_cnt`	int	NOT NULL	COMMENT '기본정보',
	`total_building_cnt`	int	NULL	COMMENT '기본정보',
	`highest_floor`	int	NULL	COMMENT '기본정보',
	`use_approval_date`	date	NULL	COMMENT '기본정보',
	`total_parking_cnt`	int	NULL	COMMENT '상세정보',
	`builder_name`	varchar(100)	NULL	COMMENT '상세정보',
	`developer_name`	varchar(100)	NULL	COMMENT '상세정보',
	`manage_type`	varchar(20)	NULL	COMMENT '자치관리/위탁관리 등, 상세정보',
	`hallway_type`	varchar(20)	NULL	COMMENT '계단식/복도식/혼합식, 상세정보',
	`Field`	varchar(100)	NULL	COMMENT '상세정보',
	`geometry`	geometry(Point, 4326)	NOT NULL,
	`kapt_code`	varchar(20)	NULL	COMMENT '국토부 단지코드',
	`kaptdWtimesub`	varchar(100)	NULL	COMMENT '상세정보',
	`subwayLine`	varchar(100)	NULL	COMMENT '상세정보',
	`subwayStation`	varchar(100)	NULL	COMMENT '상세정보',
	`educationFacility`	varchar(100)	NULL	COMMENT '상세정보',
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0	COMMENT '소프트 삭제'
);

CREATE TABLE `CITIES` (
	`dong_id`	int	NOT NULL	COMMENT 'PK',
	`sigungu_id`	int	NOT NULL	COMMENT '소속 시군구 코드(FK)',
	`dong_code`	char(10)	NULL,
	`dong_name`	varchar(40)	NOT NULL,
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0
);

CREATE TABLE `FAVORITE_APARTMENTS` (
	`favorite_id`	int	NULL	COMMENT 'PK',
	`account_id`	bigint	NOT NULL,
	`apt_id`	int	NOT NULL	COMMENT '아파트 단지 코드',
	`sigungu_id`	int	NOT NULL	COMMENT '시군구코드',
	`memo`	varchar(200)	NULL	COMMENT '(관심 등록 사유 등)',
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0	COMMENT '(소프트 삭제)'
);

CREATE TABLE `HOUSE_PRICES` (
	`index_id`	int	NOT NULL	COMMENT 'PK',
	`sigungu_id`	int	NOT NULL	COMMENT '시군구 코드 (FK), 동 단위 미제공',
	`base_ym`	char(6)	NOT NULL	COMMENT '해당 하는 달',
	`index_value`	decimal(8, 2)	NOT NULL	COMMENT '2017.11=100 기준',
	`index_change_rate`	decimal(5, 2)	NULL,
	`index_type`	varchar(10)	NOT NULL	DEFAULT 'APT'	COMMENT 'APT=아파트, HOUSE=단독주택, ALL=전체',
	`data_source`	varchar(50)	NOT NULL	DEFAULT 'KB부동산',
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0	COMMENT '소프트 삭제'
);

CREATE TABLE `TRANSACTIONS` (
	`trans_id`	int	NOT NULL	COMMENT 'PK',
	`apt_id`	int	NOT NULL	COMMENT '아파트 단지 id',
	`sigungu_id`	int	NOT NULL	COMMENT '시군구 id',
	`trans_type`	varchar(10)	NOT NULL	COMMENT 'SALE=매매, JEONSE=전세, MONTHLY=월세)',
	`rent_type`	varchar(10)	NULL	COMMENT 'NEW=신규, RENEWAL=갱신, 전월세만 해당',
	`trans_price`	int	NULL,
	`deposit_price`	int	NULL,
	`monthly_rent`	int	NULL,
	`exclusive_area`	decimal(7, 2)	NOT NULL,
	`floor`	int	NULL,
	`building_num`	varchar(10)	NULL,
	`unit_num`	varchar(10)	NULL,
	`deal_date`	date	NOT NULL,
	`contract_date`	date	NULL,
	`is_renewal_right`	tinyint(1)	NULL,
	`is_canceled`	tinyint(1)	NOT NULL	DEFAULT 0,
	`cancel_date`	date	NULL,
	`data_source`	varchar(50)	NOT NULL	DEFAULT '국토부실거래가',
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0
);

CREATE TABLE `ACCOUNTS` (
	`account_id`	int	NULL	COMMENT 'PK',
	`email`	varchar(255)	NOT NULL	COMMENT '로그인 ID, UNIQUE',
	`password`	varchar(255)	NOT NULL	COMMENT '(bcrypt 등)',
	`nickname`	varchar(20)	NOT NULL,
	`profile_image_url`	varchar(500)	NULL,
	`last_login_at`	timestamp	NULL,
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0	COMMENT '소프트 삭제'
);

CREATE TABLE `STATES` (
	`sigungu_id`	int	NOT NULL	COMMENT 'PK',
	`sigungu_name`	varchar(20)	NOT NULL	COMMENT '시군구명 (예: 강남구, 해운대구)',
	`sigungu_code`	char(5)	NOT NULL	COMMENT '시도코드 2자리 + 시군구 3자리',
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP)	COMMENT '레코드 생성 일시',
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP)	COMMENT '레코드 수정 일시',
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0	COMMENT '삭제 여부 (소프트 삭제)',
	`dong_code`	char(10)	NULL	COMMENT '시도코드 2자리 + 시군구 3자리+동코드 5자리',
	`Field2`	VARCHAR(255)	NULL
);

CREATE TABLE `FAVORITE_LOCATIONS` (
	`favorite_id`	int	NULL	COMMENT 'PK',
	`sigungu_id`	int	NOT NULL	COMMENT 'PK',
	`account_id`	bigint	NOT NULL,
	`dong_id`	int	NOT NULL	COMMENT '동 단위 관심 시 법정동 코드',
	`notify_enabled`	tinyint(1)	NOT NULL	DEFAULT 1,
	`created_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`updated_at`	timestamp	NOT NULL	DEFAULT (CURRENT_TIMESTAMP),
	`is_deleted`	tinyint(1)	NOT NULL	DEFAULT 0	COMMENT '소프트 삭제'
);

ALTER TABLE `MY_PROPERTIES` ADD CONSTRAINT `PK_MY_PROPERTIES` PRIMARY KEY (
	`property_id`
);

ALTER TABLE `APARTMENTS` ADD CONSTRAINT `PK_APARTMENTS` PRIMARY KEY (
	`apt_id`
);

ALTER TABLE `CITIES` ADD CONSTRAINT `PK_CITIES` PRIMARY KEY (
	`dong_id`
);

ALTER TABLE `FAVORITE_APARTMENTS` ADD CONSTRAINT `PK_FAVORITE_APARTMENTS` PRIMARY KEY (
	`favorite_id`
);

ALTER TABLE `HOUSE_PRICES` ADD CONSTRAINT `PK_HOUSE_PRICES` PRIMARY KEY (
	`index_id`
);

ALTER TABLE `TRANSACTIONS` ADD CONSTRAINT `PK_TRANSACTIONS` PRIMARY KEY (
	`trans_id`
);

ALTER TABLE `ACCOUNTS` ADD CONSTRAINT `PK_ACCOUNTS` PRIMARY KEY (
	`account_id`
);

ALTER TABLE `STATES` ADD CONSTRAINT `PK_STATES` PRIMARY KEY (
	`sigungu_id`
);

ALTER TABLE `FAVORITE_LOCATIONS` ADD CONSTRAINT `PK_FAVORITE_LOCATIONS` PRIMARY KEY (
	`favorite_id`
);

ALTER TABLE `MY_PROPERTIES` ADD CONSTRAINT `FK_APARTMENTS_TO_MY_PROPERTIES_1` FOREIGN KEY (
	`apt_id`
)
REFERENCES `APARTMENTS` (
	`apt_id`
);

ALTER TABLE `MY_PROPERTIES` ADD CONSTRAINT `FK_ACCOUNTS_TO_MY_PROPERTIES_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `ACCOUNTS` (
	`account_id`
);

ALTER TABLE `APARTMENTS` ADD CONSTRAINT `FK_CITIES_TO_APARTMENTS_1` FOREIGN KEY (
	`dong_id`
)
REFERENCES `CITIES` (
	`dong_code`
);

ALTER TABLE `CITIES` ADD CONSTRAINT `FK_STATES_TO_CITIES_1` FOREIGN KEY (
	`sigungu_id`
)
REFERENCES `STATES` (
	`sigungu_id`
);

ALTER TABLE `FAVORITE_APARTMENTS` ADD CONSTRAINT `FK_ACCOUNTS_TO_FAVORITE_APARTMENTS_1` FOREIGN KEY (
	`account_id`
)
REFERENCES `ACCOUNTS` (
	`account_id`
);

ALTER TABLE `FAVORITE_APARTMENTS` ADD CONSTRAINT `FK_APARTMENTS_TO_FAVORITE_APARTMENTS_1` FOREIGN KEY (
	`apt_id`
)
REFERENCES `APARTMENTS` (
	`kapt_code`
);

ALTER TABLE `FAVORITE_APARTMENTS` ADD CONSTRAINT `FK_STATES_TO_FAVORITE_APARTMENTS_1` FOREIGN KEY (
	`sigungu_id`
)
REFERENCES `STATES` (
	`sigungu_id`
);

ALTER TABLE `HOUSE_PRICES` ADD CONSTRAINT `FK_STATES_TO_HOUSE_PRICES_1` FOREIGN KEY (
	`sigungu_id`
)
REFERENCES `STATES` (
	`sigungu_id`
);

ALTER TABLE `TRANSACTIONS` ADD CONSTRAINT `FK_APARTMENTS_TO_TRANSACTIONS_1` FOREIGN KEY (
	`apt_id`
)
REFERENCES `APARTMENTS` (
	`kapt_code`
);

ALTER TABLE `TRANSACTIONS` ADD CONSTRAINT `FK_STATES_TO_TRANSACTIONS_1` FOREIGN KEY (
	`sigungu_id`
)
REFERENCES `STATES` (
	`sigungu_id`
);

ALTER TABLE `FAVORITE_LOCATIONS` ADD CONSTRAINT `FK_STATES_TO_FAVORITE_LOCATIONS_1` FOREIGN KEY (
	`sigungu_id`
)
REFERENCES `STATES` (
	`sigungu_id`
);

ALTER TABLE `FAVORITE_LOCATIONS` ADD CONSTRAINT `FK_ACCOUNTS_TO_FAVORITE_LOCATIONS_1` FOREIGN KEY (
	`account_id`
)
REFERENCES `ACCOUNTS` (
	`account_id`
);

ALTER TABLE `FAVORITE_LOCATIONS` ADD CONSTRAINT `FK_CITIES_TO_FAVORITE_LOCATIONS_1` FOREIGN KEY (
	`dong_id`
)
REFERENCES `CITIES` (
	`dong_code`
);

