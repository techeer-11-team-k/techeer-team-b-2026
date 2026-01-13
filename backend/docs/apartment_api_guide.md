# 🏠 아파트 정보 API 개발 가이드

외부 API를 사용하여 아파트의 기본 정보와 상세 정보를 제공하는 API를 만드는 전체 흐름을 설명합니다.

---

## 📋 목차

1. [전체 흐름 개요](#전체-흐름-개요)
2. [필요한 파일 목록](#필요한-파일-목록)
3. [단계별 구현 가이드](#단계별-구현-가이드)
4. [외부 API 키 관리](#외부-api-키-관리)
5. [추가로 필요한 정보](#추가로-필요한-정보)

---

## 전체 흐름 개요

```
외부 API (국토부/공공데이터)
    ↓
[1] 환경 변수 설정 (.env)
    ↓
[2] 설정 파일에 API 키 추가 (config.py)
    ↓
[3] 스키마 정의 (schemas/apartment.py)
    ↓
[4] 서비스 레이어 (services/apartment.py) - 외부 API 호출
    ↓
[5] 엔드포인트 정의 (endpoints/apartments.py)
    ↓
[6] 라우터 등록 (router.py)
    ↓
[7] API 사용 가능! (/api/v1/apartments/...)
```

---

## 필요한 파일 목록

### 새로 생성할 파일

1. **`backend/app/schemas/apartment.py`** - 요청/응답 스키마 정의
2. **`backend/app/services/apartment.py`** - 외부 API 호출 로직
3. **`backend/app/api/v1/endpoints/apartments.py`** - API 엔드포인트

### 수정할 파일

1. **`backend/app/core/config.py`** - 외부 API 키 환경 변수 추가
2. **`backend/app/api/v1/router.py`** - 새 라우터 등록
3. **`.env`** (프로젝트 루트) - 실제 API 키 값 설정

---

## 단계별 구현 가이드

### 1단계: 환경 변수 설정

#### 1-1. `.env` 파일에 API 키 추가

프로젝트 루트에 `.env` 파일을 열고 외부 API 키를 추가합니다.

```bash
# .env 파일 (프로젝트 루트)

# 기존 환경 변수들...
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/realestate
CLERK_SECRET_KEY=sk_test_...

# ============================================================
# 외부 API 키 추가
# ============================================================

# 국토교통부 API 키 (예시)
MOLIT_API_KEY=your_molit_api_key_here

# 또는 다른 외부 API 키 (예: 공공데이터포털)
PUBLIC_DATA_API_KEY=your_public_data_api_key_here

# 카카오 REST API 키 (주소 검색 등에 사용)
KAKAO_REST_API_KEY=your_kakao_rest_api_key_here
```

> ⚠️ **주의**: `.env` 파일은 절대 Git에 커밋하지 마세요! `.gitignore`에 이미 포함되어 있습니다.

---

#### 1-2. `config.py`에 환경 변수 추가

`backend/app/core/config.py` 파일을 열고 외부 API 키를 추가합니다.

```python
# backend/app/core/config.py

class Settings(BaseSettings):
    # ... 기존 설정들 ...
    
    # 외부 API
    MOLIT_API_KEY: Optional[str] = None  # 국토부 API 키 (이미 있음)
    PUBLIC_DATA_API_KEY: Optional[str] = None  # 공공데이터포털 API 키 (추가)
    KAKAO_REST_API_KEY: Optional[str] = None  # 카카오 REST API 키 (이미 있음)
    
    # ... 나머지 설정들 ...
```

---

### 2단계: 스키마 정의

#### 2-1. `schemas/apartment.py` 파일 생성

```python
# backend/app/schemas/apartment.py

"""
아파트 관련 스키마 정의

요청(Request)과 응답(Response)의 데이터 구조를 정의합니다.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ============ 요청(Request) 스키마 ============

class ApartmentSearchRequest(BaseModel):
    """아파트 검색 요청"""
    keyword: Optional[str] = Field(None, description="검색 키워드 (아파트명, 주소 등)")
    city: Optional[str] = Field(None, description="시/도")
    district: Optional[str] = Field(None, description="시/군/구")
    page: int = Field(1, ge=1, description="페이지 번호")
    limit: int = Field(20, ge=1, le=100, description="페이지당 개수")
    
    class Config:
        json_schema_extra = {
            "example": {
                "keyword": "래미안",
                "city": "서울특별시",
                "district": "강남구",
                "page": 1,
                "limit": 20
            }
        }


# ============ 응답(Response) 스키마 ============

class ApartmentBase(BaseModel):
    """아파트 기본 정보"""
    apt_id: str = Field(..., description="아파트 고유 ID")
    apt_name: str = Field(..., description="아파트명")
    address: str = Field(..., description="주소")
    city: str = Field(..., description="시/도")
    district: str = Field(..., description="시/군/구")
    dong: Optional[str] = Field(None, description="동")
    build_year: Optional[int] = Field(None, description="준공년도")
    total_households: Optional[int] = Field(None, description="총 세대수")
    latitude: Optional[float] = Field(None, description="위도")
    longitude: Optional[float] = Field(None, description="경도")
    
    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "apt_id": "A1234567890",
                "apt_name": "래미안 강남파크",
                "address": "서울특별시 강남구 역삼동 123",
                "city": "서울특별시",
                "district": "강남구",
                "dong": "역삼동",
                "build_year": 2020,
                "total_households": 500,
                "latitude": 37.5012,
                "longitude": 127.0395
            }
        }


class ApartmentDetail(ApartmentBase):
    """아파트 상세 정보 (기본 정보 + 추가 정보)"""
    # 기본 정보는 ApartmentBase에서 상속
    
    # 추가 상세 정보
    apt_type: Optional[str] = Field(None, description="아파트 유형")
    total_parking: Optional[int] = Field(None, description="총 주차대수")
    management_office: Optional[str] = Field(None, description="관리사무소 연락처")
    facilities: Optional[List[str]] = Field(None, description="부대시설 목록")
    nearby_stations: Optional[List[str]] = Field(None, description="인근 지하철역")
    nearby_schools: Optional[List[str]] = Field(None, description="인근 학교")
    
    # 가격 정보
    recent_avg_price: Optional[float] = Field(None, description="최근 평균 가격 (만원)")
    price_trend: Optional[str] = Field(None, description="가격 추이 (상승/하락/보합)")
    
    class Config:
        json_schema_extra = {
            "example": {
                **ApartmentBase.Config.json_schema_extra["example"],
                "apt_type": "아파트",
                "total_parking": 300,
                "management_office": "02-1234-5678",
                "facilities": ["헬스장", "독서실", "어린이집"],
                "nearby_stations": ["역삼역", "선릉역"],
                "nearby_schools": ["역삼초등학교"],
                "recent_avg_price": 120000.0,
                "price_trend": "상승"
            }
        }


class ApartmentListResponse(BaseModel):
    """아파트 목록 응답"""
    success: bool = True
    data: List[ApartmentBase]
    meta: dict = Field(..., description="메타 정보 (페이지네이션 등)")


class ApartmentDetailResponse(BaseModel):
    """아파트 상세 정보 응답"""
    success: bool = True
    data: ApartmentDetail
    meta: Optional[dict] = Field(None, description="메타 정보 (데이터 출처 등)")
```

---

### 3단계: 서비스 레이어 구현

#### 3-1. `services/apartment.py` 파일 생성

외부 API를 호출하는 로직을 여기에 구현합니다.

```python
# backend/app/services/apartment.py

"""
아파트 관련 비즈니스 로직

외부 API를 호출하여 아파트 정보를 가져옵니다.
"""
import httpx
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundException, ExternalAPIException
from app.schemas.apartment import ApartmentBase, ApartmentDetail


class ApartmentService:
    """
    아파트 관련 서비스
    
    외부 API를 호출하여 아파트 정보를 조회합니다.
    """
    
    # 외부 API 기본 URL (예시 - 실제 API에 맞게 수정)
    MOLIT_API_BASE_URL = "http://openapi.molit.go.kr:8081"
    PUBLIC_DATA_API_BASE_URL = "http://apis.data.go.kr"
    
    async def _call_external_api(
        self,
        url: str,
        params: Dict[str, Any],
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        외부 API 호출 공통 메서드
        
        Args:
            url: API 엔드포인트 URL
            params: 쿼리 파라미터
            api_key: API 키 (없으면 settings에서 가져옴)
        
        Returns:
            API 응답 데이터
        
        Raises:
            ExternalAPIException: API 호출 실패 시
        """
        # API 키가 없으면 설정에서 가져오기
        if not api_key:
            api_key = settings.MOLIT_API_KEY or settings.PUBLIC_DATA_API_KEY
        
        if not api_key:
            raise ExternalAPIException("API 키가 설정되지 않았습니다.")
        
        # API 키를 파라미터에 추가 (API에 따라 다를 수 있음)
        params["serviceKey"] = api_key  # 공공데이터포털 형식
        # 또는 params["key"] = api_key  # 다른 API 형식
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()  # HTTP 에러 발생 시 예외 발생
                return response.json()
        except httpx.HTTPError as e:
            raise ExternalAPIException(f"외부 API 호출 실패: {str(e)}")
        except Exception as e:
            raise ExternalAPIException(f"API 처리 중 오류 발생: {str(e)}")
    
    async def search_apartments(
        self,
        db: AsyncSession,
        *,
        keyword: Optional[str] = None,
        city: Optional[str] = None,
        district: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        아파트 검색 (기본 정보 목록)
        
        Args:
            db: 데이터베이스 세션
            keyword: 검색 키워드
            city: 시/도
            district: 시/군/구
            page: 페이지 번호
            limit: 페이지당 개수
        
        Returns:
            검색 결과 딕셔너리
        """
        # 외부 API 호출
        url = f"{self.MOLIT_API_BASE_URL}/OpenAPI_ToolInstallPackage/service/rest/GetRTMSDataSvcAptRent"
        
        params = {
            "numOfRows": limit,
            "pageNo": page,
            # 실제 API 파라미터에 맞게 수정 필요
        }
        
        if keyword:
            params["keyword"] = keyword
        if city:
            params["city"] = city
        if district:
            params["district"] = district
        
        # 외부 API 호출
        api_response = await self._call_external_api(url, params)
        
        # API 응답을 내부 스키마로 변환
        apartments = []
        if "response" in api_response and "body" in api_response["response"]:
            items = api_response["response"]["body"].get("items", {}).get("item", [])
            if not isinstance(items, list):
                items = [items] if items else []
            
            for item in items:
                apartments.append(ApartmentBase(
                    apt_id=item.get("apt_id", ""),
                    apt_name=item.get("apt_name", ""),
                    address=item.get("address", ""),
                    city=item.get("city", ""),
                    district=item.get("district", ""),
                    dong=item.get("dong"),
                    build_year=int(item.get("build_year")) if item.get("build_year") else None,
                    total_households=int(item.get("total_households")) if item.get("total_households") else None,
                    latitude=float(item.get("latitude")) if item.get("latitude") else None,
                    longitude=float(item.get("longitude")) if item.get("longitude") else None,
                ))
        
        return {
            "apartments": apartments,
            "total": len(apartments),
            "page": page,
            "limit": limit
        }
    
    async def get_apartment_detail(
        self,
        db: AsyncSession,
        *,
        apt_id: str
    ) -> ApartmentDetail:
        """
        아파트 상세 정보 조회
        
        Args:
            db: 데이터베이스 세션
            apt_id: 아파트 고유 ID
        
        Returns:
            아파트 상세 정보
        
        Raises:
            NotFoundException: 아파트를 찾을 수 없는 경우
        """
        # 외부 API 호출 (상세 정보)
        url = f"{self.MOLIT_API_BASE_URL}/OpenAPI_ToolInstallPackage/service/rest/GetRTMSDataSvcAptRent"
        
        params = {
            "apt_id": apt_id
        }
        
        # 외부 API 호출
        api_response = await self._call_external_api(url, params)
        
        # API 응답 파싱
        if "response" in api_response and "body" in api_response["response"]:
            items = api_response["response"]["body"].get("items", {}).get("item", [])
            if not isinstance(items, list):
                items = [items] if items else []
            
            if not items:
                raise NotFoundException("아파트")
            
            item = items[0]
            
            # 기본 정보
            detail = ApartmentDetail(
                apt_id=item.get("apt_id", ""),
                apt_name=item.get("apt_name", ""),
                address=item.get("address", ""),
                city=item.get("city", ""),
                district=item.get("district", ""),
                dong=item.get("dong"),
                build_year=int(item.get("build_year")) if item.get("build_year") else None,
                total_households=int(item.get("total_households")) if item.get("total_households") else None,
                latitude=float(item.get("latitude")) if item.get("latitude") else None,
                longitude=float(item.get("longitude")) if item.get("longitude") else None,
                
                # 상세 정보 (API 응답에 따라 다를 수 있음)
                apt_type=item.get("apt_type"),
                total_parking=int(item.get("total_parking")) if item.get("total_parking") else None,
                management_office=item.get("management_office"),
                facilities=item.get("facilities", "").split(",") if item.get("facilities") else None,
                recent_avg_price=float(item.get("recent_avg_price")) if item.get("recent_avg_price") else None,
                price_trend=item.get("price_trend"),
            )
            
            return detail
        else:
            raise NotFoundException("아파트")


# 싱글톤 인스턴스
apartment_service = ApartmentService()
```

> ⚠️ **주의**: 위 코드는 예시입니다. 실제 사용하는 외부 API의 문서를 참고하여 URL, 파라미터, 응답 형식을 수정해야 합니다.

---

### 4단계: 엔드포인트 정의

#### 4-1. `endpoints/apartments.py` 파일 생성

```python
# backend/app/api/v1/endpoints/apartments.py

"""
아파트 관련 API 엔드포인트

담당 기능:
- 아파트 검색 (GET /apartments/search)
- 아파트 기본 정보 조회 (GET /apartments/{apt_id})
- 아파트 상세 정보 조회 (GET /apartments/{apt_id}/detail)
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.services.apartment import apartment_service
from app.schemas.apartment import (
    ApartmentSearchRequest,
    ApartmentListResponse,
    ApartmentDetailResponse
)
from app.core.exceptions import NotFoundException, ExternalAPIException

router = APIRouter()


@router.get(
    "/search",
    response_model=dict,
    summary="아파트 검색",
    description="키워드, 지역으로 아파트를 검색합니다."
)
async def search_apartments(
    keyword: Optional[str] = Query(None, description="검색 키워드 (아파트명, 주소 등)"),
    city: Optional[str] = Query(None, description="시/도"),
    district: Optional[str] = Query(None, description="시/군/구"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    limit: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    db: AsyncSession = Depends(get_db)
):
    """
    ## 아파트 검색 API
    
    ### Query Parameters
    - **keyword**: 검색 키워드 (아파트명, 주소 등)
    - **city**: 시/도 (예: 서울특별시)
    - **district**: 시/군/구 (예: 강남구)
    - **page**: 페이지 번호 (기본값: 1)
    - **limit**: 페이지당 개수 (기본값: 20, 최대: 100)
    
    ### Response
    - 성공: 아파트 목록 반환
    - 실패: 400 (잘못된 요청) 또는 500 (서버 오류)
    """
    try:
        result = await apartment_service.search_apartments(
            db,
            keyword=keyword,
            city=city,
            district=district,
            page=page,
            limit=limit
        )
        
        return {
            "success": True,
            "data": result["apartments"],
            "meta": {
                "page": result["page"],
                "limit": result["limit"],
                "total": result["total"],
                "data_source": "국토교통부"
            }
        }
    except ExternalAPIException as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "EXTERNAL_API_ERROR",
                "message": str(e)
            }
        )


@router.get(
    "/{apt_id}",
    response_model=dict,
    summary="아파트 기본 정보",
    description="아파트의 기본 정보를 조회합니다."
)
async def get_apartment(
    apt_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    ## 아파트 기본 정보 조회 API
    
    ### Path Parameter
    - **apt_id**: 아파트 고유 ID
    
    ### Response
    - 성공: 아파트 기본 정보 반환
    - 실패: 404 (아파트를 찾을 수 없음)
    """
    try:
        detail = await apartment_service.get_apartment_detail(db, apt_id=apt_id)
        
        return {
            "success": True,
            "data": detail,
            "meta": {
                "data_source": "국토교통부",
                "disclaimer": "본 서비스는 과거 데이터 기반 시각화이며 투자 판단/권유를 제공하지 않습니다."
            }
        }
    except NotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "APT_NOT_FOUND",
                "message": "아파트를 찾을 수 없습니다."
            }
        )
    except ExternalAPIException as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "EXTERNAL_API_ERROR",
                "message": str(e)
            }
        )


@router.get(
    "/{apt_id}/detail",
    response_model=dict,
    summary="아파트 상세 정보",
    description="아파트의 상세 정보를 조회합니다."
)
async def get_apartment_detail(
    apt_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    ## 아파트 상세 정보 조회 API
    
    ### Path Parameter
    - **apt_id**: 아파트 고유 ID
    
    ### Response
    - 성공: 아파트 상세 정보 반환 (기본 정보 + 추가 정보)
    - 실패: 404 (아파트를 찾을 수 없음)
    """
    try:
        detail = await apartment_service.get_apartment_detail(db, apt_id=apt_id)
        
        return {
            "success": True,
            "data": detail,
            "meta": {
                "data_source": "국토교통부",
                "disclaimer": "본 서비스는 과거 데이터 기반 시각화이며 투자 판단/권유를 제공하지 않습니다."
            }
        }
    except NotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "APT_NOT_FOUND",
                "message": "아파트를 찾을 수 없습니다."
            }
        )
    except ExternalAPIException as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "EXTERNAL_API_ERROR",
                "message": str(e)
            }
        )
```

---

### 5단계: 라우터 등록

#### 5-1. `router.py`에 새 라우터 추가

`backend/app/api/v1/router.py` 파일을 열고 새 라우터를 등록합니다.

```python
# backend/app/api/v1/router.py

from fastapi import APIRouter

from app.api.v1.endpoints import auth, admin, apartments  # apartments 추가

# ... 기존 코드 ...

# ============================================================
# 아파트 관련 API
# ============================================================
# 아파트 검색 및 상세 정보 조회
#
# 엔드포인트:
# - GET  /api/v1/apartments/search        - 아파트 검색
# - GET  /api/v1/apartments/{apt_id}      - 아파트 기본 정보
# - GET  /api/v1/apartments/{apt_id}/detail - 아파트 상세 정보
#
# 파일 위치: app/api/v1/endpoints/apartments.py
api_router.include_router(
    apartments.router,
    prefix="/apartments",  # URL prefix: /api/v1/apartments/...
    tags=["🏠 Apartment (아파트)"]  # Swagger UI에서 그룹화할 태그
)
```

---

### 6단계: 예외 처리 추가 (선택)

외부 API 호출 시 발생할 수 있는 예외를 처리하기 위해 `backend/app/core/exceptions.py`에 예외 클래스를 추가할 수 있습니다.

```python
# backend/app/core/exceptions.py (기존 파일에 추가)

class ExternalAPIException(Exception):
    """외부 API 호출 실패 예외"""
    pass
```

---

## 외부 API 키 관리

### API 키 저장 위치

1. **`.env` 파일** (프로젝트 루트)
   - 실제 API 키 값을 저장
   - ⚠️ Git에 커밋하지 않음 (`.gitignore`에 포함됨)

2. **`config.py`** (`backend/app/core/config.py`)
   - 환경 변수를 읽어서 설정 클래스에 정의
   - 코드에서 `settings.API_KEY` 형태로 사용

### API 키 사용 방법

```python
# services/apartment.py에서 사용 예시

from app.core.config import settings

# API 키 가져오기
api_key = settings.MOLIT_API_KEY

# API 호출 시 사용
params = {
    "serviceKey": api_key,  # API에 따라 파라미터 이름이 다를 수 있음
    # ... 다른 파라미터들 ...
}
```

### 환경 변수 설정 순서

1. **외부 API에서 API 키 발급받기**
   - 공공데이터포털: https://www.data.go.kr
   - 국토교통부 API: https://www.data.go.kr (공공데이터포털)
   - 카카오 개발자: https://developers.kakao.com

2. **`.env` 파일에 추가**
   ```bash
   MOLIT_API_KEY=실제_발급받은_키_값
   ```

3. **서버 재시작**
   ```bash
   docker-compose restart backend
   ```

---

## 추가로 필요한 정보

### 1. 외부 API 문서 확인

- **API 엔드포인트 URL**: 정확한 API 주소
- **인증 방식**: API 키를 헤더에 넣는지, 쿼리 파라미터에 넣는지
- **요청 파라미터**: 필수/선택 파라미터 목록
- **응답 형식**: JSON 구조 (XML인 경우 파싱 필요)
- **에러 코드**: 각 에러 코드의 의미

### 2. 필요한 Python 패키지

외부 API 호출을 위해 `httpx`가 필요합니다. `requirements.txt`에 추가되어 있는지 확인하세요.

```bash
# requirements.txt에 추가 (없는 경우)
httpx>=0.24.0
```

설치:
```bash
pip install httpx
# 또는
pip install -r requirements.txt
```

### 3. 데이터베이스 모델 (선택)

외부 API에서 받은 데이터를 DB에 저장하려면 모델이 필요합니다.

- `backend/app/models/apartment.py` 파일 생성
- SQLAlchemy 모델 정의
- CRUD 작업 추가 (`backend/app/crud/apartment.py`)

하지만 외부 API만 사용하고 DB에 저장하지 않는다면 불필요합니다.

---

## 완성된 API 엔드포인트

구현이 완료되면 다음 엔드포인트를 사용할 수 있습니다:

### 1. 아파트 검색
```http
GET /api/v1/apartments/search?keyword=래미안&city=서울특별시&district=강남구&page=1&limit=20
```

### 2. 아파트 기본 정보
```http
GET /api/v1/apartments/{apt_id}
```

### 3. 아파트 상세 정보
```http
GET /api/v1/apartments/{apt_id}/detail
```

---

## 테스트 방법

### 1. Swagger UI에서 테스트

```bash
# 서버 실행 후
http://localhost:8000/docs
```

Swagger UI에서 직접 API를 테스트할 수 있습니다.

### 2. curl로 테스트

```bash
# 아파트 검색
curl "http://localhost:8000/api/v1/apartments/search?keyword=래미안&page=1&limit=20"

# 아파트 상세 정보
curl "http://localhost:8000/api/v1/apartments/A1234567890/detail"
```

### 3. Python으로 테스트

```python
import httpx

async def test_apartment_api():
    async with httpx.AsyncClient() as client:
        # 검색
        response = await client.get(
            "http://localhost:8000/api/v1/apartments/search",
            params={"keyword": "래미안", "page": 1, "limit": 20}
        )
        print(response.json())
        
        # 상세 정보
        response = await client.get(
            "http://localhost:8000/api/v1/apartments/A1234567890/detail"
        )
        print(response.json())
```

---

## 주의사항

1. **외부 API 제한**: API 호출 횟수 제한이 있을 수 있으므로, 필요시 캐싱을 고려하세요.
2. **에러 처리**: 외부 API가 실패할 경우를 대비한 에러 처리가 필요합니다.
3. **타임아웃**: 외부 API 호출 시 타임아웃을 설정하세요 (예: 10초).
4. **API 키 보안**: API 키는 절대 코드에 하드코딩하지 마세요. 환경 변수로만 관리하세요.

---

## 다음 단계

1. ✅ 외부 API 문서 확인 및 API 키 발급
2. ✅ 위 단계에 따라 파일 생성 및 구현
3. ✅ `.env` 파일에 API 키 설정
4. ✅ 서버 재시작 및 테스트
5. ✅ 프론트엔드에서 API 호출 구현

---

**마지막 업데이트**: 2026-01-11
