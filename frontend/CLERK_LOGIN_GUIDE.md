# Clerk 로그인 화면 확인 가이드

## 1. 프론트엔드 서버 실행 확인

### 서버 실행 상태 확인
```bash
# 포트 3002가 사용 중인지 확인
netstat -ano | findstr :3002
```

### 서버 실행 방법
```bash
cd frontend
npm run dev
```

서버가 정상적으로 실행되면:
- 터미널에 `VITE v5.x.x  ready in xxx ms` 메시지 표시
- `➜  Local:   http://localhost:3002/` 메시지 표시

---

## 2. Clerk 로그인 화면 확인 방법

### 방법 1: ProfileMenu에서 로그인 버튼 클릭

1. **브라우저에서 `http://localhost:3002` 접속**
2. **우측 상단 프로필 아이콘 클릭** (또는 사용자 아이콘)
3. **"로그인" 버튼 클릭**
4. **Clerk 로그인 모달이 표시되어야 함**

### 방법 2: 브라우저 콘솔에서 확인

1. **F12로 개발자 도구 열기**
2. **Console 탭 선택**
3. **다음 메시지 확인:**
   ```
   🔑 Clerk Key 로드 상태: { hasKey: true, keyLength: ..., ... }
   🚀 앱 시작 중...
   ✅ 앱 렌더링 완료
   ```

### 방법 3: 직접 로그인 페이지 접속

Clerk는 기본적으로 모달 방식으로 작동하지만, 직접 페이지로 접속하려면:
- URL: `http://localhost:3002/#/sign-in` (Clerk 설정에 따라 다를 수 있음)

---

## 3. 문제 해결

### 문제 1: 로그인 버튼이 보이지 않음

**원인:**
- Clerk Key가 로드되지 않음
- 환경 변수가 인식되지 않음

**해결:**
1. `frontend/.env` 파일 확인:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```
2. 프론트엔드 서버 재시작:
   ```bash
   # Ctrl + C로 서버 중지
   cd frontend
   npm run dev
   ```
3. 브라우저 새로고침 (Ctrl + Shift + R)

### 문제 2: 로그인 버튼 클릭 시 아무 일도 일어나지 않음

**원인:**
- Clerk Key가 없거나 잘못됨
- Clerk Provider가 제대로 설정되지 않음

**해결:**
1. 브라우저 콘솔 확인:
   ```javascript
   console.log('Clerk Key:', import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
   ```
2. `frontend/src/lib/clerk.tsx`에서 경고 메시지 확인:
   - `⚠️ Clerk Publishable Key가 설정되지 않았습니다.` 메시지가 보이면 환경 변수 확인

### 문제 3: 로그인 모달이 표시되지만 에러 발생

**원인:**
- Clerk Key가 잘못됨
- Clerk 대시보드 설정 문제

**해결:**
1. Clerk 대시보드에서 Publishable Key 확인
2. `.env` 파일의 키가 올바른지 확인
3. Clerk 대시보드에서 Allowed Origins 설정 확인:
   - `http://localhost:3002` 추가

---

## 4. 예상 동작

### 정상 동작 시:
1. **프로필 메뉴 열기** → "로그인이 필요합니다" 메시지와 "로그인" 버튼 표시
2. **"로그인" 버튼 클릭** → Clerk 로그인 모달 표시
3. **이메일/비밀번호 입력** → 로그인 성공
4. **프로필 메뉴 다시 열기** → 사용자 정보 표시

### 콘솔 로그 예시:
```
🔑 Clerk Key 로드 상태: { hasKey: true, keyLength: 51, ... }
🚀 앱 시작 중...
✅ 앱 렌더링 완료
📱 App 컴포넌트 렌더링 시작
✅ useProfile 훅 실행 완료
```

---

## 5. 추가 확인 사항

### Network 탭에서 확인:
1. F12 → Network 탭
2. 로그인 버튼 클릭
3. `clerk.accounts.dev` 또는 `clerk.com` 도메인으로 요청이 가는지 확인

### Clerk 대시보드 설정:
- **Allowed Origins**: `http://localhost:3002` 추가
- **Sign-in/Sign-up URLs**: 기본값 사용 또는 커스텀 설정

---

## 요약

1. ✅ 프론트엔드 서버 실행 (`npm run dev`)
2. ✅ 브라우저에서 `http://localhost:3002` 접속
3. ✅ 프로필 메뉴 열기 (우측 상단 아이콘)
4. ✅ "로그인" 버튼 클릭
5. ✅ Clerk 로그인 모달 확인

문제가 계속되면 브라우저 콘솔의 에러 메시지를 확인하세요.
