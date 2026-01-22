# 🚀 빠른 해결 가이드

## 즉시 해야 할 작업 (순서대로)

### 1️⃣ Vercel 환경 변수 수정 (5분)

1. Vercel 대시보드 접속: https://vercel.com/dashboard
2. 프로젝트 선택 → **Settings** → **Environment Variables**
3. `VITE_API_BASE_URL` 찾아서 수정:
   - ❌ 기존: `http://your-ec2-ip:8000/api/v1`
   - ✅ 수정: `https://your-backend-domain.com/api/v1`
4. **Redeploy** 클릭

### 2️⃣ 백엔드 CORS 설정 (EC2에서 실행)

```bash
# EC2 서버에 SSH 접속 후

# 환경 변수 확인
echo $ALLOWED_ORIGINS

# Vercel 도메인 추가 (예시)
export ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,https://your-app.vercel.app"

# Docker 사용 시 docker-compose.yml 또는 .env 파일 수정
# 또는 환경 변수로 전달:
docker-compose up -d --build -e ALLOWED_ORIGINS="..."
```

### 3️⃣ 백엔드 HTTPS 설정 (필수)

**옵션 1: Nginx + Let's Encrypt (무료, 권장)**

```bash
# EC2에서 실행
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# Nginx 설정 (도메인이 있는 경우)
sudo certbot --nginx -d your-backend-domain.com
```

**옵션 2: 임시 프록시 (Vercel vercel.json)**

`frontend/vercel.json` 수정:

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "http://your-ec2-ip:8000/api/:path*"
    }
  ]
}
```

그리고 `frontend/services/api.ts`에서:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
```

이렇게 하면 `/api/v1`로 시작하는 요청이 Vercel 서버를 통해 프록시됩니다.

### 4️⃣ CSS 오류 수정 (완료됨)

`frontend/index.html`에서 `/index.css` 참조를 제거했습니다.

---

## ✅ 확인 사항

배포 후 브라우저 콘솔에서 확인:

1. ✅ Mixed Content Error 없음
2. ✅ CORS Error 없음  
3. ✅ API 요청 성공 (Network 탭에서 200 응답)
4. ✅ CSS 404 오류 없음

---

## 🔧 백엔드 CORS 설정 예시

### .env 파일 예시:

```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8081,https://sweethome-app.vercel.app,https://sweethome-preview.vercel.app,https://yourdomain.com
```

### docker-compose.yml 예시:

```yaml
services:
  backend:
    environment:
      - ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

---

## 📝 체크리스트

- [ ] Vercel `VITE_API_BASE_URL`을 HTTPS로 변경
- [ ] 백엔드 `ALLOWED_ORIGINS`에 Vercel 도메인 추가
- [ ] 백엔드 HTTPS 설정 (Nginx 또는 ALB)
- [ ] CSS 404 오류 수정 (완료)
- [ ] 배포 후 테스트

---

## 🆘 여전히 문제가 있다면

1. **브라우저 캐시 삭제**: Ctrl+Shift+Delete
2. **시크릿 모드에서 테스트**
3. **백엔드 로그 확인**: `docker logs realestate-backend`
4. **Network 탭에서 실제 요청 URL 확인**
