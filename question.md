/data-collection/apartments/detail
이러한 엔드포인트에 대한 api를 만들어야 해.

apartments에 단지명과 단지 코드 등의 정보가 저장이 되어 있을 거야.
그리고, aparts_detail 테이블에 아래의 2개 외부 api를 활용하여 파싱 후 적재하는 것이 목표야.

트랜잭션 방식으로, 100개 먼저 넣고 실제로 적용하고..이걸 반복하는 게 좋을 수 있다고 생각해.

-- 상세 정보
https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4?ServiceKey=(공공데이터 api key)&kaptCode=(단지코드)

이런 식으로 받아오면,

{
  "response": {
    "body": {
      "item": {
        "kaptCode": "A10023858",
        "kaptName": "용산데시앙포레아파트",
        "codeMgr": "위탁관리",
        "kaptMgrCnt": "5",
        "kaptCcompany": "우리관리(주)",
        "codeSec": "위탁관리",
        "kaptdScnt": "4",
        "kaptdSecCom": "홈스웰",
        "codeClean": "위탁관리",
        "kaptdClcnt": "5",
        "codeGarbage": "음식물쓰레기종량제",
        "codeDisinf": "위탁관리",
        "kaptdDcnt": "4",
        "disposalType": "분무식",
        "codeStr": "철근콘크리트구조",
        "kaptdEcapa": "2400",
        "codeEcon": "종합계약",
        "codeEmgr": "상주선임",
        "codeFalarm": "R형",
        "codeWsupply": "부스타방식",
        "codeElev": "위탁관리",
        "kaptdEcnt": 19,
        "kaptdPcnt": "7",
        "kaptdPcntu": "458",
        "codeNet": "유",
        "kaptdCccnt": "233",
        "welfareFacility": "관리사무소, 노인정, 보육시설, 문고, 주민공동시설, 어린이놀이터, 자전거보관소",
        "kaptdWtimebus": "5분이내",
        "subwayLine": "1호선, 4호선, 6호선",
        "subwayStation": null,
        "kaptdWtimesub": "10~15분이내",
        "convenientFacility": "관공서() 병원() 백화점() 대형상가() 공원() 기타()",
        "educationFacility": "초등학교() 대학교()",
        "groundElChargerCnt": 0,
        "undergroundElChargerCnt": 5,
        "useYn": "Y"
      }
    },
    "header": {
      "resultCode": "00",
      "resultMsg": "NORMAL SERVICE."
    }
  }
}

(이 데이터는 예시야.) 이런 식으로 받아올 수 있어.

-- 기본 정보
https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4?ServiceKey=(공공데이터 api key)&kaptCode=(단지코드)
{
  "response": {
    "body": {
      "item": {
        "kaptCode": "A10023858",
        "kaptName": "용산데시앙포레아파트",
        "kaptAddr": "서울특별시 용산구 효창동 288 용산데시앙포레아파트",
        "codeSaleNm": "혼합",
        "codeHeatNm": "개별난방",
        "kaptTarea": 55633.258,
        "kaptDongCnt": "7",
        "kaptdaCnt": 384,
        "kaptBcompany": "태영건설",
        "kaptAcompany": "효창제6구역주택재개발정비사업조합",
        "kaptTel": "027178006",
        "kaptUrl": " ",
        "codeAptNm": "아파트",
        "doroJuso": "서울특별시 용산구 효창원로 227",
        "codeMgrNm": "위탁관리",
        "codeHallNm": "혼합식",
        "kaptUsedate": "20220328",
        "kaptFax": "027178009",
        "hoCnt": 384,
        "kaptMarea": 32297.396,
        "kaptMparea60": 295,
        "kaptMparea85": 89,
        "kaptMparea135": 0,
        "kaptMparea136": 0,
        "privArea": "24126.7417",
        "bjdCode": "1117011900",
        "kaptTopFloor": 14,
        "ktownFlrNo": 14,
        "kaptBaseFloor": 3,
        "kaptdEcntp": 19,
        "zipcode": "04311"
      }
    },
    "header": {
      "resultCode": "00",
      "resultMsg": "NORMAL SERVICE."
    }
  }
}

(이 데이터는 예시야.) 이런 식으로 받아올 수 있어.
apart_details의 현재 구조는 아마 아래와 같을 거야.

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
    subway_time VARCHAR(100),
    subway_line VARCHAR(100),
    subway_station VARCHAR(100),
    educationFacility VARCHAR(100),
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
