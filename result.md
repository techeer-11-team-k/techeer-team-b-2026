# API 명세서

> 이 문서는 실제 백엔드 및 프론트엔드 구현을 기반으로 작성되었습니다.
> 마지막 업데이트: 2026-01-11

| # | 속성 | Auth | Description | Endpoint | Method | Priority | 백엔드/프론트엔드 | 담당자 | 상태 |
|---|------|------|-------------|----------|--------|----------|------------------|--------|------|
| 1 | Auth | ❌ | Clerk 웹훅 (사용자 동기화) | `/api/v1/auth/webhook` | POST | P0 | 백엔드 | - | 완료 |
| 2-1 | Auth | ✅ | 내 프로필 조회 (백엔드) | `/api/v1/auth/me` | GET | P0 | 백엔드 | - | 완료 |
| 2-2 | Auth | ✅ | 내 프로필 조회 (프론트엔드) | `/api/v1/auth/me` | GET | P0 | 프론트엔드 | - | 완료 |
| 3-1 | Auth | ✅ | 내 프로필 수정 (백엔드) | `/api/v1/auth/me` | PATCH | P0 | 백엔드 | - | 완료 |
| 3-2 | Auth | ✅ | 내 프로필 수정 (프론트엔드) | `/api/v1/auth/me` | PATCH | P0 | 프론트엔드 | - | 완료 |
| 4 | Apartments | ❌ | 지역별 아파트 목록 조회 | `/api/v1/apartments?region_id={id}&limit={limit}&skip={skip}` | GET | P0 | 백엔드 | 김강문 | 완료 |
| 5-1 | Apartments | ❌ | 아파트 기본 정보 상세 (백엔드) | `/api/v1/apartments/{apt_id}` | GET | P0 | 백엔드 | 조수아 | 완료 |
| 5-2 | Apartments | ❌ | 아파트 기본 정보 상세 (프론트엔드) | `/api/v1/apartments/{apt_id}` | GET | P0 | 프론트엔드 | 조수아 | 완료 |
| 6-1 | Apartments | ❌ | 아파트 실거래 내역과 추이 (백엔드) | `/api/v1/apartments/{apt_id}/transactions?transaction_type={sale\|jeonse}&limit={limit}&months={months}` | GET | P0 | 백엔드 | 김강문 | 완료 |
| 6-2 | Apartments | ❌ | 아파트 실거래 내역과 추이 (프론트엔드) | `/api/v1/apartments/{apt_id}/transactions?transaction_type={sale\|jeonse}&limit={limit}&months={months}` | GET | P0 | 프론트엔드 | 김강문 | 완료 |
| 7 | Apartments | ❌ | 유사 단지 비교 | `/api/v1/apartments/{apt_id}/similar?limit={limit}` | GET | P2 | 백엔드 | 조항중 | 완료 |
| 8 | Apartments | ❌ | 주변 500m 아파트 비교 | `/api/v1/apartments/{apt_id}/nearby-comparison?radius_meters={radius}&months={months}` | GET | P2 | 백엔드 | 조항중 | 완료 |
| 9 | Apartments | ❌ | 주변 아파트 평균 가격 | `/api/v1/apartments/{apt_id}/nearby_price?months={months}` | GET | P1 | 백엔드 | 조항중 | 완료 |
| 10 | Apartments | ❌ | 주소를 좌표로 변환하여 geometry 일괄 업데이트 | `/api/v1/apartments/geometry?limit={limit}&batch_size={size}` | POST | P2 | 백엔드 | - | 완료 |
| 11-1 | Search | ❌ | 아파트명 검색 (백엔드) | `/api/v1/search/apartments?q={query}&limit={limit}&threshold={threshold}` | GET | P0 | 백엔드 | 박찬영 | 완료 |
| 11-2 | Search | ❌ | 아파트명 검색 (프론트엔드) | `/api/v1/search/apartments?q={query}&limit={limit}&threshold={threshold}` | GET | P0 | 프론트엔드 | 박찬영 | 완료 |
| 12-1 | Search | ❌ | 지역 검색 (백엔드) | `/api/v1/search/locations?q={query}&location_type={sigungu\|dong}&limit={limit}` | GET | P0 | 백엔드 | 박찬영 | 완료 |
| 12-2 | Search | ❌ | 지역 검색 (프론트엔드) | `/api/v1/search/locations?q={query}&location_type={sigungu\|dong}&limit={limit}` | GET | P0 | 프론트엔드 | 박찬영 | 완료 |
| 13-1 | Search | ✅ | 최근 검색어 저장 (백엔드) | `/api/v1/search/recent` | POST | P1 | 백엔드 | 박찬영 | 완료 |
| 13-2 | Search | ✅ | 최근 검색어 저장 (프론트엔드) | `/api/v1/search/recent` | POST | P1 | 프론트엔드 | 박찬영 | 완료 |
| 14-1 | Search | ✅ | 최근 검색어 조회 (백엔드) | `/api/v1/search/recent?limit={limit}` | GET | P1 | 백엔드 | 박찬영 | 완료 |
| 14-2 | Search | ✅ | 최근 검색어 조회 (프론트엔드) | `/api/v1/search/recent?limit={limit}` | GET | P1 | 프론트엔드 | 박찬영 | 완료 |
| 15-1 | Search | ✅ | 최근 검색어 삭제 (백엔드) | `/api/v1/search/recent/{search_id}` | DELETE | P1 | 백엔드 | 박찬영 | 완료 |
| 15-2 | Search | ✅ | 최근 검색어 삭제 (프론트엔드) | `/api/v1/search/recent/{search_id}` | DELETE | P1 | 프론트엔드 | 박찬영 | 완료 |
| 16-1 | Favorites | ✅ | 관심 지역 목록 (백엔드) | `/api/v1/favorites/locations?skip={skip}&limit={limit}` | GET | P1 | 백엔드 | 조항중 | 완료 |
| 16-2 | Favorites | ✅ | 관심 지역 목록 (프론트엔드) | `/api/v1/favorites/locations?skip={skip}&limit={limit}` | GET | P1 | 프론트엔드 | 조항중 | 완료 |
| 17-1 | Favorites | ✅ | 관심 지역 추가 (백엔드) | `/api/v1/favorites/locations` | POST | P1 | 백엔드 | 조항중 | 완료 |
| 17-2 | Favorites | ✅ | 관심 지역 추가 (프론트엔드) | `/api/v1/favorites/locations` | POST | P1 | 프론트엔드 | 조항중 | 완료 |
| 18-1 | Favorites | ✅ | 관심 지역 삭제 (백엔드) | `/api/v1/favorites/locations/{region_id}` | DELETE | P1 | 백엔드 | 조항중 | 완료 |
| 18-2 | Favorites | ✅ | 관심 지역 삭제 (프론트엔드) | `/api/v1/favorites/locations/{region_id}` | DELETE | P1 | 프론트엔드 | 조항중 | 완료 |
| 19-1 | Favorites | ✅ | 관심 아파트 목록 (백엔드) | `/api/v1/favorites/apartments?skip={skip}&limit={limit}` | GET | P1 | 백엔드 | 조항중 | 완료 |
| 19-2 | Favorites | ✅ | 관심 아파트 목록 (프론트엔드) | `/api/v1/favorites/apartments?skip={skip}&limit={limit}` | GET | P1 | 프론트엔드 | 조항중 | 완료 |
| 20-1 | Favorites | ✅ | 관심 아파트 추가 (백엔드) | `/api/v1/favorites/apartments` | POST | P1 | 백엔드 | 조항중 | 완료 |
| 20-2 | Favorites | ✅ | 관심 아파트 추가 (프론트엔드) | `/api/v1/favorites/apartments` | POST | P1 | 프론트엔드 | 조항중 | 완료 |
| 21 | Favorites | ✅ | 관심 아파트 수정 | `/api/v1/favorites/apartments/{favorite_id}` | PUT | P1 | 백엔드 | 조항중 | 완료 |
| 22-1 | Favorites | ✅ | 관심 아파트 삭제 (백엔드) | `/api/v1/favorites/apartments/{apt_id}` | DELETE | P1 | 백엔드 | 조항중 | 완료 |
| 22-2 | Favorites | ✅ | 관심 아파트 삭제 (프론트엔드) | `/api/v1/favorites/apartments/{apt_id}` | DELETE | P1 | 프론트엔드 | 조항중 | 완료 |
| 23-1 | My Properties | ✅ | 내 집 목록 (백엔드) | `/api/v1/my-properties?skip={skip}&limit={limit}` | GET | P1 | 백엔드 | 조항중 | 완료 |
| 23-2 | My Properties | ✅ | 내 집 목록 (프론트엔드) | `/api/v1/my-properties?skip={skip}&limit={limit}` | GET | P1 | 프론트엔드 | 조항중 | 완료 |
| 24-1 | My Properties | ✅ | 내 집 등록 (백엔드) | `/api/v1/my-properties` | POST | P1 | 백엔드 | 조항중 | 완료 |
| 24-2 | My Properties | ✅ | 내 집 등록 (프론트엔드) | `/api/v1/my-properties` | POST | P1 | 프론트엔드 | 조항중 | 완료 |
| 25-1 | My Properties | ✅ | 내 집 상세 (백엔드) | `/api/v1/my-properties/{id}` | GET | P1 | 백엔드 | 조항중 | 완료 |
| 25-2 | My Properties | ✅ | 내 집 상세 (프론트엔드) | `/api/v1/my-properties/{id}` | GET | P1 | 프론트엔드 | 조항중 | 완료 |
| 26-1 | My Properties | ✅ | 내 집 정보 수정 (백엔드) | `/api/v1/my-properties/{id}` | PUT | P1 | 백엔드 | - | 완료 |
| 26-2 | My Properties | ✅ | 내 집 정보 수정 (프론트엔드) | `/api/v1/my-properties/{id}` | PUT | P1 | 프론트엔드 | - | 완료 |
| 27-1 | My Properties | ✅ | 내 집 삭제 (백엔드) | `/api/v1/my-properties/{id}` | DELETE | P1 | 백엔드 | 조항중 | 완료 |
| 27-2 | My Properties | ✅ | 내 집 삭제 (프론트엔드) | `/api/v1/my-properties/{id}` | DELETE | P1 | 프론트엔드 | 조항중 | 완료 |
| 28 | My Properties | ✅ | 동일 단지 최근 거래 | `/api/v1/my-properties/{id}/recent-transactions?transaction_type={sale\|jeonse}&limit={limit}` | GET | P1 | 백엔드 | 정조셉 | 완료 |
| 29 | My Properties | ✅ | 내 집 시세 추이 (6개월) | `/api/v1/my-properties/{id}/trend?transaction_type={sale\|jeonse}&months={months}` | GET | P1 | 백엔드 | 조항중 | 진행 중 |
| 30-1 | Dashboard | ❌ | 전국 평당가, 거래량 추이, 월간 아파트 값 추이 (백엔드) | `/api/v1/dashboard/summary?transaction_type={sale\|jeonse}&months={months}` | GET | P1 | 백엔드 | 김강문 | 완료 |
| 30-2 | Dashboard | ❌ | 전국 평당가, 거래량 추이, 월간 아파트 값 추이 (프론트엔드) | `/api/v1/dashboard/summary?transaction_type={sale\|jeonse}&months={months}` | GET | P1 | 프론트엔드 | 김강문 | 완료 |
| 31-1 | Dashboard | ❌ | 랭킹 (요즘 관심 많은 아파트, 상승률, 하락률 TOP 5) (백엔드) | `/api/v1/dashboard/rankings?transaction_type={sale\|jeonse}&trending_days={days}&trend_months={months}` | GET | P1 | 백엔드 | 김강문 | 완료 |
| 31-2 | Dashboard | ❌ | 랭킹 (요즘 관심 많은 아파트, 상승률, 하락률 TOP 5) (프론트엔드) | `/api/v1/dashboard/rankings?transaction_type={sale\|jeonse}&trending_days={days}&trend_months={months}` | GET | P1 | 프론트엔드 | 김강문 | 완료 |
| 32-1 | Dashboard | ❌ | 지역별 상승률 히트맵 데이터 (백엔드) | `/api/v1/dashboard/regional-heatmap?transaction_type={sale\|jeonse}&months={months}` | GET | P2 | 백엔드 | - | 완료 |
| 32-2 | Dashboard | ❌ | 지역별 상승률 히트맵 데이터 (프론트엔드) | `/api/v1/dashboard/regional-heatmap?transaction_type={sale\|jeonse}&months={months}` | GET | P2 | 프론트엔드 | - | 완료 |
| 33-1 | Dashboard | ❌ | 지역별 집값 변화 추이 (백엔드) | `/api/v1/dashboard/regional-trends?transaction_type={sale\|jeonse}&months={months}` | GET | P2 | 백엔드 | - | 완료 |
| 33-2 | Dashboard | ❌ | 지역별 집값 변화 추이 (프론트엔드) | `/api/v1/dashboard/regional-trends?transaction_type={sale\|jeonse}&months={months}` | GET | P2 | 프론트엔드 | - | 완료 |
| 34-1 | Dashboard | ❌ | 가격대별 아파트 분포 (히스토그램용) (백엔드) | `/api/v1/dashboard/advanced-charts/price-distribution?transaction_type={sale\|jeonse}` | GET | P2 | 백엔드 | - | 완료 |
| 34-2 | Dashboard | ❌ | 가격대별 아파트 분포 (히스토그램용) (프론트엔드) | `/api/v1/dashboard/advanced-charts/price-distribution?transaction_type={sale\|jeonse}` | GET | P2 | 프론트엔드 | - | 완료 |
| 35-1 | Dashboard | ❌ | 지역별 가격 상관관계 (버블 차트용) (백엔드) | `/api/v1/dashboard/advanced-charts/regional-price-correlation?transaction_type={sale\|jeonse}&months={months}` | GET | P2 | 백엔드 | - | 완료 |
| 35-2 | Dashboard | ❌ | 지역별 가격 상관관계 (버블 차트용) (프론트엔드) | `/api/v1/dashboard/advanced-charts/regional-price-correlation?transaction_type={sale\|jeonse}&months={months}` | GET | P2 | 프론트엔드 | - | 완료 |
| 36 | Users | ✅ | 내 프로필 조회 | `/api/v1/users/me` | GET | P1 | 백엔드 | - | 완료 |
| 37 | Users | ✅ | 내 프로필 수정 | `/api/v1/users/me` | PATCH | P1 | 백엔드 | - | 완료 |
| 38 | Users | ✅ | 프로필 이미지 업로드 | `/api/v1/users/me/profile-image` | POST | P2 | 백엔드 | - | 완료 |
| 39 | Users | ✅ | 최근 본 아파트 목록 | `/api/v1/users/me/recent-views?limit={limit}` | GET | P1 | 백엔드 | 박찬영 | 진행 중 |
| 40 | Users | ✅ | 회원 탈퇴 | `/api/v1/users/me` | DELETE | P1 | 백엔드 | - | 완료 |
| 41 | News | ❌ | 뉴스 목록 | `/api/v1/news?page={page}&limit={limit}` | GET | P2 | 백엔드 | 조수아 | 완료 |
| 42 | News | ❌ | 뉴스 상세 | `/api/v1/news/detail?url={url}` | GET | P2 | 백엔드 | 조수아 | 완료 |
| 43 | News | ✅ | 뉴스 북마크 | `/api/v1/news/{id}/bookmark` | POST | P2 | 백엔드 | - | 시작 전 |
| 44 | News | ✅ | 북마크 삭제 | `/api/v1/news/{id}/bookmark` | DELETE | P2 | 백엔드 | - | 시작 전 |
| 45 | AI | ✅ | 내 집 자랑 (AI 요약) | `/api/v1/ai/summary/my-property?property_id={id}` | POST | P2 | 백엔드 | 조항중 | 완료 |
| 46 | AI | ❌ | 아파트 정보 AI 요약 | `/api/v1/ai/summary/apartment?apt_id={id}` | POST | P2 | 백엔드 | 조항중 | 완료 |
| 47 | AI | ❌ | 뉴스 AI 요약 | `/api/v1/ai/summary/news` | POST | P2 | 백엔드 | 조항중 | 진행 중 |
| 48 | AI | ❌ | AI 조건 기반 아파트 탐색 | `/api/v1/ai/search` | POST | P2 | 백엔드 | - | 시작 전 |
| 49 | Admin | ❌ | 모든 계정 조회 (개발용) | `/api/v1/admin/accounts?skip={skip}&limit={limit}` | GET | P2 | 백엔드 | - | 완료 |
| 50 | Admin | ❌ | 특정 계정 조회 (개발용) | `/api/v1/admin/accounts/{id}` | GET | P2 | 백엔드 | - | 완료 |
| 51 | Admin | ❌ | 계정 삭제 - 소프트 삭제 (개발용) | `/api/v1/admin/accounts/{id}` | DELETE | P2 | 백엔드 | - | 완료 |
| 52 | Admin | ❌ | 계정 하드 삭제 (개발용) | `/api/v1/admin/accounts/{id}/hard` | DELETE | P2 | 백엔드 | - | 완료 |
| 53 | Admin | ❌ | 테이블 목록 조회 (개발용) | `/api/v1/admin/db/tables` | GET | P2 | 백엔드 | - | 완료 |
| 54 | Admin | ❌ | 테이블 데이터 조회 (개발용) | `/api/v1/admin/db/query?table={table}&skip={skip}&limit={limit}` | GET | P2 | 백엔드 | - | 완료 |
| 55 | Data Collection | admin | 법정동(시군구동) 코드 수집 및 적재 | `/api/v1/data-collection/regions` | POST | P0 | 백엔드 | 김강문 | 완료 |
| 56 | Data Collection | admin | 아파트 단지 목록 수집 (법정동코드 기준) | `/api/v1/data-collection/apartments/list` | POST | P0 | 백엔드 | 김강문 | 완료 |
| 57 | Data Collection | admin | 아파트 상세정보 수집 및 적재 | `/api/v1/data-collection/apartments/detail` | POST | P0 | 백엔드 | 김강문 | 완료 |
| 58 | Data Collection | admin | 아파트 매매 거래 수집 및 적재 | `/api/v1/data-collection/transactions/sale` | POST | P0 | 백엔드 | 김강문 | 완료 |
| 59 | Data Collection | admin | 아파트 전월세 거래 수집 및 적재 | `/api/v1/data-collection/transactions/rent` | POST | P0 | 백엔드 | 정조셉 | 완료 |
| 60 | Data Collection | admin | 지역별 주택가격지수 수집 및 적재 | `/api/v1/data-collection/house-scores` | POST | P0 | 백엔드 | 김민성 | 완료 |
| 61 | Data Collection | admin | 수집 작업 상태 조회 | `/api/v1/data-collection/jobs/{job_id}` | GET | P0 | 백엔드 | 김강문 | 완료 |

---

## 부연설명

### 인증 (Auth)

- **#1 `/api/v1/auth/webhook`**: Clerk에서 사용자 생성/업데이트/삭제 이벤트를 받아 백엔드 DB와 동기화합니다. 웹훅 서명 검증을 통해 보안을 보장합니다.
- **#2, #3 `/api/v1/auth/me`**: 내 프로필 조회/수정 엔드포인트입니다. 프론트엔드(`frontend/src/hooks/useProfile.ts`)와 백엔드(`backend/app/api/v1/endpoints/auth.py`) 모두에서 사용됩니다. Clerk JWT 토큰이 필요하며, Redis 캐싱을 사용합니다.

### 아파트 (Apartments)

- **#4 `/api/v1/apartments`**: 지역별 아파트 목록을 조회합니다. `region_id` 파라미터로 특정 지역의 아파트를 필터링할 수 있습니다.
- **#5 `/api/v1/apartments/{apt_id}`**: 아파트 상세 정보를 조회합니다. 프론트엔드에서도 사용되며, 캐싱이 적용되어 있습니다.
- **#6 `/api/v1/apartments/{apt_id}/transactions`**: 아파트의 실거래 내역과 가격 추이를 조회합니다. `transaction_type` 파라미터로 매매(`sale`) 또는 전세(`jeonse`)를 선택할 수 있습니다. 프론트엔드에서도 사용됩니다.
- **#7 `/api/v1/apartments/{apt_id}/similar`**: 유사한 조건의 아파트를 조회합니다. 같은 지역, 비슷한 세대수, 동수를 기준으로 찾습니다.
- **#8 `/api/v1/apartments/{apt_id}/nearby-comparison`**: 기준 아파트로부터 지정된 반경 내의 주변 아파트들을 거리순으로 조회합니다. PostGIS 공간 쿼리를 사용합니다.
- **#9 `/api/v1/apartments/{apt_id}/nearby_price`**: 같은 지역의 주변 아파트들의 평균 거래가격을 조회합니다.
- **#10 `/api/v1/apartments/geometry`**: 주소를 좌표로 변환하여 geometry 컬럼을 일괄 업데이트합니다. 카카오 API를 사용합니다.

### 검색 (Search)

- **#11 `/api/v1/search/apartments`**: 아파트명으로 검색합니다. pg_trgm 유사도 검색을 사용하여 오타, 공백, 부분 매칭을 지원합니다. 프론트엔드(`frontend/src/lib/searchApi.ts`)에서 사용됩니다.
- **#12 `/api/v1/search/locations`**: 지역명(시/군/구/동)으로 검색합니다. `location_type` 파라미터로 시군구만 또는 동만 필터링할 수 있습니다. 프론트엔드에서 사용됩니다.
- **#13, #14, #15 `/api/v1/search/recent`**: 최근 검색어를 저장/조회/삭제합니다. 로그인한 사용자의 경우 아파트/지역 검색 시 자동으로 최근 검색어에 저장됩니다. 프론트엔드에서 사용됩니다.

### 관심 매물/지역 (Favorites)

- **#16, #17, #18 `/api/v1/favorites/locations`**: 관심 지역을 조회/추가/삭제합니다. 최대 50개까지 저장 가능합니다. 프론트엔드에서 사용됩니다.
- **#19, #20, #21, #22 `/api/v1/favorites/apartments`**: 관심 아파트를 조회/추가/수정/삭제합니다. 최대 100개까지 저장 가능합니다. 관심 아파트 삭제는 `apt_id`를 사용합니다. 프론트엔드에서 사용됩니다.

### 내 집 (My Properties)

- **#23~#27 `/api/v1/my-properties`**: 내 집 목록/등록/상세/수정/삭제를 제공합니다. 최대 100개까지 저장 가능합니다. 프론트엔드에서 사용됩니다.
- **#28 `/api/v1/my-properties/{id}/recent-transactions`**: 동일 단지의 최근 거래 내역을 조회합니다.
- **#29 `/api/v1/my-properties/{id}/trend`**: 내 집의 시세 추이를 조회합니다. 현재 진행 중입니다.

### 대시보드 (Dashboard)

- **#30 `/api/v1/dashboard/summary`**: 전국 평당가 및 거래량 추이, 월간 아파트 값 추이를 조회합니다. 프론트엔드(`frontend/src/lib/dashboardApi.ts`)에서 사용됩니다.
- **#31 `/api/v1/dashboard/rankings`**: 요즘 관심 많은 아파트, 상승률 TOP 5, 하락률 TOP 5를 조회합니다. 프론트엔드에서 사용됩니다.
- **#32 `/api/v1/dashboard/regional-heatmap`**: 도/특별시/광역시 단위로 지역별 가격 상승률을 조회합니다. 프론트엔드에서 사용됩니다.
- **#33 `/api/v1/dashboard/regional-trends`**: 도/특별시/광역시 단위로 지역별 집값 변화 추이를 조회합니다. 프론트엔드에서 사용됩니다.
- **#34 `/api/v1/dashboard/advanced-charts/price-distribution`**: 가격대별 아파트 분포를 조회합니다. HighChart 히스토그램에 사용됩니다. 프론트엔드에서 사용됩니다.
- **#35 `/api/v1/dashboard/advanced-charts/regional-price-correlation`**: 지역별 평균 가격, 거래량, 상승률을 조회합니다. HighChart 버블 차트에 사용됩니다. 프론트엔드에서 사용됩니다.

### 사용자 (Users)

- **#36, #37 `/api/v1/users/me`**: 내 프로필 조회/수정 엔드포인트입니다. 실제로는 `/auth/me`가 주로 사용되지만, 백엔드에 구현되어 있습니다.
- **#38 `/api/v1/users/me/profile-image`**: 프로필 이미지를 업로드합니다.
- **#39 `/api/v1/users/me/recent-views`**: 최근 본 아파트 목록을 조회합니다. 현재 진행 중입니다.
- **#40 `/api/v1/users/me`**: 회원 탈퇴를 처리합니다.

### 뉴스 (News)

- **#41 `/api/v1/news`**: 뉴스 목록을 조회합니다. 크롤링 기반이며 DB 저장이 없습니다.
- **#42 `/api/v1/news/detail`**: 뉴스 상세를 조회합니다. URL을 파라미터로 받습니다.
- **#43, #44 `/api/v1/news/{id}/bookmark`**: 뉴스 북마크를 추가/삭제합니다. 현재 시작 전 상태입니다.

### AI (인공지능)

- **#45 `/api/v1/ai/summary/my-property`**: AI를 사용하여 내 집에 대한 칭찬글을 생성합니다. Gemini AI를 사용하며 캐싱이 적용되어 있습니다.
- **#46 `/api/v1/ai/summary/apartment`**: 아파트 정보를 AI로 요약합니다.
- **#47 `/api/v1/ai/summary/news`**: 뉴스를 AI로 요약합니다. 현재 진행 중입니다.
- **#48 `/api/v1/ai/search`**: AI 조건 기반 아파트 탐색을 제공합니다. 현재 시작 전 상태입니다.

### 관리자 (Admin)

- **#49~#54 `/api/v1/admin/*`**: 개발/테스트 환경에서 사용하는 관리자 API입니다. 계정 조회/삭제, DB 테이블 조회 등을 제공합니다. 프로덕션 환경에서는 인증을 추가하거나 비활성화해야 합니다.

### 데이터 수집 (Data Collection)

- **#55~#60 `/api/v1/data-collection/*`**: 국토교통부 API에서 데이터를 수집하여 데이터베이스에 저장하는 API입니다. 관리자 권한이 필요하며, MOLIT_API_KEY, REB_API_KEY 등 외부 API 키가 필요합니다.
- **#61 `/api/v1/data-collection/jobs/{job_id}`**: 수집 작업의 상태를 조회합니다.

---

## 공통 사항

### 인증 방식
- Clerk JWT 토큰을 사용합니다.
- Authorization 헤더에 `Bearer {token}` 형식으로 전달합니다.
- 인증이 필요한 엔드포인트는 `✅`로 표시되어 있습니다.

### 응답 형식
모든 API는 다음 공통 응답 형식을 사용합니다:

```json
{
  "success": true,
  "data": { ... },
  "meta": { ... }  // 선택적
}
```

### 에러 응답
```json
{
  "detail": {
    "code": "ERROR_CODE",
    "message": "에러 메시지"
  }
}
```

### 캐싱
- Redis 캐싱을 사용하여 성능을 최적화합니다.
- 대부분의 조회 API는 캐싱이 적용되어 있습니다.

### 페이지네이션
- `skip`: 건너뛸 레코드 수 (기본값: 0)
- `limit`: 가져올 레코드 수 (기본값: 10~50, 최대값: 50~100)

### 거래 유형 (transaction_type)
- `sale`: 매매
- `jeonse`: 전세

---

## 제거된/변경된 엔드포인트

다음 엔드포인트들은 CSV에 있었지만 실제 구현과 다르거나 제거되었습니다:

1. **`/map/apartments`** - 지도 화면 내 아파트 마커 조회
   - 실제로는 `/apartments?region_id={id}` 엔드포인트를 사용합니다.

2. **`/map/apartments/{apt_id}/summary`** - 마커 클릭 시 간단 정보
   - 실제로는 `/apartments/{apt_id}` 엔드포인트를 사용합니다.

3. **`/apartments/{apt_id}/price-trend`** - 평당가 추이 차트 데이터
   - 실제로는 `/apartments/{apt_id}/transactions` 엔드포인트의 `price_trend` 필드에 포함됩니다.

4. **`/apartments/{apt_id}/volume-trend`** - 거래량 추이 차트 데이터
   - 실제로는 `/apartments/{apt_id}/transactions` 엔드포인트의 `price_trend` 필드에 포함됩니다.

5. **`/search/recent/s`** - 최근 검색어 저장 (CSV 20-1)
   - 실제로는 `/search/recent` (POST) 엔드포인트를 사용합니다.

6. **`/indicators/jeonse-ratio`** - 전세가율 조회
   - 실제로는 구현되지 않았습니다.

7. **`/indicators/house-scores/{id}/{YYYYMM}`** - 주택매매가격지수 지역별 정리
   - 실제로는 구현되지 않았습니다.

8. **`/indicators/jeonse-ratio/calculate`** - 전세가율 계산 (입력값)
   - 실제로는 구현되지 않았습니다.

9. **`/indicators/regional-comparison`** - 지역별 지표 비교
   - 실제로는 구현되지 않았습니다.

---

## 변경 이력

- 2026-01-11: 초기 작성
  - CSV 파일을 기반으로 실제 구현과 비교하여 개선
  - 백엔드/프론트엔드 구분 추가
  - 누락된 엔드포인트 추가
  - 잘못된 정보 수정
  - 하나의 통합 표로 재구성
