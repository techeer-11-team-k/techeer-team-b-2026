-- Sales Monthly Stats (Materialized View)
-- This view aggregates sales data by year and month for faster querying.
-- Execute this script in your PostgreSQL database to create the view.
-- Note: You need to update your application code to query this view instead of the raw tables if you want to use it.

-- 기존에 잘못된 스키마로 만들어진 뷰가 있을 수 있으므로, 항상 드롭 후 재생성
DROP MATERIALIZED VIEW IF EXISTS mv_sales_monthly_stats;

CREATE MATERIALIZED VIEW mv_sales_monthly_stats AS
SELECT
    EXTRACT(YEAR FROM s.contract_date)::INTEGER as year,
    EXTRACT(MONTH FROM s.contract_date)::INTEGER as month,
    st.region_id,
    st.city_name,
    st.region_name,
    COUNT(s.trans_id) as transaction_count,
    AVG(s.trans_price) as avg_price,
    AVG(s.trans_price / NULLIF(s.exclusive_area, 0) * 3.3) as avg_price_per_pyeong
FROM sales s
JOIN apartments a ON s.apt_id = a.apt_id
JOIN states st ON a.region_id = st.region_id
WHERE s.is_canceled = false 
  AND (s.is_deleted = false OR s.is_deleted IS NULL)
  AND s.contract_date IS NOT NULL
GROUP BY 
    EXTRACT(YEAR FROM s.contract_date), 
    EXTRACT(MONTH FROM s.contract_date),
    st.region_id, 
    st.city_name, 
    st.region_name;

-- Indexes for the Materialized View
CREATE INDEX IF NOT EXISTS idx_mv_sales_year_month ON mv_sales_monthly_stats(year, month);
CREATE INDEX IF NOT EXISTS idx_mv_sales_city_name ON mv_sales_monthly_stats(city_name);
CREATE INDEX IF NOT EXISTS idx_mv_sales_region_id ON mv_sales_monthly_stats(region_id);

-- Function to refresh the view
CREATE OR REPLACE FUNCTION refresh_mv_sales_monthly_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_monthly_stats;
END;
$$ LANGUAGE plpgsql;
