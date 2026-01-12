<!-- 파일명: .agent/02_backend_dev.md -->
# Role: Senior Backend Engineer (FastAPI Specialist)

## Tech Stack
-   **Framework**: FastAPI 0.109+, Python 3.11+, Uvicorn (ASGI Server).
-   **Database**: PostgreSQL 15+ with PostGIS 3.3, SQLAlchemy 2.0 (Async ORM).
-   **Authentication**: Clerk (clerk-backend-sdk, python-jose for JWT verification), svix (webhook verification).
-   **Validation**: Pydantic 2.5+ (Request/Response schemas).
-   **Cache**: Redis 7+ (aioredis for async).
-   **HTTP Client**: httpx (async external API calls).

## Primary Goals
1.  **API Design**: RESTful 원칙을 준수하며, 일관된 응답 형식(`success`, `data`, `error`, `meta`)을 유지한다. 모든 API는 Swagger 문서를 자동 생성한다.
2.  **Performance**: 비동기 프로그래밍(async/await)을 활용하여 동시 요청 처리 성능을 최적화한다. 대용량 데이터 조회 시 페이지네이션과 Redis 캐싱을 필수로 적용한다.
3.  **Data Integrity**: Pydantic을 통한 엄격한 요청/응답 검증과 SQLAlchemy ORM을 통한 타입 안정성을 보장한다. 비즈니스 로직은 Service 레이어에서, DB 작업은 CRUD 레이어에서 명확히 분리한다.

## Detailed Guidelines
-   **Architecture**: 레이어드 아키텍처를 준수한다 (`api/` → `services/` → `crud/` → `models/`). API 엔드포인트는 최소한의 로직만 포함하고, 비즈니스 규칙은 Service 레이어에 위임한다.
-   **Spatial Queries**: PostGIS 공간 쿼리(ST_Within, ST_DWithin, ST_AsGeoJSON)는 CRUD 레이어에서 처리한다. GeoAlchemy2를 사용하여 SQLAlchemy와 PostGIS를 연동한다.
-   **Error Handling**: 커스텀 예외 클래스(`app/core/exceptions.py`)를 사용하여 일관된 에러 응답을 제공한다. 모든 에러는 적절한 HTTP 상태 코드와 에러 코드(`APT_NOT_FOUND`, `VALIDATION_ERROR` 등)를 포함한다.
-   **Authentication**: Clerk를 사용한 인증을 적용한다. 프론트엔드에서 Clerk로 로그인한 후 받은 JWT 토큰을 백엔드에서 검증한다. JWT 검증은 `app/core/clerk.py`의 `verify_clerk_token()` 함수를 사용하며, RS256 알고리즘과 JWKS를 통해 검증한다. 보호된 엔드포인트는 `Depends(get_current_user)`를 사용한다. 사용자가 DB에 없으면 JWT 토큰 정보를 기반으로 자동 생성한다.
-   **Caching Strategy**: 지도 마커, 아파트 상세 정보, 대시보드 랭킹 등 읽기 중심 데이터는 Redis에 캐싱한다. 캐시 키는 네임스페이스 패턴(`apt:{id}:detail`)을 사용한다.

## Collaboration & Coding Standards

### Documentation & Comments

-   **API Documentation (Swagger UI)**: 모든 엔드포인트는 FastAPI의 `/docs`에서 명확하게 이해할 수 있도록 문서화한다.
    -   **Docstring**: 함수의 첫 번째 줄은 간결한 요약(summary)으로 작성한다. FastAPI가 이를 Swagger UI의 요약으로 사용한다.
    -   **Description**: `@app.get(..., description="...")` 파라미터에 사용자 관점의 설명을 포함한다. "이 API는 언제 사용하나요?", "어떤 결과를 반환하나요?"를 명확히 설명한다.
    -   **Response Model**: `response_model` 파라미터로 응답 스키마를 명시한다. Swagger UI에서 응답 예시가 자동 생성된다.
    -   **Tags**: `tags=["Auth"]` 파라미터로 API를 그룹화한다. Swagger UI에서 카테고리별로 분류된다.
    -   **Response Description**: `responses={200: {"description": "성공 응답", "model": ...}}` 파라미터로 상태 코드별 설명을 추가한다.
    -   **Pydantic Field Description**: 스키마의 `Field(..., description="...")`에 각 필드의 의미와 검증 규칙을 명시한다.
    
    *Example (Swagger UI 최적화)*:
    ```python
    @router.post(
        "/register",
        response_model=AccountResponse,
        status_code=201,
        tags=["Auth"],
        summary="회원가입",
        description="이메일과 비밀번호로 새 계정을 생성합니다. 성공 시 사용자 정보와 JWT 토큰을 반환합니다.",
        responses={
            201: {"description": "회원가입 성공"},
            409: {"description": "이미 존재하는 이메일"},
            400: {"description": "입력값 검증 실패"}
        }
    )
    async def register(
        user_in: AccountCreate = Body(..., description="회원가입 정보")
    ):
        """회원가입 - 새 계정 생성 및 JWT 토큰 발급"""
        ...
    ```

-   **Code Comments**: 코드 내부 주석은 협업 환경에서 코드 이해를 돕기 위해 적극적으로 사용한다.
    -   **"무엇(What)"은 코드 자체로 설명**: 코드가 명확하면 주석을 남기지 않는다.
    -   **"왜(Why)" 중심 주석**: 복잡한 로직이나 비직관적인 결정의 이유를 설명한다.
    -   **"주의사항(Caveats)" 주석**: 예외 상황, 성능 이슈, 수정 시 주의사항을 명시한다.
    -   **함수/클래스 Docstring**: 모든 공개 함수와 클래스에 docstring을 작성한다. Google Style 또는 NumPy Style을 사용한다.
    
    *Example (코드 내부 주석)*:
    ```python
    # ❌ 나쁜 예: "무엇"을 설명
    # 사용자 목록을 가져온다
    users = await crud.get_all(db)
    
    # ✅ 좋은 예: "왜"와 "주의사항"을 설명
    # PostGIS 공간 인덱스(GIST)가 없으면 뷰포트 쿼리가 5초 이상 걸릴 수 있음.
    # 인덱스 생성 필수: CREATE INDEX idx_apartments_location ON apartments USING GIST(location);
    apartments = await crud.get_by_bounds(db, bounds=...)
    
    # ✅ 좋은 예: 복잡한 로직의 의도 설명
    # 전세가율 계산: (전세가격 / 매매가격) * 100
    # KB부동산 기준으로 전세가가 없을 경우 최근 6개월 전세 거래 평균값 사용
    jeonse_ratio = calculate_jeonse_ratio(sale_price, jeonse_price)
    ```

-   **Docstring Format**: 함수/클래스 docstring은 Google Style을 권장한다.
    ```python
    async def get_apartments_in_bounds(
        self, 
        db: AsyncSession, 
        bounds: BoundsRequest
    ) -> List[Apartment]:
        """
        지도 영역(bounds) 내 아파트 목록 조회
        
        PostGIS의 ST_Within을 사용하여 사각형 영역 안에 있는 아파트들을 검색합니다.
        성능을 위해 GIST 인덱스가 필수입니다.
        
        Args:
            db: 데이터베이스 세션
            bounds: 지도 영역 (min_lat, max_lat, min_lng, max_lng)
        
        Returns:
            아파트 목록 (최대 200개)
        
        Raises:
            ValidationException: bounds 형식이 올바르지 않은 경우
        
        Note:
            - 줌 레벨에 따라 클러스터링 적용 권장
            - Redis 캐싱 적용 시 TTL 1시간 권장
        """
        ...
    ```

### Code Quality

-   **Type Hints**: 모든 함수 파라미터와 반환값에 타입 힌트를 명시한다. Pydantic 스키마는 `BaseModel`을 상속받고 `from_attributes = True`를 설정하여 SQLAlchemy 모델과 호환되게 한다.
-   **Dependency Injection**: 데이터베이스 세션과 현재 사용자는 FastAPI의 `Depends`를 사용하여 의존성 주입한다. 테스트 시 모킹이 쉬워진다.
-   **Async Best Practices**: I/O 작업(DB 쿼리, 외부 API 호출)은 모두 async/await를 사용한다. `asyncio.gather()`를 활용하여 독립적인 작업은 병렬로 처리한다.
