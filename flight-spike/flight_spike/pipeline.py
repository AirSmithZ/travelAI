from __future__ import annotations

from datetime import datetime, timezone
import os

from flight_spike.duffel import search_duffel
from flight_spike.letsfg import search_letsfg
from flight_spike.models import FlightOffer, SearchRequest, SearchResult
from flight_spike.rank import rank_offers
from flight_spike.tripcom_deeplink import TripcomAffiliateParams, build_tripcom_flight_url


def _tripcom_purchase_url(req: SearchRequest) -> str:
    affiliate = TripcomAffiliateParams(
        alliance_id=os.environ.get("TRIPCOM_AFFILIATE_ALLIANCE_ID", ""),
        sid=os.environ.get("TRIPCOM_AFFILIATE_SID", ""),
        sub1=os.environ.get("TRIPCOM_AFFILIATE_SUB1", ""),
        sub3=os.environ.get("TRIPCOM_AFFILIATE_SUB3", ""),
    )
    return build_tripcom_flight_url(
        dcity=req.origin,
        acity=req.destination,
        depart_date=req.date,
        adults=req.adults,
        return_date=req.return_date,
        cabin=req.cabin,
        currency=req.currency if req.currency else "CNY",
        affiliate=affiliate,
    )


def search_and_rank(req: SearchRequest, *, top_n: int = 5) -> SearchResult:
    fetched_at = datetime.now(timezone.utc).isoformat()
    purchase_url = _tripcom_purchase_url(req)
    result = SearchResult(
        request=req,
        fetched_at=fetched_at,
        deeplink=purchase_url,
        warnings=[
            "航班与价格以 Trip.com 预订页为准。",
            "本流程不提供订票，仅搜索与性价比排序。",
        ],
    )
    result.sources_used.append("tripcom_deeplink")

    all_offers: list[FlightOffer] = []

    if req.include_letsfg:
        offers, ms, err = search_letsfg(req)
        result.latency_ms["letsfg"] = ms
        if err:
            result.errors["letsfg"] = err
            result.warnings.append(f"LetsFG 未返回结果: {err}")
        else:
            result.sources_used.append("letsfg")
            all_offers.extend(offers)

    if req.include_duffel:
        offers, ms, err = search_duffel(req)
        if ms:
            result.latency_ms["duffel"] = ms
        if err:
            if "not set" in err:
                result.warnings.append("Duffel 未配置 DUFFEL_TOKEN，已跳过。")
            else:
                result.errors["duffel"] = err
                result.warnings.append(f"Duffel 失败: {err}")
        else:
            result.sources_used.append("duffel")
            all_offers.extend(offers)

    # Dedupe rough: same price + airline + duration
    seen: set[tuple] = set()
    unique: list[FlightOffer] = []
    for o in all_offers:
        key = (o.airline, o.price_amount, o.duration_minutes, o.stops)
        if key in seen:
            continue
        seen.add(key)
        unique.append(o)

    result.offers = unique
    result.ranked = rank_offers(unique, req.preference, top_n=top_n)

    if not result.ranked and req.include_letsfg and not result.errors.get("letsfg"):
        result.warnings.append("无结构化报价；请使用 Trip.com 链接查看航班。")

    return result
