"""
UI 개인화 설정 스키마

대시보드 하단 좌측/우측 카드 뷰(4가지)를 저장합니다.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


DashboardBottomPanelView = Literal[
    "policyNews",
    "transactionVolume",
    "marketPhase",
    "regionComparison",
]


class UiPreferences(BaseModel):
    left_panel_view: Optional[DashboardBottomPanelView] = Field(
        None,
        description="대시보드 하단 좌측 카드 뷰",
    )
    bottom_panel_view: Optional[DashboardBottomPanelView] = Field(
        None,
        description="대시보드 하단 우측 카드 뷰 (하위 호환성을 위해 유지)",
    )
    right_panel_view: Optional[DashboardBottomPanelView] = Field(
        None,
        description="대시보드 하단 우측 카드 뷰",
    )


class UiPreferencesResponse(BaseModel):
    success: bool = True
    data: UiPreferences


class UiPreferencesUpdateRequest(BaseModel):
    left_panel_view: Optional[DashboardBottomPanelView] = Field(
        None,
        description="대시보드 하단 좌측 카드 뷰",
    )
    bottom_panel_view: Optional[DashboardBottomPanelView] = Field(
        None,
        description="대시보드 하단 우측 카드 뷰 (하위 호환성을 위해 유지)",
    )
    right_panel_view: Optional[DashboardBottomPanelView] = Field(
        None,
        description="대시보드 하단 우측 카드 뷰",
    )
