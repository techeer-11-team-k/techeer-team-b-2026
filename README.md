<h1 align="center"> ⚙️ 부동산 데이터 분석 및 시각화 서비스 ⚙️ </h1> <div align="center" style="font-size:18px">
<img width="282" height="56" alt="image" src="https://github.com/user-attachments/assets/c77a194f-6f2e-48e7-83b6-fdca697e0d39" />


<p></p> </div>

<br>
<br>

## 📣 Introduction
**SWEETHOME**은 **부동산 데이터를 분석하고 시각화**하는 부동산 자산 관리 플랫폼입니다. 

국토교통부 API를 활용하여 실거래가 데이터를 수집하고, 다양한 통계 지표를 제공하고<br>
**사용자가 관심을 가지는 정보**에 대해 **시각화하여 제시**함으로써
사용자가 부동산 시장을 더 잘 이해하고 의사결정을 내릴 수 있도록 돕습니다.

> 🔎 [Medium]

<br>
<br>

## ✨ 주요 기능

| 🔍 부동산 데이터 조회 | 🗺️ 지도 기반 검색 기능 |
| :--- | :--- |
| - 아파트 기본 정보 및 상세 정보 조회<br>- 매매/전월세 거래 내역 및 가격 추이 분석<br>- 실거래가 데이터 실시간 수집 | - 지도 영역 기반 데이터 조회 및 주변 아파트 검색<br>- 최근 검색어 및 아파트명 자동완성<br>- 카카오 지도 API 활용 인터랙티브 지도 |
| **💼 자산 및 관심 목록 비교** | **📊 시장 분석 및 통계 시각화** |
| - 소유 부동산 등록 및 자산 관리<br>- 자산 활동 로그(가격 변동 이력 등)<br>- 아파트 정보 비교 및 즐겨찾기 | - 전국 평당가 및 거래량 추이 대시보드<br>- 지역별 랭킹 및 부동산 지수(HPI) 시각화<br>- D3.js를 활용한 인터랙티브 차트 |



<br>
<br>

## Demo Video
### **회원가입/로그인**
   - Clerk를 통한 소셜 로그인 또는 이메일 가입
   - 튜토리얼
### 홈 - **자산 등록 및 관리**
   - 내 자산, 관심 아파트 등록 및 상세 분석 페이지
   - 사용자 지정 카드
   - 뉴스
### 지도 -**아파트 검색**
   - 검색창에 아파트명 또는 지역명 입력
   - 아파트 상세 정보
   - 자동완성 기능 활용
### **비교 및 분석**
   - 1:1, 혹은 여러 아파트를 선택하여 비교
   - 지역별 통계 대시보드 확인
   - 부동산 지수(HPI) 추이 확인



<br>
<br>

## System Architecture
<img width="1194" height="661" alt="image (1)" src="https://github.com/user-attachments/assets/8ef0f067-9e8d-428f-b5fa-b6a3ee18c5d6" />

![제목 없는 다이어그램-Copy of 페이지-1의 복사본](https://github.com/user-attachments/assets/ce8872ad-404c-4373-a42f-e0eff4d9279b)

<br>
<br>

## 💾 ERD
사진

<br>
<br>

## ✨ API
사진

<br>
<br>

## 📊 Monitoring

사진


<br>
<br>

## 💻 기술 스택

| 카테고리 | 기술 스택 |
|:---|:---|
| **Frontend** | ![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white) ![Highcharts](https://img.shields.io/badge/Highcharts-8085e9?style=for-the-badge&logo=highcharts&logoColor=white) <br> ![Expo](https://img.shields.io/badge/expo-1C1E24?style=for-the-badge&logo=expo&logoColor=#D04A37) ![React Native](https://img.shields.io/badge/react_native-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) |
| **Backend** | ![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi) ![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white) ![Pydantic](https://img.shields.io/badge/pydantic-E92063?style=for-the-badge&logo=pydantic&logoColor=white) ![Uvicorn](https://img.shields.io/badge/uvicorn-d09fff?style=for-the-badge&logo=uvicorn&logoColor=white) |
| **Database & Cache** | ![PostgreSQL](https://img.shields.io/badge/postgresql-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white) ![PostGIS](https://img.shields.io/badge/PostGIS-336791?style=for-the-badge&logo=postgresql&logoColor=white) ![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white) |
| **Auth** | ![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white) ![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens) |
| **DevOps** | ![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white) ![AWS EC2](https://img.shields.io/badge/Amazon%20EC2-FF9900?style=for-the-badge&logo=amazonec2&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white) ![Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white) |
| **Monitoring** | ![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=Prometheus&logoColor=white) ![Grafana](https://img.shields.io/badge/grafana-%23F46800.svg?style=for-the-badge&logo=grafana&logoColor=white) |
| **Additional** | ![GitHub](https://img.shields.io/badge/github-%23121011.svg?style=for-the-badge&logo=github&logoColor=white) ![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge&logo=slack&logoColor=white) ![Notion](https://img.shields.io/badge/Notion-%23000000.svg?style=for-the-badge&logo=notion&logoColor=white) ![Figma](https://img.shields.io/badge/figma-%23F24E1E.svg?style=for-the-badge&logo=figma&logoColor=white) ![Google Maps](https://img.shields.io/badge/Google%20Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white) ![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white) ![Kakao Maps](https://img.shields.io/badge/Kakao%20Maps-FFCD00?style=for-the-badge&logo=kakao&logoColor=black) |


<br>
<br>

## How to start
### 0. 사전 요구사항
- **Docker & Docker Compose** (권장)
- **Node.js 18+** (프론트엔드/모바일 로컬 개발 시)
- **Python 3.11+** (백엔드 로컬 개발 시)
- **PostgreSQL 15+ with PostGIS 3.3+** (로컬 DB 사용 시)

### 1. Clone The Repository
```bash
git clone https://github.com/your-org/techeer-team-b-2026.git
cd techeer-team-b-2026
```
#### 2. ENV Setting
#### 필수 환경 변수

```bash
# 데이터베이스 설정
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=realestate_db
POSTGRES_PORT=5432

# Redis 설정
REDIS_PORT=6379

# 서버 포트
BACKEND_PORT=8000

# Clerk 인증 (https://clerk.com 에서 발급)
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_WEBHOOK_SECRET=your_clerk_webhook_secret

# 외부 API 키
MOLIT_API_KEY=your_molit_api_key          # 국토교통부 API (https://www.data.go.kr/)
REB_API_KEY=your_reb_api_key              # 한국부동산원 API
KAKAO_REST_API_KEY=your_kakao_rest_api_key      # 카카오 개발자 콘솔 (https://developers.kakao.com/)
KAKAO_JAVASCRIPT_KEY=your_kakao_javascript_key
GEMINI_API_KEY=your_gemini_api_key        # Google Gemini (https://aistudio.google.com/)
GOOGLE_MAP_API_KEY=your_google_map_api_key      # Google Maps (https://console.cloud.google.com/)
```

> ⚠️ **주의**: `.env` 파일에는 실제 API 키를 설정하되, 절대 Git에 커밋하지 마세요. `.gitignore`에 이미 포함되어 있습니다.

#### API 키 발급 가이드

- **Clerk**: https://clerk.com → Dashboard → API Keys
- **국토교통부 API**: https://www.data.go.kr/ → 공공데이터포털 → API 신청
- **카카오 지도 API**: https://developers.kakao.com/ → 내 애플리케이션 → 앱 키
- **Google Gemini**: https://aistudio.google.com/app/apikey
- **Google Maps**: https://console.cloud.google.com/google/maps-apis


### 3. Docker로 실행 (권장)
```bash
# 전체 서비스 실행 (DB + Redis + Backend + Frontend)
docker-compose up -d --build

# 종료
docker-compose down
```

### 4. 데이터베이스 초기화

```bash
# DB 초기화 (테이블 생성)
docker exec -it realestate-backend python /app/scripts/init_db_from_sql.py

# DB 관리 도구 실행
docker exec -it realestate-backend python -m app.db_admin
```

<br>
<br>
## Member

| 항목 | 김강문 | 조항중 | 박찬영 | 김민성 | 조수아 | 정조셉 |
|------|--------|--------|--------|--------|--------|-------|
| **Profile** | | | | | | |
| **Role**   | **Team Leader** |  |  |  |  |  |  |
| **GitHub** |  [@rivermoon-03](https://github.com/rivermoon-03)|  [@whgkdwnd](https://github.com/whgkdwnd)| [@ChanyoungPark03](https://github.com/ChanyoungPark03) | [@rlaalstjdzzz](https://github.com/rlaalstjdzzz) |  [@ssuasu](https://github.com/ssuasu)|  [@joseph054](https://github.com/joseph054)|


> **프로젝트 시작일**: 2025-12-29
> **프로젝트 종료일**: 2026-1-31

