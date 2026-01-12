# 🛠️ utils 폴더 가이드

> 마지막 업데이트: 2026-01-11

## 🎯 이 폴더는 뭐하는 곳이에요?

`utils/` 폴더는 **여러 곳에서 공통으로 사용하는 도구 함수들**을 모아두는 곳이에요!

### 쉬운 비유로 이해하기

주방의 **만능 조리도구 서랍**을 생각해보세요:
- 계량컵 (단위 변환)
- 타이머 (시간 관련 유틸)
- 저울 (데이터 검증)

어떤 요리를 만들든 이 도구들은 항상 필요하죠?
utils 폴더는 이런 **"만능 도구들"**을 모아두는 곳이에요!

## 📁 이 폴더에 들어갈 파일들

```
utils/
├── __init__.py          # 유틸리티 모듈 초기화
├── datetime_utils.py    # 날짜/시간 관련 유틸
├── format_utils.py      # 데이터 포맷 변환
├── geo_utils.py         # 지리/좌표 관련 유틸
├── validators.py        # 데이터 검증 함수
├── pagination.py        # 페이지네이션 헬퍼
├── cache.py             # 캐싱 유틸리티
└── helpers.py           # 기타 헬퍼 함수
```

## 📝 코드 예시

### 1. 날짜/시간 유틸 (datetime_utils.py)

```python
from datetime import datetime, date, timedelta
from typing import Optional
import pytz


# 한국 시간대
KST = pytz.timezone("Asia/Seoul")


def now_kst() -> datetime:
    """현재 한국 시간 반환"""
    return datetime.now(KST)


def today_kst() -> date:
    """오늘 날짜 (한국 기준) 반환"""
    return now_kst().date()


def format_date(dt: datetime, format: str = "%Y-%m-%d") -> str:
    """
    날짜를 문자열로 포맷
    
    Args:
        dt: datetime 객체
        format: 출력 형식 (기본: YYYY-MM-DD)
    
    Returns:
        포맷된 문자열
    
    Example:
        >>> format_date(datetime(2026, 1, 11))
        "2026-01-11"
    """
    return dt.strftime(format)


def parse_date(date_str: str, format: str = "%Y-%m-%d") -> Optional[datetime]:
    """
    문자열을 datetime으로 파싱
    
    Args:
        date_str: 날짜 문자열
        format: 입력 형식
    
    Returns:
        datetime 객체 또는 None (파싱 실패시)
    """
    try:
        return datetime.strptime(date_str, format)
    except ValueError:
        return None


def get_month_range(year: int, month: int) -> tuple[datetime, datetime]:
    """
    특정 월의 시작일과 종료일 반환
    
    Example:
        >>> get_month_range(2026, 1)
        (datetime(2026, 1, 1), datetime(2026, 1, 31, 23, 59, 59))
    """
    start = datetime(year, month, 1, tzinfo=KST)
    
    # 다음 달 1일에서 1초 빼기
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=KST) - timedelta(seconds=1)
    else:
        end = datetime(year, month + 1, 1, tzinfo=KST) - timedelta(seconds=1)
    
    return start, end


def time_ago(dt: datetime) -> str:
    """
    "~전" 형식으로 시간 표시
    
    Example:
        >>> time_ago(datetime.now() - timedelta(hours=2))
        "2시간 전"
    """
    now = now_kst()
    diff = now - dt
    
    seconds = diff.total_seconds()
    
    if seconds < 60:
        return "방금 전"
    elif seconds < 3600:
        return f"{int(seconds // 60)}분 전"
    elif seconds < 86400:
        return f"{int(seconds // 3600)}시간 전"
    elif seconds < 2592000:  # 30일
        return f"{int(seconds // 86400)}일 전"
    elif seconds < 31536000:  # 365일
        return f"{int(seconds // 2592000)}개월 전"
    else:
        return f"{int(seconds // 31536000)}년 전"
```

### 2. 포맷 유틸 (format_utils.py)

```python
from decimal import Decimal
from typing import Union


def format_price(price: Union[int, float, Decimal]) -> str:
    """
    가격을 한국식으로 포맷
    
    Example:
        >>> format_price(1234567890)
        "12억 3,456만원"
        
        >>> format_price(45000)
        "4.5만원"
    """
    price = int(price)
    
    if price >= 100000000:  # 1억 이상
        eok = price // 100000000
        man = (price % 100000000) // 10000
        if man > 0:
            return f"{eok}억 {man:,}만원"
        return f"{eok}억원"
    elif price >= 10000:  # 1만 이상
        man = price / 10000
        if man == int(man):
            return f"{int(man)}만원"
        return f"{man:.1f}만원"
    else:
        return f"{price:,}원"


def format_area(area_sqm: float) -> str:
    """
    면적 포맷 (제곱미터 → 평)
    
    Example:
        >>> format_area(84.5)
        "84.5㎡ (약 25.6평)"
    """
    pyeong = area_sqm / 3.3058
    return f"{area_sqm}㎡ (약 {pyeong:.1f}평)"


def format_percentage(value: float, decimals: int = 1) -> str:
    """
    백분율 포맷
    
    Example:
        >>> format_percentage(0.1234)
        "+12.3%"
        
        >>> format_percentage(-0.05)
        "-5.0%"
    """
    percent = value * 100
    sign = "+" if percent > 0 else ""
    return f"{sign}{percent:.{decimals}f}%"


def format_phone(phone: str) -> str:
    """
    전화번호 포맷
    
    Example:
        >>> format_phone("01012345678")
        "010-1234-5678"
    """
    phone = phone.replace("-", "").replace(" ", "")
    
    if len(phone) == 11:
        return f"{phone[:3]}-{phone[3:7]}-{phone[7:]}"
    elif len(phone) == 10:
        return f"{phone[:3]}-{phone[3:6]}-{phone[6:]}"
    else:
        return phone


def truncate_text(text: str, max_length: int = 50, suffix: str = "...") -> str:
    """
    텍스트 자르기
    
    Example:
        >>> truncate_text("이것은 매우 긴 텍스트입니다", 10)
        "이것은 매우..."
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix
```

### 3. 지리/좌표 유틸 (geo_utils.py)

```python
from math import radians, sin, cos, sqrt, atan2
from typing import Tuple


def haversine_distance(
    lat1: float, 
    lng1: float, 
    lat2: float, 
    lng2: float
) -> float:
    """
    두 좌표 사이의 거리 계산 (Haversine 공식)
    
    Args:
        lat1, lng1: 첫 번째 좌표 (위도, 경도)
        lat2, lng2: 두 번째 좌표 (위도, 경도)
    
    Returns:
        거리 (미터 단위)
    
    Example:
        >>> haversine_distance(37.5665, 126.9780, 37.5172, 127.0473)
        8943.67  # 서울역 ~ 강남역 약 8.9km
    """
    R = 6371000  # 지구 반경 (미터)
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lng = radians(lng2 - lng1)
    
    a = sin(delta_lat / 2) ** 2 + \
        cos(lat1_rad) * cos(lat2_rad) * sin(delta_lng / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    
    return R * c


def format_distance(meters: float) -> str:
    """
    거리를 읽기 쉬운 형식으로 포맷
    
    Example:
        >>> format_distance(500)
        "500m"
        
        >>> format_distance(2500)
        "2.5km"
    """
    if meters < 1000:
        return f"{int(meters)}m"
    else:
        return f"{meters / 1000:.1f}km"


def get_bounding_box(
    lat: float, 
    lng: float, 
    radius_km: float
) -> Tuple[float, float, float, float]:
    """
    중심점과 반경으로 바운딩 박스 계산
    
    Args:
        lat: 중심 위도
        lng: 중심 경도
        radius_km: 반경 (km)
    
    Returns:
        (min_lat, max_lat, min_lng, max_lng)
    """
    # 대략적인 계산 (정확한 계산은 더 복잡함)
    lat_delta = radius_km / 111  # 1도 ≈ 111km
    lng_delta = radius_km / (111 * cos(radians(lat)))
    
    return (
        lat - lat_delta,
        lat + lat_delta,
        lng - lng_delta,
        lng + lng_delta
    )


def is_point_in_bounds(
    lat: float, 
    lng: float, 
    bounds: Tuple[float, float, float, float]
) -> bool:
    """
    점이 바운딩 박스 안에 있는지 확인
    
    Args:
        lat: 확인할 위도
        lng: 확인할 경도
        bounds: (min_lat, max_lat, min_lng, max_lng)
    
    Returns:
        바운딩 박스 안에 있으면 True
    """
    min_lat, max_lat, min_lng, max_lng = bounds
    return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng
```

### 4. 데이터 검증 (validators.py)

```python
import re
from typing import Optional


def is_valid_email(email: str) -> bool:
    """
    이메일 형식 검증
    
    Example:
        >>> is_valid_email("user@example.com")
        True
        
        >>> is_valid_email("invalid-email")
        False
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def is_valid_phone(phone: str) -> bool:
    """
    한국 휴대폰 번호 검증
    
    Example:
        >>> is_valid_phone("010-1234-5678")
        True
        
        >>> is_valid_phone("01012345678")
        True
    """
    # 숫자만 추출
    digits = re.sub(r'\D', '', phone)
    
    # 010으로 시작하고 11자리
    return len(digits) == 11 and digits.startswith('010')


def is_valid_password(password: str) -> tuple[bool, Optional[str]]:
    """
    비밀번호 강도 검증
    
    조건:
    - 최소 8자
    - 대문자, 소문자, 숫자 각각 1개 이상
    
    Returns:
        (유효 여부, 에러 메시지 또는 None)
    
    Example:
        >>> is_valid_password("Abc12345")
        (True, None)
        
        >>> is_valid_password("abc123")
        (False, "비밀번호는 8자 이상이어야 합니다")
    """
    if len(password) < 8:
        return False, "비밀번호는 8자 이상이어야 합니다"
    
    if not re.search(r'[A-Z]', password):
        return False, "대문자가 1개 이상 포함되어야 합니다"
    
    if not re.search(r'[a-z]', password):
        return False, "소문자가 1개 이상 포함되어야 합니다"
    
    if not re.search(r'\d', password):
        return False, "숫자가 1개 이상 포함되어야 합니다"
    
    return True, None


def sanitize_input(text: str) -> str:
    """
    사용자 입력 정리 (XSS 방지 등)
    
    Example:
        >>> sanitize_input("  Hello <script>alert('xss')</script>  ")
        "Hello"
    """
    # 앞뒤 공백 제거
    text = text.strip()
    
    # HTML 태그 제거
    text = re.sub(r'<[^>]+>', '', text)
    
    # 연속 공백을 하나로
    text = re.sub(r'\s+', ' ', text)
    
    return text
```

### 5. 페이지네이션 (pagination.py)

```python
from typing import TypeVar, Generic, List
from pydantic import BaseModel

T = TypeVar('T')


class PageInfo(BaseModel):
    """페이지네이션 정보"""
    page: int           # 현재 페이지 (1부터 시작)
    size: int           # 페이지당 항목 수
    total: int          # 전체 항목 수
    pages: int          # 전체 페이지 수
    has_next: bool      # 다음 페이지 존재 여부
    has_prev: bool      # 이전 페이지 존재 여부


class PaginatedResult(BaseModel, Generic[T]):
    """페이지네이션된 결과"""
    items: List[T]
    page_info: PageInfo


def calculate_pagination(
    page: int = 1,
    size: int = 20,
    total: int = 0
) -> tuple[int, int, PageInfo]:
    """
    페이지네이션 계산
    
    Args:
        page: 현재 페이지 (1부터 시작)
        size: 페이지당 항목 수
        total: 전체 항목 수
    
    Returns:
        (skip, limit, page_info)
    
    Example:
        >>> skip, limit, info = calculate_pagination(page=2, size=10, total=95)
        >>> skip
        10
        >>> info.pages
        10
    """
    # 유효성 검사
    page = max(1, page)
    size = min(max(1, size), 100)  # 최대 100개
    
    # offset 계산
    skip = (page - 1) * size
    limit = size
    
    # 페이지 정보 계산
    pages = (total + size - 1) // size  # 올림 나눗셈
    
    page_info = PageInfo(
        page=page,
        size=size,
        total=total,
        pages=pages,
        has_next=page < pages,
        has_prev=page > 1
    )
    
    return skip, limit, page_info


def paginate_list(
    items: List[T],
    page: int = 1,
    size: int = 20
) -> PaginatedResult[T]:
    """
    리스트를 페이지네이션
    
    메모리에 이미 있는 리스트를 페이지네이션할 때 사용
    (DB 쿼리에는 calculate_pagination 사용)
    """
    total = len(items)
    skip, limit, page_info = calculate_pagination(page, size, total)
    
    paged_items = items[skip:skip + limit]
    
    return PaginatedResult(
        items=paged_items,
        page_info=page_info
    )
```

### 6. 캐싱 유틸 (cache.py)

```python
import json
from typing import Optional, Any
from functools import wraps
from datetime import timedelta

# Redis 클라이언트는 외부에서 주입
# from app.core.redis import redis_client


def cache_key(*args, **kwargs) -> str:
    """캐시 키 생성"""
    parts = [str(arg) for arg in args]
    parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
    return ":".join(parts)


# 사용 예시를 위한 간단한 인메모리 캐시
_memory_cache: dict[str, Any] = {}


def simple_cache(ttl_seconds: int = 300):
    """
    간단한 캐시 데코레이터 (개발용)
    
    프로덕션에서는 Redis를 사용하세요!
    
    Example:
        @simple_cache(ttl_seconds=60)
        async def get_expensive_data():
            # 비용이 큰 작업
            return result
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{cache_key(*args, **kwargs)}"
            
            # 캐시에서 조회
            if key in _memory_cache:
                return _memory_cache[key]
            
            # 함수 실행
            result = await func(*args, **kwargs)
            
            # 캐시에 저장
            _memory_cache[key] = result
            
            return result
        
        return wrapper
    return decorator


def clear_cache(pattern: str = "*"):
    """캐시 삭제"""
    if pattern == "*":
        _memory_cache.clear()
    else:
        keys_to_delete = [k for k in _memory_cache if pattern in k]
        for k in keys_to_delete:
            del _memory_cache[k]
```

## 🎨 Utils 작성 팁

### 1. 함수는 한 가지 일만!
```python
# ❌ 나쁜 예: 여러 가지 일을 함
def process_and_format_and_validate(data):
    pass

# ✅ 좋은 예: 한 가지 일만
def validate_data(data): pass
def process_data(data): pass
def format_data(data): pass
```

### 2. 명확한 함수 이름
```python
# ❌ 나쁜 예
def convert(x): pass
def do_stuff(data): pass

# ✅ 좋은 예
def meters_to_kilometers(meters): pass
def format_price_korean(price): pass
```

### 3. 문서화 필수!
```python
def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    두 좌표 사이의 거리 계산 (Haversine 공식)
    
    Args:
        lat1, lng1: 첫 번째 좌표
        lat2, lng2: 두 번째 좌표
    
    Returns:
        거리 (미터 단위)
    
    Example:
        >>> haversine_distance(37.5665, 126.9780, 37.5172, 127.0473)
        8943.67
    """
```

## ❓ 자주 묻는 질문

### Q: utils와 helpers의 차이는요?
보통 같은 의미로 사용해요. 프로젝트에서 일관되게 사용하면 됩니다.

### Q: core와 utils의 차이는요?
- **core**: 앱 전체 설정, 보안, 설정 등 핵심 인프라
- **utils**: 순수 유틸리티 함수들 (DB나 설정에 의존하지 않음)

### Q: 유틸 함수는 어디에 두어야 하나요?
- 2곳 이상에서 사용 → `utils/`
- 1곳에서만 사용 → 해당 파일 내부에 private 함수로

## 📚 참고 자료

- [Python 날짜/시간 다루기](https://docs.python.org/3/library/datetime.html)
- [정규표현식 테스트](https://regex101.com/)
