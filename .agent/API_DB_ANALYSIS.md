# API 및 DB 설계 분석 보고서

## 1. 현재 구현된 API 엔드포인트 전체 목록

### 🔐 인증 (Auth)
- `POST /api/v1/auth/webhook` - Clerk 웹훅 (사용자 동기화)
- `GET /api/v1/auth/me` - 내 프로필 조회
- `PATCH /api/v1/auth/me` - 내 프로필 수정

### 🏠 아파트 (Apartments)
- `GET /api/v1/apartments` - 지역별 아파트 목록 조회
- `GET /api/v1/apartments/trending` - 급상승 아파트 조회
- `GET /api/v1/apartments/{apt_id}` - 아파트 상세정보 조회
- `GET /api/v1/apartments/{apt_id}/detail` - 아파트 상세 정보 조회 (상세)
- `GET /api/v1/apartments/{apt_id}/similar` - 유사 아파트 조회
- `GET /api/v1/apartments/{apt_id}/volume-trend` - 아파트 거래량 추이 조회
- `GET /api/v1/apartments/{apt_id}/price-trend` - 아파트 평당가 추이 조회
- `GET /api/v1/apartments/{apt_id}/nearby_price` - 주변 아파트 평균 가격 조회
- `GET /api/v1/apartments/{apt_id}/nearby-comparison` - 주변 아파트 비교
- `GET /api/v1/apartments/{apt_id}/pyeong-prices` - 평형별 가격 조회
- `GET /api/v1/apartments/{apt_id}/transactions` - 아파트 실거래 내역 조회
- `POST /api/v1/apartments/compare` - 다중 아파트 비교 조회
- `POST /api/v1/apartments/search` - 아파트 상세 검색
- `POST /api/v1/apartments/geometry` - 주소를 좌표로 변환하여 geometry 일괄 업데이트

### 🔍 검색 (Search)
- `GET /api/v1/search/apartments` - 아파트명 검색 (자동완성)
- `GET /api/v1/search/locations` - 지역 검색
- `POST /api/v1/search/recent` - 최근 검색어 저장
- `GET /api/v1/search/recent` - 최근 검색어 조회
- `DELETE /api/v1/search/recent/{id}` - 최근 검색어 삭제

### ⭐ 즐겨찾기 (Favorites)
- `GET /api/v1/favorites/locations` - 관심 지역 목록 조회
- `POST /api/v1/favorites/locations` - 관심 지역 추가
- `DELETE /api/v1/favorites/locations/{id}` - 관심 지역 삭제
- `GET /api/v1/favorites/apartments` - 관심 아파트 목록 조회
- `POST /api/v1/favorites/apartments` - 관심 아파트 추가
- `DELETE /api/v1/favorites/apartments/{id}` - 관심 아파트 삭제

### 🏠 내 집 (My Properties)
- `GET /api/v1/my-properties` - 내 집 목록 조회
- `POST /api/v1/my-properties` - 내 집 등록
- `GET /api/v1/my-properties/{id}` - 내 집 상세 조회
- `PATCH /api/v1/my-properties/{id}` - 내 집 수정
- `DELETE /api/v1/my-properties/{id}` - 내 집 삭제
- `GET /api/v1/my-properties/{id}/analysis` - 내 집 분석

### 📊 대시보드 (Dashboard)
- `GET /api/v1/dashboard/summary` - 대시보드 요약 데이터 조회 (전국 평당가/거래량 추이, 월간 아파트 값 추이)
- `GET /api/v1/dashboard/rankings` - 대시보드 랭킹 데이터 조회 (관심 많은 아파트, 상승률/하락률 TOP 5)
- `GET /api/v1/dashboard/rankings_region` - 지역별 대시보드 랭킹 데이터 조회
- `GET /api/v1/dashboard/regional-heatmap` - 지역별 상승률 히트맵 데이터 조회
- `GET /api/v1/dashboard/regional-trends` - 지역별 집값 변화 추이 조회
- `GET /api/v1/dashboard/advanced-charts/price-distribution` - 가격대별 아파트 분포
- `GET /api/v1/dashboard/advanced-charts/regional-price-correlation` - 지역별 가격 상관관계

### 📊 통계 (Statistics)
- `GET /api/v1/statistics/rvol` - RVOL(상대 거래량) 조회
- `GET /api/v1/statistics/quadrant` - 4분면 분류 조회 (매매/전월세 거래량 변화율 기반)
- `GET /api/v1/statistics/summary` - 통계 요약 조회 (RVOL + 4분면 분류)
- `GET /api/v1/statistics/hpi` - 주택가격지수(HPI) 조회
- `GET /api/v1/statistics/hpi/heatmap` - 주택가격지수(HPI) 히트맵 조회
- `GET /api/v1/statistics/population-movements` - 인구 이동 데이터 조회

### 📈 지표 (Indicators)
- `GET /api/v1/indicators/house-scores/{region_id}/{base_ym}` - 부동산 지수 조회
- `GET /api/v1/indicators/house-volumes/{region_id}/{base_ym}` - 부동산 거래량 조회
- `GET /api/v1/indicators/jeonse-ratio` - 전세가율 조회
- `POST /api/v1/indicators/jeonse-ratio/calculate` - 전세가율 계산 (입력값)
- `GET /api/v1/indicators/regional-comparison` - 지역별 지표 비교

### 👤 사용자 (Users)
- `GET /api/v1/users/me/recent-views` - 최근 본 아파트 목록 조회
- `POST /api/v1/users/me/recent-views` - 최근 본 아파트 추가
- `DELETE /api/v1/users/me/recent-views/{id}` - 최근 본 아파트 삭제
- `DELETE /api/v1/users/me/recent-views` - 최근 본 아파트 전체 삭제

### 📰 뉴스 (News)
- `GET /api/v1/news` - 뉴스 목록 조회
- `GET /api/v1/news/detail` - 뉴스 상세 조회

### 🤖 AI (인공지능)
- `POST /api/v1/ai/summary/my-property` - 내 집 칭찬글 생성
- `POST /api/v1/ai/summary/apartment` - 아파트 정보 요약
- `POST /api/v1/ai/summary/news` - 뉴스 요약
- `POST /api/v1/ai/search` - AI 조건 기반 아파트 탐색

### 📊 금리 지표 (Interest Rates)
- `GET /api/v1/interest-rates` - 금리 지표 목록 조회
- `PUT /api/v1/interest-rates/{type}` - 금리 지표 수정 (운영자용)
- `POST /api/v1/interest-rates/batch-update` - 금리 지표 일괄 수정

### 📥 데이터 수집 (Data Collection)
- `POST /api/v1/data-collection/regions` - 지역 데이터 수집 및 저장
- 기타 데이터 수집 관련 엔드포인트 다수

---

## 2. 데이터베이스 스키마 설계

### 주요 테이블 구조

#### 1. **states** (지역 정보)
- `region_id` (PK): 지역 고유 ID
- `region_name`: 시군구명 (예: 강남구, 해운대구)
- `region_code`: 지역코드 (시도코드 2자리 + 시군구 3자리 + 동코드 5자리)
- `city_name`: 시도명 (예: 서울특별시, 부산광역시)
- `is_deleted`: 소프트 삭제 여부

#### 2. **apartments** (아파트 기본 정보)
- `apt_id` (PK): 아파트 고유 ID
- `apt_name`: 아파트명
- `kapt_code`: 아파트 코드
- `region_id` (FK): 지역 ID
- `is_deleted`: 소프트 삭제 여부

#### 3. **apart_details** (아파트 상세 정보)
- `apt_detail_id` (PK): 상세 정보 고유 ID
- `apt_id` (FK): 아파트 ID
- `road_address`: 도로명 주소
- `jibun_address`: 지번 주소
- `total_household_cnt`: 총 세대수
- `total_parking_cnt`: 총 주차 대수
- `use_approval_date`: 사용승인일
- `subway_line`: 지하철 노선
- `subway_station`: 지하철역
- `subway_time`: 지하철 도보 시간
- `educationFacility`: 교육시설 정보
- `geometry`: PostGIS Point (위도/경도)
- `is_deleted`: 소프트 삭제 여부

#### 4. **sales** (매매 거래 정보)
- `trans_id` (PK): 거래 고유 ID
- `apt_id` (FK): 아파트 ID
- `trans_price`: 거래가격
- `exclusive_area`: 전용면적 (㎡)
- `floor`: 층
- `contract_date`: 계약일
- `is_canceled`: 취소 여부
- `is_deleted`: 소프트 삭제 여부

#### 5. **rents** (전월세 거래 정보)
- `trans_id` (PK): 거래 고유 ID
- `apt_id` (FK): 아파트 ID
- `deposit_price`: 보증금
- `monthly_rent`: 월세
- `exclusive_area`: 전용면적 (㎡)
- `floor`: 층
- `deal_date`: 거래일
- `is_deleted`: 소프트 삭제 여부

#### 6. **house_scores** (부동산 가격 지수)
- `index_id` (PK): 지수 고유 ID
- `region_id` (FK): 지역 ID
- `base_ym`: 기준 년월 (YYYYMM)
- `index_value`: 지수 값 (2017.11=100 기준)
- `index_change_rate`: 지수 변동률
- `index_type`: 지수 유형 (APT=아파트, HOUSE=단독주택, ALL=전체)
- `is_deleted`: 소프트 삭제 여부

#### 7. **house_volumes** (부동산 거래량)
- `volume_id` (PK): 거래량 고유 ID
- `region_id` (FK): 지역 ID
- `base_ym`: 기준 년월 (YYYYMM)
- `volume_value`: 거래량 값
- `volume_area`: 거래 면적
- `is_deleted`: 소프트 삭제 여부

#### 8. **population_movements** (인구 이동)
- `movement_id` (PK): 이동 고유 ID
- `region_id` (FK): 지역 ID
- `base_ym`: 기준 년월 (YYYYMM)
- `in_migration`: 전입 인구 수
- `out_migration`: 전출 인구 수
- `net_migration`: 순이동 인구 수 (전입 - 전출)
- `movement_type`: 이동 유형 (TOTAL=전체, DOMESTIC=국내이동)
- `is_deleted`: 소프트 삭제 여부

#### 9. **accounts** (사용자 계정)
- `account_id` (PK): 계정 고유 ID
- `clerk_user_id`: Clerk 사용자 ID
- `email`: 이메일
- `nickname`: 닉네임
- `is_deleted`: 소프트 삭제 여부

#### 10. **favorites** (즐겨찾기)
- `favorite_id` (PK): 즐겨찾기 고유 ID
- `account_id` (FK): 계정 ID
- `apt_id` (FK): 아파트 ID (선택)
- `region_id` (FK): 지역 ID (선택)
- `is_deleted`: 소프트 삭제 여부

#### 11. **my_properties** (내 집)
- `property_id` (PK): 내 집 고유 ID
- `account_id` (FK): 계정 ID
- `apt_id` (FK): 아파트 ID
- `purchase_price`: 매입가
- `purchase_date`: 매입일
- `is_deleted`: 소프트 삭제 여부

#### 12. **recent_views** (최근 본 아파트)
- `view_id` (PK): 조회 고유 ID
- `account_id` (FK): 계정 ID
- `apt_id` (FK): 아파트 ID
- `viewed_at`: 조회 일시
- `is_deleted`: 소프트 삭제 여부

#### 13. **recent_searches** (최근 검색어)
- `search_id` (PK): 검색 고유 ID
- `account_id` (FK): 계정 ID
- `search_keyword`: 검색어
- `searched_at`: 검색 일시
- `is_deleted`: 소프트 삭제 여부

#### 14. **news** (뉴스)
- `news_id` (PK): 뉴스 고유 ID
- `title`: 제목
- `content`: 내용
- `source_url`: 출처 URL
- `published_at`: 발행일
- `is_deleted`: 소프트 삭제 여부

#### 15. **interest_rates** (금리 지표)
- `rate_id` (PK): 금리 고유 ID
- `rate_type`: 금리 유형
- `rate_value`: 금리 값
- `base_date`: 기준일
- `is_deleted`: 소프트 삭제 여부

---

## 3. 주택 수요 페이지 데이터 요구사항 분석

### 필요한 데이터

#### (1) 월별, 년도별 거래량 그래프
**요구사항:**
- 월별 거래량 추이 (2년, 3년, 5년 선택 가능)
- 년도별 거래량 추이
- 전국, 수도권, 5대 광역시별 필터링

**현재 사용 가능한 API:**
- ✅ `GET /api/v1/dashboard/summary` - `volume_trend` 필드에 월별 거래량 포함
  - 단, 전국 전체만 제공 (지역별 필터링 없음)
- ✅ `GET /api/v1/apartments/{apt_id}/volume-trend` - 특정 아파트의 월별 거래량
  - 단, 아파트 단위만 제공 (지역별 집계 없음)

**새로 만들어야 하는 API:**
- ❌ `GET /api/v1/statistics/transaction-volume` - 지역별 월별/년도별 거래량 조회
  - Query Parameters:
    - `region_type`: "전국" | "수도권" | "5대광역시"
    - `period_type`: "monthly" | "yearly"
    - `year_range`: 2 | 3 | 5 (월별일 때만)
    - `start_year`: 시작 연도 (년도별일 때)
    - `end_year`: 종료 연도 (년도별일 때)

#### (2) 가격과 거래량을 기반으로 한 지역별 시장 국면 분석
**요구사항:**
- 지역별 시장 단계 분류 (상승기, 회복기, 침체기, 후퇴기)
- 가격 변화율과 거래량 변화율 기반 분석

**현재 사용 가능한 API:**
- ✅ `GET /api/v1/statistics/quadrant` - 4분면 분류 조회
  - 매매 거래량 변화율과 전월세 거래량 변화율 기반
  - 하지만 지역별 필터링이 없고, 전체 데이터만 제공
  - 시장 국면 분석에 필요한 "가격 변화율"은 포함되지 않음

**새로 만들어야 하는 API:**
- ❌ `GET /api/v1/statistics/market-phase` - 지역별 시장 국면 분석
  - Query Parameters:
    - `region_type`: "전국" | "수도권" | "5대광역시"
    - `region_id`: 특정 지역 ID (선택)
    - `period_months`: 비교 기간 (개월, 기본값: 2)
  - Response:
    - `region_name`: 지역명
    - `phase`: 시장 국면 ("상승기" | "회복기" | "침체기" | "후퇴기")
    - `price_change_rate`: 가격 변화율 (%)
    - `volume_change_rate`: 거래량 변화율 (%)
    - `trend`: "up" | "down"
    - `change`: 변화율 문자열 (예: "+1.5%")

#### (3) 주택 가격 지수
**요구사항:**
- 전국, 수도권, 5대 광역시별 주택 가격 지수
- 히트맵 형식으로 표시

**현재 사용 가능한 API:**
- ✅ `GET /api/v1/statistics/hpi` - 주택가격지수(HPI) 조회
  - `region_id` 파라미터로 특정 지역 조회 가능
  - `index_type` 파라미터로 APT/HOUSE/ALL 선택 가능
  - 하지만 "전국", "수도권", "5대 광역시" 그룹 필터링은 없음
- ✅ `GET /api/v1/statistics/hpi/heatmap` - 주택가격지수(HPI) 히트맵 조회
  - 도/시별 최신 HPI 값을 반환
  - 하지만 "전국", "수도권", "5대 광역시" 그룹 필터링은 없음

**새로 만들어야 하는 API:**
- ❌ `GET /api/v1/statistics/hpi/by-region-type` - 지역 유형별 주택 가격 지수 조회
  - Query Parameters:
    - `region_type`: "전국" | "수도권" | "5대광역시"
    - `index_type`: "APT" | "HOUSE" | "ALL" (기본값: APT)
    - `months`: 조회 기간 (개월, 기본값: 24)
  - Response:
    - 지역 유형별 평균 HPI 값
    - 또는 지역 유형 내 각 지역별 HPI 값 (히트맵용)

#### (4) 인구 순이동 실제 정보
**요구사항:**
- 전국, 수도권, 5대 광역시별 인구 순이동 데이터
- Sankey 다이어그램 형식으로 표시

**현재 사용 가능한 API:**
- ✅ `GET /api/v1/statistics/population-movements` - 인구 이동 데이터 조회
  - `region_id` 파라미터로 특정 지역 조회 가능
  - `start_ym`, `end_ym` 파라미터로 기간 필터링 가능
  - 하지만 "전국", "수도권", "5대 광역시" 그룹 필터링은 없음
  - Sankey 다이어그램용 데이터 형식은 제공하지 않음

**새로 만들어야 하는 API:**
- ❌ `GET /api/v1/statistics/population-movements/by-region-type` - 지역 유형별 인구 순이동 조회
  - Query Parameters:
    - `region_type`: "전국" | "수도권" | "5대광역시"
    - `start_ym`: 시작 년월 (YYYYMM, 선택)
    - `end_ym`: 종료 년월 (YYYYMM, 선택)
  - Response:
    - 지역 유형별 순이동 합계
    - 또는 지역 유형 내 각 지역별 순이동 데이터
- ❌ `GET /api/v1/statistics/population-movements/sankey` - Sankey 다이어그램용 인구 이동 데이터
  - Query Parameters:
    - `region_type`: "전국" | "수도권" | "5대광역시"
    - `base_ym`: 기준 년월 (YYYYMM, 선택, 기본값: 최근 3개월 평균)
  - Response:
    - Sankey 다이어그램 형식의 데이터
    - 각 지역별 순유입/순유출 정보

---

## 4. 요약

### 현재 사용 가능한 API
1. ✅ **월별 거래량**: `GET /api/v1/dashboard/summary` (전국 전체만)
2. ✅ **시장 국면 분석**: `GET /api/v1/statistics/quadrant` (전체 데이터만, 가격 변화율 없음)
3. ✅ **주택 가격 지수**: `GET /api/v1/statistics/hpi`, `GET /api/v1/statistics/hpi/heatmap` (지역 유형별 필터링 없음)
4. ✅ **인구 순이동**: `GET /api/v1/statistics/population-movements` (지역 유형별 필터링 및 Sankey 형식 없음)

### 새로 만들어야 하는 API
1. ❌ **지역별 월별/년도별 거래량**: `GET /api/v1/statistics/transaction-volume`
2. ❌ **지역별 시장 국면 분석**: `GET /api/v1/statistics/market-phase`
3. ❌ **지역 유형별 주택 가격 지수**: `GET /api/v1/statistics/hpi/by-region-type`
4. ❌ **지역 유형별 인구 순이동**: `GET /api/v1/statistics/population-movements/by-region-type`
5. ❌ **Sankey 다이어그램용 인구 이동**: `GET /api/v1/statistics/population-movements/sankey`

### 지역 유형 정의
- **전국**: 모든 지역 (필터 없음)
- **수도권**: 서울특별시 + 경기도 + 인천광역시
- **5대 광역시**: 부산광역시, 대구광역시, 광주광역시, 대전광역시, 울산광역시

### DB 설계 상태
- ✅ 거래량 데이터: `sales`, `rents` 테이블에 저장됨
- ✅ 주택 가격 지수: `house_scores` 테이블에 저장됨
- ✅ 인구 이동: `population_movements` 테이블에 저장됨
- ✅ 지역 정보: `states` 테이블에 `city_name` 필드로 시도 정보 저장됨

**결론**: DB 설계는 충분하지만, 지역 유형별(전국/수도권/5대광역시) 집계 및 필터링 기능이 API에 구현되어 있지 않아 새로운 API 개발이 필요합니다.
