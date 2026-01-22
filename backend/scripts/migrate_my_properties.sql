-- ============================================================
-- 🏠 my_properties 테이블 마이그레이션
-- ============================================================
-- 누락된 컬럼 추가: purchase_price, loan_amount, purchase_date
-- 
-- 사용법:
--   docker exec -i realestate-db psql -U postgres -d realestate < migrate_my_properties.sql
-- 또는
--   docker exec -it realestate-db psql -U postgres -d realestate -f /app/scripts/migrate_my_properties.sql
-- ============================================================

-- purchase_price 컬럼 추가 (구매가, 만원 단위)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'my_properties' 
        AND column_name = 'purchase_price'
    ) THEN
        ALTER TABLE my_properties 
        ADD COLUMN purchase_price INTEGER NULL;
        
        COMMENT ON COLUMN my_properties.purchase_price IS '구매가 (만원)';
        
        RAISE NOTICE '✅ purchase_price 컬럼 추가 완료';
    ELSE
        RAISE NOTICE 'ℹ️  purchase_price 컬럼이 이미 존재합니다';
    END IF;
END $$;

-- loan_amount 컬럼 추가 (대출 금액, 만원 단위)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'my_properties' 
        AND column_name = 'loan_amount'
    ) THEN
        ALTER TABLE my_properties 
        ADD COLUMN loan_amount INTEGER NULL;
        
        COMMENT ON COLUMN my_properties.loan_amount IS '대출 금액 (만원)';
        
        RAISE NOTICE '✅ loan_amount 컬럼 추가 완료';
    ELSE
        RAISE NOTICE 'ℹ️  loan_amount 컬럼이 이미 존재합니다';
    END IF;
END $$;

-- purchase_date 컬럼 추가 (매입일)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'my_properties' 
        AND column_name = 'purchase_date'
    ) THEN
        ALTER TABLE my_properties 
        ADD COLUMN purchase_date TIMESTAMP NULL;
        
        COMMENT ON COLUMN my_properties.purchase_date IS '매입일';
        
        RAISE NOTICE '✅ purchase_date 컬럼 추가 완료';
    ELSE
        RAISE NOTICE 'ℹ️  purchase_date 컬럼이 이미 존재합니다';
    END IF;
END $$;

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ my_properties 테이블 마이그레이션 완료';
    RAISE NOTICE '   - purchase_price 컬럼 추가됨';
    RAISE NOTICE '   - loan_amount 컬럼 추가됨';
    RAISE NOTICE '   - purchase_date 컬럼 추가됨';
END $$;
