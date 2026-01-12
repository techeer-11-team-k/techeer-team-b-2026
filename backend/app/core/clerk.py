"""
Clerk 인증 유틸리티

Clerk SDK를 사용하여 사용자 인증 및 검증을 처리합니다.
"""
from typing import Optional
from fastapi import HTTPException, status, Header
from jose import jwt, JWTError
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
import httpx
import base64

from app.core.config import settings


def base64url_decode(data: str) -> bytes:
    """
    Base64URL 디코딩
    
    Base64URL은 Base64의 URL-safe 버전으로, + -> -, / -> _ 변환
    패딩(=)도 제거됩니다.
    """
    # 패딩 추가 (Base64는 4의 배수여야 함)
    padding = 4 - len(data) % 4
    if padding != 4:
        data += '=' * padding
    
    # URL-safe 문자를 일반 Base64 문자로 변환
    data = data.replace('-', '+').replace('_', '/')
    
    return base64.b64decode(data)


# Clerk JWKS 캐시
_clerk_jwks_cache: Optional[dict] = None


async def get_clerk_jwks(issuer: Optional[str] = None) -> dict:
    """
    Clerk JWKS (JSON Web Key Set) 가져오기
    
    Clerk의 공개 키를 가져와서 JWT 토큰을 검증하는 데 사용합니다.
    
    Args:
        issuer: JWT의 issuer 클레임 (예: https://careful-snipe-83.clerk.accounts.dev)
    
    Returns:
        JWKS 딕셔너리
    """
    global _clerk_jwks_cache
    
    # 캐시 키에 issuer 포함
    cache_key = issuer or "default"
    
    if _clerk_jwks_cache is not None and cache_key in _clerk_jwks_cache:
        return _clerk_jwks_cache[cache_key]
    
    try:
        # issuer가 없으면 에러 발생 (JWT에서 추출해야 함)
        # ⚠️ 보안: 하드코딩된 issuer URL 제거. JWT에서 추출한 issuer만 사용합니다.
        if not issuer:
            logger.error("JWT에서 issuer를 추출할 수 없습니다. JWT 토큰이 유효하지 않거나 형식이 올바르지 않습니다.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "INVALID_TOKEN",
                    "message": "JWT 토큰에 issuer 정보가 없습니다."
                }
            )
        
        jwks_url = f"{issuer}/.well-known/jwks.json"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_url, timeout=5.0)
            response.raise_for_status()
            jwks_data = response.json()
            
            # 캐시 초기화
            if _clerk_jwks_cache is None:
                _clerk_jwks_cache = {}
            _clerk_jwks_cache[cache_key] = jwks_data
            
            return jwks_data
            
    except Exception as e:
        # JWKS 가져오기 실패
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "JWKS_FETCH_ERROR",
                "message": f"Clerk JWKS를 가져올 수 없습니다: {str(e)}"
            }
        )


def get_signing_key(jwks: dict, kid: str) -> Optional[dict]:
    """
    JWKS에서 특정 키 ID(kid)에 해당하는 서명 키 가져오기
    
    Args:
        jwks: JWKS 딕셔너리
        kid: Key ID
    
    Returns:
        서명 키 딕셔너리 또는 None
    """
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def verify_clerk_token(
    authorization: Optional[str] = Header(None)
) -> Optional[dict]:
    """
    Clerk JWT 토큰 검증
    
    프론트엔드에서 Clerk로 로그인한 후 받은 JWT 토큰을 검증합니다.
    
    Args:
        authorization: Authorization 헤더 값 (Bearer {token})
    
    Returns:
        성공: 토큰 페이로드 ({"sub": "user_id", ...})
        실패: None
    
    Note:
        프론트엔드에서 Clerk.getToken()으로 받은 토큰을
        Authorization: Bearer {token} 형태로 전송해야 합니다.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.DEBUG)  # 디버깅을 위해 DEBUG 레벨 설정
    
    if not authorization:
        logger.warning("Authorization 헤더가 없습니다.")
        return None
    
    # "Bearer " 제거
    if not authorization.startswith("Bearer "):
        logger.warning(f"Authorization 헤더 형식이 올바르지 않습니다: {authorization[:50]}")
        return None
    
    token = authorization.replace("Bearer ", "").strip()
    
    if not token:
        logger.warning("토큰이 비어있습니다.")
        return None
    
    logger.debug(f"토큰 받음 (처음 50자): {token[:50]}...")
    
    # 토큰이 JWT 형식인지 확인 (3개 부분으로 나뉘어져 있는지)
    token_parts = token.split('.')
    logger.debug(f"토큰 부분 수: {len(token_parts)}")
    
    if len(token_parts) != 3:
        logger.warning(f"토큰이 JWT 형식이 아닙니다. 부분 수: {len(token_parts)}, 토큰 시작: {token[:100]}")
        # JWT가 아닐 수 있으므로, Clerk SDK를 사용하여 검증 시도
        # 하지만 현재는 JWT만 지원하므로 None 반환
        return None
    
    try:
        # 먼저 검증 없이 JWT를 디코딩하여 issuer 추출
        # python-jose의 jwt.decode는 key 인자가 필수이므로, 검증하지 않을 때는 None 전달
        unverified_payload = jwt.decode(
            token,
            key=None,  # 서명 검증하지 않을 때는 None
            options={"verify_signature": False}
        )
        
        logger.debug(f"JWT Payload (unverified): {unverified_payload}")
        
        issuer = unverified_payload.get("iss")
        if not issuer:
            logger.warning(f"Clerk JWT에 issuer가 없습니다. Payload: {unverified_payload}")
            return None
        
        # JWT 헤더에서 kid (Key ID) 추출
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        
        if not kid:
            return None
        
        # JWKS 가져오기 (issuer 기반)
        try:
            jwks = await get_clerk_jwks(issuer=issuer)
        except HTTPException as e:
            logger.error(f"JWKS 가져오기 실패: {e.detail}")
            return None
        
        # 서명 키 가져오기
        signing_key = get_signing_key(jwks, kid)
        
        if not signing_key:
            logger.warning(f"JWKS에서 kid '{kid}'에 해당하는 키를 찾을 수 없습니다.")
            return None
        
        # RS256 공개 키 구성
        # JWK를 RSA 공개 키로 변환
        # signing_key["n"]과 signing_key["e"]는 이미 str이므로 encode() 불필요
        n_bytes = base64url_decode(signing_key["n"])
        e_bytes = base64url_decode(signing_key["e"])
        
        n_int = int.from_bytes(n_bytes, 'big')
        e_int = int.from_bytes(e_bytes, 'big')
        
        # RSA 공개 키 생성
        rsa_public_key = rsa.RSAPublicNumbers(
            e_int,
            n_int
        ).public_key(default_backend())
        
        # PEM 형식으로 변환 (python-jose가 PEM 문자열을 요구)
        from cryptography.hazmat.primitives import serialization
        pem_public_key = rsa_public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        # JWT 검증 및 디코딩
        # Clerk의 JWT는 RS256 알고리즘 사용
        payload = jwt.decode(
            token,
            pem_public_key,
            algorithms=["RS256"],
            issuer=issuer,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_iss": True,
            }
        )
        
        # Payload에서 사용자 ID 추출 (sub 클레임)
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        return {
            "sub": user_id,
            "session_id": payload.get("sid"),
            **payload
        }
        
    except JWTError as e:
        # JWT 검증 실패
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Clerk JWT 검증 실패: {str(e)}")
        return None
    except Exception as e:
        # 기타 에러
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Clerk 토큰 검증 중 예외 발생: {str(e)}", exc_info=True)
        return None


async def get_clerk_user(user_id: str) -> Optional[dict]:
    """
    Clerk에서 사용자 정보 조회
    
    Args:
        user_id: Clerk 사용자 ID
    
    Returns:
        성공: Clerk 사용자 정보 딕셔너리
        실패: None
    """
    try:
        # Clerk SDK를 사용하여 사용자 정보 조회
        # 실제 구현은 Clerk SDK 문서 참조
        # 예시: client.users.get(user_id)
        
        # TODO: Clerk SDK의 실제 메서드로 교체
        # from clerk_backend_sdk import Client
        # client = get_clerk_client()
        # user = await client.users.get(user_id)
        # return user
        
        return None
        
    except Exception:
        return None


def verify_webhook_signature(
    payload: str,
    signature: str
) -> bool:
    """
    Clerk 웹훅 서명 검증
    
    웹훅 요청이 실제로 Clerk에서 온 것인지 검증합니다.
    
    Args:
        payload: 웹훅 요청 본문 (raw string)
        signature: svix_signature 헤더 값
    
    Returns:
        검증 성공: True
        검증 실패: False
    """
    if not settings.CLERK_WEBHOOK_SECRET:
        return False
    
    try:
        # svix 라이브러리를 사용하여 서명 검증
        # 실제 구현은 svix 문서 참조
        # 예시:
        # from svix import Webhook
        # webhook = Webhook(settings.CLERK_WEBHOOK_SECRET)
        # webhook.verify(payload, signature)
        
        # TODO: svix 라이브러리로 실제 검증 구현
        return True
        
    except Exception:
        return False
