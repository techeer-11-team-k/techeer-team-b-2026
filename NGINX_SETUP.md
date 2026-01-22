# Nginx 리버스 프록시 설정 가이드

## 🎯 목표
백엔드 API(포트 8000)를 HTTPS로 접근 가능하게 설정

## 📋 사전 준비
- ✅ Nginx 설치 완료
- ✅ Let's Encrypt SSL 인증서 발급 완료 (`https://43.203.153.77.nip.io/` 접속 가능)

## 🚀 설정 단계

### 1단계: 기존 Nginx 설정 확인

```bash
# 현재 활성화된 사이트 확인
sudo ls -la /etc/nginx/sites-enabled/

# 기존 설정 파일 확인 (certbot이 만든 파일이 있을 수 있음)
sudo cat /etc/nginx/sites-enabled/default
# 또는
sudo cat /etc/nginx/sites-enabled/43.203.153.77.nip.io
```

### 2단계: 백엔드 프록시 설정 파일 생성

```bash
# 프로젝트에서 설정 파일 복사
sudo cp nginx-backend.conf /etc/nginx/sites-available/backend

# 또는 직접 생성
sudo nano /etc/nginx/sites-available/backend
```

**중요**: `nginx-backend.conf` 파일의 SSL 인증서 경로를 확인하세요:
- Let's Encrypt 인증서 경로: `/etc/letsencrypt/live/43.203.153.77.nip.io/`
- certbot으로 발급했다면 자동으로 설정되어 있을 수 있습니다

### 3단계: 설정 파일 활성화

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/

# 기존 default 설정이 있다면 비활성화 (선택사항)
sudo rm /etc/nginx/sites-enabled/default
```

### 4단계: Nginx 설정 테스트

```bash
# 설정 파일 문법 검사
sudo nginx -t
```

**예상 출력**:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 5단계: Nginx 재시작

```bash
# Nginx 재시작
sudo systemctl restart nginx

# 상태 확인
sudo systemctl status nginx
```

### 6단계: 방화벽 확인 (필요한 경우)

```bash
# UFW 방화벽 사용 시
sudo ufw allow 'Nginx Full'
sudo ufw status

# 또는 특정 포트만
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## ✅ 테스트

### 1. HTTPS로 API 접근 테스트

```bash
# 헬스 체크
curl https://43.203.153.77.nip.io/health

# API 문서 접근
curl https://43.203.153.77.nip.io/docs
```

### 2. 브라우저에서 테스트

1. `https://43.203.153.77.nip.io/docs` 접속
2. Swagger UI가 정상적으로 표시되는지 확인
3. 브라우저 개발자 도구 → Network 탭에서 요청 확인

### 3. CORS 테스트

프론트엔드에서 API 호출 시 CORS 오류가 없는지 확인

## 🔧 문제 해결

### 문제 1: SSL 인증서 경로 오류

**증상**: `nginx -t` 실행 시 SSL 인증서를 찾을 수 없다는 오류

**해결**:
```bash
# 인증서 경로 확인
sudo ls -la /etc/letsencrypt/live/

# certbot으로 다시 설정
sudo certbot --nginx -d 43.203.153.77.nip.io
```

### 문제 2: 502 Bad Gateway

**증상**: Nginx는 정상이지만 백엔드에 연결할 수 없음

**해결**:
```bash
# 백엔드가 실행 중인지 확인
sudo netstat -tlnp | grep 8000
# 또는
sudo ss -tlnp | grep 8000

# Docker를 사용하는 경우
docker ps | grep backend

# 백엔드 로그 확인
docker logs realestate-backend
```

### 문제 3: CORS 오류

**증상**: 프론트엔드에서 API 호출 시 CORS 오류

**해결**:
1. Nginx 설정 파일에서 CORS 헤더 확인
2. 백엔드 `ALLOWED_ORIGINS`에 프론트엔드 도메인 추가
3. Nginx 재시작: `sudo systemctl restart nginx`

### 문제 4: 포트 충돌

**증상**: Nginx가 시작되지 않음

**해결**:
```bash
# 포트 사용 확인
sudo lsof -i :80
sudo lsof -i :443

# 다른 서비스가 사용 중이면 중지하거나 포트 변경
```

## 📝 추가 설정 (선택사항)

### 로그 로테이션

```bash
# 로그 파일 크기 제한 설정
sudo nano /etc/logrotate.d/nginx-backend
```

내용:
```
/var/log/nginx/backend-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

### 성능 최적화

`/etc/nginx/nginx.conf`에서 전역 설정 조정:

```nginx
http {
    # 연결 풀 설정
    upstream backend {
        server localhost:8000;
        keepalive 32;
    }

    # 기타 최적화 설정...
}
```

## 🔐 보안 체크리스트

- [ ] SSL 인증서가 정상적으로 설치됨
- [ ] HTTP가 HTTPS로 리다이렉트됨
- [ ] 보안 헤더가 설정됨 (HSTS, X-Frame-Options 등)
- [ ] 방화벽이 올바르게 설정됨
- [ ] 백엔드가 localhost에서만 접근 가능 (외부 직접 접근 차단)

## 📞 다음 단계

1. ✅ Nginx 설정 완료
2. ⬜ Vercel 환경 변수 업데이트: `VITE_API_BASE_URL=https://43.203.153.77.nip.io/api/v1`
3. ⬜ 백엔드 CORS 설정 업데이트: `ALLOWED_ORIGINS`에 Vercel 도메인 추가
4. ⬜ 프론트엔드 재배포 및 테스트
