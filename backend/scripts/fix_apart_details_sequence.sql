-- apart_details 테이블의 apt_detail_id 시퀀스 재동기화
-- 이 스크립트는 시퀀스가 실제 데이터와 동기화되지 않을 때 실행해야 합니다.

-- 현재 시퀀스 값 확인
SELECT currval('apart_details_apt_detail_id_seq') as current_sequence_value;

-- 현재 최대 apt_detail_id 값 확인
SELECT MAX(apt_detail_id) as max_apt_detail_id FROM apart_details;

-- 시퀀스를 실제 최대값 + 1로 재설정
-- COALESCE를 사용하여 데이터가 없을 경우 0으로 시작
SELECT setval(
    'apart_details_apt_detail_id_seq', 
    COALESCE((SELECT MAX(apt_detail_id) FROM apart_details), 0) + 1, 
    false
) as new_sequence_value;

-- 재설정 후 확인
SELECT currval('apart_details_apt_detail_id_seq') as updated_sequence_value;
