# 빌드 스테이지
FROM node:20-alpine AS builder

# sharp 등 네이티브 모듈 빌드에 필요한 시스템 패키지
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 소스 코드 복사
COPY . .

# 빌드 시 환경 변수 주입
ARG VITE_API_BASE_URL
ARG VITE_KAKAO_JAVASCRIPT_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_KAKAO_JAVASCRIPT_KEY=$VITE_KAKAO_JAVASCRIPT_KEY

# 빌드
RUN npm run build

# 프로덕션 스테이지
FROM nginx:alpine

# nginx 설정 파일 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 빌드된 파일을 nginx로 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# 포트 노출
EXPOSE 80

# nginx 실행
CMD ["nginx", "-g", "daemon off;"]
