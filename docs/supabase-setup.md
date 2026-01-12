# Supabase 설정 가이드

## 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 접속하여 계정을 생성하거나 로그인합니다.
2. "New Project"를 클릭하여 새 프로젝트를 생성합니다.
3. 프로젝트 이름과 데이터베이스 비밀번호를 설정합니다.
4. 프로젝트가 생성될 때까지 기다립니다 (약 2분 소요).

## 2. 환경 변수 설정

1. Supabase 대시보드에서 프로젝트를 선택합니다.
2. 좌측 메뉴에서 "Settings" > "API"를 클릭합니다.
3. 다음 정보를 확인합니다:
   - **Project URL**: `NEXT_PUBLIC_SUPABASE_URL`에 사용
   - **anon public key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`에 사용

4. 프로젝트 루트에 `.env.local` 파일을 생성하고 다음 내용을 추가합니다:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 3. 데이터베이스 테이블 생성

### 방법 1: Supabase SQL Editor 사용 (권장)

1. Supabase 대시보드에서 "SQL Editor"를 클릭합니다.
2. "New query"를 클릭합니다.
3. `supabase/migrations/001_create_todos_table.sql` 파일의 내용을 복사하여 붙여넣습니다.
4. "Run" 버튼을 클릭하여 실행합니다.

### 방법 2: Supabase CLI 사용

```bash
# Supabase CLI 설치 (필요한 경우)
npm install -g supabase

# Supabase에 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref your-project-ref

# 마이그레이션 실행
supabase db push
```

## 4. Row Level Security (RLS) 정책 확인

현재 설정은 개발 단계를 위해 모든 사용자가 읽고 쓸 수 있도록 되어 있습니다.

프로덕션 환경에서는 인증된 사용자만 접근하도록 정책을 변경해야 합니다:

```sql
-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow all operations for todos" ON public.todos;

-- 인증된 사용자만 접근 가능하도록 정책 생성
CREATE POLICY "Authenticated users can manage todos"
    ON public.todos
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
```

## 5. 테스트

1. 개발 서버를 실행합니다:
   ```bash
   npm run dev
   ```

2. 브라우저에서 `http://localhost:3000`을 엽니다.

3. 할 일을 추가하고, 완료 표시하고, 삭제하는 기능이 정상 작동하는지 확인합니다.

## 6. 문제 해결

### 환경 변수가 설정되지 않았다는 오류

- `.env.local` 파일이 프로젝트 루트에 있는지 확인합니다.
- 환경 변수 이름이 정확한지 확인합니다 (`NEXT_PUBLIC_` 접두사 필수).
- 개발 서버를 재시작합니다.

### 테이블이 없다는 오류

- SQL Editor에서 테이블이 생성되었는지 확인합니다.
- `SELECT * FROM public.todos;` 쿼리로 테이블 존재 여부를 확인합니다.

### 권한 오류

- RLS 정책이 올바르게 설정되었는지 확인합니다.
- 개발 단계에서는 "Allow all operations" 정책이 활성화되어 있어야 합니다.

## 참고 자료

- [Supabase 공식 문서](https://supabase.com/docs)
- [Next.js + Supabase 가이드](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
