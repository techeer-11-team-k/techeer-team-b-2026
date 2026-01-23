# 배포 및 CI/CD 문서 가이드

HOMU 프로젝트의 배포와 CI/CD 관련 모든 문서를 모아놓은 폴더입니다.

## 📚 문서 목록

### 기초 가이드

#### [00_deployment_overview.md](./00_deployment_overview.md)
**전체 배포 구조 및 개요**
- 프로젝트 전체 아키텍처
- 각 컴포넌트 배포 전략
- 배포 순서 및 체크리스트

#### [05_cicd_basics.md](./05_cicd_basics.md)
**CI/CD 기초 개념**
- CI/CD가 무엇인지
- 왜 필요한지
- 어떻게 작동하는지
- 실제 예시 및 FAQ

---

### 프론트엔드 배포

#### [01_vercel_deployment.md](./01_vercel_deployment.md)
**Vercel 배포 가이드**
- Vercel 배포 설정
- 환경 변수 구성
- 도메인 연결
- 문제 해결

#### [03_vercel_deployment_checklist.md](./03_vercel_deployment_checklist.md)
**Vercel 배포 체크리스트**
- 배포 전 확인사항
- 단계별 체크리스트
- CORS 설정 가이드

---

### 백엔드 배포

#### [07_aws_backend_deployment.md](./07_aws_backend_deployment.md)
**AWS 백엔드 배포 가이드**
- ECS Fargate 배포 (추천)
- EC2 + Docker Compose 배포
- RDS PostgreSQL 설정
- ElastiCache Redis 설정
- 보안 그룹 구성

---

### 모바일 앱 배포

#### [04_mobile_app_deployment.md](./04_mobile_app_deployment.md)
**모바일 앱 배포 가이드**
- EAS Build 설정
- 앱스토어 제출 방법
- WebView URL 설정
- 환경 변수 관리

---

### CI/CD 설정

#### [06_github_actions_setup.md](./06_github_actions_setup.md)
**GitHub Actions 설정 가이드**
- GitHub Actions 기본 개념
- 워크플로우 파일 작성
- 프론트엔드 CI/CD 설정
- 백엔드 CI/CD 설정
- 모바일 CI 설정
- GitHub Secrets 관리

#### [08_complete_cicd_pipeline.md](./08_complete_cicd_pipeline.md)
**전체 CI/CD 파이프라인**
- 통합 워크플로우
- 브랜치 전략
- 모노레포 CI/CD
- 배포 시나리오
- 모범 사례

---

### 시각적 예시

#### [example/](./example/)
**CI/CD 파이프라인 시각화 웹사이트**
- 인터랙티브 데모
- 실시간 로그
- 시스템 아키텍처 다이어그램

```
example/
├── index.html      # 메인 HTML
├── styles.css      # 스타일링
├── script.js       # 인터랙티브 기능
└── README.md       # 사용 가이드
```

**실행 방법:**
```bash
# example 폴더에서
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

---

## 🎯 학습 순서 추천

### 1. CI/CD 입문자

```
1. 05_cicd_basics.md (CI/CD 기초)
   ↓
2. example/ (시각적 예시)
   ↓
3. 00_deployment_overview.md (전체 구조)
   ↓
4. 06_github_actions_setup.md (실습)
```

### 2. 프론트엔드 개발자

```
1. 01_vercel_deployment.md (Vercel 배포)
   ↓
2. 03_vercel_deployment_checklist.md (체크리스트)
   ↓
3. 06_github_actions_setup.md (CI/CD 설정)
```

### 3. 백엔드 개발자

```
1. 07_aws_backend_deployment.md (AWS 배포)
   ↓
2. 06_github_actions_setup.md (CI/CD 설정)
   ↓
3. 08_complete_cicd_pipeline.md (통합 파이프라인)
```

### 4. 모바일 앱 개발자

```
1. 04_mobile_app_deployment.md (모바일 배포)
   ↓
2. 06_github_actions_setup.md (CI/CD 설정)
```

### 5. DevOps 엔지니어

```
1. 00_deployment_overview.md (전체 구조)
   ↓
2. 06_github_actions_setup.md (GitHub Actions)
   ↓
3. 08_complete_cicd_pipeline.md (통합 파이프라인)
   ↓
4. 모든 개별 배포 가이드 숙지
```

---

## 📋 빠른 참조

### 배포 플랫폼별 문서

| 플랫폼 | 컴포넌트 | 문서 |
|--------|----------|------|
| Vercel | 프론트엔드 (웹) | [01](./01_vercel_deployment.md), [03](./03_vercel_deployment_checklist.md) |
| AWS | 백엔드 | [07](./07_aws_backend_deployment.md) |
| Expo/EAS | 모바일 앱 | [04](./04_mobile_app_deployment.md) |

### 작업별 문서

| 작업 | 문서 |
|------|------|
| CI/CD 기초 학습 | [05](./05_cicd_basics.md) |
| GitHub Actions 설정 | [06](./06_github_actions_setup.md) |
| 전체 파이프라인 구축 | [08](./08_complete_cicd_pipeline.md) |
| 배포 구조 파악 | [00](./00_deployment_overview.md) |
| 시각적 학습 | [example/](./example/) |

---

## 🚀 첫 배포 시작하기

### 1단계: 백엔드 배포 (먼저!)

```bash
# AWS 배포 가이드 참고
→ 07_aws_backend_deployment.md
```

### 2단계: 프론트엔드 배포

```bash
# Vercel 배포 가이드 참고
→ 01_vercel_deployment.md
→ 03_vercel_deployment_checklist.md
```

### 3단계: CI/CD 설정

```bash
# GitHub Actions 설정
→ 06_github_actions_setup.md
→ 08_complete_cicd_pipeline.md
```

### 4단계: 모바일 앱 빌드 (선택)

```bash
# EAS Build 가이드 참고
→ 04_mobile_app_deployment.md
```

---

## ✅ 전체 배포 체크리스트

### 백엔드

- [ ] AWS 계정 생성
- [ ] RDS PostgreSQL 생성
- [ ] ElastiCache Redis 생성
- [ ] ECR 저장소 생성
- [ ] ECS 클러스터 및 서비스 설정
- [ ] 환경 변수 설정
- [ ] 백엔드 배포 및 테스트

### 프론트엔드

- [ ] Vercel 계정 생성
- [ ] GitHub 저장소 연결
- [ ] Root Directory 설정 (`frontend`)
- [ ] 환경 변수 설정
- [ ] 프론트엔드 배포 및 테스트

### CORS 설정

- [ ] 백엔드 `ALLOWED_ORIGINS`에 Vercel 도메인 추가
- [ ] CORS 동작 확인

### CI/CD

- [ ] `.github/workflows/` 폴더 생성
- [ ] 프론트엔드 CI 워크플로우 작성
- [ ] 백엔드 CI/CD 워크플로우 작성
- [ ] GitHub Secrets 설정
- [ ] 워크플로우 테스트

### 모바일 앱

- [ ] Expo 계정 생성
- [ ] EAS CLI 설치
- [ ] `App.tsx`에서 프로덕션 URL 설정
- [ ] EAS Build 설정
- [ ] 앱 빌드 및 테스트

---

## 💡 유용한 팁

### 비용 절감

1. **AWS 프리 티어 활용**
   - RDS db.t3.micro
   - ElastiCache cache.t2.micro
   - EC2 t2.micro (대안)

2. **Vercel 무료 플랜**
   - 개인/취미 프로젝트는 무료
   - 충분한 빌드 시간 제공

3. **GitHub Actions 무료 한도**
   - 공개 저장소: 무제한
   - 비공개 저장소: 월 2,000분

### 보안 모범 사례

1. **환경 변수 관리**
   - 민감한 정보는 절대 Git에 커밋하지 않기
   - GitHub Secrets 사용
   - AWS Secrets Manager 활용

2. **CORS 설정**
   - 와일드카드(`*`) 사용 지양
   - 명시적인 도메인 목록 관리

3. **접근 제한**
   - AWS 보안 그룹 최소 권한 원칙
   - 불필요한 포트 차단

---

## 🐛 문제 해결

### 공통 문제

- **배포 실패**: 로그 확인 → 환경 변수 확인 → 권한 확인
- **CORS 에러**: 백엔드 설정 확인 → 도메인 목록 확인
- **환경 변수 미적용**: 재배포 → 캐시 삭제

### 플랫폼별 문제

- **Vercel**: [01_vercel_deployment.md](./01_vercel_deployment.md#문제-해결)
- **AWS**: [07_aws_backend_deployment.md](./07_aws_backend_deployment.md#문제-해결)
- **모바일**: [04_mobile_app_deployment.md](./04_mobile_app_deployment.md#문제-해결)

---

## 📞 추가 지원

### 공식 문서

- [Vercel 문서](https://vercel.com/docs)
- [AWS 문서](https://docs.aws.amazon.com/)
- [Expo 문서](https://docs.expo.dev/)
- [GitHub Actions 문서](https://docs.github.com/actions)

### 커뮤니티

- GitHub Discussions
- Discord 서버
- Stack Overflow

---

## 🎉 배포 완료 후

### 모니터링 설정

1. AWS CloudWatch 알람
2. Vercel Analytics
3. Slack/Discord 알림

### 지속적 개선

1. 배포 시간 측정 및 최적화
2. 테스트 커버리지 향상
3. 자동화 범위 확대

---

**Happy Deploying! 🚀**

프로젝트 배포와 CI/CD 구축을 축하합니다!
