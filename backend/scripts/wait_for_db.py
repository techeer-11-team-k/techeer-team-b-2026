#!/usr/bin/env python3
"""
데이터베이스 연결 대기 스크립트

사용법:
    python wait_for_db.py <host> <port> [max_retries]
    
반환:
    0: 연결 성공
    1: 연결 실패
"""
import socket
import sys
import time


def wait_for_db(host: str, port: int, max_retries: int = 60) -> bool:
    """데이터베이스 연결 대기"""
    for i in range(max_retries):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                return True
        except Exception:
            pass
        
        print(f"   재시도 {i + 1}/{max_retries}...")
        time.sleep(1)
    
    return False


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("사용법: python wait_for_db.py <host> <port> [max_retries]")
        sys.exit(1)
    
    host = sys.argv[1]
    port = int(sys.argv[2])
    max_retries = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    
    if wait_for_db(host, port, max_retries):
        print("✅ 데이터베이스 연결 성공!")
        sys.exit(0)
    else:
        print(f"❌ 데이터베이스 연결 실패 (호스트: {host}, 포트: {port})")
        sys.exit(1)
