# 문서 구조

이 디렉토리는 프로젝트의 기술 문서를 주제별로 정리한 것입니다.

## 📁 문서 구조

### 1. 데이터 수집 및 매칭 (`data-collection/`)
- **DATA_COLLECTION_AND_MATCHING.md**: 데이터 수집 및 매칭 시스템의 문제 해결 및 개선 사항
  - 아파트 매칭 알고리즘 개선
  - 매매 vs 전월세 데이터 수집 통합
  - 더미 데이터 관리 개선
  - 아파트 API 에러 처리 체계화

### 2. 모니터링 및 문제 해결 (`monitoring/`)
- **MONITORING_AND_TROUBLESHOOTING.md**: 모니터링 시스템 구축 및 문제 해결 사례
  - 모니터링 시스템 구축 (Prometheus + Grafana)
  - 캐시 예열 시스템
  - 버그 수정 사례
  - 빠른 문제 해결 가이드

### 3. 성능 최적화 (`TECHNICAL_IMPROVEMENTS.md`)
- 성능 최적화 전략 및 개선 사항
  - 서버 시작 시 캐시 예열
  - 고성능 직렬화 (Orjson)
  - 해시 기반 캐시 키
  - Materialized View
  - 프론트엔드 최적화

### 4. 개발 가이드
- **BACKEND_DEVELOPMENT.md**: 백엔드 개발 가이드
- **FRONTEND_DEVELOPMENT.md**: 프론트엔드 개발 가이드
- **DEPLOYMENT_GUIDE.md**: 배포 가이드
- **SETUP_AND_CONFIGURATION.md**: 설정 및 구성 가이드

### 5. 백엔드 상세 문서 (`backend/`)
- **01_Architecture.md**: 아키텍처 개요
- **02_Database.md**: 데이터베이스 설계
- **03_API.md**: API 명세
- **04_Performance.md**: 성능 최적화 가이드
- **05_Deployment.md**: 배포 가이드
- **06_Setup.md**: 설정 가이드
- **07_Testing.md**: 테스트 가이드
- **08_Troubleshooting.md**: 문제 해결 및 FAQ

### 6. 배포 문서 (`deployment/`)
- 배포 관련 상세 가이드

### 7. 프론트엔드 문서 (`frontend/`)
- 프론트엔드 개발 및 설정 가이드

### 8. 모바일 문서 (`mobile/`)
- 모바일 앱 개발 및 디버깅 가이드

### 9. 설정 문서 (`setup/`)
- 초기 설정 및 구성 가이드

## 📝 문서 작성 원칙

모든 기술 문서는 다음 구조를 따릅니다:

1. **문제 상황**: 어떤 문제가 있었는지
2. **해결 방안 논의**: 문제를 어떻게 해결할지 논의
3. **해결 방법**: 실제 구현 내용
4. **해결 결과**: 개선 효과 및 성과

이 구조를 통해 문제 해결 과정을 명확히 추적할 수 있고, 향후 유사한 문제 해결 시 참고할 수 있습니다.

## 🔍 문서 검색

특정 주제를 찾으려면:
- **데이터 수집/매칭**: `data-collection/DATA_COLLECTION_AND_MATCHING.md`
- **모니터링/문제 해결**: `monitoring/MONITORING_AND_TROUBLESHOOTING.md`
- **성능 최적화**: `TECHNICAL_IMPROVEMENTS.md`
- **개발 가이드**: 루트 디렉토리의 `*_DEVELOPMENT.md` 파일들
