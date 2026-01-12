# ============================================================
# 🏠 부동산 분석 플랫폼 - Frontend Dockerfile
# ============================================================
# 빌드: docker build -t realestate-frontend .
# 실행: docker run -p 3000:3000 realestate-frontend
# ============================================================

# Node.js 20 LTS 이미지 사용
FROM node:20-alpine

# 환경변수 설정
ENV NODE_ENV=development \
    VITE_API_BASE_URL=http://localhost:8000/api/v1

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 먼저 복사 (캐싱 최적화)
COPY package*.json ./

# 의존성 설치
RUN npm ci

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 3000

# 개발 서버 실행 (hot reload 지원)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
