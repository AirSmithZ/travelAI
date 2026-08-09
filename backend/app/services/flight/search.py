from __future__ import annotations

from datetime import date, datetime, timezone

from app.config import Settings
from app.schemas.flight import (
    FlightQuote,
    FlightSearchRequest,
    FlightSearchResponse,
    PurchaseChannel,
)
from app.services.flight.city_codes import (
    UnknownCityCodeError,
    resolve_ignav_iata,
    resolve_tripcom_city_code,
)
from app.services.flight.ignav_provider import search_ignav
from app.services.flight.letsfg_provider import search_letsfg
from app.services.flight.rank import rank_offers
from app.services.flight.tripcom_deeplink import (
    affiliate_params_from_settings,
    build_tripcom_flight_url,
)


def search_flights(body: FlightSearchRequest, settings: Settings) -> FlightSearchResponse:
    try:
        # Trip.com deeplink keeps metro city codes (bjs/tyo/…);
        # Ignav requires real airport IATA (PEK/NRT/…) — see resolve_ignav_iata.
        dcity = resolve_tripcom_city_code(body.origin)
        acity = resolve_tripcom_city_code(body.destination)
        origin_iata = resolve_ignav_iata(body.origin)
        dest_iata = resolve_ignav_iata(body.destination)
    except UnknownCityCodeError as e:
        raise ValueError(str(e)) from e

    depart = date.fromisoformat(body.date)
    return_d: date | None = None
    if body.return_date:
        return_d = date.fromisoformat(body.return_date)
        if return_d < depart:
            raise ValueError("return_date must be on or after date")

    affiliate = affiliate_params_from_settings(settings)
    url = build_tripcom_flight_url(
        dcity=dcity,
        acity=acity,
        depart_date=depart,
        adults=body.adults,
        return_date=return_d,
        cabin=body.cabin,
        currency=settings.tripcom_default_currency,
        affiliate=affiliate,
    )

    warnings: list[str] = []
    errors: dict[str, str] = {}
    latency_ms: dict[str, int] = {}
    sources_used = ["tripcom_deeplink"]
    offers: list[FlightQuote] = []
    ranked: list[FlightQuote] = []

    if not affiliate.alliance_id:
        warnings.append("未配置 Trip.com 联盟参数；链接仍可正常搜索，但不计联盟佣金。")

    use_ignav = body.include_ignav and settings.flight_include_ignav
    if use_ignav:
        ignav_offers, ms, err = search_ignav(
            body,
            settings,
            origin_iata=origin_iata,
            dest_iata=dest_iata,
        )
        if ms:
            latency_ms["ignav"] = ms
        if err:
            errors["ignav"] = err
            warnings.append(f"Ignav 未返回报价: {err}")
        elif ignav_offers:
            sources_used.append("ignav")
            seen: set[tuple] = set()
            for offer in ignav_offers:
                ret = offer.return_leg
                key = (
                    offer.airline,
                    offer.price_amount,
                    offer.duration_minutes,
                    offer.stops,
                    ret.airline if ret else "",
                    ret.duration_minutes if ret else 0,
                    ret.stops if ret else 0,
                )
                if key in seen:
                    continue
                seen.add(key)
                offers.append(offer)
            ranked = rank_offers(offers, body.preference, top_n=8)
            ranked = [
                o.model_copy(update={"purchase_url": o.purchase_url or url})
                for o in ranked
            ]
            warnings.append(
                "参考价来自 Ignav，仅供 App 内对比；最终价格与余位以 Trip.com 实时页面为准。"
            )

    use_letsfg = body.include_letsfg or settings.flight_include_letsfg
    if use_letsfg and not ranked:
        letsfg_offers, letsfg_ms, err = search_letsfg(body, settings)
        if letsfg_ms:
            latency_ms["letsfg"] = letsfg_ms
        if err:
            errors["letsfg"] = err
            warnings.append(f"LetsFG 未返回参考价: {err}")
        elif letsfg_offers:
            sources_used.append("letsfg")
            seen = {(o.airline, o.price_amount, o.duration_minutes, o.stops) for o in offers}
            for offer in letsfg_offers:
                key = (offer.airline, offer.price_amount, offer.duration_minutes, offer.stops)
                if key in seen:
                    continue
                seen.add(key)
                offers.append(offer)
            ranked = rank_offers(offers, body.preference, top_n=8)
            warnings.append("参考价来自 LetsFG，仅供对比；最终价格与余位以 Trip.com 实时页面为准。")

    if not ranked:
        if not use_ignav and not use_letsfg:
            warnings.append("未启用 Ignav/LetsFG；请在 Trip.com 查看具体航班与实时价格。")
        else:
            warnings.append("App 内暂无排序推荐；可打开 Trip.com 链接查实时航班与价格。")

    return FlightSearchResponse(
        request=body,
        fetched_at=datetime.now(timezone.utc).isoformat(),
        purchase=PurchaseChannel(
            name="Trip.com",
            url=url,
            type="search",
            note="航班与价格以 Trip.com 预订页为准",
        ),
        offers=offers,
        ranked=ranked,
        sources_used=sources_used,
        warnings=warnings,
        errors=errors,
        latency_ms=latency_ms,
    )
