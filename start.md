# 프론트엔드(웹), 백엔드, DB
 - 루트 폴더에서 `docker compose up -d --build` 입력하세요. 

# Expo + RN (앱)
 - mobile 폴더에 들어가서, npm install를 먼저 입력한 후, npx expo start를 입력하세요.

 # DB 초기 세팅
 - docker exec -it realestate-backend python /app/scripts/init_db_from_sql.py 를 입력하면, 테이블이 존재하는 경우 건너뛰고 없으면 초기화하면서 생성.
n
 # DB 관리 (main.py가 있는 곳에, db_admin.py가 존재함.)
 - docker exec -it realestate-backend python -m app.db_admin

 # DB 백업
 - docker exec -it realestate-backend python -m app.db_admin
 - 메뉴에서 8번 선택 (데이터 백업)
 - 백업 파일은 `./db_backup` 폴더에 저장됩니다 (로컬 경로와 동기화됨)


## 📚 더 자세한 정보

- [프로젝트 README](./readme.md)
- [전체 설정 가이드](./README_SETUP.md)
- [API 문서](./docs/api_docs.md)
- [API 개발 체크리스트](./docs/api_check.md)
- [백엔드 문서](./backend/docs/README.md)
