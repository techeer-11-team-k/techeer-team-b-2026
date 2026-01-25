# 부동산 데이터 분석 및 시각화 서비스
*SWEETHOME*

> **프로젝트 시작일**: 2025-12-29
## Introduction


---
## System Architecture
<img width="1194" height="661" alt="image (1)" src="https://github.com/user-attachments/assets/8ef0f067-9e8d-428f-b5fa-b6a3ee18c5d6" />

![제목 없는 다이어그램-Copy of 페이지-1의 복사본](https://github.com/user-attachments/assets/ce8872ad-404c-4373-a42f-e0eff4d9279b)


---
## Tech Stack

| 영역 | 기술 |
|------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Backend** | <img alt="Static Badge" src="https://img.shields.io/badge/Fastapi-%23009688?style=for-the-badge&logo=fastapi&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/python-%233776AB?style=for-the-badge&logo=python&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/SQLAlchemy-%23D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/PostgreSQL-%234169E1?style=for-the-badge&logo=postgresql&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/pydantic-%23E92063?style=for-the-badge&logo=pydantic&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/uvicorn-d09fff?style=for-the-badge&logoColor=white"> |
| **Frontend** | <img alt="Static Badge" src="https://img.shields.io/badge/REACT_NATIVE-black?style=for-the-badge&logo=react&logoColor=%2361DAFB"> <img alt="Static Badge" src="https://img.shields.io/badge/expo-%231C2024?style=for-the-badge&logo=expo&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/typescript-%233178C6?style=for-the-badge&logo=typescript&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/vite-%239135FF?style=for-the-badge&logo=vite&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/Prettier-%23F7B93E?style=for-the-badge&logo=prettier&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/tailwind_css-%2306B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white"> |
| **Database** |<img alt="Static Badge" src="https://img.shields.io/badge/postgresql_15%2B_with_postgis_3.3-%234169E1?style=for-the-badge&logo=postgresql&logoColor=white">|
| **Cache** | <img alt="Static Badge" src="https://img.shields.io/badge/redis-%23FF4438?style=for-the-badge&logo=redis&logoColor=white">|
| **DevOps** | <img alt="Static Badge" src="https://img.shields.io/badge/docker-%232496ED?style=for-the-badge&logo=docker&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/ec2-%23ff7f00?style=for-the-badge&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/github_actions-%232088FF?style=for-the-badge&logo=githubactions&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/vercel-%23000000?style=for-the-badge&logo=vercel&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/nginx-%23009639?style=for-the-badge&logo=vercel&logoColor=white"> |
| **Auth** | <img alt="Static Badge" src="https://img.shields.io/badge/clerk-%236C47FF?style=for-the-badge&logo=clerk&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/jwt-%23000583?style=for-the-badge&logoColor=white"> |
| **Monitoring** | <img alt="Static Badge" src="https://img.shields.io/badge/prometheus-%23E6522C?style=for-the-badge&logo=prometheus&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/grafana-%23F46800?style=for-the-badge&logo=grafana&logoColor=white">|
| **etc** | <img src="https://img.shields.io/badge/github-%23121011.svg?style=for-the-badge&logo=github&logoColor=white"/> <img alt="Static Badge" src="https://img.shields.io/badge/slack-red?style=for-the-badge&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/notion-%23000000?style=for-the-badge&logo=notion&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/figma-%23F24E1E?style=for-the-badge&logo=figma&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/zoom-%230B5CFF?style=for-the-badge&logo=zoom&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/cursor-%23000000?style=for-the-badge&logo=cursor&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/google_maps-%234285F4?style=for-the-badge&logo=googlemaps&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/gemini-%238E75B2?style=for-the-badge&logo=googlegemini&logoColor=white"> <img alt="Static Badge" src="https://img.shields.io/badge/kakao_maps-%23FFCD00?style=for-the-badge&logo=kakao&logoColor=white"> |

## 🧑‍💻 팀원 소개

| 항목 | 김강문 | 조항중 | 박찬영 | 김민성 | 조수아 | 정조셉 |
|------|--------|--------|--------|--------|--------|-------|






절대 .env파일 외에는 API Key값을 적지 말도록
Access-Control-Allow-Origin 헤더 추가: 서버 응답 헤더에 허용할 출처를 지정합니다 (예: Access-Control-Allow-Origin: http://localhost:3000 또는 *로 모든 출처 허용).로 해놨으므로 배포 직전에는 수정 할 것
