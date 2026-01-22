#!/bin/bash
# ============================================================
# Nginx 설정 충돌 해결 스크립트
# ============================================================
# 사용법: sudo bash fix-nginx-conflict.sh
# ============================================================

set -e

echo "🔍 Nginx 설정 충돌 확인 중..."

DOMAIN="43.203.153.77.nip.io"

# ============================================================
# 1. 기존 설정 파일 찾기
# ============================================================
echo ""
echo "📋 활성화된 설정 파일 확인:"
sudo ls -la /etc/nginx/sites-enabled/ | grep -E "\.(conf|)$"

echo ""
echo "📋 sites-available 디렉토리 확인:"
sudo ls -la /etc/nginx/sites-available/ | grep -E "\.(conf|)$|$DOMAIN"

# ============================================================
# 2. certbot이 만든 설정 파일 확인
# ============================================================
echo ""
echo "🔍 certbot 설정 파일 검색 중..."

CERTBOT_CONFIG=""
if [ -f "/etc/nginx/sites-available/default" ]; then
    if sudo grep -q "$DOMAIN" /etc/nginx/sites-available/default 2>/dev/null; then
        CERTBOT_CONFIG="/etc/nginx/sites-available/default"
        echo "✅ certbot 설정 발견: $CERTBOT_CONFIG"
    fi
fi

# 도메인 이름으로 된 파일 찾기
if [ -f "/etc/nginx/sites-available/$DOMAIN" ]; then
    CERTBOT_CONFIG="/etc/nginx/sites-available/$DOMAIN"
    echo "✅ certbot 설정 발견: $CERTBOT_CONFIG"
fi

# ============================================================
# 3. 기존 설정 파일 내용 확인
# ============================================================
if [ -n "$CERTBOT_CONFIG" ]; then
    echo ""
    echo "📄 기존 설정 파일 내용:"
    echo "---"
    sudo head -20 "$CERTBOT_CONFIG"
    echo "---"
    echo ""
    read -p "이 설정 파일을 백엔드 프록시 설정으로 업데이트하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 백업
        sudo cp "$CERTBOT_CONFIG" "${CERTBOT_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
        echo "✅ 백업 완료: ${CERTBOT_CONFIG}.backup.*"
        
        # 새 설정으로 교체
        if [ -f "nginx-backend.conf" ]; then
            sudo cp nginx-backend.conf "$CERTBOT_CONFIG"
            echo "✅ 설정 파일 업데이트 완료"
        else
            echo "❌ nginx-backend.conf 파일을 찾을 수 없습니다."
            exit 1
        fi
    fi
else
    echo ""
    echo "⚠️  certbot 설정 파일을 찾을 수 없습니다."
    echo "기존 설정 파일을 수동으로 확인하세요:"
    echo "  sudo grep -r '$DOMAIN' /etc/nginx/sites-available/"
fi

# ============================================================
# 4. 중복 활성화된 설정 제거
# ============================================================
echo ""
echo "🔗 활성화된 설정 확인:"

ENABLED_CONFIGS=$(sudo ls /etc/nginx/sites-enabled/ | grep -E "\.(conf|)$|$DOMAIN|backend|default")

if [ -n "$ENABLED_CONFIGS" ]; then
    echo "$ENABLED_CONFIGS" | while read config; do
        echo "  - $config"
    done
    
    echo ""
    echo "중복된 설정을 제거하시겠습니까?"
    echo "(backend 설정만 남기고 나머지는 비활성화)"
    read -p "계속하시겠습니까? (y/n) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # backend가 아닌 설정들 비활성화
        echo "$ENABLED_CONFIGS" | while read config; do
            if [ "$config" != "backend" ] && [ "$config" != "$DOMAIN" ]; then
                if [ -L "/etc/nginx/sites-enabled/$config" ]; then
                    sudo rm "/etc/nginx/sites-enabled/$config"
                    echo "✅ 비활성화: $config"
                fi
            fi
        done
        
        # backend 설정이 없으면 활성화
        if [ ! -L "/etc/nginx/sites-enabled/backend" ]; then
            if [ -f "/etc/nginx/sites-available/backend" ]; then
                sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/backend
                echo "✅ backend 설정 활성화"
            fi
        fi
    fi
fi

# ============================================================
# 5. 설정 테스트
# ============================================================
echo ""
echo "🧪 Nginx 설정 테스트 중..."

if sudo nginx -t 2>&1 | grep -q "conflicting server name"; then
    echo "⚠️  여전히 충돌이 있습니다."
    echo ""
    echo "다음 명령어로 충돌하는 설정을 확인하세요:"
    echo "  sudo grep -r '$DOMAIN' /etc/nginx/sites-enabled/"
    echo ""
    echo "수동으로 중복된 설정을 제거하거나 통합하세요."
else
    echo "✅ 설정 충돌이 해결되었습니다!"
    
    # Nginx 재시작 확인
    read -p "Nginx를 재시작하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo systemctl restart nginx
        echo "✅ Nginx 재시작 완료"
        
        if sudo systemctl is-active --quiet nginx; then
            echo "✅ Nginx가 정상적으로 실행 중입니다"
        else
            echo "❌ Nginx 시작 실패"
            sudo journalctl -u nginx -n 20 --no-pager
        fi
    fi
fi

echo ""
echo "============================================================"
echo "완료!"
echo "============================================================"
