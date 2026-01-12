# 📜 scripts 폴더 가이드

> 마지막 업데이트: 2026-01-11

## 🎯 이 폴더는 뭐하는 곳이에요?

`scripts/` 폴더는 **개발 및 운영에 필요한 스크립트**를 모아두는 곳이에요!

### 쉬운 비유로 이해하기

공장의 **자동화 도구 보관함**을 생각해보세요:
- 기계 시작 버튼 (서버 실행)
- 초기 세팅 도구 (DB 초기화)
- 정기 점검 도구 (데이터 백업)

이런 도구들을 잘 정리해두면 반복 작업이 편해지죠!
scripts 폴더는 이런 **"자동화 도구들"**을 모아두는 곳이에요!

## 📁 이 폴더에 들어갈 파일들

```
scripts/
├── init_db.py           # 데이터베이스 초기화
├── seed_data.py         # 테스트/초기 데이터 삽입
├── create_superuser.py  # 관리자 계정 생성
├── import_apartments.py # 아파트 데이터 대량 import
├── update_prices.py     # 실거래가 데이터 업데이트
├── backup_db.py         # 데이터베이스 백업
├── clean_cache.py       # 캐시 정리
└── run_dev.sh           # 개발 서버 실행 스크립트
```

## 📝 코드 예시

### 1. 데이터베이스 초기화 (init_db.py)

```python
#!/usr/bin/env python
"""
데이터베이스 초기화 스크립트

사용법:
    python scripts/init_db.py

주의: 기존 데이터가 모두 삭제됩니다!
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 path에 추가
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine

from app.db.base import Base
from app.core.config import settings


async def init_db():
    """데이터베이스 테이블 초기화"""
    print(f"🔄 데이터베이스 초기화 시작...")
    print(f"📍 DB: {settings.DATABASE_URL}")
    
    engine = create_async_engine(settings.DATABASE_URL)
    
    async with engine.begin() as conn:
        # 기존 테이블 삭제
        print("🗑️  기존 테이블 삭제 중...")
        await conn.run_sync(Base.metadata.drop_all)
        
        # 새 테이블 생성
        print("✨ 새 테이블 생성 중...")
        await conn.run_sync(Base.metadata.create_all)
    
    await engine.dispose()
    print("✅ 데이터베이스 초기화 완료!")


if __name__ == "__main__":
    confirm = input("⚠️  모든 데이터가 삭제됩니다. 계속하시겠습니까? (yes/no): ")
    
    if confirm.lower() == "yes":
        asyncio.run(init_db())
    else:
        print("취소되었습니다.")
```

### 2. 시드 데이터 삽입 (seed_data.py)

```python
#!/usr/bin/env python
"""
테스트용 시드 데이터 삽입 스크립트

사용법:
    python scripts/seed_data.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session
from app.crud.account import account as account_crud
from app.crud.apartment import apartment as apartment_crud
from app.schemas.account import AccountCreate


# 시드 데이터 정의
SEED_USERS = [
    {
        "email": "admin@example.com",
        "password": "Admin1234!",
        "name": "관리자"
    },
    {
        "email": "user1@example.com",
        "password": "User1234!",
        "name": "테스트유저1"
    },
    {
        "email": "user2@example.com",
        "password": "User1234!",
        "name": "테스트유저2"
    },
]

SEED_APARTMENTS = [
    {
        "name": "래미안 테스트아파트",
        "address": "서울시 강남구 테스트동 123",
        "latitude": 37.5172,
        "longitude": 127.0473,
        "built_year": 2020,
        "total_units": 500
    },
    {
        "name": "자이 샘플아파트",
        "address": "서울시 서초구 샘플동 456",
        "latitude": 37.4837,
        "longitude": 127.0324,
        "built_year": 2018,
        "total_units": 300
    },
    # ... 더 많은 데이터
]


async def seed_users(db: AsyncSession):
    """사용자 시드 데이터 삽입"""
    print("\n👤 사용자 데이터 삽입 중...")
    
    for user_data in SEED_USERS:
        # 이미 존재하는지 확인
        existing = await account_crud.get_by_email(db, email=user_data["email"])
        if existing:
            print(f"  ⏭️  {user_data['email']} - 이미 존재")
            continue
        
        user_in = AccountCreate(**user_data)
        await account_crud.create(db, obj_in=user_in)
        print(f"  ✅ {user_data['email']} - 생성됨")


async def seed_apartments(db: AsyncSession):
    """아파트 시드 데이터 삽입"""
    print("\n🏢 아파트 데이터 삽입 중...")
    
    for apt_data in SEED_APARTMENTS:
        # 간단히 이름으로 중복 체크
        existing = await apartment_crud.search_by_name(
            db, 
            keyword=apt_data["name"],
            limit=1
        )
        if existing:
            print(f"  ⏭️  {apt_data['name']} - 이미 존재")
            continue
        
        # 위치 데이터 추가 (PostGIS Point)
        from geoalchemy2 import functions as geo_func
        apt_data["location"] = geo_func.ST_SetSRID(
            geo_func.ST_MakePoint(
                apt_data["longitude"],
                apt_data["latitude"]
            ),
            4326
        )
        
        # 직접 모델 생성
        from app.models.apartment import Apartment
        apt = Apartment(**apt_data)
        db.add(apt)
        print(f"  ✅ {apt_data['name']} - 생성됨")
    
    await db.commit()


async def main():
    """메인 시드 함수"""
    print("🌱 시드 데이터 삽입 시작...")
    
    async with async_session() as db:
        await seed_users(db)
        await seed_apartments(db)
    
    print("\n✅ 시드 데이터 삽입 완료!")


if __name__ == "__main__":
    asyncio.run(main())
```

### 3. 관리자 계정 생성 (create_superuser.py)

```python
#!/usr/bin/env python
"""
관리자 계정 생성 스크립트

사용법:
    python scripts/create_superuser.py
    
    # 또는 인자로 전달
    python scripts/create_superuser.py admin@example.com Admin1234! 관리자
"""
import asyncio
import sys
from pathlib import Path
from getpass import getpass

sys.path.append(str(Path(__file__).parent.parent))

from app.db.session import async_session
from app.crud.account import account as account_crud
from app.schemas.account import AccountCreate


async def create_superuser(email: str, password: str, name: str):
    """관리자 계정 생성"""
    async with async_session() as db:
        # 중복 확인
        existing = await account_crud.get_by_email(db, email=email)
        if existing:
            print(f"❌ 에러: {email}은(는) 이미 존재하는 이메일입니다.")
            return False
        
        # 계정 생성
        user_in = AccountCreate(
            email=email,
            password=password,
            name=name
        )
        
        user = await account_crud.create(db, obj_in=user_in)
        
        # 관리자 권한 부여 (is_superuser 필드가 있다면)
        # user.is_superuser = True
        # db.add(user)
        # await db.commit()
        
        print(f"✅ 관리자 계정이 생성되었습니다!")
        print(f"   이메일: {email}")
        print(f"   이름: {name}")
        
        return True


async def main():
    """메인 함수"""
    # 인자로 전달된 경우
    if len(sys.argv) == 4:
        email, password, name = sys.argv[1], sys.argv[2], sys.argv[3]
    else:
        # 대화형 입력
        print("🔐 관리자 계정 생성")
        print("-" * 30)
        
        email = input("이메일: ").strip()
        password = getpass("비밀번호: ")
        password_confirm = getpass("비밀번호 확인: ")
        
        if password != password_confirm:
            print("❌ 비밀번호가 일치하지 않습니다.")
            return
        
        name = input("이름: ").strip()
    
    await create_superuser(email, password, name)


if __name__ == "__main__":
    asyncio.run(main())
```

### 4. 아파트 데이터 Import (import_apartments.py)

```python
#!/usr/bin/env python
"""
아파트 데이터 대량 Import 스크립트

사용법:
    python scripts/import_apartments.py data/apartments.csv
"""
import asyncio
import sys
import csv
from pathlib import Path
from typing import List, Dict

sys.path.append(str(Path(__file__).parent.parent))

from tqdm import tqdm  # 진행률 표시
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session
from app.models.apartment import Apartment


async def import_from_csv(file_path: str, batch_size: int = 100):
    """CSV 파일에서 아파트 데이터 import"""
    print(f"📂 파일 읽는 중: {file_path}")
    
    # CSV 읽기
    apartments = []
    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        apartments = list(reader)
    
    print(f"📊 총 {len(apartments)}건의 데이터 발견")
    
    # 배치 처리
    async with async_session() as db:
        for i in tqdm(range(0, len(apartments), batch_size), desc="Importing"):
            batch = apartments[i:i + batch_size]
            
            for apt_data in batch:
                # 데이터 변환
                apt = Apartment(
                    name=apt_data["name"],
                    address=apt_data["address"],
                    dong=apt_data.get("dong"),
                    latitude=float(apt_data["latitude"]),
                    longitude=float(apt_data["longitude"]),
                    built_year=int(apt_data["built_year"]) if apt_data.get("built_year") else None,
                    total_units=int(apt_data["total_units"]) if apt_data.get("total_units") else None,
                )
                db.add(apt)
            
            # 배치 커밋
            await db.commit()
    
    print(f"✅ Import 완료!")


async def main():
    if len(sys.argv) < 2:
        print("사용법: python scripts/import_apartments.py <csv_file>")
        print("예시: python scripts/import_apartments.py data/apartments.csv")
        return
    
    file_path = sys.argv[1]
    
    if not Path(file_path).exists():
        print(f"❌ 파일을 찾을 수 없습니다: {file_path}")
        return
    
    await import_from_csv(file_path)


if __name__ == "__main__":
    asyncio.run(main())
```

### 5. 개발 서버 실행 스크립트 (run_dev.sh)

```bash
#!/bin/bash
# 개발 서버 실행 스크립트
#
# 사용법:
#   ./scripts/run_dev.sh

set -e  # 에러 발생 시 중단

echo "🚀 개발 서버 시작 중..."

# 가상환경 활성화 (있다면)
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "✅ 가상환경 활성화됨"
fi

# 환경변수 로드
if [ -f ".env" ]; then
    export $(cat .env | grep -v '#' | xargs)
    echo "✅ 환경변수 로드됨"
fi

# 데이터베이스 마이그레이션 체크
echo "🔄 마이그레이션 확인 중..."
alembic upgrade head

# Uvicorn으로 서버 실행
echo "🌐 서버 시작: http://localhost:8000"
echo "📚 API 문서: http://localhost:8000/docs"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"
echo ""

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 6. 캐시 정리 (clean_cache.py)

```python
#!/usr/bin/env python
"""
캐시 정리 스크립트

사용법:
    python scripts/clean_cache.py           # 전체 캐시 삭제
    python scripts/clean_cache.py apartment # 아파트 관련 캐시만 삭제
"""
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

# Redis 사용 시
# import redis
# from app.core.config import settings

# 인메모리 캐시 사용 시
from app.utils.cache import clear_cache


async def clean_all():
    """전체 캐시 삭제"""
    print("🗑️  전체 캐시 삭제 중...")
    clear_cache("*")
    print("✅ 완료!")


async def clean_pattern(pattern: str):
    """특정 패턴 캐시 삭제"""
    print(f"🗑️  '{pattern}' 패턴 캐시 삭제 중...")
    clear_cache(pattern)
    print("✅ 완료!")


async def main():
    if len(sys.argv) > 1:
        pattern = sys.argv[1]
        await clean_pattern(pattern)
    else:
        await clean_all()


if __name__ == "__main__":
    asyncio.run(main())
```

## 🚀 스크립트 사용 가이드

### 실행 권한 부여 (Linux/Mac)

```bash
chmod +x scripts/*.sh
chmod +x scripts/*.py
```

### 스크립트 실행 방법

```bash
# Python 스크립트
python scripts/init_db.py
python scripts/seed_data.py
python scripts/create_superuser.py

# Bash 스크립트
./scripts/run_dev.sh
# 또는
bash scripts/run_dev.sh
```

## 💡 스크립트 작성 팁

### 1. 항상 확인 메시지 추가

```python
# 위험한 작업 전에는 확인!
confirm = input("⚠️  모든 데이터가 삭제됩니다. 계속하시겠습니까? (yes/no): ")
if confirm.lower() != "yes":
    print("취소되었습니다.")
    sys.exit(0)
```

### 2. 로깅 추가

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

logger.info("작업 시작")
logger.error("에러 발생!")
```

### 3. 진행률 표시

```python
from tqdm import tqdm

for item in tqdm(items, desc="Processing"):
    process(item)
```

### 4. 에러 처리

```python
try:
    await risky_operation()
except Exception as e:
    print(f"❌ 에러 발생: {e}")
    sys.exit(1)
```

## ❓ 자주 묻는 질문

### Q: 스크립트에서 앱 모듈을 import 할 수 없어요

프로젝트 루트를 path에 추가하세요:
```python
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
```

### Q: 환경변수를 어떻게 로드하나요?

```python
from dotenv import load_dotenv
load_dotenv()  # .env 파일 자동 로드
```

### Q: 스크립트를 cron으로 실행하려면?

```bash
# crontab -e
# 매일 새벽 3시에 데이터 업데이트
0 3 * * * cd /path/to/project && python scripts/update_prices.py >> /var/log/update.log 2>&1
```

## 📚 참고 자료

- [Python argparse](https://docs.python.org/3/library/argparse.html)
- [Click - CLI 라이브러리](https://click.palletsprojects.com/)
- [tqdm - 진행률 표시](https://tqdm.github.io/)
