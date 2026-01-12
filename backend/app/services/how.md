# 🧠 services 폴더 가이드

> 마지막 업데이트: 2026-01-11

## 🎯 이 폴더는 뭐하는 곳이에요?

`services/` 폴더는 **비즈니스 로직**을 담당하는 곳이에요!

### 쉬운 비유로 이해하기

레스토랑을 생각해보세요:
- **웨이터 (Endpoint)**: 주문을 받음
- **셰프 (Service)**: 요리를 만듦 ← 여기!
- **식재료 창고 (CRUD)**: 재료를 가져옴
- **레시피북 (Model)**: 재료 정보

셰프는 여러 재료를 조합해서 **맛있는 요리(결과)**를 만들어요.
services 폴더는 이 **"셰프 역할"**을 하는 곳이에요!

## 📁 이 폴더에 들어갈 파일들

```
services/
├── __init__.py          # 서비스 모듈 초기화
├── auth.py              # 인증/인가 서비스
├── apartment.py         # 아파트 관련 서비스
├── map.py               # 지도 데이터 서비스
├── search.py            # 검색 서비스
├── dashboard.py         # 대시보드 서비스
├── favorite.py          # 관심 매물/지역 서비스
├── my_property.py       # 내 자산 서비스
├── indicator.py         # 지표/통계 서비스
├── news.py              # 뉴스 크롤링 서비스
├── ai.py                # AI 추천 서비스
└── external/            # 외부 API 연동
    ├── __init__.py
    ├── public_data.py   # 공공데이터 API
    └── news_api.py      # 뉴스 API
```

## 🔄 서비스의 역할

```
┌─────────────────────────────────────────────────────────┐
│                      Endpoint                           │
│         (요청 받기, 응답 보내기만 담당)                   │
└────────────────────────┬────────────────────────────────┘
                         │ 
                         ▼
┌─────────────────────────────────────────────────────────┐
│                      Service                            │
│  • 비즈니스 규칙 적용                                     │
│  • 여러 CRUD 조합                                        │
│  • 외부 API 연동                                         │
│  • 데이터 가공/계산                                      │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌────────┐    ┌────────┐    ┌────────────┐
     │  CRUD  │    │  CRUD  │    │ 외부 API   │
     └────────┘    └────────┘    └────────────┘
```

## 📝 코드 예시

### 1. 인증 서비스 (auth.py)

```python
from datetime import timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.account import account as account_crud
from app.models.account import Account
from app.schemas.account import AccountCreate
from app.schemas.token import Token
from app.core.security import (
    create_access_token, 
    create_refresh_token,
    verify_password
)
from app.core.config import settings
from app.core.exceptions import (
    AlreadyExistsException,
    UnauthorizedException,
    NotFoundException
)


class AuthService:
    """
    인증 관련 비즈니스 로직
    
    - 회원가입: 중복 체크 → 사용자 생성
    - 로그인: 인증 → 토큰 발급
    - 토큰 갱신: 리프레시 토큰 검증 → 새 토큰 발급
    """
    
    async def register(
        self, 
        db: AsyncSession, 
        user_in: AccountCreate
    ) -> Account:
        """
        회원가입
        
        1. 이메일 중복 확인
        2. 비밀번호 해싱
        3. 사용자 생성
        """
        # 1. 이메일 중복 체크
        existing_user = await account_crud.get_by_email(db, email=user_in.email)
        if existing_user:
            raise AlreadyExistsException("이미 등록된 이메일입니다")
        
        # 2. 사용자 생성 (CRUD에서 비밀번호 해싱 처리)
        user = await account_crud.create(db, obj_in=user_in)
        
        return user
    
    async def login(
        self, 
        db: AsyncSession, 
        email: str, 
        password: str
    ) -> Token:
        """
        로그인
        
        1. 사용자 인증
        2. 활성 상태 확인
        3. 토큰 발급
        """
        # 1. 이메일/비밀번호 확인
        user = await account_crud.authenticate(
            db, 
            email=email, 
            password=password
        )
        if not user:
            raise UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다")
        
        # 2. 활성 상태 확인
        if not await account_crud.is_active(user):
            raise UnauthorizedException("비활성화된 계정입니다")
        
        # 3. 토큰 발급
        access_token = create_access_token(
            subject=user.id,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        refresh_token = create_refresh_token(subject=user.id)
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer"
        )
    
    async def refresh_token(
        self, 
        db: AsyncSession, 
        user_id: int
    ) -> Token:
        """
        토큰 갱신
        
        리프레시 토큰이 유효한 경우 새 토큰 쌍 발급
        """
        user = await account_crud.get(db, id=user_id)
        if not user:
            raise NotFoundException("사용자를 찾을 수 없습니다")
        
        access_token = create_access_token(
            subject=user.id,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        refresh_token = create_refresh_token(subject=user.id)
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer"
        )


# 싱글톤 인스턴스
auth_service = AuthService()
```

### 2. 아파트 서비스 (apartment.py)

여러 CRUD를 조합하고 데이터를 가공하는 예시에요.

```python
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from decimal import Decimal

from app.crud.apartment import apartment as apartment_crud
from app.crud.transaction import transaction as transaction_crud
from app.crud.favorite import favorite_apartment as favorite_crud
from app.schemas.apartment import ApartmentDetail, ApartmentListItem
from app.schemas.map import BoundsRequest, MapMarker
from app.core.exceptions import NotFoundException


class ApartmentService:
    """
    아파트 관련 비즈니스 로직
    
    - 상세 정보 조회 (거래 내역 포함)
    - 지도 영역 내 아파트 목록
    - 검색 기능
    - 가격 통계 계산
    """
    
    async def get_apartment_detail(
        self, 
        db: AsyncSession, 
        apartment_id: int,
        user_id: Optional[int] = None
    ) -> dict:
        """
        아파트 상세 정보 조회
        
        1. 아파트 기본 정보
        2. 최근 거래 내역
        3. (로그인시) 관심 매물 여부
        """
        # 1. 아파트 정보
        apartment = await apartment_crud.get(db, id=apartment_id)
        if not apartment:
            raise NotFoundException("아파트를 찾을 수 없습니다")
        
        # 2. 최근 거래 내역 (최근 10건)
        transactions = await transaction_crud.get_by_apartment(
            db, 
            apartment_id=apartment_id,
            limit=10
        )
        
        # 3. 관심 매물 여부 (로그인한 경우만)
        is_favorited = False
        if user_id:
            favorite = await favorite_crud.get_by_user_and_apartment(
                db,
                account_id=user_id,
                apartment_id=apartment_id
            )
            is_favorited = favorite is not None
        
        return {
            "apartment": apartment,
            "transactions": transactions,
            "is_favorited": is_favorited
        }
    
    async def get_apartments_in_bounds(
        self, 
        db: AsyncSession, 
        bounds: BoundsRequest,
        skip: int = 0,
        limit: int = 100
    ) -> List[MapMarker]:
        """
        지도 영역 내 아파트 마커 조회
        
        1. 영역 내 아파트 검색
        2. 평균 가격 계산
        3. 마커 데이터로 변환
        """
        apartments = await apartment_crud.get_by_bounds(
            db,
            min_lat=bounds.min_lat,
            max_lat=bounds.max_lat,
            min_lng=bounds.min_lng,
            max_lng=bounds.max_lng,
            skip=skip,
            limit=limit
        )
        
        markers = []
        for apt in apartments:
            # 각 아파트의 최근 거래 평균가 계산
            avg_price = await self._calculate_avg_price(db, apt.id)
            
            markers.append(MapMarker(
                id=apt.id,
                latitude=apt.latitude,
                longitude=apt.longitude,
                name=apt.name,
                price=avg_price,
                marker_type="apartment"
            ))
        
        return markers
    
    async def _calculate_avg_price(
        self, 
        db: AsyncSession, 
        apartment_id: int,
        months: int = 6
    ) -> Optional[Decimal]:
        """최근 N개월 평균 거래가 계산 (내부 헬퍼 메서드)"""
        transactions = await transaction_crud.get_recent_by_apartment(
            db,
            apartment_id=apartment_id,
            months=months
        )
        
        if not transactions:
            return None
        
        total = sum(t.price for t in transactions)
        return total / len(transactions)
    
    async def get_price_trend(
        self, 
        db: AsyncSession, 
        apartment_id: int,
        months: int = 12
    ) -> List[dict]:
        """
        가격 추이 데이터 조회 (대시보드용)
        
        월별 평균 거래가를 계산해서 반환
        """
        transactions = await transaction_crud.get_by_apartment_with_period(
            db,
            apartment_id=apartment_id,
            months=months
        )
        
        # 월별로 그룹핑
        monthly_data = {}
        for t in transactions:
            month_key = t.transaction_date.strftime("%Y-%m")
            if month_key not in monthly_data:
                monthly_data[month_key] = []
            monthly_data[month_key].append(t.price)
        
        # 평균 계산
        trend = []
        for month, prices in sorted(monthly_data.items()):
            trend.append({
                "month": month,
                "avg_price": sum(prices) / len(prices),
                "count": len(prices)
            })
        
        return trend


# 싱글톤 인스턴스
apartment_service = ApartmentService()
```

### 3. 대시보드 서비스 (dashboard.py)

여러 서비스를 조합하는 고급 예시에요.

```python
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.apartment import apartment as apartment_crud
from app.crud.my_property import my_property as my_property_crud
from app.crud.favorite import favorite_apartment as favorite_crud
from app.services.apartment import apartment_service
from app.services.indicator import indicator_service


class DashboardService:
    """
    대시보드 비즈니스 로직
    
    여러 데이터를 조합해서 대시보드에 필요한 정보를 제공
    """
    
    async def get_user_dashboard(
        self, 
        db: AsyncSession, 
        user_id: int
    ) -> dict:
        """
        사용자 맞춤 대시보드 데이터
        
        1. 내 자산 현황
        2. 관심 매물 목록
        3. 관심 지역 시세 변동
        4. 추천 매물
        """
        # 1. 내 자산 현황
        my_properties = await my_property_crud.get_by_user(
            db, 
            account_id=user_id
        )
        
        total_asset_value = sum(
            p.current_value or 0 for p in my_properties
        )
        
        # 2. 관심 매물 (최근 5개)
        favorites = await favorite_crud.get_by_user(
            db, 
            account_id=user_id,
            limit=5
        )
        
        # 3. 관심 매물 가격 변동
        favorite_trends = []
        for fav in favorites:
            trend = await apartment_service.get_price_trend(
                db, 
                apartment_id=fav.apartment_id,
                months=3
            )
            favorite_trends.append({
                "apartment_id": fav.apartment_id,
                "trend": trend
            })
        
        # 4. 전체 시장 지표
        market_indicators = await indicator_service.get_market_summary(db)
        
        return {
            "my_properties": {
                "count": len(my_properties),
                "total_value": total_asset_value,
                "items": my_properties[:5]  # 최근 5개만
            },
            "favorites": {
                "count": len(favorites),
                "items": favorites,
                "trends": favorite_trends
            },
            "market_indicators": market_indicators
        }


# 싱글톤 인스턴스
dashboard_service = DashboardService()
```

### 4. 외부 API 서비스 (external/public_data.py)

```python
import httpx
from typing import Optional, List
from app.core.config import settings
from app.core.exceptions import ExternalAPIException


class PublicDataService:
    """
    공공데이터포털 API 연동
    
    아파트 실거래가, 공시가격 등 공공데이터를 가져와요.
    """
    
    def __init__(self):
        self.base_url = "https://apis.data.go.kr/1613000"
        self.api_key = settings.PUBLIC_DATA_API_KEY
    
    async def get_apartment_transactions(
        self, 
        region_code: str,
        deal_year: int,
        deal_month: int
    ) -> List[dict]:
        """
        아파트 실거래가 조회
        
        공공데이터포털에서 특정 지역/기간의 거래 내역을 가져와요.
        """
        url = f"{self.base_url}/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
        
        params = {
            "serviceKey": self.api_key,
            "LAWD_CD": region_code,  # 지역코드
            "DEAL_YMD": f"{deal_year}{deal_month:02d}",  # 거래년월
            "pageNo": 1,
            "numOfRows": 1000,
            "_type": "json"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params, timeout=30.0)
                response.raise_for_status()
                
                data = response.json()
                items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
                
                # 리스트가 아닌 경우 (1건만 있을 때) 리스트로 변환
                if isinstance(items, dict):
                    items = [items]
                
                return items
                
            except httpx.HTTPError as e:
                raise ExternalAPIException(f"공공데이터 API 호출 실패: {str(e)}")
    
    async def get_official_price(
        self, 
        apartment_id: str
    ) -> Optional[dict]:
        """공시가격 조회"""
        # ... 구현
        pass


# 싱글톤 인스턴스
public_data_service = PublicDataService()
```

## 💡 Service vs CRUD 비교

| 관점 | CRUD | Service |
|------|------|---------|
| **책임** | DB 읽기/쓰기 | 비즈니스 로직 |
| **복잡도** | 단순 | 복잡 |
| **조합** | 단일 테이블 | 여러 CRUD + 외부 API |
| **예시** | `get(id)` | `get_dashboard(user_id)` |

### 언제 Service를 사용해야 할까요?

```python
# ❌ 이런 건 CRUD에서 바로 처리
apartment = await apartment_crud.get(db, id=1)

# ✅ 이런 복잡한 로직은 Service에서 처리
# - 여러 테이블 조회
# - 데이터 가공/계산
# - 외부 API 연동
# - 비즈니스 규칙 적용
result = await apartment_service.get_apartment_detail(db, apartment_id=1, user_id=current_user.id)
```

## 🚀 개발 순서 가이드

1. **1단계**: `auth.py` - 인증 서비스
2. **2단계**: `apartment.py` - 핵심 아파트 서비스
3. **3단계**: `map.py`, `search.py` - 지도/검색
4. **4단계**: `external/` - 외부 API 연동
5. **5단계**: `dashboard.py`, `indicator.py` - 대시보드

## ❓ 자주 묻는 질문

### Q: Endpoint에서 직접 CRUD를 호출해도 되나요?
간단한 조회는 괜찮지만, 비즈니스 로직이 있으면 Service를 거치는 게 좋아요.
```python
# 간단한 조회 - 직접 CRUD 호출 OK
@router.get("/{id}")
async def get_user(id: int, db: AsyncSession = Depends(get_db)):
    return await account_crud.get(db, id=id)

# 복잡한 로직 - Service 사용
@router.get("/{id}/dashboard")
async def get_dashboard(id: int, db: AsyncSession = Depends(get_db)):
    return await dashboard_service.get_user_dashboard(db, user_id=id)
```

### Q: 트랜잭션은 어디서 관리하나요?
여러 DB 작업이 하나의 트랜잭션으로 묶여야 하면 Service에서 관리해요.
```python
async def transfer_property(self, db: AsyncSession, ...):
    async with db.begin():  # 트랜잭션 시작
        await crud_a.update(...)
        await crud_b.delete(...)
        # 둘 중 하나라도 실패하면 전체 롤백!
```

### Q: 외부 API 호출은 왜 별도 폴더로 분리하나요?
1. **관심사 분리**: 외부 의존성을 명확히 분리
2. **테스트 용이**: 모킹(mocking)하기 쉬움
3. **재사용**: 여러 서비스에서 공통으로 사용

## 📚 참고 자료

- [클린 아키텍처](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design (DDD)](https://martinfowler.com/bliki/DomainDrivenDesign.html)
