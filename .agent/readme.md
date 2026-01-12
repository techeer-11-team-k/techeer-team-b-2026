<!-- 파일명: .agent/readme.md -->
# AI Development Agents System Manual

이 문서는 AI 에이전트들을 활용하여 "부동산 데이터 시각화 및 분석 서비스"를 효율적으로 개발하기 위한 가이드라인입니다.

## 1. Core Philosophy
이 프로젝트는 **"단순 코드 생성이 아닌, 시니어 개발자 팀의 협업"**을 시뮬레이션합니다.
모든 에이전트는 본인의 코드가 동료(다른 에이전트/사람)에게 미칠 영향을 고려해야 하며, **"Why(왜)"**에 대한 설명 없는 코드는 작성하지 않습니다.

## 2. Agent Roster & Responsibility
| Agent File | Role | Key Responsibilities |
|Data Type|---|---|
| `00_master_architect.md` | **CPO & PM** | 기능 명세서(V2.0.1) 관리, 법적 고지 준수 감독, API 스펙 확정 |
| `01_frontend_dev.md` | **Mobile/Web FE** | React Native 지도 UX, 차트 시각화, 바텀시트 인터랙션 구현 |
| `02_backend_dev.md` | **FastAPI BE** | 데이터 집계(Ranking), AI 분석(LLM) 연동, JWT 인증, API 구현 |
| `03_data_gis_engineer.md` | **DBA & GIS** | PostGIS 공간 쿼리 최적화, 대용량 거래 데이터 인덱싱/파티셔닝 |
| `04_devops_infra.md` | **DevOps** | AWS 인프라 구축, CI/CD, 모니터링, 데이터 파이프라인 관리 |

## 3. Workflow Protocol
작업은 반드시 다음 순서를 따릅니다.

1.  **Planning**: `@00_master_architect`에게 기능 명세서의 특정 ID(예: FUNC-004)를 주고 기술 명세를 요구.
2.  **Data Layer**: `@03_data_gis_engineer`가 ERD와 SQL 쿼리(Spatial Join 등)를 작성.
3.  **Server Layer**: `@02_backend_dev`가 API 스켈레톤과 비즈니스 로직(Pydantic) 구현.
4.  **Client Layer**: `@01_frontend_dev`가 API를 연동하여 UI 구현 (Mock Data 활용 권장).
5.  **Integration**: 발생한 에러 로그를 기반으로 Front/Back 에이전트 동시 호출하여 디버깅.

## 4. Universal Rules (전체 공통 강령)
1.  **Disclaimer Compliance**: 모든 차트/데이터 표출 화면에는 반드시 *"과거 데이터 기반이며 투자 권유가 아님"* 문구를 포함하거나 관련 UI를 강제해야 한다.
2.  **Performance First**: 부동산 데이터는 방대하므로, 페이징(Pagination)과 인덱싱(Indexing) 없는 리스트 조회는 금지한다.
3.  **Explicit Comments**: 주석에는 코드의 기능이 아닌 **"의도와 주의사항"**을 적는다.
    - `// (X) 거래량을 합산한다.`
    - `// (O) 대시보드 로딩 속도를 위해 실시간 집계 대신 Redis 캐시된 값을 우선 조회함.`