"""
天气查询 tool。

WX-01：和风每日预报见 ``qweather_forecast.fetch_trip_forecast``。
对话 ``fetch_weather`` 确认 UI（WX-03）仍后续；当前 stub 保留给 Chat。
"""

from __future__ import annotations

from typing import Any

WEATHER_ICONS = frozenset({"sunny", "cloudy", "overcast", "rain", "storm", "snow"})


def weather_tool_schema_doc() -> str:
    return (
        "【fetch_weather 工具】查询指定天的天气预报。"
        " 输出 action=fetch_weather，day_index 为 1-based。"
        f" weather.icon 仅允许：{', '.join(sorted(WEATHER_ICONS))}。"
        " 用户确认后写入 days[i].weather。"
    )


def stub_fetch_weather(
    destination: str,
    date: str,
    *,
    llm_weather: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Phase 0 / Chat：优先使用 LLM 推断结果，否则返回占位。"""
    if llm_weather:
        icon = str(llm_weather.get("icon", "cloudy")).strip().lower()
        if icon not in WEATHER_ICONS:
            icon = "cloudy"
        return {
            "temp_min": int(llm_weather.get("temp_min", 22)),
            "temp_max": int(llm_weather.get("temp_max", 30)),
            "icon": icon,
            "description": str(llm_weather.get("description", "多云")),
            "source": "llm",
        }
    return {
        "temp_min": 24,
        "temp_max": 32,
        "icon": "cloudy",
        "description": f"{destination} {date} 天气待查询",
        "source": "llm",
    }
