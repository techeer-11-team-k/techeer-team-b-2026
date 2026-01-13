# Git 브랜치 작업 방법 가이드

## ✅ 권장 방법: 로컬에서도 브랜치 생성

### 기본 워크플로우

```bash
# 1. 최신 main 브랜치 가져오기
git checkout main
git pull origin main

# 2. 새 브랜치 생성 및 전환
git checkout -b feature/my-feature

# 또는 원격 브랜치가 이미 있다면:
git checkout -b feature/my-feature origin/feature/my-feature

# 3. 작업 및 커밋
# ... 코드 수정 ...
git add .
git commit -m "feat: 새로운 기능 추가"

# 4. 원격 브랜치에 push (첫 push 시)
git push -u origin feature/my-feature

# 이후 push는 간단하게
git push
```

### 여러 기능을 동시에 작업하는 경우

```bash
# 기능 A 작업
git checkout -b feature/login
# 작업 후 커밋
git push -u origin feature/login

# 기능 B 작업으로 전환
git checkout main
git pull origin main
git checkout -b feature/cart
# 작업 후 커밋
git push -u origin feature/cart

# 이전 작업으로 다시 전환
git checkout feature/login
```

## ❌ 비권장 방법: 로컬 main에서만 작업

### 문제점

```bash
# 로컬 main에서 작업
git checkout main
# ... 작업 ...
git commit -m "feat: 기능 추가"

# 원격 브랜치로 push
git push origin main:feature/my-feature

# 문제:
# 1. 로컬 main이 feature 브랜치의 내용을 포함하게 됨
# 2. 다른 사람이 feature 브랜치를 작업할 때 충돌 발생 가능
# 3. 히스토리가 복잡해짐
```

## 🔄 일반적인 Git Flow

### 1. Feature 브랜치 (기능 개발)

```bash
# 기능 개발 시작
git checkout main
git pull origin main
git checkout -b feature/user-auth

# 작업 및 커밋
git add .
git commit -m "feat: 사용자 인증 기능 추가"
git push -u origin feature/user-auth

# PR 생성 후 머지 완료되면
git checkout main
git pull origin main
git branch -d feature/user-auth  # 로컬 브랜치 삭제
```

### 2. Hotfix 브랜치 (긴급 수정)

```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 수정 후
git push -u origin hotfix/critical-bug
```

### 3. 브랜치 이름 규칙

- `feature/기능명`: 새로운 기능 개발
- `bugfix/버그명`: 버그 수정
- `hotfix/긴급수정명`: 긴급 버그 수정
- `chore/작업명`: 설정, 빌드 작업
- `refactor/리팩토링명`: 코드 리팩토링

## 📝 브랜치 관리 명령어

```bash
# 현재 브랜치 확인
git branch

# 원격 브랜치 포함 확인
git branch -a

# 브랜치 전환
git checkout 브랜치명

# 브랜치 생성 및 전환
git checkout -b 새브랜치명

# 브랜치 삭제
git branch -d 브랜치명  # 안전한 삭제 (머지된 경우만)
git branch -D 브랜치명  # 강제 삭제

# 원격 브랜치 삭제
git push origin --delete 브랜치명
```

## 💡 실무 팁

1. **작업 전 항상 main을 최신화**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **브랜치 이름은 명확하게**
   - ❌ `test`, `temp`, `fix`
   - ✅ `feature/user-login`, `bugfix/cart-error`

3. **작은 단위로 커밋**
   - 하나의 커밋은 하나의 논리적 변경만
   - 커밋 메시지는 명확하게

4. **정기적으로 원격과 동기화**
   ```bash
   git fetch origin
   git merge origin/feature/my-feature  # 또는 git pull
   ```

5. **작업 완료 후 브랜치 정리**
   ```bash
   # 머지된 브랜치 삭제
   git branch -d feature/merged-feature
   ```
