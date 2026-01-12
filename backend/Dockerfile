# ============================================================
# 🏠 부동산 분석 플랫폼 - Dockerfile
# ============================================================
# 빌드: docker build -t realestate-api .
# 실행: docker run -p 8000:8000 realestate-api
# ============================================================

# Python 3.11 슬림 이미지 사용
FROM python:3.11-slim

# 환경변수 설정
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 의존성 설치
# - gcc: 일부 Python 패키지 컴파일에 필요
# - libpq-dev: PostgreSQL 클라이언트 라이브러리
# - libgeos-dev: Shapely/GeoAlchemy2에 필요
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt 먼저 복사 (캐싱 최적화)
# .dockerignore가 적용되어 불필요한 파일은 제외됨
COPY requirements.txt .

# Python 의존성 설치
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# 애플리케이션 코드 복사
# .dockerignore가 적용되어 불필요한 파일은 제외됨
COPY ./app ./app

# 비root 사용자로 실행 (보안)
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app
USER appuser

# 포트 노출
EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')" || exit 1

# 서버 실행
# --host 0.0.0.0: 외부 접속 허용
# --port 8000: 포트 지정
# --workers 4: 워커 프로세스 수 (CPU 코어에 맞게 조정)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# 개발용 (hot reload)
# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
