# 📋 API 개발 체크리스트

> **최종 수정일**: 2026-01-11  
> **총 API 개수**: 55개  
> **Notion 복사 방법**: 아래 테이블을 전체 선택(Ctrl+A) 후 복사(Ctrl+C)하여 Notion 페이지에 붙여넣기(Ctrl+V)

---

## 📊 전체 API 목록 (Notion 데이터베이스용)

| # | Category | Method | Endpoint | Description | Auth | Priority | Status | Assignee | Due Date | Notes |
|---|----------|--------|----------|-------------|:----:|:--------:|:------:|----------|----------|-------|
| 1 | Auth | POST | /auth/register | 회원가입 | ❌ | P0 | ⬜ |  |  |  |
| 2 | Auth | POST | /auth/login | 로그인 | ❌ | P0 | ⬜ |  |  |  |
| 3 | Auth | POST | /auth/refresh | 토큰 갱신 | ✅ | P0 | ⬜ |  |  |  |
| 4 | Auth | POST | /auth/logout | 로그아웃 | ✅ | P0 | ⬜ |  |  |  |
| 5 | Auth | POST | /auth/password/reset-request | 비밀번호 재설정 요청 | ❌ | P1 | ⬜ |  |  |  |
| 6 | Auth | POST | /auth/password/reset | 비밀번호 재설정 완료 | ❌ | P1 | ⬜ |  |  |  |
| 7 | Auth | PUT | /auth/password | 비밀번호 변경 (로그인 상태) | ✅ | P1 | ⬜ |  |  |  |
| 8 | Map | GET | /map/apartments | 지도 화면 내 아파트 마커 조회 | ❌ | P0 | ⬜ |  |  |  |
| 9 | Map | GET | /map/apartments/{apt_id}/summary | 마커 클릭 시 간단 정보 | ❌ | P0 | ⬜ |  |  |  |
| 10 | Map | GET | /map/heatmap | 가격 히트맵 데이터 | ❌ | P2 | ⬜ |  |  |  |
| 11 | Apartments | GET | /apartments/{apt_id} | 아파트 기본 정보 상세 | ❌ | P0 | ⬜ |  |  |  |
| 12 | Apartments | GET | /apartments/{apt_id}/transactions | 실거래 내역 (페이지네이션) | ❌ | P0 | ⬜ |  |  |  |
| 13 | Apartments | GET | /apartments/{apt_id}/price-trend | 평당가 추이 차트 데이터 | ❌ | P0 | ⬜ |  |  |  |
| 14 | Apartments | GET | /apartments/{apt_id}/volume-trend | 거래량 추이 차트 데이터 | ❌ | P1 | ⬜ |  |  |  |
| 15 | Apartments | GET | /apartments/{apt_id}/nearby-comparison | 주변 500m 아파트 비교 | ❌ | P2 | ⬜ |  |  |  |
| 16 | Apartments | GET | /apartments/{apt_id}/similar | 유사 단지 비교 | ❌ | P2 | ⬜ |  |  |  |
| 17 | Search | GET | /search/apartments | 아파트명 검색 (자동완성) | ❌ | P0 | ⬜ |  |  |  |
| 18 | Search | GET | /search/locations | 지역 검색 (시/군/구/동) | ❌ | P0 | ⬜ |  |  |  |
| 19 | Search | GET | /search/recent | 최근 검색어 조회 | ✅ | P1 | ⬜ |  |  |  |
| 20 | Search | DELETE | /search/recent/{id} | 최근 검색어 삭제 | ✅ | P1 | ⬜ |  |  |  |
| 21 | Dashboard | GET | /dashboard/summary | 핵심 지표 요약 (거래량, 평균가 등) | ❌ | P1 | ⬜ |  |  |  |
| 22 | Dashboard | GET | /dashboard/rankings | 랭킹 (상승률/하락률/거래량/가격) | ❌ | P1 | ⬜ |  |  |  |
| 23 | Favorites | GET | /favorites/apartments | 관심 아파트 목록 | ✅ | P1 | ⬜ |  |  |  |
| 24 | Favorites | POST | /favorites/apartments | 관심 아파트 추가 | ✅ | P1 | ⬜ |  |  |  |
| 25 | Favorites | DELETE | /favorites/apartments/{apt_id} | 관심 아파트 삭제 | ✅ | P1 | ⬜ |  |  |  |
| 26 | Favorites | GET | /favorites/locations | 관심 지역 목록 | ✅ | P1 | ⬜ |  |  |  |
| 27 | Favorites | POST | /favorites/locations | 관심 지역 추가 | ✅ | P1 | ⬜ |  |  |  |
| 28 | Favorites | DELETE | /favorites/locations/{id} | 관심 지역 삭제 | ✅ | P1 | ⬜ |  |  |  |
| 29 | My Properties | GET | /my-properties | 내 집 목록 | ✅ | P1 | ⬜ |  |  |  |
| 30 | My Properties | POST | /my-properties | 내 집 등록 | ✅ | P1 | ⬜ |  |  |  |
| 31 | My Properties | GET | /my-properties/{id} | 내 집 상세 | ✅ | P1 | ⬜ |  |  |  |
| 32 | My Properties | GET | /my-properties/{id}/trend | 내 집 시세 추이 (6개월) | ✅ | P1 | ⬜ |  |  |  |
| 33 | My Properties | GET | /my-properties/{id}/recent-transactions | 동일 단지 최근 거래 | ✅ | P1 | ⬜ |  |  |  |
| 34 | My Properties | PUT | /my-properties/{id} | 내 집 정보 수정 | ✅ | P1 | ⬜ |  |  |  |
| 35 | My Properties | DELETE | /my-properties/{id} | 내 집 삭제 | ✅ | P1 | ⬜ |  |  |  |
| 36 | Indicators | GET | /indicators/house-price-index | 주택매매가격지수 | ❌ | P1 | ⬜ |  |  |  |
| 37 | Indicators | GET | /indicators/jeonse-ratio | 전세가율 조회 | ❌ | P1 | ⬜ |  |  |  |
| 38 | Indicators | POST | /indicators/jeonse-ratio/calculate | 전세가율 계산 (입력값) | ❌ | P2 | ⬜ |  |  |  |
| 39 | Indicators | GET | /indicators/regional-comparison | 지역별 지표 비교 | ❌ | P2 | ⬜ |  |  |  |
| 40 | Users | GET | /users/me | 내 프로필 조회 | ✅ | P1 | ⬜ |  |  |  |
| 41 | Users | PATCH | /users/me | 내 프로필 수정 | ✅ | P1 | ⬜ |  |  |  |
| 42 | Users | GET | /users/me/recent-views | 최근 본 아파트 목록 | ✅ | P1 | ⬜ |  |  |  |
| 43 | Users | DELETE | /users/me | 회원 탈퇴 | ✅ | P1 | ⬜ |  |  |  |
| 44 | Users | POST | /users/me/profile-image | 프로필 이미지 업로드 | ✅ | P2 | ⬜ |  |  |  |
| 45 | News | GET | /news | 뉴스 목록 | ❌ | P2 | ⬜ |  |  |  |
| 46 | News | GET | /news/{id} | 뉴스 상세 | ❌ | P2 | ⬜ |  |  |  |
| 47 | News | POST | /news/{id}/bookmark | 뉴스 북마크 | ✅ | P2 | ⬜ |  |  |  |
| 48 | News | DELETE | /news/{id}/bookmark | 북마크 삭제 | ✅ | P2 | ⬜ |  |  |  |
| 49 | Tools | POST | /tools/loan-calculator | 대출 계산기 | ❌ | P2 | ⬜ |  |  |  |
| 50 | Tools | GET | /tools/glossary | 용어 사전 목록 | ❌ | P2 | ⬜ |  |  |  |
| 51 | Tools | GET | /tools/glossary/{id} | 용어 상세 | ❌ | P2 | ⬜ |  |  |  |
| 52 | AI | POST | /ai/search | AI 조건 기반 아파트 탐색 | ❌ | P2 | ⬜ |  |  |  |
| 53 | AI | POST | /ai/summary/apartment | 아파트 정보 AI 요약 | ❌ | P2 | ⬜ |  |  |  |
| 54 | AI | POST | /ai/summary/my-property | 내 집 자랑 (AI 요약) | ✅ | P2 | ⬜ |  |  |  |
| 55 | AI | POST | /ai/summary/news | 뉴스 AI 요약 | ❌ | P2 | ⬜ |  |  |  |

---

## 📈 진행률 요약

| Priority | Total | Done | Progress |
|:--------:|:-----:|:----:|:--------:|
| 🔴 P0 | 11 | 0 | 0% |
| 🟡 P1 | 27 | 0 | 0% |
| 🟢 P2 | 17 | 0 | 0% |
| **합계** | **55** | **0** | **0%** |

---

## 📂 카테고리별 요약

| Category | Total | P0 | P1 | P2 |
|----------|:-----:|:--:|:--:|:--:|
| Auth | 7 | 4 | 3 | 0 |
| Map | 3 | 2 | 0 | 1 |
| Apartments | 6 | 3 | 1 | 2 |
| Search | 4 | 2 | 2 | 0 |
| Dashboard | 2 | 0 | 2 | 0 |
| Favorites | 6 | 0 | 6 | 0 |
| My Properties | 7 | 0 | 7 | 0 |
| Indicators | 4 | 0 | 2 | 2 |
| Users | 5 | 0 | 4 | 1 |
| News | 4 | 0 | 0 | 4 |
| Tools | 3 | 0 | 0 | 3 |
| AI | 4 | 0 | 0 | 4 |

---

## 🏷️ Status 범례

| Status | 의미 |
|:------:|------|
| ⬜ | 미시작 (Not Started) |
| 🔄 | 진행중 (In Progress) |
| 🔍 | 리뷰중 (In Review) |
| ✅ | 완료 (Done) |
| ⏸️ | 보류 (On Hold) |
| ❌ | 취소 (Cancelled) |

---

## 📋 Notion 복사용 (탭 구분 형식)

아래 텍스트를 복사하여 Notion 데이터베이스에 붙여넣으면 자동으로 테이블이 생성됩니다.

```
#	Category	Method	Endpoint	Description	Auth	Priority	Status
1	Auth	POST	/auth/register	회원가입	❌	P0	⬜
2	Auth	POST	/auth/login	로그인	❌	P0	⬜
3	Auth	POST	/auth/refresh	토큰 갱신	✅	P0	⬜
4	Auth	POST	/auth/logout	로그아웃	✅	P0	⬜
5	Auth	POST	/auth/password/reset-request	비밀번호 재설정 요청	❌	P1	⬜
6	Auth	POST	/auth/password/reset	비밀번호 재설정 완료	❌	P1	⬜
7	Auth	PUT	/auth/password	비밀번호 변경 (로그인 상태)	✅	P1	⬜
8	Map	GET	/map/apartments	지도 화면 내 아파트 마커 조회	❌	P0	⬜
9	Map	GET	/map/apartments/{apt_id}/summary	마커 클릭 시 간단 정보	❌	P0	⬜
10	Map	GET	/map/heatmap	가격 히트맵 데이터	❌	P2	⬜
11	Apartments	GET	/apartments/{apt_id}	아파트 기본 정보 상세	❌	P0	⬜
12	Apartments	GET	/apartments/{apt_id}/transactions	실거래 내역 (페이지네이션)	❌	P0	⬜
13	Apartments	GET	/apartments/{apt_id}/price-trend	평당가 추이 차트 데이터	❌	P0	⬜
14	Apartments	GET	/apartments/{apt_id}/volume-trend	거래량 추이 차트 데이터	❌	P1	⬜
15	Apartments	GET	/apartments/{apt_id}/nearby-comparison	주변 500m 아파트 비교	❌	P2	⬜
16	Apartments	GET	/apartments/{apt_id}/similar	유사 단지 비교	❌	P2	⬜
17	Search	GET	/search/apartments	아파트명 검색 (자동완성)	❌	P0	⬜
18	Search	GET	/search/locations	지역 검색 (시/군/구/동)	❌	P0	⬜
19	Search	GET	/search/recent	최근 검색어 조회	✅	P1	⬜
20	Search	DELETE	/search/recent/{id}	최근 검색어 삭제	✅	P1	⬜
21	Dashboard	GET	/dashboard/summary	핵심 지표 요약 (거래량, 평균가 등)	❌	P1	⬜
22	Dashboard	GET	/dashboard/rankings	랭킹 (상승률/하락률/거래량/가격)	❌	P1	⬜
23	Favorites	GET	/favorites/apartments	관심 아파트 목록	✅	P1	⬜
24	Favorites	POST	/favorites/apartments	관심 아파트 추가	✅	P1	⬜
25	Favorites	DELETE	/favorites/apartments/{apt_id}	관심 아파트 삭제	✅	P1	⬜
26	Favorites	GET	/favorites/locations	관심 지역 목록	✅	P1	⬜
27	Favorites	POST	/favorites/locations	관심 지역 추가	✅	P1	⬜
28	Favorites	DELETE	/favorites/locations/{id}	관심 지역 삭제	✅	P1	⬜
29	My Properties	GET	/my-properties	내 집 목록	✅	P1	⬜
30	My Properties	POST	/my-properties	내 집 등록	✅	P1	⬜
31	My Properties	GET	/my-properties/{id}	내 집 상세	✅	P1	⬜
32	My Properties	GET	/my-properties/{id}/trend	내 집 시세 추이 (6개월)	✅	P1	⬜
33	My Properties	GET	/my-properties/{id}/recent-transactions	동일 단지 최근 거래	✅	P1	⬜
34	My Properties	PUT	/my-properties/{id}	내 집 정보 수정	✅	P1	⬜
35	My Properties	DELETE	/my-properties/{id}	내 집 삭제	✅	P1	⬜
36	Indicators	GET	/indicators/house-price-index	주택매매가격지수	❌	P1	⬜
37	Indicators	GET	/indicators/jeonse-ratio	전세가율 조회	❌	P1	⬜
38	Indicators	POST	/indicators/jeonse-ratio/calculate	전세가율 계산 (입력값)	❌	P2	⬜
39	Indicators	GET	/indicators/regional-comparison	지역별 지표 비교	❌	P2	⬜
40	Users	GET	/users/me	내 프로필 조회	✅	P1	⬜
41	Users	PATCH	/users/me	내 프로필 수정	✅	P1	⬜
42	Users	GET	/users/me/recent-views	최근 본 아파트 목록	✅	P1	⬜
43	Users	DELETE	/users/me	회원 탈퇴	✅	P1	⬜
44	Users	POST	/users/me/profile-image	프로필 이미지 업로드	✅	P2	⬜
45	News	GET	/news	뉴스 목록	❌	P2	⬜
46	News	GET	/news/{id}	뉴스 상세	❌	P2	⬜
47	News	POST	/news/{id}/bookmark	뉴스 북마크	✅	P2	⬜
48	News	DELETE	/news/{id}/bookmark	북마크 삭제	✅	P2	⬜
49	Tools	POST	/tools/loan-calculator	대출 계산기	❌	P2	⬜
50	Tools	GET	/tools/glossary	용어 사전 목록	❌	P2	⬜
51	Tools	GET	/tools/glossary/{id}	용어 상세	❌	P2	⬜
52	AI	POST	/ai/search	AI 조건 기반 아파트 탐색	❌	P2	⬜
53	AI	POST	/ai/summary/apartment	아파트 정보 AI 요약	❌	P2	⬜
54	AI	POST	/ai/summary/my-property	내 집 자랑 (AI 요약)	✅	P2	⬜
55	AI	POST	/ai/summary/news	뉴스 AI 요약	❌	P2	⬜
```

---

## 🗓️ 주차별 개발 계획

### Week 1-2: 🔴 P0 필수 (11개)
- [ ] Auth: register, login, logout, refresh (4개)
- [ ] Apartments: 상세, 거래내역, 가격추이 (3개)
- [ ] Map: 마커 조회, 마커 요약 (2개)
- [ ] Search: 아파트 검색, 지역 검색 (2개)

### Week 3-4: 🟡 P1 핵심 (27개)
- [ ] Dashboard: summary, rankings (2개)
- [ ] Favorites: 아파트 3개 + 지역 3개 (6개)
- [ ] My Properties: 전체 (7개)
- [ ] Indicators: house-price-index, jeonse-ratio (2개)
- [ ] Users: me 조회/수정, recent-views, 탈퇴 (4개)
- [ ] Search: recent 조회/삭제 (2개)
- [ ] Auth: password 관련 (3개)
- [ ] Apartments: volume-trend (1개)

### Week 5+: 🟢 P2 부가 (17개)
- [ ] 나머지 전체

---

## 📝 사용 방법

### Notion에서 데이터베이스로 사용하기

1. **마크다운 테이블 복사**
   - 위의 "전체 API 목록" 테이블 전체 선택
   - Notion 페이지에 붙여넣기
   - Notion이 자동으로 테이블로 변환

2. **탭 구분 형식 복사** (권장)
   - "Notion 복사용 (탭 구분 형식)" 섹션의 텍스트 복사
   - Notion에서 `/table` 입력 → "Table - Inline" 선택
   - 테이블에 붙여넣기

3. **데이터베이스 속성 설정**
   - `Status`: Select 타입으로 변경 (⬜, 🔄, 🔍, ✅, ⏸️, ❌)
   - `Priority`: Select 타입으로 변경 (P0, P1, P2)
   - `Assignee`: Person 타입으로 변경
   - `Due Date`: Date 타입으로 변경

---

> **마지막 업데이트**: 2026-01-11
