# 부동산 플랫폼 개선안

프론트엔드와 백엔드 전체를 점검하여 도출한 기술 중심 개선안입니다.

---

## 1. 차팅 개선 (20개)

### 1.1. 차트 인터랙션 강화
- 마우스 드래그로 차트 영역 확대/축소 (zoom & pan)
- 더블클릭으로 원래 뷰로 리셋
- 핀치 줌 제스처 지원 (모바일)

### 1.2. 툴팁 개선
- 툴팁에 더 상세한 정보 표시 (전일 대비, 평균 대비)
- 툴팁 위치 자동 조정 (화면 밖으로 나가지 않도록)
- 커스텀 툴팁 렌더러 지원

### 1.3. 다중 시리즈 비교
- 최대 5개 아파트/지역 동시 비교
- 정규화(normalize) 옵션으로 스케일 맞춤
- 차이점 하이라이트 기능

### 1.4. 차트 타입 변환
- 같은 데이터를 선/막대/영역 차트로 전환
- 캔들스틱 차트 옵션 (주가 스타일)
- 누적/비누적 차트 토글

### 1.5. 기간 선택 UI
- 프리셋 버튼 (1개월, 3개월, 1년, 3년, 전체)
- 달력 UI로 정확한 기간 선택
- 기간 비교 모드 (올해 vs 작년)

### 1.6. 애니메이션 효과
```typescript
// recharts 애니메이션 설정
<LineChart>
  <Line
    type="monotone"
    dataKey="price"
    animationDuration={800}
    animationEasing="ease-in-out"
  />
</LineChart>

// 데이터 변경 시 모핑
import { animate } from 'framer-motion';
animate(prevValue, newValue, {
  duration: 0.5,
  onUpdate: (v) => setDisplayValue(v)
});
```

### 1.7. 반응형 차트 레이아웃
```typescript
// ResponsiveContainer 활용
<ResponsiveContainer width="100%" height={400}>
  <LineChart data={data}>
    {/* 모바일에서는 레이블 간소화 */}
    <XAxis 
      dataKey="date" 
      tick={{ fontSize: isMobile ? 10 : 12 }}
      interval={isMobile ? 'preserveStartEnd' : 0}
    />
  </LineChart>
</ResponsiveContainer>
```

### 1.8. 데이터 레이블 최적화
- 중요 포인트에만 레이블 표시 (최고점, 최저점, 현재)
- 레이블 충돌 방지 알고리즘
- 레이블 위치 자동 최적화

### 1.9. 범례 인터랙션
```typescript
// 범례 클릭으로 시리즈 토글
const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

<Legend
  onClick={(e) => {
    const key = e.dataKey;
    setHiddenSeries(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }}
/>

<Line
  dataKey="price"
  hide={hiddenSeries.has('price')}
/>
```

### 1.10. 마이크로 차트 (스파크라인)
```typescript
// 테이블 셀 내 미니 차트
import { Sparklines, SparklinesLine } from 'react-sparklines';

const PriceCell = ({ history }) => (
  <div className="w-20 h-8">
    <Sparklines data={history} svgWidth={80} svgHeight={32}>
      <SparklinesLine color="#3B82F6" />
    </Sparklines>
  </div>
);
```

### 1.11. 복합 차트 (혼합 지표)
```typescript
// 매매가-전세가-금리 복합 차트
<ComposedChart data={data}>
  <Bar dataKey="volume" fill="#E5E7EB" yAxisId="left" />
  <Line dataKey="salePrice" stroke="#3B82F6" yAxisId="right" />
  <Line dataKey="jeonsePrice" stroke="#10B981" yAxisId="right" />
  <Area dataKey="interestRate" fill="#FEF3C7" yAxisId="rate" />
  
  <YAxis yAxisId="left" orientation="left" />
  <YAxis yAxisId="right" orientation="right" />
  <YAxis yAxisId="rate" orientation="right" axisLine={false} />
</ComposedChart>
```

### 1.12. 버블 차트 (다차원 분석)
```typescript
// X: 가격변화율, Y: 거래량변화율, 크기: 평균가, 색상: 지역
<ScatterChart>
  <Scatter
    data={apartmentData}
    fill={(entry) => getRegionColor(entry.region)}
  >
    {apartmentData.map((entry, index) => (
      <Cell 
        key={index}
        r={Math.sqrt(entry.avgPrice) / 10}  // 크기
      />
    ))}
  </Scatter>
</ScatterChart>
```

### 1.13. 히트맵 색상 커스터마이징
```typescript
// 사용자 선택 팔레트
const colorPalettes = {
  default: ['#FEE2E2', '#FECACA', '#FCA5A5', '#F87171', '#EF4444', '#DC2626'],
  colorblind: ['#FFF7ED', '#FFEDD5', '#FED7AA', '#FDBA74', '#FB923C', '#F97316'],
  grayscale: ['#F3F4F6', '#E5E7EB', '#D1D5DB', '#9CA3AF', '#6B7280', '#4B5563'],
};

const getHeatmapColor = (value: number, palette: string) => {
  const colors = colorPalettes[palette];
  const index = Math.min(Math.floor(value / 20), colors.length - 1);
  return colors[index];
};
```

### 1.14. 시계열 래그 분석
```typescript
// 정책 발표-가격 변화 타임라인
const PolicyImpactChart = ({ policies, priceData }) => (
  <LineChart data={priceData}>
    <Line dataKey="price" />
    
    {/* 정책 발표일 마커 */}
    {policies.map(policy => (
      <ReferenceLine
        key={policy.date}
        x={policy.date}
        stroke="#EF4444"
        strokeDasharray="3 3"
        label={{ value: policy.name, position: 'top' }}
      />
    ))}
  </LineChart>
);
```

### 1.15. 차트 이미지 내보내기
```typescript
import html2canvas from 'html2canvas';

const exportChart = async (chartRef: RefObject<HTMLDivElement>) => {
  if (!chartRef.current) return;
  
  const canvas = await html2canvas(chartRef.current);
  const link = document.createElement('a');
  link.download = `chart-${Date.now()}.png`;
  link.href = canvas.toDataURL();
  link.click();
};
```

### 1.16. 실시간 데이터 반영
```typescript
// WebSocket으로 실시간 업데이트
const useRealtimeChart = (aptId: number) => {
  const [data, setData] = useState<DataPoint[]>([]);
  
  useEffect(() => {
    const ws = new WebSocket(`wss://api.example.com/ws/price/${aptId}`);
    
    ws.onmessage = (event) => {
      const newPoint = JSON.parse(event.data);
      setData(prev => [...prev.slice(-99), newPoint]);  // 최근 100개만 유지
    };
    
    return () => ws.close();
  }, [aptId]);
  
  return data;
};
```

### 1.17. 다크 모드 차트
```typescript
const chartTheme = {
  light: {
    background: '#FFFFFF',
    text: '#1F2937',
    grid: '#E5E7EB',
    line: '#3B82F6',
  },
  dark: {
    background: '#1F2937',
    text: '#F3F4F6',
    grid: '#374151',
    line: '#60A5FA',
  },
};

const ChartWrapper = ({ children }) => {
  const { theme } = useTheme();
  const colors = chartTheme[theme];
  
  return (
    <div style={{ background: colors.background }}>
      {React.cloneElement(children, { colors })}
    </div>
  );
};
```

### 1.18. 접근성 개선
```typescript
// 스크린 리더용 차트 설명
<LineChart
  role="img"
  aria-label="2024년 아파트 가격 추이 차트"
>
  {/* 숨겨진 데이터 테이블 (스크린 리더용) */}
  <desc>
    {data.map(d => `${d.date}: ${d.price}만원`).join(', ')}
  </desc>
</LineChart>

// 키보드 네비게이션
const [focusedIndex, setFocusedIndex] = useState(0);
<div
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'ArrowRight') setFocusedIndex(i => Math.min(i + 1, data.length - 1));
    if (e.key === 'ArrowLeft') setFocusedIndex(i => Math.max(i - 1, 0));
  }}
>
```

### 1.19. 3D 시각화
```typescript
// Three.js 기반 3D 막대 차트
import { Canvas } from '@react-three/fiber';

const Bar3D = ({ data }) => (
  <Canvas camera={{ position: [5, 5, 5] }}>
    <ambientLight intensity={0.5} />
    <pointLight position={[10, 10, 10]} />
    
    {data.map((item, i) => (
      <mesh key={i} position={[i * 1.5, item.value / 2, 0]}>
        <boxGeometry args={[1, item.value, 1]} />
        <meshStandardMaterial color={getColor(item.value)} />
      </mesh>
    ))}
    
    <OrbitControls />
  </Canvas>
);
```

### 1.20. 대용량 데이터 차트 최적화
```typescript
// 다운샘플링 (수천 개 포인트 -> 수백 개)
const downsample = (data: DataPoint[], targetPoints: number) => {
  if (data.length <= targetPoints) return data;
  
  const step = Math.ceil(data.length / targetPoints);
  return data.filter((_, i) => i % step === 0);
};

// Canvas 렌더링 (SVG 대신)
import { CanvasRenderer } from 'recharts';

<LineChart renderer={<CanvasRenderer />}>
  <Line dataKey="price" dot={false} />  // 점 비활성화로 성능 향상
</LineChart>
```

---

## 2. 기술적 문제 해결 (20개)

### 2.1. N+1 쿼리 문제 해결
```python
# 문제: 각 아파트마다 추가 쿼리 발생
for apt in apartments:
    transactions = await db.execute(
        select(Sale).where(Sale.apt_id == apt.apt_id)
    )

# 해결: selectinload로 일괄 로드
stmt = (
    select(Apartment)
    .options(selectinload(Apartment.sales))
    .limit(100)
)
result = await db.execute(stmt)
apartments = result.scalars().all()
# 추가 쿼리 없이 apt.sales 접근 가능
```

### 2.2. 메모리 누수 방지 (React)
```typescript
// 문제: 컴포넌트 언마운트 후에도 상태 업데이트 시도
useEffect(() => {
  let isMounted = true;
  
  fetchData().then(data => {
    if (isMounted) {  // 마운트 상태 확인
      setData(data);
    }
  });
  
  return () => {
    isMounted = false;
  };
}, []);

// AbortController 활용
useEffect(() => {
  const controller = new AbortController();
  
  fetch(url, { signal: controller.signal })
    .then(res => res.json())
    .then(setData)
    .catch(err => {
      if (err.name !== 'AbortError') throw err;
    });
  
  return () => controller.abort();
}, [url]);
```

### 2.3. Race Condition 해결
```typescript
// 문제: 빠른 검색 시 이전 요청 결과가 나중에 도착
const [searchId, setSearchId] = useState(0);

const handleSearch = async (query: string) => {
  const currentId = searchId + 1;
  setSearchId(currentId);
  
  const results = await searchApartments(query);
  
  // 현재 ID와 일치하는 경우에만 결과 반영
  if (currentId === searchId) {
    setResults(results);
  }
};

// 또는 useRef 활용
const latestRequestRef = useRef(0);

const handleSearch = async (query: string) => {
  const requestId = ++latestRequestRef.current;
  const results = await searchApartments(query);
  
  if (requestId === latestRequestRef.current) {
    setResults(results);
  }
};
```

### 2.4. 무한 스크롤 중복 요청 방지
```typescript
const useInfiniteScroll = (fetchMore: () => Promise<void>) => {
  const [isLoading, setIsLoading] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  const lastElementRef = useCallback((node: HTMLElement | null) => {
    if (isLoading) return;  // 로딩 중이면 무시
    
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !isLoading) {
        setIsLoading(true);
        await fetchMore();
        setIsLoading(false);
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [isLoading, fetchMore]);
  
  return { lastElementRef, isLoading };
};
```

### 2.5. 동시성 제어 (데이터베이스)
```python
# 문제: 동시에 같은 레코드 수정 시 충돌
# 해결: 낙관적 잠금 (Optimistic Locking)
class Apartment(Base):
    __tablename__ = 'apartments'
    
    apt_id = Column(Integer, primary_key=True)
    version = Column(Integer, default=1)  # 버전 컬럼 추가

async def update_apartment(apt_id: int, data: dict, version: int):
    stmt = (
        update(Apartment)
        .where(
            Apartment.apt_id == apt_id,
            Apartment.version == version  # 버전 체크
        )
        .values(**data, version=version + 1)
    )
    result = await db.execute(stmt)
    
    if result.rowcount == 0:
        raise HTTPException(409, "다른 사용자가 수정했습니다. 새로고침 후 다시 시도해주세요.")
```

### 2.6. 타임존 처리
```python
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')

# 항상 UTC로 저장
def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=KST)  # 타임존 없으면 KST 가정
    return dt.astimezone(timezone.utc)

# 표시할 때 KST로 변환
def to_kst(dt: datetime) -> datetime:
    return dt.astimezone(KST)

# API 응답에서 ISO 형식으로 반환
class SaleResponse(BaseModel):
    contract_date: datetime
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
```

### 2.7. 대용량 파일 업로드 처리
```python
from fastapi import UploadFile
from fastapi.responses import StreamingResponse
import aiofiles

@router.post("/upload")
async def upload_large_file(file: UploadFile):
    # 청크 단위로 저장 (메모리 효율)
    async with aiofiles.open(f"/tmp/{file.filename}", 'wb') as f:
        while chunk := await file.read(1024 * 1024):  # 1MB 청크
            await f.write(chunk)
    
    return {"filename": file.filename}

@router.get("/download/{filename}")
async def download_large_file(filename: str):
    async def stream_file():
        async with aiofiles.open(f"/tmp/{filename}", 'rb') as f:
            while chunk := await f.read(1024 * 1024):
                yield chunk
    
    return StreamingResponse(stream_file())
```

### 2.8. 순환 참조 해결
```python
# 문제: A가 B를 참조하고, B가 A를 참조
# models/apartment.py
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.sale import Sale  # 타입 힌트용으로만 import

class Apartment(Base):
    sales: List[Sale] = relationship("Sale", back_populates="apartment")

# 또는 문자열로 참조
class Apartment(Base):
    sales = relationship("Sale", back_populates="apartment")  # 문자열 사용
```

### 2.9. 긴 트랜잭션 분리
```python
# 문제: 대량 데이터 처리 시 트랜잭션이 너무 길어짐
async def process_all_apartments(db: AsyncSession):
    # 나쁜 예: 전체를 하나의 트랜잭션으로
    apartments = await db.execute(select(Apartment))
    for apt in apartments.scalars():
        await process_apartment(apt)
    await db.commit()  # 오래 걸림

# 좋은 예: 배치 단위로 커밋
BATCH_SIZE = 100
offset = 0

while True:
    async with AsyncSession(engine) as batch_db:
        apartments = await batch_db.execute(
            select(Apartment).offset(offset).limit(BATCH_SIZE)
        )
        batch = apartments.scalars().all()
        
        if not batch:
            break
        
        for apt in batch:
            await process_apartment(apt)
        
        await batch_db.commit()
        offset += BATCH_SIZE
```

### 2.10. API 요청 재시도 로직
```typescript
// 현재 구현된 재시도 로직 개선
const fetchWithRetry = async <T>(
  url: string,
  options: RequestOptions,
  maxRetries = 3
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return await response.json();
      }
      
      // 재시도 불가능한 에러
      if (response.status === 400 || response.status === 401) {
        throw new ApiError(response.status, await response.text());
      }
      
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error as Error;
    }
    
    // 지수 백오프
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  throw lastError;
};
```

### 2.11. XSS 방지
```typescript
// React는 기본적으로 이스케이프하지만, dangerouslySetInnerHTML 사용 시 주의
import DOMPurify from 'dompurify';

const SafeHTML = ({ html }: { html: string }) => (
  <div 
    dangerouslySetInnerHTML={{ 
      __html: DOMPurify.sanitize(html) 
    }} 
  />
);

// 백엔드에서도 검증
from bleach import clean

@router.post("/reviews")
async def create_review(content: str):
    sanitized = clean(
        content,
        tags=['p', 'br', 'strong', 'em'],
        attributes={},
        strip=True
    )
    # 저장
```

### 2.12. SQL Injection 방지
```python
# 나쁜 예: 문자열 포맷팅
query = f"SELECT * FROM apartments WHERE name LIKE '%{user_input}%'"

# 좋은 예: 파라미터 바인딩 (SQLAlchemy가 자동 처리)
stmt = select(Apartment).where(Apartment.apt_name.ilike(f"%{user_input}%"))

# Raw SQL 필요 시
from sqlalchemy import text
stmt = text("SELECT * FROM apartments WHERE name LIKE :pattern")
result = await db.execute(stmt, {"pattern": f"%{user_input}%"})
```

### 2.13. 데드락 방지
```python
# 항상 같은 순서로 락 획득
async def transfer_ownership(from_apt_id: int, to_apt_id: int):
    # 작은 ID부터 락
    first_id, second_id = sorted([from_apt_id, to_apt_id])
    
    async with db.begin():
        await db.execute(
            select(Apartment)
            .where(Apartment.apt_id == first_id)
            .with_for_update()
        )
        await db.execute(
            select(Apartment)
            .where(Apartment.apt_id == second_id)
            .with_for_update()
        )
        # 작업 수행
```

### 2.14. 캐시 스탬피드 방지
```python
import asyncio
from asyncio import Lock

_locks: dict[str, Lock] = {}

async def get_with_lock(key: str, fetch_func):
    """
    캐시 미스 시 하나의 요청만 DB 조회하고 나머지는 대기
    """
    # 캐시 확인
    cached = await get_from_cache(key)
    if cached is not None:
        return cached
    
    # 락 획득
    if key not in _locks:
        _locks[key] = Lock()
    
    async with _locks[key]:
        # 다시 확인 (다른 요청이 이미 캐시했을 수 있음)
        cached = await get_from_cache(key)
        if cached is not None:
            return cached
        
        # DB 조회 및 캐시
        result = await fetch_func()
        await set_to_cache(key, result)
        return result
```

### 2.15. 에러 로깅 개선
```python
import traceback
import json
from datetime import datetime

class StructuredLogger:
    def error(self, message: str, **context):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": "ERROR",
            "message": message,
            "traceback": traceback.format_exc(),
            **context
        }
        print(json.dumps(log_entry))  # JSON 형식으로 출력 (ELK 연동 용이)

logger = StructuredLogger()

@router.get("/apartments/{apt_id}")
async def get_apartment(apt_id: int):
    try:
        return await apartment_service.get(apt_id)
    except Exception as e:
        logger.error(
            "아파트 조회 실패",
            apt_id=apt_id,
            error_type=type(e).__name__,
            user_id=current_user.id if current_user else None
        )
        raise
```

### 2.16. 요청 유효성 검증 강화
```python
from pydantic import BaseModel, validator, Field
from typing import Optional

class ApartmentSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=100)
    limit: int = Field(10, ge=1, le=100)
    min_price: Optional[int] = Field(None, ge=0)
    max_price: Optional[int] = Field(None, ge=0)
    
    @validator('max_price')
    def max_price_must_be_greater(cls, v, values):
        if v is not None and 'min_price' in values:
            if values['min_price'] is not None and v < values['min_price']:
                raise ValueError('max_price must be >= min_price')
        return v
    
    @validator('query')
    def sanitize_query(cls, v):
        # 특수문자 제거
        return ''.join(c for c in v if c.isalnum() or c.isspace())
```

### 2.17. 연결 끊김 복구
```python
from sqlalchemy.exc import OperationalError
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=lambda e: isinstance(e, OperationalError)
)
async def execute_with_retry(db: AsyncSession, stmt):
    try:
        return await db.execute(stmt)
    except OperationalError:
        await db.rollback()
        raise
```

### 2.18. 파일 경로 보안
```python
from pathlib import Path
import os

UPLOAD_DIR = Path("/app/uploads")

def safe_join(base: Path, filename: str) -> Path:
    """
    경로 조작 공격 방지
    """
    # 파일명에서 경로 구분자 제거
    safe_filename = os.path.basename(filename)
    
    # 절대 경로로 변환 후 기본 경로 내에 있는지 확인
    full_path = (base / safe_filename).resolve()
    
    if not str(full_path).startswith(str(base.resolve())):
        raise ValueError("Invalid file path")
    
    return full_path
```

### 2.19. 비밀번호/토큰 안전 비교
```python
import secrets

def safe_compare(a: str, b: str) -> bool:
    """
    타이밍 공격 방지를 위한 상수 시간 비교
    """
    return secrets.compare_digest(a.encode(), b.encode())

# API 키 검증
async def verify_api_key(key: str):
    stored_key = await get_api_key_from_db()
    if not safe_compare(key, stored_key):
        raise HTTPException(401, "Invalid API key")
```

### 2.20. 대용량 JSON 응답 스트리밍
```python
from fastapi.responses import StreamingResponse
import json

async def stream_large_result(db: AsyncSession):
    stmt = select(Apartment)
    result = await db.stream(stmt)
    
    async def generate():
        yield '{"apartments": ['
        first = True
        
        async for row in result:
            if not first:
                yield ','
            first = False
            yield json.dumps(row[0].to_dict())
        
        yield ']}'
    
    return StreamingResponse(
        generate(),
        media_type="application/json"
    )
```

---

## 3. 기술적 진보 (20개)

### 3.1. Elasticsearch 통합
```python
from elasticsearch import AsyncElasticsearch

es = AsyncElasticsearch(['http://elasticsearch:9200'])

# 인덱스 생성
await es.indices.create(
    index='apartments',
    body={
        'mappings': {
            'properties': {
                'apt_name': {
                    'type': 'text',
                    'analyzer': 'korean',  # nori 분석기
                    'fields': {
                        'keyword': {'type': 'keyword'},
                        'suggest': {
                            'type': 'completion',
                            'analyzer': 'simple'
                        }
                    }
                },
                'location': {'type': 'geo_point'},
                'price': {'type': 'integer'}
            }
        }
    }
)

# 검색
async def search_apartments(query: str):
    return await es.search(
        index='apartments',
        body={
            'query': {
                'bool': {
                    'should': [
                        {'match': {'apt_name': {'query': query, 'boost': 3}}},
                        {'match': {'address': query}},
                        {'fuzzy': {'apt_name': {'value': query, 'fuzziness': 'AUTO'}}}
                    ]
                }
            },
            'highlight': {'fields': {'apt_name': {}}}
        }
    )
```

### 3.2. GraphQL API
```python
import strawberry
from strawberry.fastapi import GraphQLRouter

@strawberry.type
class Apartment:
    id: int
    name: str
    price: float
    
    @strawberry.field
    async def transactions(self, limit: int = 10) -> List['Transaction']:
        # 필요한 경우에만 로드 (over-fetching 방지)
        return await get_transactions(self.id, limit)

@strawberry.type
class Query:
    @strawberry.field
    async def apartment(self, id: int) -> Apartment:
        return await get_apartment(id)
    
    @strawberry.field
    async def search_apartments(
        self, 
        query: str,
        min_price: Optional[int] = None,
        max_price: Optional[int] = None
    ) -> List[Apartment]:
        return await search_apartments(query, min_price, max_price)

schema = strawberry.Schema(query=Query)
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")
```

### 3.3. 서버리스 함수 (AWS Lambda)
```python
# 가격 알림 발송 함수
import boto3
from mangum import Mangum

def lambda_handler(event, context):
    """
    EventBridge에서 매시간 트리거
    """
    # 가격 변동 확인
    changed_apartments = check_price_changes()
    
    # 알림 대상 사용자 조회
    for apt in changed_apartments:
        users = get_subscribers(apt['id'])
        
        # SNS로 알림 발송
        sns = boto3.client('sns')
        for user in users:
            sns.publish(
                TopicArn=f"arn:aws:sns:ap-northeast-2:xxx:price-alerts-{user['id']}",
                Message=f"{apt['name']} 가격이 {apt['change']}% 변동했습니다."
            )
    
    return {'statusCode': 200}

# FastAPI를 Lambda에서 실행
handler = Mangum(app)
```

### 3.4. 메시지 큐 (RabbitMQ/Kafka)
```python
import aio_pika

async def publish_price_update(apt_id: int, new_price: int):
    connection = await aio_pika.connect_robust("amqp://guest:guest@rabbitmq/")
    
    async with connection:
        channel = await connection.channel()
        exchange = await channel.declare_exchange('price_updates', aio_pika.ExchangeType.FANOUT)
        
        message = aio_pika.Message(
            body=json.dumps({
                'apt_id': apt_id,
                'price': new_price,
                'timestamp': datetime.utcnow().isoformat()
            }).encode()
        )
        
        await exchange.publish(message, routing_key='')

# Consumer
async def consume_price_updates():
    connection = await aio_pika.connect_robust("amqp://guest:guest@rabbitmq/")
    
    async with connection:
        channel = await connection.channel()
        queue = await channel.declare_queue('price_processor')
        
        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    data = json.loads(message.body)
                    await process_price_update(data)
```

### 3.5. 머신러닝 가격 예측
```python
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
import joblib

class PricePredictor:
    def __init__(self):
        self.model = joblib.load('models/price_predictor.pkl')
    
    def predict(self, features: dict) -> dict:
        """
        features: {
            'area': 84.0,
            'floor': 12,
            'build_year': 2015,
            'households': 1200,
            'distance_to_subway': 300,
            'region_avg_price': 85000,
            'interest_rate': 3.5
        }
        """
        df = pd.DataFrame([features])
        prediction = self.model.predict(df)[0]
        
        # 신뢰 구간 계산
        predictions = [
            tree.predict(df)[0] 
            for tree in self.model.estimators_
        ]
        
        return {
            'predicted_price': int(prediction),
            'confidence_interval': {
                'lower': int(np.percentile(predictions, 5)),
                'upper': int(np.percentile(predictions, 95))
            }
        }

# 모델 학습 파이프라인
def train_model():
    # 데이터 로드
    df = pd.read_sql("SELECT * FROM training_data", engine)
    
    # 특성 엔지니어링
    df['age'] = 2024 - df['build_year']
    df['price_per_area'] = df['price'] / df['area']
    
    # 학습
    X = df[['area', 'floor', 'age', 'households', 'distance_to_subway']]
    y = df['price']
    
    model = GradientBoostingRegressor(n_estimators=100, max_depth=5)
    model.fit(X, y)
    
    joblib.dump(model, 'models/price_predictor.pkl')
```

### 3.6. 벡터 데이터베이스 (유사 아파트 검색)
```python
from pgvector.sqlalchemy import Vector
from sentence_transformers import SentenceTransformer

# 모델
model = SentenceTransformer('jhgan/ko-sbert-nli')

# 테이블 정의
class ApartmentEmbedding(Base):
    __tablename__ = 'apartment_embeddings'
    
    apt_id = Column(Integer, primary_key=True)
    embedding = Column(Vector(768))  # SBERT 차원

# 임베딩 생성
async def create_embedding(apt: Apartment):
    text = f"""
    {apt.name} {apt.address}
    {apt.households}세대 {apt.build_year}년 준공
    {apt.parking_spaces}대 주차 가능
    """
    embedding = model.encode(text).tolist()
    
    await db.execute(
        insert(ApartmentEmbedding)
        .values(apt_id=apt.apt_id, embedding=embedding)
        .on_conflict_do_update(
            index_elements=[ApartmentEmbedding.apt_id],
            set_={'embedding': embedding}
        )
    )

# 유사 아파트 검색
async def find_similar(apt_id: int, limit: int = 5):
    target = await db.execute(
        select(ApartmentEmbedding.embedding)
        .where(ApartmentEmbedding.apt_id == apt_id)
    )
    target_embedding = target.scalar_one()
    
    result = await db.execute(
        select(Apartment, ApartmentEmbedding.embedding.cosine_distance(target_embedding).label('distance'))
        .join(ApartmentEmbedding)
        .where(ApartmentEmbedding.apt_id != apt_id)
        .order_by('distance')
        .limit(limit)
    )
    
    return result.all()
```

### 3.7. 실시간 협업 (CRDT)
```typescript
// Yjs를 활용한 실시간 비교 공유
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const useCollaborativeComparison = (roomId: string) => {
  const [doc] = useState(() => new Y.Doc());
  const [provider] = useState(() => 
    new WebsocketProvider('wss://api.example.com/ws', roomId, doc)
  );
  
  const apartments = doc.getArray<number>('apartments');
  
  const addApartment = (aptId: number) => {
    apartments.push([aptId]);
  };
  
  const removeApartment = (index: number) => {
    apartments.delete(index, 1);
  };
  
  useEffect(() => {
    return () => provider.destroy();
  }, [provider]);
  
  return { apartments: apartments.toArray(), addApartment, removeApartment };
};
```

### 3.8. Edge Computing (Cloudflare Workers)
```typescript
// 지역별 캐시 및 빠른 응답
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    
    // 지역별 캐시 확인
    const cacheKey = `${url.pathname}-${request.cf?.country || 'default'}`;
    const cached = await env.KV.get(cacheKey, 'json');
    
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
      });
    }
    
    // 원본 서버에서 가져오기
    const response = await fetch(`https://api.example.com${url.pathname}`);
    const data = await response.json();
    
    // 캐시 저장 (1시간)
    await env.KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 3600 });
    
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' }
    });
  }
};
```

### 3.9. 자연어 검색 (LLM)
```python
from openai import AsyncOpenAI

client = AsyncOpenAI()

async def natural_language_search(query: str):
    """
    "강남역 근처 10억 이하 신축 아파트" 같은 자연어 검색
    """
    # LLM으로 검색 조건 추출
    response = await client.chat.completions.create(
        model="gpt-4",
        messages=[
            {
                "role": "system",
                "content": """
                사용자의 검색어에서 아파트 검색 조건을 추출하세요.
                JSON 형식으로 반환: {
                    "location": "지역명",
                    "max_price": 숫자 (만원),
                    "min_build_year": 연도,
                    "keywords": ["키워드1", "키워드2"]
                }
                """
            },
            {"role": "user", "content": query}
        ],
        response_format={"type": "json_object"}
    )
    
    conditions = json.loads(response.choices[0].message.content)
    
    # 조건으로 검색
    return await search_apartments_by_conditions(conditions)
```

### 3.10. PWA (Progressive Web App)
```typescript
// service-worker.ts
const CACHE_NAME = 'realestate-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => 
      cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
      ])
    )
  );
});

// manifest.json
{
  "name": "부동산 분석 플랫폼",
  "short_name": "부동산",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3B82F6",
  "icons": [
    {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"}
  ]
}
```

### 3.11. WebAssembly 활용
```rust
// Rust로 고성능 계산 모듈 작성
// lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn calculate_compound_interest(
    principal: f64,
    rate: f64,
    years: u32,
    monthly_payment: f64
) -> f64 {
    let monthly_rate = rate / 12.0 / 100.0;
    let months = years * 12;
    
    let mut balance = principal;
    for _ in 0..months {
        balance = balance * (1.0 + monthly_rate) - monthly_payment;
    }
    
    balance
}

#[wasm_bindgen]
pub fn find_optimal_loan(
    principal: f64,
    target_monthly: f64,
    rates: &[f64],
    terms: &[u32]
) -> JsValue {
    // 복잡한 최적화 계산...
    JsValue::from_serde(&result).unwrap()
}
```

### 3.12. 블록체인 기반 거래 기록
```solidity
// Solidity 스마트 컨트랙트
contract PropertyRegistry {
    struct Transaction {
        uint256 apartmentId;
        address seller;
        address buyer;
        uint256 price;
        uint256 timestamp;
        bytes32 documentHash;  // 계약서 해시
    }
    
    mapping(uint256 => Transaction[]) public transactions;
    
    event TransactionRecorded(
        uint256 indexed apartmentId,
        address seller,
        address buyer,
        uint256 price
    );
    
    function recordTransaction(
        uint256 apartmentId,
        address seller,
        address buyer,
        uint256 price,
        bytes32 documentHash
    ) public {
        transactions[apartmentId].push(Transaction({
            apartmentId: apartmentId,
            seller: seller,
            buyer: buyer,
            price: price,
            timestamp: block.timestamp,
            documentHash: documentHash
        }));
        
        emit TransactionRecorded(apartmentId, seller, buyer, price);
    }
}
```

### 3.13. 이벤트 소싱
```python
from datetime import datetime
from enum import Enum

class EventType(str, Enum):
    PRICE_UPDATED = "PRICE_UPDATED"
    FAVORITE_ADDED = "FAVORITE_ADDED"
    REVIEW_CREATED = "REVIEW_CREATED"

class Event(Base):
    __tablename__ = 'events'
    
    id = Column(Integer, primary_key=True)
    aggregate_type = Column(String)  # 'apartment', 'user' 등
    aggregate_id = Column(Integer)
    event_type = Column(String)
    data = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)

# 이벤트 발행
async def publish_event(
    aggregate_type: str,
    aggregate_id: int,
    event_type: EventType,
    data: dict
):
    event = Event(
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event_type.value,
        data=data
    )
    db.add(event)
    await db.commit()
    
    # 이벤트 핸들러들에게 전파
    await event_bus.publish(event)

# 상태 재구성
async def rebuild_apartment_state(apt_id: int) -> dict:
    events = await db.execute(
        select(Event)
        .where(Event.aggregate_type == 'apartment', Event.aggregate_id == apt_id)
        .order_by(Event.timestamp)
    )
    
    state = {}
    for event in events.scalars():
        if event.event_type == EventType.PRICE_UPDATED:
            state['current_price'] = event.data['new_price']
        # ... 다른 이벤트 처리
    
    return state
```

### 3.14. Feature Flags
```python
from flagsmith import Flagsmith

flagsmith = Flagsmith(environment_key="YOUR_KEY")

@router.get("/apartments/{apt_id}")
async def get_apartment(apt_id: int, user: User = Depends(get_current_user)):
    flags = flagsmith.get_identity_flags(user.id)
    
    result = await apartment_service.get(apt_id)
    
    # 신규 기능 플래그 확인
    if flags.is_feature_enabled("new_price_chart"):
        result['price_chart'] = await get_new_price_chart(apt_id)
    else:
        result['price_chart'] = await get_legacy_price_chart(apt_id)
    
    # A/B 테스트
    if flags.get_feature_value("recommendation_algorithm") == "v2":
        result['similar'] = await get_similar_v2(apt_id)
    else:
        result['similar'] = await get_similar_v1(apt_id)
    
    return result
```

### 3.15. OpenAPI 자동 생성 클라이언트
```bash
# OpenAPI 스펙에서 TypeScript 클라이언트 자동 생성
npx openapi-typescript-codegen \
    --input http://localhost:8000/openapi.json \
    --output ./src/api \
    --client fetch
```

```typescript
// 생성된 클라이언트 사용
import { ApartmentService, ApiError } from './api';

const apartments = await ApartmentService.getApartments({
  regionId: 1,
  limit: 20
});
```

### 3.16. 분산 트레이싱
```python
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# 설정
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

jaeger_exporter = JaegerExporter(
    agent_host_name="jaeger",
    agent_port=6831,
)
trace.get_tracer_provider().add_span_processor(
    BatchSpanProcessor(jaeger_exporter)
)

# 사용
@router.get("/apartments/{apt_id}")
async def get_apartment(apt_id: int):
    with tracer.start_as_current_span("get_apartment") as span:
        span.set_attribute("apt_id", apt_id)
        
        with tracer.start_as_current_span("db_query"):
            apartment = await db.get(Apartment, apt_id)
        
        with tracer.start_as_current_span("get_transactions"):
            transactions = await get_transactions(apt_id)
        
        return {...}
```

### 3.17. Circuit Breaker 패턴
```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=30)
async def call_external_api(endpoint: str):
    """
    외부 API 호출 (5번 실패 시 30초간 차단)
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(endpoint, timeout=5.0)
        response.raise_for_status()
        return response.json()

@router.get("/apartments/{apt_id}/external-data")
async def get_external_data(apt_id: int):
    try:
        return await call_external_api(f"https://external.api/apt/{apt_id}")
    except CircuitBreakerError:
        # 폴백 데이터 반환
        return {"status": "unavailable", "cached_data": await get_cached_data(apt_id)}
```

### 3.18. 컨테이너 오케스트레이션 (Kubernetes)
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: realestate/backend:latest
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 15
          periodSeconds: 20

---
# HPA (Horizontal Pod Autoscaler)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 3.19. 서버리스 데이터베이스 (PlanetScale)
```python
# 브랜칭 기반 스키마 관리
# .pscale/schema.sql

-- Development 브랜치에서 스키마 변경
ALTER TABLE apartments ADD COLUMN rating DECIMAL(3,2);
CREATE INDEX idx_apartments_rating ON apartments(rating);

-- Deploy Request 생성 후 Production에 머지
```

### 3.20. 멀티 클라우드 배포
```terraform
# Terraform으로 멀티 클라우드 인프라 관리
# main.tf

# AWS
module "aws_backend" {
  source = "./modules/aws-ecs"
  
  region           = "ap-northeast-2"
  container_image  = var.backend_image
  desired_count    = 2
}

# GCP (재해 복구)
module "gcp_backend" {
  source = "./modules/gcp-cloudrun"
  
  region           = "asia-northeast3"
  container_image  = var.backend_image
  min_instances    = 1
  max_instances    = 5
}

# Cloudflare DNS 기반 로드밸런싱
resource "cloudflare_load_balancer" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api.example.com"
  
  default_pool_ids = [
    cloudflare_load_balancer_pool.aws.id,
  ]
  fallback_pool_id = cloudflare_load_balancer_pool.gcp.id
  
  proxied = true
}
```

---

## 4. 성능 최적화 (30개)

### 4.1. 데이터베이스 인덱스 최적화
```sql
-- 현재 인덱스 분석
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as number_of_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- 미사용 인덱스 찾기
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public';

-- 복합 인덱스 추가 (자주 함께 조회되는 컬럼)
CREATE INDEX idx_sales_apt_date ON sales (apt_id, contract_date DESC);

-- Covering Index (인덱스만으로 쿼리 완료)
CREATE INDEX idx_sales_covering ON sales (apt_id, contract_date DESC)
    INCLUDE (trans_price, exclusive_area);

-- 부분 인덱스 (조건부)
CREATE INDEX idx_sales_recent ON sales (apt_id, contract_date DESC)
    WHERE contract_date >= '2024-01-01';

-- GIN 인덱스 (검색용)
CREATE INDEX idx_apartments_name_gin ON apartments 
    USING gin (apt_name gin_trgm_ops);
```

### 4.2. 쿼리 실행 계획 분석
```sql
-- EXPLAIN ANALYZE로 실제 실행 시간 확인
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT a.apt_id, a.apt_name, AVG(s.trans_price) as avg_price
FROM apartments a
JOIN sales s ON a.apt_id = s.apt_id
WHERE s.contract_date >= '2024-01-01'
GROUP BY a.apt_id, a.apt_name
ORDER BY avg_price DESC
LIMIT 100;

-- 문제점 식별
-- Seq Scan -> 인덱스 필요
-- Hash Join -> 대용량 시 Merge Join 고려
-- Sort -> 인덱스로 정렬 회피 가능
```

### 4.3. 테이블 파티셔닝
```sql
-- 날짜 기반 파티셔닝
CREATE TABLE sales (
    trans_id SERIAL,
    apt_id INTEGER,
    trans_price INTEGER,
    contract_date DATE,
    PRIMARY KEY (trans_id, contract_date)
) PARTITION BY RANGE (contract_date);

-- 연도별 파티션 생성
CREATE TABLE sales_2023 PARTITION OF sales
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
CREATE TABLE sales_2024 PARTITION OF sales
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE sales_2025 PARTITION OF sales
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- 각 파티션에 인덱스 자동 생성
CREATE INDEX ON sales (apt_id, contract_date DESC);
```

### 4.4. 쿼리 최적화
```python
# Before: 모든 컬럼 조회
stmt = select(Apartment).join(ApartDetail).join(State)

# After: 필요한 컬럼만 선택
stmt = select(
    Apartment.apt_id,
    Apartment.apt_name,
    ApartDetail.road_address,
    State.region_name
).select_from(Apartment).join(ApartDetail).join(State)

# Before: 여러 번의 쿼리
for apt in apartments:
    sales = await db.execute(select(Sale).where(Sale.apt_id == apt.apt_id))

# After: 배치 쿼리
apt_ids = [apt.apt_id for apt in apartments]
stmt = select(Sale).where(Sale.apt_id.in_(apt_ids))
all_sales = await db.execute(stmt)
sales_by_apt = defaultdict(list)
for sale in all_sales.scalars():
    sales_by_apt[sale.apt_id].append(sale)
```

### 4.5. 커서 기반 페이지네이션
```python
# Before: OFFSET (깊은 페이지에서 느림)
stmt = select(Apartment).offset(10000).limit(20)  # 10000개 스캔

# After: 커서 기반 (항상 일정한 속도)
stmt = (
    select(Apartment)
    .where(Apartment.apt_id > last_id)  # 마지막 ID 이후
    .order_by(Apartment.apt_id)
    .limit(20)
)

# 복합 정렬 시 키셋 페이지네이션
stmt = (
    select(Sale)
    .where(
        or_(
            Sale.contract_date < last_date,
            and_(
                Sale.contract_date == last_date,
                Sale.trans_id < last_id
            )
        )
    )
    .order_by(Sale.contract_date.desc(), Sale.trans_id.desc())
    .limit(20)
)
```

### 4.6. 연결 풀 최적화
```python
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import QueuePool

engine = create_async_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,           # 기본 연결 수
    max_overflow=10,        # 최대 추가 연결
    pool_timeout=30,        # 연결 대기 타임아웃
    pool_recycle=1800,      # 30분마다 연결 재생성
    pool_pre_ping=True,     # 사용 전 연결 상태 확인
    echo_pool="debug",      # 풀 디버그 로깅 (개발 시)
)

# 연결 풀 모니터링
@router.get("/health/db")
async def db_health():
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
    }
```

### 4.7. 캐시 전략
```python
# 캐시 계층 구조
class CacheManager:
    def __init__(self):
        self.l1_cache = {}  # 프로세스 메모리 (가장 빠름)
        self.l1_max_size = 1000
        
    async def get(self, key: str, fetch_func):
        # L1: 메모리 캐시
        if key in self.l1_cache:
            return self.l1_cache[key]
        
        # L2: Redis 캐시
        cached = await get_from_redis(key)
        if cached:
            self._set_l1(key, cached)
            return cached
        
        # 캐시 미스: DB에서 조회
        result = await fetch_func()
        
        # 캐시 저장
        await set_to_redis(key, result, ttl=3600)
        self._set_l1(key, result)
        
        return result
    
    def _set_l1(self, key: str, value):
        if len(self.l1_cache) >= self.l1_max_size:
            # LRU: 가장 오래된 항목 제거
            oldest_key = next(iter(self.l1_cache))
            del self.l1_cache[oldest_key]
        self.l1_cache[key] = value

# 캐시 워밍업
async def warm_cache():
    """서버 시작 시 자주 조회되는 데이터 미리 로드"""
    popular_apartments = await get_popular_apartments(limit=100)
    for apt in popular_apartments:
        key = f"apartment:{apt.apt_id}"
        await set_to_redis(key, apt.to_dict())
```

### 4.8. API 응답 압축
```python
from fastapi.middleware.gzip import GZipMiddleware
from starlette_compress import CompressMiddleware

# Gzip 압축 (기본)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Brotli 압축 (더 높은 압축률)
app.add_middleware(
    CompressMiddleware,
    minimum_size=500,
    gzip_level=6,
    brotli_quality=4
)
```

### 4.9. 비동기 병렬 처리
```python
import asyncio

async def get_apartment_full_info(apt_id: int):
    # 독립적인 쿼리들을 병렬 실행
    basic_info, transactions, nearby, reviews = await asyncio.gather(
        get_basic_info(apt_id),
        get_transactions(apt_id, limit=50),
        get_nearby_apartments(apt_id, radius=500),
        get_reviews(apt_id, limit=10),
        return_exceptions=True  # 하나가 실패해도 다른 것은 계속
    )
    
    # 에러 처리
    result = {"apt_id": apt_id}
    
    if not isinstance(basic_info, Exception):
        result["basic"] = basic_info
    if not isinstance(transactions, Exception):
        result["transactions"] = transactions
    # ...
    
    return result
```

### 4.10. 스트리밍 응답
```python
from fastapi.responses import StreamingResponse
import json

@router.get("/export/apartments")
async def export_apartments(db: AsyncSession = Depends(get_db)):
    async def generate():
        yield '{"apartments": ['
        
        stmt = select(Apartment)
        result = await db.stream(stmt)
        first = True
        
        async for row in result:
            if not first:
                yield ','
            first = False
            yield json.dumps(row[0].to_dict())
        
        yield ']}'
    
    return StreamingResponse(
        generate(),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=apartments.json"}
    )
```

### 4.11. 프론트엔드 번들 최적화
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ filename: 'bundle-stats.html' })  // 번들 분석
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 벤더 청크 분리
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts', 'lightweight-charts'],
          'vendor-map': ['kakao-maps-sdk'],
          'vendor-ui': ['lucide-react', 'framer-motion'],
        }
      }
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,  // 프로덕션에서 소스맵 제거
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // console.log 제거
        drop_debugger: true
      }
    }
  },
  // 사전 번들링
  optimizeDeps: {
    include: ['react', 'react-dom', 'recharts'],
  }
});
```

### 4.12. 코드 스플리팅
```typescript
import { lazy, Suspense } from 'react';

// 라우트별 코드 스플리팅
const Dashboard = lazy(() => import('./views/Dashboard'));
const MapExplorer = lazy(() => import('./views/MapExplorer'));
const Comparison = lazy(() => import('./views/Comparison'));

const App = () => (
  <Suspense fallback={<LoadingSkeleton />}>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/map" element={<MapExplorer />} />
      <Route path="/compare" element={<Comparison />} />
    </Routes>
  </Suspense>
);

// 컴포넌트별 코드 스플리팅
const HeavyChart = lazy(() => import('./components/HeavyChart'));

const ChartSection = ({ data }) => (
  <Suspense fallback={<ChartSkeleton />}>
    {data && <HeavyChart data={data} />}
  </Suspense>
);
```

### 4.13. React 메모이제이션
```typescript
// 컴포넌트 메모이제이션
const ApartmentCard = React.memo(({ apartment, onClick }) => {
  return (
    <div onClick={() => onClick(apartment.id)}>
      <h3>{apartment.name}</h3>
      <p>{formatPrice(apartment.price)}</p>
    </div>
  );
}, (prevProps, nextProps) => {
  // 커스텀 비교: ID와 가격이 같으면 리렌더링 안함
  return prevProps.apartment.id === nextProps.apartment.id &&
         prevProps.apartment.price === nextProps.apartment.price;
});

// useMemo: 계산 비용이 높은 값
const filteredApartments = useMemo(() => {
  return apartments
    .filter(apt => apt.price >= minPrice && apt.price <= maxPrice)
    .sort((a, b) => b.price - a.price);
}, [apartments, minPrice, maxPrice]);

// useCallback: 자식에게 전달하는 함수
const handleSelect = useCallback((id: number) => {
  setSelectedId(id);
  onSelect?.(id);
}, [onSelect]);
```

### 4.14. 가상화 (Virtualization)
```typescript
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const VirtualizedApartmentList = ({ apartments }) => {
  const Row = ({ index, style }) => {
    const apt = apartments[index];
    return (
      <div style={style}>
        <ApartmentCard apartment={apt} />
      </div>
    );
  };
  
  return (
    <AutoSizer>
      {({ height, width }) => (
        <List
          height={height}
          width={width}
          itemCount={apartments.length}
          itemSize={100}  // 각 아이템 높이
          overscanCount={5}  // 버퍼 아이템 수
        >
          {Row}
        </List>
      )}
    </AutoSizer>
  );
};

// 가변 높이 아이템
import { VariableSizeList } from 'react-window';

const getItemSize = (index: number) => {
  return apartments[index].hasImage ? 150 : 80;
};
```

### 4.15. 이미지 최적화
```typescript
// 지연 로딩
const LazyImage = ({ src, alt }) => (
  <img
    src={src}
    alt={alt}
    loading="lazy"
    decoding="async"
  />
);

// 반응형 이미지
const ResponsiveImage = ({ src, alt }) => (
  <picture>
    <source
      srcSet={`${src}?w=400 400w, ${src}?w=800 800w, ${src}?w=1200 1200w`}
      sizes="(max-width: 600px) 400px, (max-width: 900px) 800px, 1200px"
    />
    <img src={`${src}?w=800`} alt={alt} />
  </picture>
);

// 백엔드: 이미지 리사이징
from PIL import Image
from io import BytesIO

async def resize_image(image_bytes: bytes, max_width: int) -> bytes:
    img = Image.open(BytesIO(image_bytes))
    
    if img.width > max_width:
        ratio = max_width / img.width
        new_size = (max_width, int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    
    # WebP로 변환
    output = BytesIO()
    img.save(output, format='WEBP', quality=85, optimize=True)
    return output.getvalue()
```

### 4.16. 프리페칭
```typescript
import { useQueryClient } from '@tanstack/react-query';

const useApartmentPrefetch = () => {
  const queryClient = useQueryClient();
  
  // 마우스 호버 시 상세 정보 프리페치
  const prefetchApartment = (aptId: number) => {
    queryClient.prefetchQuery({
      queryKey: ['apartment', aptId],
      queryFn: () => fetchApartmentDetail(aptId),
      staleTime: 5 * 60 * 1000,  // 5분간 신선하게 유지
    });
  };
  
  // 다음 페이지 프리페치
  const prefetchNextPage = (currentPage: number) => {
    queryClient.prefetchQuery({
      queryKey: ['apartments', currentPage + 1],
      queryFn: () => fetchApartments(currentPage + 1),
    });
  };
  
  return { prefetchApartment, prefetchNextPage };
};

// 사용
<ApartmentCard
  apartment={apt}
  onMouseEnter={() => prefetchApartment(apt.id)}
/>
```

### 4.17. 서비스 워커 캐싱
```typescript
// service-worker.ts
const CACHE_NAME = 'realestate-v2';

const STATIC_CACHE = [
  '/',
  '/index.html',
  '/static/js/main.js',
  '/static/css/main.css',
];

const API_CACHE_DURATION = 5 * 60 * 1000;  // 5분

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API 요청: Network First, Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // GET 요청만 캐시
          if (event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // 정적 자산: Cache First, Network Fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
```

### 4.18. 읽기/쓰기 분리
```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

# 마스터 (쓰기용)
write_engine = create_async_engine(PRIMARY_DB_URL, pool_size=10)

# 리플리카 (읽기용)
read_engine = create_async_engine(REPLICA_DB_URL, pool_size=30)

async def get_read_db():
    async with AsyncSession(read_engine) as session:
        yield session

async def get_write_db():
    async with AsyncSession(write_engine) as session:
        yield session

# 라우터에서 적절히 사용
@router.get("/apartments")
async def list_apartments(db: AsyncSession = Depends(get_read_db)):
    ...

@router.post("/apartments/{apt_id}/favorite")
async def add_favorite(
    apt_id: int,
    db: AsyncSession = Depends(get_write_db)
):
    ...
```

### 4.19. 백그라운드 작업
```python
from fastapi import BackgroundTasks
from celery import Celery

celery_app = Celery('tasks', broker='redis://redis:6379/0')

# 간단한 백그라운드 작업 (FastAPI)
@router.post("/apartments/{apt_id}/refresh")
async def refresh_apartment(
    apt_id: int,
    background_tasks: BackgroundTasks
):
    background_tasks.add_task(update_apartment_data, apt_id)
    return {"message": "Refresh started"}

# 복잡한 작업 (Celery)
@celery_app.task(bind=True, max_retries=3)
def recalculate_all_statistics(self):
    try:
        # 시간이 오래 걸리는 통계 재계산
        ...
    except Exception as exc:
        self.retry(exc=exc, countdown=60)

@celery_app.task
def send_price_alert(user_id: int, apt_id: int, new_price: int):
    # 이메일/푸시 알림 발송
    ...

# 스케줄링
celery_app.conf.beat_schedule = {
    'recalculate-statistics-daily': {
        'task': 'tasks.recalculate_all_statistics',
        'schedule': crontab(hour=3, minute=0),  # 매일 3AM
    },
}
```

### 4.20. CDN 활용
```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    
    # 정적 파일 캐싱
    location /static/ {
        alias /app/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options nosniff;
        
        # Brotli 압축
        brotli on;
        brotli_types text/plain text/css application/javascript application/json;
    }
    
    # API 캐싱 (GET 요청만)
    location /api/ {
        proxy_pass http://backend;
        proxy_cache api_cache;
        proxy_cache_valid 200 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_key "$request_method$request_uri";
        proxy_cache_methods GET HEAD;
        add_header X-Cache-Status $upstream_cache_status;
    }
}
```

### 4.21. HTTP/2 서버 푸시
```nginx
location / {
    http2_push /static/js/main.js;
    http2_push /static/css/main.css;
    http2_push /static/fonts/pretendard.woff2;
}
```

### 4.22. 데이터베이스 쿼리 분석
```python
import time
import logging
from sqlalchemy import event

logger = logging.getLogger('slow_query')

@event.listens_for(engine.sync_engine, "before_cursor_execute")
def before_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start = time.time()

@event.listens_for(engine.sync_engine, "after_cursor_execute")
def after_execute(conn, cursor, statement, parameters, context, executemany):
    elapsed = time.time() - context._query_start
    
    if elapsed > 1.0:  # 1초 이상
        logger.warning(
            f"Slow query ({elapsed:.2f}s): {statement[:200]}..."
        )
    
    # Prometheus 메트릭
    QUERY_DURATION.labels(
        query_type=statement.split()[0]
    ).observe(elapsed)
```

### 4.23. 모니터링 메트릭
```python
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator

# 기본 메트릭 자동 수집
Instrumentator().instrument(app).expose(app)

# 커스텀 메트릭
REQUEST_COUNT = Counter(
    'api_requests_total',
    'Total API requests',
    ['method', 'endpoint', 'status']
)

REQUEST_LATENCY = Histogram(
    'api_request_latency_seconds',
    'API request latency',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0]
)

DB_CONNECTIONS = Gauge(
    'db_connection_pool_size',
    'Database connection pool size',
    ['pool']
)

@app.middleware("http")
async def metrics_middleware(request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    
    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    REQUEST_LATENCY.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)
    
    return response
```

### 4.24. 지도 마커 클러스터링
```typescript
// 클러스터링으로 수천 개 마커 처리
const useMarkerClusterer = (map: kakao.maps.Map, markers: Marker[]) => {
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  
  useEffect(() => {
    if (!map) return;
    
    // 기존 클러스터러 제거
    if (clustererRef.current) {
      clustererRef.current.clear();
    }
    
    // 클러스터러 생성
    clustererRef.current = new kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 5,  // 클러스터링 시작 레벨
      calculator: [10, 30, 50],  // 클러스터 크기 기준
      styles: [
        { width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.8)', borderRadius: '50%', color: '#fff', textAlign: 'center', lineHeight: '40px' },
        { width: '50px', height: '50px', background: 'rgba(37, 99, 235, 0.8)', borderRadius: '50%', color: '#fff', textAlign: 'center', lineHeight: '50px' },
        { width: '60px', height: '60px', background: 'rgba(29, 78, 216, 0.8)', borderRadius: '50%', color: '#fff', textAlign: 'center', lineHeight: '60px' },
      ]
    });
    
    // 마커 추가
    const kakaoMarkers = markers.map(m => 
      new kakao.maps.Marker({
        position: new kakao.maps.LatLng(m.lat, m.lng)
      })
    );
    
    clustererRef.current.addMarkers(kakaoMarkers);
    
    return () => {
      clustererRef.current?.clear();
    };
  }, [map, markers]);
};
```

### 4.25. 메모리 사용 최적화
```python
# 제너레이터 사용 (대용량 데이터)
async def process_large_dataset():
    async for batch in fetch_in_batches(batch_size=1000):
        yield process_batch(batch)

# __slots__ 사용 (메모리 절약)
class ApartmentDTO:
    __slots__ = ['apt_id', 'apt_name', 'price', 'area']
    
    def __init__(self, apt_id, apt_name, price, area):
        self.apt_id = apt_id
        self.apt_name = apt_name
        self.price = price
        self.area = area

# 약한 참조 캐시
import weakref

_cache = weakref.WeakValueDictionary()

async def get_apartment_cached(apt_id: int):
    if apt_id in _cache:
        return _cache[apt_id]
    
    apt = await fetch_apartment(apt_id)
    _cache[apt_id] = apt
    return apt
```

### 4.26. 요청 배치 처리
```typescript
// DataLoader 패턴
class ApartmentLoader {
  private queue: number[] = [];
  private timeout: NodeJS.Timeout | null = null;
  private resolvers: Map<number, (data: Apartment) => void> = new Map();
  
  load(id: number): Promise<Apartment> {
    return new Promise((resolve) => {
      this.queue.push(id);
      this.resolvers.set(id, resolve);
      
      if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), 10);  // 10ms 대기
      }
    });
  }
  
  private async flush() {
    const ids = [...this.queue];
    this.queue = [];
    this.timeout = null;
    
    // 배치 요청
    const apartments = await fetchApartmentsBatch(ids);
    
    // 결과 분배
    for (const apt of apartments) {
      const resolve = this.resolvers.get(apt.id);
      if (resolve) {
        resolve(apt);
        this.resolvers.delete(apt.id);
      }
    }
  }
}

const loader = new ApartmentLoader();

// 개별 호출이 자동으로 배치됨
const [apt1, apt2, apt3] = await Promise.all([
  loader.load(1),
  loader.load(2),
  loader.load(3),
]);
```

### 4.27. DNS 프리페치
```html
<!-- index.html -->
<head>
  <!-- DNS 프리페치 -->
  <link rel="dns-prefetch" href="//api.example.com">
  <link rel="dns-prefetch" href="//dapi.kakao.com">
  
  <!-- 프리커넥트 (DNS + TCP + TLS) -->
  <link rel="preconnect" href="https://api.example.com">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  
  <!-- 중요 리소스 프리로드 -->
  <link rel="preload" href="/fonts/pretendard.woff2" as="font" type="font/woff2" crossorigin>
</head>
```

### 4.28. 렌더링 성능
```typescript
// requestAnimationFrame 활용
const smoothScroll = (target: number) => {
  const start = window.scrollY;
  const distance = target - start;
  const duration = 500;
  let startTime: number | null = null;
  
  const animation = (currentTime: number) => {
    if (!startTime) startTime = currentTime;
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // easeOutQuad
    const eased = 1 - (1 - progress) * (1 - progress);
    
    window.scrollTo(0, start + distance * eased);
    
    if (progress < 1) {
      requestAnimationFrame(animation);
    }
  };
  
  requestAnimationFrame(animation);
};

// CSS contain 속성
.apartment-card {
  contain: layout style paint;  // 렌더링 범위 제한
}
```

### 4.29. 웹 워커
```typescript
// heavy-calculation.worker.ts
self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;
  
  if (type === 'CALCULATE_STATISTICS') {
    const result = calculateHeavyStatistics(data);
    self.postMessage({ type: 'STATISTICS_RESULT', result });
  }
};

function calculateHeavyStatistics(apartments: any[]) {
  // 메인 스레드를 블로킹하지 않고 복잡한 계산
  return {
    average: apartments.reduce((sum, a) => sum + a.price, 0) / apartments.length,
    median: calculateMedian(apartments.map(a => a.price)),
    standardDeviation: calculateStdDev(apartments.map(a => a.price)),
    // ...
  };
}

// 사용
const worker = new Worker('/heavy-calculation.worker.js');

const calculateStats = (apartments: Apartment[]): Promise<Statistics> => {
  return new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'STATISTICS_RESULT') {
        resolve(e.data.result);
      }
    };
    worker.postMessage({ type: 'CALCULATE_STATISTICS', data: apartments });
  });
};
```

### 4.30. 로드 밸런싱
```yaml
# docker-compose.yml
services:
  backend:
    image: realestate/backend
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
  
  nginx:
    image: nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - backend

# nginx.conf
upstream backend {
    least_conn;  # 최소 연결 방식
    
    server backend1:8000 weight=3;
    server backend2:8000 weight=2;
    server backend3:8000 weight=1 backup;  # 백업 서버
    
    keepalive 32;  # 연결 유지
}

server {
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # 헬스체크
        proxy_next_upstream error timeout http_500;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
}
```

---

## 5. 기타 (기능 추가) (15개)

### 5.1. 가격 알림 서비스
- 관심 아파트의 가격이 설정 범위에 도달하면 푸시/이메일 알림
- 매매가, 전세가 각각 상한선/하한선 설정

### 5.2. 투자 시뮬레이션
- 대출 금리, 보유 기간, 예상 상승률 입력 시 수익률 계산
- 취득세, 양도세, 보유세 시뮬레이션 포함

### 5.3. 학군 분석
- 주변 학교 학업성취도, 특목고 진학률
- 학원가 밀집도, 교육 인프라 점수화

### 5.4. 재건축/재개발 정보
- 재건축 연한, 안전진단 결과, 조합 설립 현황
- 예상 분담금, 입주 예정 시기

### 5.5. 전세 리스크 분석
- 전세가율, 깡통 전세 위험도 계산
- 전세보증보험 가입 가능 여부

### 5.6. 커뮤니티/리뷰 시스템
- 실거주자 장단점 리뷰
- 관리비, 층간소음, 주차 편의성 평점

### 5.7. 맞춤형 추천
- 예산, 가족 구성, 선호 지역 기반 추천
- 검색/클릭 히스토리 기반 협업 필터링

### 5.8. 거래 진행 가이드
- 계약~잔금 단계별 체크리스트
- 필요 서류 목록, 법무사 연결

### 5.9. 분양권 정보
- 현재 분양 중인 아파트 목록
- 청약 경쟁률, 분양가, 입주 예정일

### 5.10. 포트폴리오 분석
- 등록한 매물들의 총 자산가치, 분산도
- 지역별/평형별 구성 비율

### 5.11. 금리 연동 분석
- 기준금리 변동에 따른 대출 이자 변화
- 금리와 가격 상관관계 차트

### 5.12. 주변 환경 분석
- 편의시설 개수, 혐오시설 거리
- 소음, 대기질, 교통량 데이터

### 5.13. 오픈 API 제공
- 개발자용 REST API
- API 키 발급 및 사용량 관리

### 5.14. 다국어 지원
- i18n 구조 설계
- 숫자/날짜 형식 현지화

### 5.15. 모바일 앱 (React Native)
- 기존 컴포넌트 재사용
- 푸시 알림, 오프라인 지원

---

## 우선순위 정리

### 즉시 적용 (1주 이내)
1. 데이터베이스 인덱스 추가 (4.1)
2. API 응답 압축 (4.8)
3. React 메모이제이션 (4.13)
4. 쿼리 최적화 (4.4)
5. 커서 기반 페이지네이션 (4.5)

### 단기 (2-4주)
1. 캐시 전략 개선 (4.7)
2. 가상화 적용 (4.14)
3. 번들 최적화 (4.11)
4. 지도 클러스터링 (4.24)
5. 차트 인터랙션 개선 (1.1~1.5)

### 중기 (1-3개월)
1. Elasticsearch 도입 (3.1)
2. 읽기/쓰기 분리 (4.18)
3. 서비스 워커 (4.17)
4. 분산 트레이싱 (3.16)
5. 실시간 차트 (1.16)

### 장기 (3개월 이상)
1. GraphQL API (3.2)
2. ML 가격 예측 (3.5)
3. 벡터 검색 (3.6)
4. Kubernetes 배포 (3.18)
5. 가격 알림 서비스 (5.1)
