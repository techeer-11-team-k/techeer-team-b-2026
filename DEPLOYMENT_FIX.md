# 배포 문제 해결 가이드

## 🔴 발생한 문제들

1. **Mixed Content Error**: HTTPS 페이지(Vercel)에서 HTTP 리소스(EC2) 요청 시도
2. **CORS Error**: 백엔드에 Vercel 도메인이 허용되지 않음
3. **API 연결 실패**: 네트워크 연결 오류
4. **CSS 404 Error**: index.css 파일을 찾을 수 없음

## ✅ 해결 방법

### 1. 백엔드 CORS 설정 업데이트 (EC2)

EC2 서버의 환경 변수에 Vercel 도메인을 추가해야 합니다.

#### EC2에서 실행할 명령어:

```bash
# .env 파일 편집
sudo nano /path/to/your/backend/.env
```

또는 환경 변수로 직접 설정:

```bash
# docker-compose.yml을 사용하는 경우
export ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,http://localhost:8081,https://your-vercel-domain.vercel.app,https://your-custom-domain.com"
```

**중요**: 
- Vercel 도메인을 `https://`로 시작하는 전체 URL로 추가
- 여러 도메인은 콤마로 구분
- 프로덕션 도메인과 프리뷰 도메인 모두 추가 권장

#### 예시:
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8081,https://sweethome-app.vercel.app,https://sweethome-preview.vercel.app,https://yourdomain.com
```

#### 백엔드 재시작:
```bash
# Docker를 사용하는 경우
docker-compose restart backend

# 또는 직접 실행하는 경우
# 프로세스를 재시작하세요
```

---

### 2. 백엔드 HTTPS 설정 (EC2)

**Mixed Content Error를 해결하려면 백엔드도 HTTPS를 사용해야 합니다.**

#### 옵션 A: Nginx Reverse Proxy 사용 (권장)

1. **Nginx 설치 및 설정**:

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

2. **Nginx 설정 파일 생성** (`/etc/nginx/sites-available/backend`):

```nginx
server {
    listen 80;
    server_name your-backend-domain.com;  # EC2 도메인 또는 IP

    # HTTP를 HTTPS로 리다이렉트
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-backend-domain.com;

    # SSL 인증서 설정 (Let's Encrypt 사용)
    ssl_certificate /etc/letsencrypt/live/your-backend-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-backend-domain.com/privkey.pem;

    # SSL 보안 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # CORS 헤더 추가
    add_header 'Access-Control-Allow-Origin' '$http_origin' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;

    # OPTIONS 요청 처리
    if ($request_method = 'OPTIONS') {
        return 204;
    }

    # 백엔드로 프록시
    location / {
        proxy_pass http://localhost:8000;  # FastAPI가 실행 중인 포트
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **설정 활성화**:

```bash
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/
sudo nginx -t  # 설정 테스트
sudo systemctl restart nginx
```

4. **Let's Encrypt SSL 인증서 발급**:

```bash
sudo certbot --nginx -d your-backend-domain.com
```

#### 옵션 B: AWS Application Load Balancer + ACM 사용

AWS를 사용하는 경우:
1. Application Load Balancer 생성
2. ACM(Amazon Certificate Manager)에서 SSL 인증서 발급
3. ALB에 HTTPS 리스너 추가
4. 타겟 그룹에 EC2 인스턴스 연결

---

### 3. Vercel 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정하세요:

1. **Vercel 대시보드** → 프로젝트 선택 → **Settings** → **Environment Variables**

2. **다음 변수들을 추가/수정**:

```
VITE_API_BASE_URL=https://your-backend-domain.com/api/v1
```

**중요**: 
- ✅ `https://`로 시작해야 함
- ✅ `/api/v1`로 끝나야 함
- ❌ `http://` 사용 금지 (Mixed Content Error 발생)

3. **다른 필수 환경 변수들도 확인**:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_... (프로덕션 키 사용)
VITE_KAKAO_JAVASCRIPT_KEY=your_kakao_key
```

4. **배포 재실행**:
   - 환경 변수 변경 후 자동으로 재배포되거나
   - 수동으로 **Deployments** 탭에서 **Redeploy** 클릭

---

### 4. CSS 404 오류 해결

`index.html`에서 존재하지 않는 `/index.css`를 참조하고 있습니다.

#### 해결 방법:

`frontend/index.html`의 414번째 줄을 제거하거나 주석 처리:

```html
<!-- <link rel="stylesheet" href="/index.css"> -->
```

CSS는 이미 `index.html`의 `<style>` 태그에 포함되어 있거나, Vite가 자동으로 처리합니다.

---

## 🔍 문제 확인 체크리스트

배포 후 다음을 확인하세요:

- [ ] 브라우저 콘솔에 Mixed Content Error가 없는지 확인
- [ ] Network 탭에서 API 요청이 HTTPS로 전송되는지 확인
- [ ] API 응답에 CORS 헤더가 포함되어 있는지 확인
- [ ] Vercel 환경 변수가 올바르게 설정되었는지 확인
- [ ] 백엔드가 HTTPS로 접근 가능한지 확인
- [ ] CSS 파일 404 오류가 해결되었는지 확인

---

## 🚨 긴급 해결책 (임시)

백엔드 HTTPS 설정이 완료되기 전까지 임시로 사용할 수 있는 방법:

### 프론트엔드에서 프록시 사용

Vercel의 `vercel.json`에 프록시 설정 추가:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "http://your-ec2-ip:8000/api/:path*"
    }
  ]
}
```

**주의**: 이 방법은 Vercel 서버를 통해 프록시하므로 성능에 영향을 줄 수 있습니다. 프로덕션에서는 백엔드 HTTPS 설정을 권장합니다.

---

## 📞 추가 도움이 필요한 경우

1. 백엔드 로그 확인: `docker logs realestate-backend`
2. Nginx 로그 확인: `sudo tail -f /var/log/nginx/error.log`
3. 브라우저 개발자 도구 → Network 탭에서 요청/응답 확인
