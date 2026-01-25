"""Fix API 스키마"""
from typing import Optional, List, Any
from pydantic import BaseModel, Field

from app.schemas.sale import SalesCollectionResponse
from app.schemas.rent import RentCollectionResponse


class ApartmentTransactionsFixResponse(BaseModel):
    """아파트 매매/전월세 초기화 및 재수집 결과"""

    success: bool = Field(..., description="전체 성공 여부")
    apt_id: int = Field(..., description="대상 아파트 ID")
    message: str = Field("", description="결과 메시지")

    deleted: dict = Field(
        default_factory=dict,
        description="초기화(삭제)된 건수: { sales: N, rents: M }",
    )
    sales: Optional[SalesCollectionResponse] = Field(
        None,
        description="매매 재수집 결과",
    )
    rents: Optional[RentCollectionResponse] = Field(
        None,
        description="전월세 재수집 결과",
    )
    errors: List[str] = Field(default_factory=list, description="오류 메시지 목록")
