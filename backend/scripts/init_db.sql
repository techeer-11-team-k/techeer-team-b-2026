-- ============================================================
-- 🏠 부동산 분석 플랫폼 - 데이터베이스 초기화 스크립트
-- ============================================================
-- 사용법: psql -U postgres -d realestate -f init_db.sql
-- 또는 Docker 컨테이너에서 실행:
-- docker exec -i realestate-db psql -U postgres -d realestate < init_db.sql

-- ============================================================
-- PostGIS 확장 활성화 (공간 데이터 지원)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- ACCOUNTS 테이블 (사용자 계정) - Clerk 인증 사용
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    account_id SERIAL PRIMARY KEY,
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    profile_image_url VARCHAR(500),
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_accounts_clerk_user_id ON accounts(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_is_deleted ON accounts(is_deleted);

-- 코멘트 추가
COMMENT ON TABLE accounts IS '사용자 계정 테이블 (Clerk 인증 사용)';
COMMENT ON COLUMN accounts.clerk_user_id IS 'Clerk 사용자 ID (유니크)';
COMMENT ON COLUMN accounts.email IS '이메일 주소 (유니크)';
COMMENT ON COLUMN accounts.is_deleted IS '소프트 삭제 여부';

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '데이터베이스 초기화 완료!';
    RAISE NOTICE 'accounts 테이블이 생성되었습니다.';
END $$;
