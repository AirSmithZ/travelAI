"""doc 34 L3/L11: must/nice adopt levels + attach node evidence_refs (code, not LLM-only)."""

from __future__ import annotations

from typing import Any

from app.services.closed_poi_pool import match_pool_entry, normalize_poi_name

_ATTRACTION_CATS = frozenset({"attraction", "landmark", "restaurant", "snack"})


def normalize_adopt_levels(
    names: list[str],
    raw_levels: dict[str, Any] | None,
) -> dict[str, str]:
    """Map adopted names → must|nice (default nice)."""
    out: dict[str, str] = {}
    raw = raw_levels if isinstance(raw_levels, dict) else {}
    # Build casefold lookup from raw keys
    raw_norm: dict[str, str] = {}
    for k, v in raw.items():
        key = normalize_poi_name(str(k))
        lvl = str(v or "").strip().lower()
        if key and lvl in ("must", "nice"):
            raw_norm[key] = lvl
    for name in names:
        n = str(name).strip()
        if not n:
            continue
        out[n] = raw_norm.get(normalize_poi_name(n), "nice")
    return out


def collect_must_names(evidence: list[dict[str, Any]] | None) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for item in evidence or []:
        if not isinstance(item, dict):
            continue
        adopted = item.get("adopted_pois")
        if not isinstance(adopted, list):
            continue
        levels = item.get("adopt_levels")
        level_map = normalize_adopt_levels(
            [str(x) for x in adopted],
            levels if isinstance(levels, dict) else None,
        )
        for name, lvl in level_map.items():
            if lvl != "must":
                continue
            key = normalize_poi_name(name)
            if key in seen:
                continue
            seen.add(key)
            names.append(name)
    return names


def _adopted_index(
    evidence: list[dict[str, Any]] | None,
) -> dict[str, list[dict[str, Any]]]:
    """normalized POI name → list of adopted evidence stubs."""
    idx: dict[str, list[dict[str, Any]]] = {}
    for item in evidence or []:
        if not isinstance(item, dict):
            continue
        adopted = item.get("adopted_pois")
        if not isinstance(adopted, list) or not adopted:
            continue
        stub = {
            "url": str(item.get("url") or "").strip(),
            "title": str(item.get("title") or "").strip() or None,
            "note_id": str(item.get("note_id") or "").strip() or None,
            "role": "adopted",
        }
        if not stub["url"] and not stub["note_id"]:
            continue
        for name in adopted:
            n = str(name).strip()
            if not n:
                continue
            key = normalize_poi_name(n)
            idx.setdefault(key, [])
            # dedupe by url/note_id
            sig = stub["url"] or stub["note_id"] or ""
            if any((r.get("url") or r.get("note_id") or "") == sig for r in idx[key]):
                continue
            idx[key].append(dict(stub))
    return idx


def attach_evidence_refs(
    itinerary: dict[str, Any],
    evidence: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """
    Code-attach evidence_refs on nodes that match adopted POI names.
    Only links adopted (user-checked) posts — never auto pack alone (L11).
    """
    idx = _adopted_index(evidence)
    if not idx:
        return itinerary

    # pool-style index for fuzzy node→adopted name
    pool_for_match = {
        k: {"name": k} for k in idx.keys()
    }
    # Better: keep original names for display — rebuild with first original
    name_by_key: dict[str, str] = {}
    for item in evidence or []:
        if not isinstance(item, dict):
            continue
        for name in item.get("adopted_pois") or []:
            n = str(name).strip()
            key = normalize_poi_name(n)
            if key and key not in name_by_key:
                name_by_key[key] = n
    pool_for_match = {
        k: {"name": name_by_key.get(k, k), "verified": True} for k in idx.keys()
    }

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
            key = normalize_poi_name(name)
            refs = list(idx.get(key) or [])
            if not refs:
                hit = match_pool_entry(name, pool_for_match, threshold=0.78)
                if hit is not None:
                    hkey = normalize_poi_name(str(hit.get("name") or ""))
                    refs = list(idx.get(hkey) or [])
            if refs:
                # compact: drop empty fields
                clean: list[dict[str, Any]] = []
                for r in refs[:4]:
                    row = {"url": r["url"], "role": "adopted"}
                    if r.get("title"):
                        row["title"] = r["title"]
                    if r.get("note_id"):
                        row["note_id"] = r["note_id"]
                    if row["url"] or row.get("note_id"):
                        clean.append(row)
                if clean:
                    node["evidence_refs"] = clean
    return itinerary


def audit_must_pois(
    itinerary: dict[str, Any],
    evidence: list[dict[str, Any]] | None,
) -> list[str]:
    """Warn when adopt-level must places are missing from the itinerary."""
    musts = collect_must_names(evidence)
    if not musts:
        return []

    node_names: list[str] = []
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        for node in day.get("nodes") or []:
            if not isinstance(node, dict):
                continue
            n = str(node.get("name") or "").strip()
            if n:
                node_names.append(n)

    pool_index = {
        normalize_poi_name(n): {"name": n, "verified": True} for n in node_names
    }
    missing: list[str] = []
    for m in musts:
        if match_pool_entry(m, pool_index, threshold=0.72) is None:
            missing.append(m)

    if not missing:
        return []
    sample = "、".join(missing[:4])
    more = f" 等{len(missing)}处" if len(missing) > 4 else ""
    return [f"必去地点未排入行程：{sample}{more}"]


def apply_must_optional_flags(
    itinerary: dict[str, Any],
    evidence: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Matched must POIs should not stay optional."""
    musts = collect_must_names(evidence)
    if not musts:
        return itinerary
    pool_index = {
        normalize_poi_name(m): {"name": m, "verified": True} for m in musts
    }
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        for node in day.get("nodes") or []:
            if not isinstance(node, dict):
                continue
            name = str(node.get("name") or "").strip()
            if not name:
                continue
            if match_pool_entry(name, pool_index, threshold=0.72) is not None:
                node["is_optional"] = False
                node.pop("out_of_pool", None)
    return itinerary


def enrich_itinerary_evidence_borrow(
    itinerary: dict[str, Any],
    evidence: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Attach refs + must flags/warnings."""
    itinerary = attach_evidence_refs(itinerary, evidence)
    itinerary = apply_must_optional_flags(itinerary, evidence)
    notes = audit_must_pois(itinerary, evidence)
    if notes:
        meta = itinerary.setdefault("meta", {})
        warnings = list(meta.get("warnings") or [])
        for w in notes:
            if w not in warnings:
                warnings.append(w)
        meta["warnings"] = warnings
    return itinerary
