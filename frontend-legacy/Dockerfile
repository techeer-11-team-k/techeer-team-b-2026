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

# 의존성 설치 (highcharts, highcharts-react-official 포함)
# npm ci가 실패하면 npm install로 폴백
RUN npm ci --no-audit --no-fund || (npm install --no-audit --no-fund && npm cache clean --force)

# 소스 코드 복사
COPY . .

# 개발 모드에서도 의존성 재확인 (볼륨 마운트 시 node_modules 동기화 보장)
# highcharts, highcharts-react-official 등 새로 추가된 패키지가 확실히 설치되도록 함
RUN npm install --no-audit --no-fund || true

# Entrypoint 스크립트 복사 및 실행 권한 부여
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 포트 노출
EXPOSE 3000

# Entrypoint를 통해 의존성 확인 후 개발 서버 실행
ENTRYPOINT ["/docker-entrypoint.sh"]
