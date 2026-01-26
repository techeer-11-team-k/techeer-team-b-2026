#!/usr/bin/env python3
"""
데이터베이스 복원 스크립트
백업 파일이 있는 경우 모든 테이블을 복원합니다.
"""
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from app.db_admin import DatabaseAdmin


async def main():
    """데이터베이스 복원 실행"""
    admin = DatabaseAdmin()
    
    try:
        # 백업 디렉토리 확인
        backup_dir = admin.backup_dir
        print(f"\n백업 디렉토리: {backup_dir}")
        
        # 백업 파일 목록 확인
        backup_files = list(backup_dir.glob("*.csv"))
        if not backup_files:
            print(f"\n❌ 오류: 백업 파일이 없습니다!")
            print(f"   백업 디렉토리: {backup_dir}")
            print(f"   로컬 경로: ./db_backup")
            print(f"\n   백업 파일이 필요합니다. 먼저 백업을 생성하세요:")
            print(f"   docker exec -it realestate-backend python -m app.db_admin restore --force")
            return False
        
        print(f"\n✓ 백업 파일 {len(backup_files)}개 발견:")
        for f in sorted(backup_files):
            size = f.stat().st_size
            print(f"   - {f.name} ({size:,} bytes)")
        
        # 복원 실행
        print(f"\n{'='*60}")
        print(f"데이터베이스 복원 시작")
        print(f"{'='*60}")
        
        await admin.restore_all(confirm=True)
        
        print(f"\n{'='*60}")
        print(f"복원 완료!")
        print(f"{'='*60}")
        return True
        
    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await admin.close()


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
