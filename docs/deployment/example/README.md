# CI/CD 파이프라인 시각화 예시 웹사이트

이 웹사이트는 HOMU 프로젝트의 CI/CD 파이프라인이 어떻게 작동하는지 시각적으로 보여주는 인터랙티브 데모입니다.

## 📁 파일 구조

```
example/
├── index.html      # 메인 HTML 파일
├── styles.css      # 스타일링 (CSS)
├── script.js       # 인터랙티브 기능 (JavaScript)
└── README.md       # 이 파일
```

## 🚀 실행 방법

### 방법 1: 로컬에서 직접 열기

1. `index.html` 파일을 더블클릭
2. 웹 브라우저에서 자동으로 열림

### 방법 2: Live Server 사용 (권장)

VS Code를 사용하는 경우:

1. Live Server 확장 설치
2. `index.html` 파일에서 우클릭 → "Open with Live Server"
3. 브라우저에서 자동으로 열림

### 방법 3: Python 간이 서버

```bash
# example 폴더에서 실행
cd docs/deployment/example

# Python 3
python3 -m http.server 8000

# 브라우저에서 http://localhost:8000 접속
```

## 🎯 사용 방법

### 1. 컴포넌트 선택

- ☑️ **프론트엔드 (React + Vercel)**: 웹 애플리케이션
- ☑️ **백엔드 (FastAPI + AWS)**: API 서버
- ☑️ **모바일 앱 (Expo + RN)**: iOS/Android 앱

### 2. 브랜치 선택

- **feature/\***: 기능 개발 (CI만 실행)
- **dev**: 개발 환경 (Staging 배포)
- **main**: 프로덕션 (Production 배포)

### 3. 파이프라인 시작

"🚀 파이프라인 시작" 버튼 클릭

### 4. 실행 과정 관찰

다음 5단계를 순차적으로 실행합니다:

1. **Stage 1: 코드 푸시** (Git commit & push)
2. **Stage 2: GitHub Actions 트리거** (워크플로우 감지)
3. **Stage 3: CI** (테스트 및 빌드)
4. **Stage 4: CD** (자동 배포)
5. **Stage 5: 알림** (Slack 알림)

### 5. 결과 확인

- 각 스테이지의 상태 확인
- 실시간 로그 출력
- 배포 통계 대시보드

## ✨ 주요 기능

### 실시간 로그

- 각 단계의 진행 상황을 콘솔에 출력
- 성공/실패/정보/경고 메시지 색상 구분

### 인터랙티브 UI

- 클릭하여 파이프라인 실행
- 각 스테이지의 상태 변화 애니메이션
- 진행 중인 단계 하이라이트

### 통계 대시보드

- 총 배포 횟수
- 성공률
- 평균 배포 시간
- 마지막 배포 시간

### 시스템 아키텍처

- 전체 시스템 구조 다이어그램
- 각 컴포넌트 간 관계 시각화

## 🎨 시각적 요소

### 색상 코드

- 🔵 파란색: 진행 중
- 🟢 초록색: 성공
- 🔴 빨간색: 실패
- ⚪ 회색: 대기 중

### 애니메이션

- 페이드 인/아웃
- 슬라이드 효과
- 펄스 애니메이션 (진행 중)

## 📱 반응형 디자인

- 데스크톱 (1200px+)
- 태블릿 (768px-1199px)
- 모바일 (767px 이하)

## ⌨️ 키보드 단축키

- `Ctrl/Cmd + Enter`: 파이프라인 시작
- `Ctrl/Cmd + R`: 리셋

## 🎓 학습 포인트

이 데모를 통해 다음을 이해할 수 있습니다:

1. **CI/CD의 개념**
   - Continuous Integration (지속적 통합)
   - Continuous Deployment (지속적 배포)

2. **파이프라인 단계**
   - 코드 푸시 → 트리거 → CI → CD → 알림

3. **브랜치 전략**
   - feature: 개발만
   - dev: Staging 배포
   - main: Production 배포

4. **컴포넌트별 배포**
   - 프론트엔드 → Vercel
   - 백엔드 → AWS
   - 모바일 → EAS Build

## 🔧 커스터마이징

### 색상 변경

`styles.css`의 CSS 변수 수정:

```css
:root {
    --primary-color: #0ea5e9;  /* 메인 색상 */
    --success-color: #10b981;  /* 성공 색상 */
    --danger-color: #ef4444;   /* 실패 색상 */
}
```

### 파이프라인 단계 추가

`script.js`에서 새로운 스테이지 함수 추가:

```javascript
async function runStage6NewStep() {
    updateStageStatus('newstep', 'Running');
    log('🆕 새로운 단계 시작');
    await delay(1000);
    log('✅ 새로운 단계 완료', 'success');
    updateStageStatus('newstep', 'Success');
}
```

### 타이밍 조정

`delay()` 함수의 시간 조정:

```javascript
await delay(1000);  // 1초 대기
await delay(500);   // 0.5초 대기
```

## 📚 관련 문서

- [CI/CD 기초 가이드](../05_cicd_basics.md)
- [GitHub Actions 설정](../06_github_actions_setup.md)
- [AWS 백엔드 배포](../07_aws_backend_deployment.md)
- [전체 파이프라인 가이드](../08_complete_cicd_pipeline.md)

## 💡 팁

### 실제 프로젝트 적용

1. 이 데모에서 본 흐름을 실제 프로젝트에 적용
2. GitHub Actions 워크플로우 파일 작성
3. 단계별로 테스트하며 구축

### 디버깅

1. 브라우저 개발자 도구 열기 (F12)
2. Console 탭에서 에러 확인
3. Network 탭에서 리소스 로딩 확인

### 성능 최적화

- 이미지 대신 CSS 그라디언트 사용
- 애니메이션은 `transform`과 `opacity` 사용
- 불필요한 DOM 조작 최소화

## 🐛 문제 해결

### 페이지가 안 열림

- 파일 경로 확인
- 브라우저 캐시 삭제
- 다른 브라우저로 시도

### 애니메이션이 느림

- 하드웨어 가속 확인
- 다른 탭/프로그램 닫기
- 브라우저 업데이트

### 스타일이 안 적용됨

- `styles.css` 파일 경로 확인
- CSS 파일이 로드되었는지 Network 탭 확인
- 캐시 삭제 후 새로고침

## 📄 라이선스

이 예시 웹사이트는 HOMU 프로젝트의 일부로, 학습 및 참고 목적으로 자유롭게 사용할 수 있습니다.

## 🙏 기여

개선 아이디어나 버그 리포트는 언제나 환영합니다!

---

**만든 이**: HOMU 팀  
**목적**: CI/CD 개념을 시각적으로 이해하기 위한 교육용 데모  
**기술 스택**: HTML, CSS, JavaScript (순수 바닐라, 프레임워크 없음)
