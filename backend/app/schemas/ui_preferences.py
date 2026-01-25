"""
UI 개인화 설정 스키마

현재는 대시보드 하단 우측 카드 뷰(4가지)만 저장합니다.
"""

from typing import Literal
from pydantic import BaseModel, Field


DashboardBottomPanelView = Literal[
    "policyNews",
    "transactionVolume",
    "marketPhase",
    "regionComparison",
]


class UiPreferences(BaseModel):
    bottom_panel_view: DashboardBottomPanelView = Field(
        ...,
        description="대시보드 하단 우측 카드 뷰",
    )


class UiPreferencesResponse(BaseModel):
    success: bool = True
    data: UiPreferences


class UiPreferencesUpdateRequest(BaseModel):
    bottom_panel_view: DashboardBottomPanelView = Field(
        ...,
        description="대시보드 하단 우측 카드 뷰",
    )
