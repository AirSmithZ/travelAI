"""ACT-POOL / doc 34: closed attraction pool from maps + evidence, then code enforce."""

from __future__ import annotations

import logging
import re
import time
from difflib import SequenceMatcher
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.services.api_usage import record_usage
from app.services.geocode_providers import haversine_km

logger = logging.getLogger(__name__)

_ATTRACTION_CATS = frozenset({"attraction", "landmark"})
_SKIP_TYPE_RE = re.compile(
    r"hotel|lodging|hostel|motel|inn|restaurant|cafe|bar|supermarket|bank|atm|"
    r"gas_station|parking|pharmacy|hospital|school|embassy",
    re.I,
)
_NORMALIZE_RE = re.compile(r"[\s\-·・'\"「」『』（）()\[\]【】!！?？,，.。]+")


def normalize_poi_name(name: str) -> str:
    s = _NORMALIZE_RE.sub("", str(name or "").strip().casefold())
    return s


def hotel_anchor_from_intel(
    travel_intel: dict[str, Any] | None,
) -> tuple[float, float, str] | None:
    """Return (lat, lng, city_hint) from first locked hotel with coords."""
    if not travel_intel:
        return None
    for h in travel_intel.get("hotels") or []:
        if not isinstance(h, dict):
            continue
        try:
            lat = float(h.get("lat"))
            lng = float(h.get("lng"))
        except (TypeError, ValueError):
            continue
        if abs(lat) < 0.01 and abs(lng) < 0.01:
            continue
        city = str(h.get("city") or h.get("name") or "").strip()
        return lat, lng, city
    return None


def verified_pool_names(poi_candidates: list[dict[str, Any]] | None) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for p in poi_candidates or []:
        if not isinstance(p, dict) or not p.get("verified"):
            continue
        name = str(p.get("name") or "").strip()
        if not name:
            continue
        key = normalize_poi_name(name)
        if not key or key in seen:
            continue
        seen.add(key)
        names.append(name)
    return names


def _pool_index(
    poi_candidates: list[dict[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    idx: dict[str, dict[str, Any]] = {}
    for p in poi_candidates or []:
        if not isinstance(p, dict) or not p.get("verified"):
            continue
        name = str(p.get("name") or "").strip()
        key = normalize_poi_name(name)
        if key and key not in idx:
            idx[key] = p
    return idx


def match_pool_entry(
    name: str,
    pool_index: dict[str, dict[str, Any]],
    *,
    threshold: float = 0.72,
) -> dict[str, Any] | None:
    """Exact / contains / fuzzy match against closed pool."""
    raw = str(name or "").strip()
    if not raw or not pool_index:
        return None
    key = normalize_poi_name(raw)
    if key in pool_index:
        return pool_index[key]
    best: dict[str, Any] | None = None
    best_score = 0.0
    for pkey, entry in pool_index.items():
        if not pkey:
            continue
        if key in pkey or pkey in key:
            # Prefer longer overlap
            score = max(len(key), len(pkey)) / max(len(key), len(pkey), 1)
            score = min(0.95, 0.78 + 0.1 * score)
        else:
            score = SequenceMatcher(None, key, pkey).ratio()
        if score > best_score:
            best_score = score
            best = entry
    if best is not None and best_score >= threshold:
        return best
    return None


def merge_poi_candidates(
    *groups: list[dict[str, Any]] | None,
    max_items: int = 24,
) -> list[dict[str, Any]]:
    """Dedupe by normalized name; prefer verified + richer metadata."""
    by_key: dict[str, dict[str, Any]] = {}
    for group in groups:
        for raw in group or []:
            if not isinstance(raw, dict):
                continue
            name = str(raw.get("name") or "").strip()
            key = normalize_poi_name(name)
            if not key:
                continue
            cur = by_key.get(key)
            if cur is None:
                by_key[key] = dict(raw)
                by_key[key]["name"] = name
                continue
            # Upgrade fields
            if raw.get("verified") and not cur.get("verified"):
                cur["verified"] = True
            for fld in ("lat", "lng", "place_id", "rating", "place_types", "hours_text", "open_state", "display_name", "source"):
                if cur.get(fld) in (None, "", [], {}) and raw.get(fld) not in (None, "", [], {}):
                    cur[fld] = raw.get(fld)
            try:
                m_new = int(raw.get("mentions") or 0)
                m_old = int(cur.get("mentions") or 0)
                if m_new > m_old:
                    cur["mentions"] = m_new
            except (TypeError, ValueError):
                pass
            if raw.get("adopted") or cur.get("adopted"):
                cur["adopted"] = True

    rows = list(by_key.values())
    rows.sort(
        key=lambda c: (
            not bool(c.get("verified")),
            not bool(c.get("adopted")),
            -int(c.get("mentions") or 0),
            str(c.get("name") or ""),
        )
    )
    return rows[: max(1, max_items)]


def collect_adopted_names(evidence: list[dict[str, Any]] | None) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for item in evidence or []:
        if not isinstance(item, dict):
            continue
        adopted = item.get("adopted_pois")
        if not isinstance(adopted, list):
            continue
        for x in adopted:
            name = str(x).strip()
            key = normalize_poi_name(name)
            if not name or key in seen:
                continue
            seen.add(key)
            names.append(name)
    return names


def promote_adopted_candidates(
    evidence: list[dict[str, Any]] | None,
    destination: str,
    *,
    fence_lat: float | None = None,
    fence_lng: float | None = None,
    max_km: float = 35.0,
    max_geocode: int = 8,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """Geocode adopted names into fence so they enter the closed pool as verified."""
    dest = (destination or "").strip()
    names = collect_adopted_names(evidence)
    if not names or not dest:
        return []

    cfg = settings or get_settings()
    out: list[dict[str, Any]] = []
    try:
        from app.services.geocoding import geocode_place
    except Exception as e:  # pragma: no cover
        logger.warning("adopt geocode import failed: %s", e)
        return []

    n = 0
    for name in names:
        if n >= max_geocode:
            break
        try:
            hit = geocode_place(name, dest)
        except Exception as e:
            logger.debug("adopt geocode skip %s: %s", name, e)
            hit = None
        n += 1
        if not hit:
            # Soft seed so prompt can still prefer the name; enforce may fuzzy-fail
            out.append(
                {
                    "name": name,
                    "verified": False,
                    "adopted": True,
                    "source": "adopted",
                    "mentions": 1,
                }
            )
            continue
        lat, lng = hit.get("lat"), hit.get("lng")
        try:
            lat_f = float(lat) if lat is not None else None
            lng_f = float(lng) if lng is not None else None
        except (TypeError, ValueError):
            lat_f = lng_f = None
        verified = lat_f is not None and lng_f is not None
        if (
            verified
            and fence_lat is not None
            and fence_lng is not None
            and max_km > 0
        ):
            d = haversine_km(fence_lat, fence_lng, lat_f, lng_f)
            if d > max_km:
                out.append(
                    {
                        "name": name,
                        "verified": False,
                        "adopted": True,
                        "source": "adopted",
                        "mentions": 1,
                        "fence_rejected_km": round(d, 1),
                    }
                )
                continue
        row: dict[str, Any] = {
            "name": name,
            "verified": verified,
            "adopted": True,
            "source": "adopted",
            "mentions": 2,
        }
        if lat_f is not None and lng_f is not None:
            row["lat"] = lat_f
            row["lng"] = lng_f
        label = hit.get("name") or hit.get("address")
        if label:
            row["display_name"] = label
        out.append(row)
    return out


def _parse_maps_attractions(
    data: dict[str, Any],
    *,
    hub_lat: float,
    hub_lng: float,
    max_km: float,
    limit: int,
) -> list[dict[str, Any]]:
    raw_items: list[dict[str, Any]] = []
    place = data.get("place_results")
    if isinstance(place, dict):
        raw_items.append(place)
    local = data.get("local_results")
    if isinstance(local, list):
        raw_items.extend(x for x in local if isinstance(x, dict))

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_items:
        title = str(item.get("title") or item.get("name") or "").strip()
        if not title:
            continue
        type_blob = item.get("type") or item.get("types") or ""
        if isinstance(type_blob, list):
            type_s = " ".join(str(t) for t in type_blob)
        else:
            type_s = str(type_blob)
        if type_s and _SKIP_TYPE_RE.search(type_s):
            continue
        gps = item.get("gps_coordinates") if isinstance(item.get("gps_coordinates"), dict) else {}
        try:
            lat = float(gps.get("latitude"))
            lng = float(gps.get("longitude"))
        except (TypeError, ValueError):
            continue
        if max_km > 0 and haversine_km(hub_lat, hub_lng, lat, lng) > max_km:
            continue
        key = normalize_poi_name(title)
        if key in seen:
            continue
        seen.add(key)
        row: dict[str, Any] = {
            "name": title,
            "verified": True,
            "lat": lat,
            "lng": lng,
            "source": "maps_pool",
            "mentions": 1,
        }
        if type_s.strip():
            row["place_types"] = [t.strip() for t in re.split(r"[,/]", type_s) if t.strip()][:5]
        rating = item.get("rating")
        try:
            if rating is not None:
                row["rating"] = float(rating)
        except (TypeError, ValueError):
            pass
        pid = item.get("place_id") or item.get("data_id")
        if pid:
            row["place_id"] = str(pid)
        addr = str(item.get("address") or "").strip()
        if addr:
            row["display_name"] = addr
        out.append(row)
        if len(out) >= limit:
            break
    return out


def fetch_maps_attraction_pool(
    *,
    lat: float,
    lng: float,
    destination: str,
    settings: Settings | None = None,
    limit: int = 16,
    max_km: float = 35.0,
) -> list[dict[str, Any]]:
    """One SerpAPI Maps search for attractions near hotel. Soft-fail → []."""
    cfg = settings or get_settings()
    if not cfg.closed_poi_maps_enable:
        return []
    if not cfg.serpapi_configured:
        return []

    from app.services.serp_circuit import (
        record_serp_rate_limit,
        serp_backoff_from_settings,
        serp_circuit_open,
    )

    if serp_circuit_open():
        logger.info("closed poi maps skipped: serp circuit open")
        return []

    key = (cfg.serpapi_api_key or "").strip()
    dest = (destination or "").strip()
    q = f"{dest} tourist attractions".strip() if dest else "tourist attractions"
    base = (cfg.serpapi_base_url or "https://serpapi.com").rstrip("/")
    params = {
        "engine": "google_maps",
        "q": q,
        "type": "search",
        "hl": "zh-cn",
        "ll": f"@{lat},{lng},13z",
        "api_key": key,
    }
    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=float(cfg.serpapi_timeout_sec or 20)) as client:
            resp = client.get(f"{base}/search.json", params=params)
            if resp.status_code == 429:
                record_serp_rate_limit(serp_backoff_from_settings(cfg))
                record_usage("serpapi", "closed_poi_maps", ok=False, latency_ms=int((time.perf_counter() - t0) * 1000), error="429")
                return []
            resp.raise_for_status()
            data = resp.json()
        ms = int((time.perf_counter() - t0) * 1000)
    except Exception as e:
        record_usage(
            "serpapi",
            "closed_poi_maps",
            ok=False,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error=str(e)[:200],
        )
        logger.warning("closed poi maps fetch failed: %s", e)
        return []

    if not isinstance(data, dict) or data.get("error"):
        err = str((data or {}).get("error") if isinstance(data, dict) else "bad")[:200]
        if "429" in err or "rate" in err.lower():
            record_serp_rate_limit(serp_backoff_from_settings(cfg))
        record_usage("serpapi", "closed_poi_maps", ok=False, latency_ms=ms, error=err)
        return []

    record_usage("serpapi", "closed_poi_maps", ok=True, latency_ms=ms)
    return _parse_maps_attractions(
        data, hub_lat=lat, hub_lng=lng, max_km=max_km, limit=limit
    )


def build_closed_poi_pool(
    evidence_candidates: list[dict[str, Any]] | None,
    *,
    evidence: list[dict[str, Any]] | None = None,
    destination: str = "",
    travel_intel: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """
    Merge evidence verified + adopted∩fence + optional hotel-anchored Maps attractions.
    Maps fill only when verified seed is thin (Serp budget).
    """
    cfg = settings or get_settings()
    dest = (destination or "").strip()
    max_items = max(8, int(cfg.closed_poi_pool_max))
    max_km = float(cfg.closed_poi_max_km)

    anchor = hotel_anchor_from_intel(travel_intel)
    fence_lat = anchor[0] if anchor else None
    fence_lng = anchor[1] if anchor else None
    city_hint = anchor[2] if anchor else dest

    adopted = promote_adopted_candidates(
        evidence,
        dest,
        fence_lat=fence_lat,
        fence_lng=fence_lng,
        max_km=max_km,
        max_geocode=max(0, int(cfg.closed_poi_adopt_geocode_max)),
        settings=cfg,
    )

    merged = merge_poi_candidates(evidence_candidates, adopted, max_items=max_items)
    verified_n = sum(1 for p in merged if p.get("verified"))

    maps: list[dict[str, Any]] = []
    min_seed = max(0, int(cfg.closed_poi_maps_min_seed))
    if (
        anchor
        and verified_n < min_seed
        and cfg.closed_poi_maps_enable
    ):
        maps = fetch_maps_attraction_pool(
            lat=anchor[0],
            lng=anchor[1],
            destination=city_hint or dest,
            settings=cfg,
            limit=max(4, int(cfg.closed_poi_maps_limit)),
            max_km=max_km,
        )
        if maps:
            merged = merge_poi_candidates(merged, maps, max_items=max_items)

    logger.info(
        "closed_poi_pool built verified=%s total=%s maps=%s adopted=%s dest=%r",
        sum(1 for p in merged if p.get("verified")),
        len(merged),
        len(maps),
        sum(1 for p in merged if p.get("adopted")),
        dest,
    )
    return merged


def enforce_closed_poi_pool(
    itinerary: dict[str, Any],
    poi_candidates: list[dict[str, Any]] | None,
    *,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """
    Post-LLM: attraction/landmark must match closed pool when pool is non-empty.
    Fuzzy → rename to canonical + copy coords; else demote to optional + warning.
    """
    cfg = settings or get_settings()
    if not cfg.closed_poi_enforce:
        return itinerary

    pool_index = _pool_index(poi_candidates)
    if len(pool_index) < 1:
        return itinerary

    threshold = float(cfg.closed_poi_match_threshold)
    rewritten: list[str] = []
    demoted: list[str] = []

    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        for node in day.get("nodes") or []:
            if not isinstance(node, dict):
                continue
            cat = str(node.get("category") or "").strip().lower()
            if cat not in _ATTRACTION_CATS:
                continue
            name = str(node.get("name") or "").strip()
            if not name:
                continue
            hit = match_pool_entry(name, pool_index, threshold=threshold)
            if hit is None:
                node["is_optional"] = True
                node["out_of_pool"] = True
                tip = str(node.get("tips") or "").strip()
                note = "未在封闭景点池内，已标为可选"
                node["tips"] = f"{tip}；{note}".strip("；") if tip else note
                demoted.append(name)
                continue

            canon = str(hit.get("name") or "").strip()
            if canon and canon != name:
                rewritten.append(f"{name}→{canon}")
                node["name"] = canon
            node.pop("out_of_pool", None)
            # Prefer pool coords when node lacks them
            if node.get("lat") is None and hit.get("lat") is not None:
                node["lat"] = hit.get("lat")
            if node.get("lng") is None and hit.get("lng") is not None:
                node["lng"] = hit.get("lng")
            if hit.get("place_id") and not node.get("place_id"):
                node["place_id"] = hit.get("place_id")

    warnings: list[str] = []
    if rewritten:
        sample = "、".join(rewritten[:4])
        more = f" 等{len(rewritten)}处" if len(rewritten) > 4 else ""
        warnings.append(f"封闭池对齐景点名：{sample}{more}")
    if demoted:
        sample = "、".join(demoted[:4])
        more = f" 等{len(demoted)}处" if len(demoted) > 4 else ""
        warnings.append(f"出池景点已标可选：{sample}{more}")

    if warnings:
        meta = itinerary.setdefault("meta", {})
        existing = list(meta.get("warnings") or [])
        for w in warnings:
            if w not in existing:
                existing.append(w)
        meta["warnings"] = existing
        meta["closed_poi_enforced"] = True
        meta["closed_poi_rewritten"] = len(rewritten)
        meta["closed_poi_demoted"] = len(demoted)

    return itinerary
