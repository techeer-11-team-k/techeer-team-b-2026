# 관심 리스트 사라지는 버그 분석

## 데이터 흐름 분석

### 1. 데이터 소스
- **상태**: `assetGroups` (311-314번 라인)
  ```typescript
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([
      { id: 'my', name: '내 자산', assets: [] },
      { id: 'favorites', name: '관심 단지', assets: [] },
  ]);
  ```

### 2. UI 렌더링
- **탭**: `ControlsContent` 컴포넌트 (1595-1685번 라인)
  - `assetGroups.map((group) => ...)` 로 각 그룹을 탭으로 렌더링
  - "내 자산", "관심 단지" 텍스트는 `group.name`에서 가져옴
  
- **목록**: `sortedAssets` (883-895번 라인)
  - `activeGroup.assets`에서 계산됨
  - `activeGroup`은 `assetGroups.find(g => g.id === activeGroupId)` (881번 라인)

### 3. 데이터 업데이트
- **API 호출**: `loadData()` 함수 (470-755번 라인)
  - `fetchFavoriteApartments()` API 호출 (510번 라인)
  - 응답을 `assetGroups` 상태에 반영 (548-555번 라인)

## 문제 원인

### 증상
새로고침 시 관심 리스트 목록이 사라짐

### 원인 분석

1. **새로고침 시 시퀀스**:
   ```
   페이지 로드 → assetGroups 초기화 (빈 배열)
   → useEffect로 loadData() 호출 (758-760번 라인)
   → fetchFavoriteApartments() API 호출
   → 응답이 비어있거나 캐시 문제로 데이터 없음
   → assetGroups의 favorites.assets가 빈 배열로 설정됨
   ```

2. **기존 병합 로직의 한계** (533-556번 라인):
   - API 응답과 기존 로컬 상태를 병합하려고 시도
   - 하지만 새로고침 시 `assetGroups`가 초기 상태로 리셋됨
   - 따라서 기존 로컬 항목이 사라짐

3. **캐시 문제 가능성**:
   - 백엔드에서 캐시 무효화 후 즉시 조회 시 빈 배열 반환 가능
   - Redis 캐시가 아직 갱신되지 않은 상태

## 해결 방안

### 방안 1: localStorage에 백업 저장 (권장)
- 관심 아파트 추가 시 localStorage에 저장
- 새로고침 시 localStorage에서 먼저 로드
- API 응답과 병합

### 방안 2: API 응답 대기 시간 추가
- 캐시 무효화 후 조회 시 약간의 지연 추가
- 또는 재시도 로직 추가

### 방안 3: 백엔드 캐시 로직 개선
- 캐시 무효화 후 즉시 DB 조회 보장
- 빈 배열 캐시 방지

## 검증 방법

1. **브라우저 콘솔 확인**:
   ```javascript
   // loadData() 호출 시 로그 확인
   console.log('📊 변환된 관심 아파트:', favProps);
   console.log('📊 병합된 관심 아파트:', mergedFavProps.length);
   ```

2. **네트워크 탭 확인**:
   - `/api/v1/favorites/apartments` 요청 확인
   - 응답 데이터 확인

3. **React DevTools 확인**:
   - `assetGroups` 상태 확인
   - `favorites` 그룹의 `assets` 배열 확인

## 현재 코드 위치

- **데이터 로드**: `frontend/components/views/Dashboard.tsx:470-755`
- **병합 로직**: `frontend/components/views/Dashboard.tsx:533-556`
- **UI 렌더링**: `frontend/components/views/Dashboard.tsx:1595-1685`
- **목록 표시**: `frontend/components/views/Dashboard.tsx:2295-2326`
