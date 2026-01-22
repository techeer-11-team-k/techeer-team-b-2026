#!/bin/bash
# ============================================================
# Nginx 백엔드 프록시 설정 스크립트
# ============================================================
# 사용법: sudo bash setup-nginx-backend.sh
# ============================================================

set -e  # 오류 발생 시 스크립트 중단

echo "🚀 Nginx 백엔드 프록시 설정을 시작합니다..."

# ============================================================
# 1. 기존 설정 확인
# ============================================================
echo ""
echo "📋 기존 Nginx 설정 확인 중..."

# certbot이 만든 설정 파일 확인
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    echo "⚠️  기존 default 설정 파일 발견"
    read -p "기존 설정을 백업하고 계속하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.backup.$(date +%Y%m%d_%H%M%S)
        echo "✅ 백업 완료"
    fi
fi

# ============================================================
# 2. SSL 인증서 경로 확인
# ============================================================
echo ""
echo "🔐 SSL 인증서 경로 확인 중..."

DOMAIN="43.203.153.77.nip.io"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

if [ -d "$CERT_PATH" ]; then
    echo "✅ SSL 인증서 발견: $CERT_PATH"
else
    echo "⚠️  SSL 인증서를 찾을 수 없습니다: $CERT_PATH"
    echo "certbot으로 인증서를 발급하세요:"
    echo "  sudo certbot --nginx -d $DOMAIN"
    exit 1
fi

# ============================================================
# 3. 설정 파일 생성
# ============================================================
echo ""
echo "📝 Nginx 설정 파일 생성 중..."

CONFIG_FILE="/etc/nginx/sites-available/backend"

# 프로젝트 디렉토리에서 설정 파일 복사 (있는 경우)
if [ -f "nginx-backend.conf" ]; then
    sudo cp nginx-backend.conf "$CONFIG_FILE"
    echo "✅ 설정 파일 복사 완료"
else
    # 직접 생성
    sudo tee "$CONFIG_FILE" > /dev/null <<EOF
# HTTP를 HTTPS로 리다이렉트
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

# HTTPS 서버 설정
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # SSL 인증서
    ssl_certificate ${CERT_PATH}/fullchain.pem;
    ssl_certificate_key ${CERT_PATH}/privkey.pem;

    # SSL 보안 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 보안 헤더
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # 로그
    access_log /var/log/nginx/backend-access.log;
    error_log /var/log/nginx/backend-error.log;

    # 요청 크기 제한
    client_max_body_size 50M;

    # 백엔드로 프록시
    # CORS는 백엔드 애플리케이션에서 처리하므로 nginx에서는 설정하지 않음
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        # 타임아웃
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 버퍼링
        proxy_buffering off;
    }

    # 헬스 체크
    location /health {
        proxy_pass http://localhost:8000/health;
        access_log off;
    }
}
EOF
    echo "✅ 설정 파일 생성 완료"
fi

# ============================================================
# 4. 설정 활성화
# ============================================================
echo ""
echo "🔗 설정 파일 활성화 중..."

if [ -L "/etc/nginx/sites-enabled/backend" ]; then
    echo "⚠️  이미 활성화된 설정이 있습니다. 제거 후 재생성합니다."
    sudo rm /etc/nginx/sites-enabled/backend
fi

sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/backend
echo "✅ 설정 파일 활성화 완료"

# ============================================================
# 5. Nginx 설정 테스트
# ============================================================
echo ""
echo "🧪 Nginx 설정 테스트 중..."

if sudo nginx -t; then
    echo "✅ Nginx 설정이 올바릅니다!"
else
    echo "❌ Nginx 설정에 오류가 있습니다. 위의 오류 메시지를 확인하세요."
    exit 1
fi

# ============================================================
# 6. 백엔드 실행 확인
# ============================================================
echo ""
echo "🔍 백엔드 서비스 확인 중..."

if sudo netstat -tlnp 2>/dev/null | grep -q ":8000 " || sudo ss -tlnp 2>/dev/null | grep -q ":8000 "; then
    echo "✅ 백엔드가 포트 8000에서 실행 중입니다"
else
    echo "⚠️  백엔드가 포트 8000에서 실행되지 않습니다"
    echo "백엔드를 시작한 후 다시 시도하세요:"
    echo "  docker-compose up -d"
    echo "  또는"
    echo "  uvicorn app.main:app --host 0.0.0.0 --port 8000"
fi

# ============================================================
# 7. Nginx 재시작
# ============================================================
echo ""
read -p "Nginx를 재시작하시겠습니까? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo systemctl restart nginx
    echo "✅ Nginx 재시작 완료"
    
    # 상태 확인
    if sudo systemctl is-active --quiet nginx; then
        echo "✅ Nginx가 정상적으로 실행 중입니다"
    else
        echo "❌ Nginx 시작 실패. 로그를 확인하세요:"
        echo "  sudo journalctl -u nginx -n 50"
        exit 1
    fi
else
    echo "⚠️  Nginx를 수동으로 재시작하세요:"
    echo "  sudo systemctl restart nginx"
fi

# ============================================================
# 8. 완료 및 테스트 안내
# ============================================================
echo ""
echo "============================================================"
echo "✅ 설정 완료!"
echo "============================================================"
echo ""
echo "📝 다음 단계:"
echo ""
echo "1. API 테스트:"
echo "   curl https://${DOMAIN}/health"
echo "   curl https://${DOMAIN}/docs"
echo ""
echo "2. 브라우저에서 확인:"
echo "   https://${DOMAIN}/docs"
echo ""
echo "3. Vercel 환경 변수 업데이트:"
echo "   VITE_API_BASE_URL=https://${DOMAIN}/api/v1"
echo ""
echo "4. 백엔드 CORS 설정 업데이트:"
echo "   ALLOWED_ORIGINS에 Vercel 도메인 추가"
echo ""
echo "============================================================"
