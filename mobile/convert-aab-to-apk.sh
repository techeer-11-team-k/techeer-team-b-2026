#!/bin/bash

# AAB 파일을 APK로 변환하는 스크립트
# 사용법: ./convert-aab-to-apk.sh [aab-file-path]

set -e  # 에러 발생 시 스크립트 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 디렉토리 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 출력 디렉토리
OUTPUT_DIR="build-output"
mkdir -p "$OUTPUT_DIR"

# bundletool 경로
BUNDLETOOL_JAR="bundletool-all-1.18.3.jar"

# 함수: 로그 출력
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 함수: 필수 도구 확인
check_requirements() {
    log_info "필수 도구 확인 중..."
    
    # Java 확인
    if ! command -v java &> /dev/null; then
        log_error "Java가 설치되어 있지 않습니다. Java 8 이상이 필요합니다."
        exit 1
    fi
    
    # bundletool 확인
    if [ ! -f "$BUNDLETOOL_JAR" ]; then
        log_error "bundletool을 찾을 수 없습니다: $BUNDLETOOL_JAR"
        log_info "bundletool을 다운로드하거나 경로를 확인하세요."
        exit 1
    fi
    
    log_info "모든 필수 도구가 확인되었습니다."
}

# 함수: AAB 파일 찾기
find_aab_file() {
    local AAB_FILE="$1"
    
    # 인자로 파일 경로가 제공된 경우
    if [ -n "$AAB_FILE" ] && [ -f "$AAB_FILE" ]; then
        echo "$AAB_FILE"
        return 0
    fi
    
    # 현재 디렉토리에서 AAB 파일 검색
    AAB_FILE=$(find . -maxdepth 1 -name "*.aab" -type f | head -1)
    
    if [ -n "$AAB_FILE" ]; then
        echo "$AAB_FILE"
        return 0
    fi
    
    # 하위 디렉토리에서도 검색
    AAB_FILE=$(find . -name "*.aab" -type f | head -1)
    
    if [ -n "$AAB_FILE" ]; then
        echo "$AAB_FILE"
        return 0
    fi
    
    return 1
}

# 함수: AAB를 APKS로 변환
convert_aab_to_apks() {
    local AAB_FILE="$1"
    
    if [ -z "$AAB_FILE" ] || [ ! -f "$AAB_FILE" ]; then
        log_error "유효한 AAB 파일이 필요합니다."
        return 1
    fi
    
    log_info "AAB를 APKS로 변환 중..."
    log_info "AAB 파일: $AAB_FILE"
    
    APKS_FILE="$OUTPUT_DIR/$(basename "$AAB_FILE" .aab).apks"
    
    # keystore 파일 확인
    KEYSTORE_FILE="debug.keystore"
    KEYSTORE_PASSWORD="android"
    KEY_ALIAS="androiddebugkey"
    KEY_PASSWORD="android"
    
    if [ ! -f "$KEYSTORE_FILE" ]; then
        log_warn "Keystore 파일을 찾을 수 없습니다. 기본 debug keystore를 생성합니다."
        log_info "Keystore 생성 중..."
        
        # debug keystore 생성
        keytool -genkey -v -keystore "$KEYSTORE_FILE" \
            -alias "$KEY_ALIAS" \
            -keyalg RSA -keysize 2048 -validity 10000 \
            -storepass "$KEYSTORE_PASSWORD" \
            -keypass "$KEY_PASSWORD" \
            -dname "CN=Android Debug,O=Android,C=US" \
            2>/dev/null || log_warn "Keystore 생성 실패 (이미 존재할 수 있음)"
    fi
    
    # bundletool을 사용하여 AAB를 APKS로 변환
    java -jar "$BUNDLETOOL_JAR" build-apks \
        --bundle="$AAB_FILE" \
        --output="$APKS_FILE" \
        --ks="$KEYSTORE_FILE" \
        --ks-pass="pass:$KEYSTORE_PASSWORD" \
        --ks-key-alias="$KEY_ALIAS" \
        --key-pass="pass:$KEY_PASSWORD" \
        --mode=universal
    
    if [ -f "$APKS_FILE" ]; then
        log_info "APKS 파일 생성 완료: $APKS_FILE"
        echo "$APKS_FILE"
        return 0
    else
        log_error "APKS 파일 생성 실패"
        return 1
    fi
}

# 함수: APKS에서 APK 추출
extract_apk_from_apks() {
    local APKS_FILE="$1"
    
    if [ -z "$APKS_FILE" ] || [ ! -f "$APKS_FILE" ]; then
        log_error "유효한 APKS 파일이 필요합니다."
        return 1
    fi
    
    log_info "APKS에서 APK 추출 중..."
    
    APK_FILE="$OUTPUT_DIR/$(basename "$APKS_FILE" .apks).apk"
    TEMP_DIR="$OUTPUT_DIR/temp_apks_extract"
    
    # 임시 디렉토리 생성
    mkdir -p "$TEMP_DIR"
    
    # APKS 파일 압축 해제
    unzip -q "$APKS_FILE" -d "$TEMP_DIR"
    
    # universal.apk 찾기
    UNIVERSAL_APK=$(find "$TEMP_DIR" -name "universal.apk" -type f | head -1)
    
    if [ -z "$UNIVERSAL_APK" ]; then
        log_error "universal.apk를 찾을 수 없습니다."
        rm -rf "$TEMP_DIR"
        return 1
    fi
    
    # APK 파일 복사
    cp "$UNIVERSAL_APK" "$APK_FILE"
    
    # 임시 디렉토리 정리
    rm -rf "$TEMP_DIR"
    
    if [ -f "$APK_FILE" ]; then
        log_info "APK 파일 추출 완료: $APK_FILE"
        echo "$APK_FILE"
        return 0
    else
        log_error "APK 파일 추출 실패"
        return 1
    fi
}

# 메인 실행
main() {
    log_info "========================================="
    log_info "AAB → APK 변환 스크립트"
    log_info "========================================="
    
    # 필수 도구 확인
    check_requirements
    
    # AAB 파일 찾기
    AAB_FILE=""
    if [ -n "$1" ]; then
        AAB_FILE="$1"
    fi
    
    AAB_FILE=$(find_aab_file "$AAB_FILE")
    
    if [ $? -ne 0 ] || [ -z "$AAB_FILE" ]; then
        log_error "AAB 파일을 찾을 수 없습니다."
        log_info "사용법: $0 [aab-file-path]"
        log_info "또는 현재 디렉토리에 .aab 파일을 배치하세요."
        exit 1
    fi
    
    log_info "AAB 파일 발견: $AAB_FILE"
    
    # AAB를 APKS로 변환
    log_info ""
    log_info "========================================="
    APKS_FILE=$(convert_aab_to_apks "$AAB_FILE")
    if [ $? -ne 0 ] || [ -z "$APKS_FILE" ]; then
        log_error "APKS 변환 실패"
        exit 1
    fi
    
    # APKS에서 APK 추출
    log_info ""
    log_info "========================================="
    APK_FILE=$(extract_apk_from_apks "$APKS_FILE")
    if [ $? -ne 0 ] || [ -z "$APK_FILE" ]; then
        log_error "APK 추출 실패"
        exit 1
    fi
    
    # 완료 메시지
    log_info ""
    log_info "========================================="
    log_info "변환이 완료되었습니다!"
    log_info "========================================="
    log_info "생성된 파일:"
    log_info "  APKS: $APKS_FILE"
    log_info "  APK:  $APK_FILE"
    log_info ""
    log_info "출력 디렉토리: $OUTPUT_DIR"
    log_info "========================================="
}

# 스크립트 실행
main "$@"
