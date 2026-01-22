# Nginx 설정 충돌 해결 가이드

## 🔴 문제
```
conflicting server name "43.203.153.77.nip.io" on 0.0.0.0:80, ignored
conflicting server name "43.203.153.77.nip.io" on 0.0.0.0:443, ignored
```

이 경고는 certbot이 이미 같은 도메인으로 설정 파일을 만들었기 때문입니다.

## ✅ 해결 방법

### 방법 1: 기존 certbot 설정 파일 수정 (권장)

certbot이 만든 설정 파일을 찾아서 백엔드 프록시 설정으로 업데이트합니다.

```bash
# 1. certbot이 만든 설정 파일 찾기
sudo ls -la /etc/nginx/sites-enabled/
sudo ls -la /etc/nginx/sites-available/

# 2. 도메인 이름이 포함된 파일 확인
sudo grep -r "43.203.153.77.nip.io" /etc/nginx/sites-available/
sudo grep -r "43.203.153.77.nip.io" /etc/nginx/sites-enabled/
```

일반적으로 certbot은 다음 중 하나에 설정을 만듭니다:
- `/etc/nginx/sites-available/default`
- `/etc/nginx/sites-available/43.203.153.77.nip.io`

**해결 단계:**

```bash
# 1. 기존 설정 파일 확인
sudo cat /etc/nginx/sites-available/default
# 또는
sudo cat /etc/nginx/sites-available/43.203.153.77.nip.io

# 2. 기존 설정 백업
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# 3. 기존 설정 파일을 백엔드 프록시 설정으로 교체
# 방법 A: nginx-backend.conf 내용을 복사
sudo nano /etc/nginx/sites-available/default
# (nginx-backend.conf의 내용으로 교체)

# 방법 B: 파일 직접 교체
sudo cp nginx-backend.conf /etc/nginx/sites-available/default

# 4. 새로 만든 backend 설정 제거 (중복 방지)
sudo rm /etc/nginx/sites-enabled/backend
sudo rm /etc/nginx/sites-available/backend

# 5. default 설정이 활성화되어 있는지 확인
sudo ls -la /etc/nginx/sites-enabled/ | grep default

# 6. 설정 테스트
sudo nginx -t

# 7. Nginx 재시작
sudo systemctl restart nginx
```

### 방법 2: 새 backend 설정만 사용 (기존 설정 제거)

```bash
# 1. certbot이 만든 설정 비활성화
sudo rm /etc/nginx/sites-enabled/default
# 또는
sudo rm /etc/nginx/sites-enabled/43.203.153.77.nip.io

# 2. backend 설정만 활성화
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/backend

# 3. 설정 테스트
sudo nginx -t

# 4. Nginx 재시작
sudo systemctl restart nginx
```

### 방법 3: 자동 해결 스크립트 사용

```bash
# 프로젝트 디렉토리에서 실행
sudo bash fix-nginx-conflict.sh
```

## 🔍 확인

설정 후 경고가 사라졌는지 확인:

```bash
sudo nginx -t
```

**예상 출력** (경고 없음):
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

## ⚠️ 주의사항

1. **certbot 자동 갱신**: certbot이 설정 파일을 수정할 수 있으므로, certbot 설정을 확인하세요:
   ```bash
   sudo certbot renew --dry-run
   ```

2. **SSL 인증서 경로**: 설정 파일의 SSL 인증서 경로가 올바른지 확인:
   ```bash
   sudo ls -la /etc/letsencrypt/live/43.203.153.77.nip.io/
   ```

3. **백엔드 실행 확인**: 프록시가 작동하려면 백엔드가 포트 8000에서 실행 중이어야 합니다:
   ```bash
   sudo netstat -tlnp | grep 8000
   # 또는
   curl http://localhost:8000/health
   ```

## ✅ 최종 테스트

```bash
# 1. Nginx 상태 확인
sudo systemctl status nginx

# 2. HTTPS로 API 접근 테스트
curl https://43.203.153.77.nip.io/health

# 3. 브라우저에서 확인
# https://43.203.153.77.nip.io/docs
```

## 📝 추천 방법

**방법 1 (기존 설정 수정)**을 권장합니다:
- certbot이 만든 설정을 유지하면서 프록시 기능만 추가
- SSL 인증서 자동 갱신이 정상 작동
- 설정이 더 간단하고 관리하기 쉬움
