import json
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.chat import TripRequestIn
from app.services.itinerary_normalize import normalize_node_regions

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "mock_singapore.json"
_TEMPLATE: dict | None = None


def _load_template() -> dict:
    global _TEMPLATE
    if _TEMPLATE is None:
        with open(_DATA_PATH, encoding="utf-8") as f:
            _TEMPLATE = json.load(f)
    return _TEMPLATE


def _filter_edges(edges: list[dict], kept_ids: set[str]) -> list[dict]:
    return [e for e in edges if e.get("from") in kept_ids and e.get("to") in kept_ids]


def build_itinerary(trip_request: TripRequestIn) -> dict:
    template = deepcopy(_load_template())
    dest = (trip_request.destination or "").strip() or "新加坡"
    requested_days = trip_request.day_count

    days = template.get("days", [])
    if requested_days is not None and requested_days > 0:
        days = days[:requested_days]

    days = [{**d, "day_index": i + 1} for i, d in enumerate(days)]

    kept_ids: set[str] = set()
    for day in days:
        kept_ids.update(n["id"] for n in day.get("nodes", []))

    for day in days:
        day["edges"] = _filter_edges(day.get("edges", []), kept_ids)

    cross_day = _filter_edges(template.get("cross_day_edges", []), kept_ids)

    warnings = list(template.get("meta", {}).get("warnings", []))
    full_len = len(template.get("days", []))
    if requested_days and requested_days < full_len:
        warnings.append(f"Mock 已按 {requested_days} 天截断行程")

    return normalize_node_regions({
        **template,
        "id": str(uuid.uuid4()),
        "destination": dest,
        "title": f"{dest} {len(days)} 日游",
        "days": days,
        "cross_day_edges": cross_day,
        "meta": {
            **template.get("meta", {}),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "warnings": warnings,
        },
    })
