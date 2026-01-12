"""
커스텀 예외 클래스

API 에러 응답을 일관되게 관리합니다.
"""
from typing import Any, Optional
from fastapi import HTTPException, status


class AppException(HTTPException):
    """
    애플리케이션 기본 예외 클래스
    """
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Any] = None
    ):
        detail = {
            "code": code,
            "message": message,
            "details": details
        }
        super().__init__(status_code=status_code, detail=detail)


# ==================== 인증 관련 예외 ====================

class InvalidCredentialsException(AppException):
    """이메일 또는 비밀번호가 틀렸을 때"""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="INVALID_CREDENTIALS",
            message="이메일 또는 비밀번호가 올바르지 않습니다."
        )


class TokenExpiredException(AppException):
    """토큰이 만료되었을 때"""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="TOKEN_EXPIRED",
            message="인증 토큰이 만료되었습니다. 다시 로그인해주세요."
        )


class AlreadyExistsException(AppException):
    """이미 존재하는 리소스일 때 (중복 가입 등)"""
    def __init__(self, resource: str = "리소스"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            code="ALREADY_EXISTS",
            message=f"이미 존재하는 {resource}입니다."
        )


# ==================== 리소스 관련 예외 ====================

class NotFoundException(AppException):
    """리소스를 찾을 수 없을 때"""
    def __init__(self, resource: str = "리소스"):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code=f"{resource.upper()}_NOT_FOUND",
            message=f"해당 {resource}을(를) 찾을 수 없습니다."
        )


class LimitExceededException(AppException):
    """제한 초과했을 때"""
    def __init__(self, resource: str, limit: int):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=f"{resource.upper()}_LIMIT_EXCEEDED",
            message=f"{resource}은(는) 최대 {limit}개까지 가능합니다."
        )


# ==================== 검증 관련 예외 ====================

class ValidationException(AppException):
    """입력값 검증 실패"""
    def __init__(self, message: str, details: Any = None):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="VALIDATION_ERROR",
            message=message,
            details=details
        )


# ==================== 인가 관련 예외 ====================

class UnauthorizedException(AppException):
    """인증이 필요할 때"""
    def __init__(self, message: str = "인증이 필요합니다."):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="UNAUTHORIZED",
            message=message
        )


class ForbiddenException(AppException):
    """권한이 없을 때"""
    def __init__(self, message: str = "권한이 없습니다."):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            code="FORBIDDEN",
            message=message
        )
