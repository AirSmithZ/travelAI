from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from urllib.parse import urlencode

TRIPCOM_FLIGHT_BASE = "https://www.trip.com/flights/showfarefirst"

_CABIN_CLASS = {
    "economy": "y",
    "premium_economy": "s",
    "business": "c",
    "first": "f",
}


@dataclass(frozen=True)
class TripcomAffiliateParams:
    alliance_id: str = ""
    sid: str = ""
    sub1: str = ""
    sub3: str = ""


def build_tripcom_flight_url(
    *,
    dcity: str,
    acity: str,
    depart_date: str,
    adults: int = 1,
    return_date: str | None = None,
    cabin: str = "economy",
    currency: str = "CNY",
    affiliate: TripcomAffiliateParams | None = None,
) -> str:
    d = date.fromisoformat(depart_date)
    triptype = "rt" if return_date else "ow"
    params: dict[str, str | int] = {
        "dcity": dcity.lower(),
        "acity": acity.lower(),
        "ddate": d.isoformat(),
        "triptype": triptype,
        "class": _CABIN_CLASS.get(cabin, "y"),
        "quantity": adults,
        "curr": currency.upper(),
    }
    if return_date:
        params["rdate"] = date.fromisoformat(return_date).isoformat()
    if affiliate:
        if affiliate.alliance_id:
            params["Allianceid"] = affiliate.alliance_id
        if affiliate.sid:
            params["SID"] = affiliate.sid
        if affiliate.sub1:
            params["trip_sub1"] = affiliate.sub1
        if affiliate.sub3:
            params["trip_sub3"] = affiliate.sub3
    return f"{TRIPCOM_FLIGHT_BASE}?{urlencode(params)}"
