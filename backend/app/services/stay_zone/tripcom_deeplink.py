"""Trip.com 酒店 deep link（Affiliate Phase 1）。"""

from urllib.parse import quote_plus

from app.services.stay_zone.occupancy import split_hotel_occupancy


def build_tripcom_hotel_url(
    city: str,
    check_in: str,
    check_out: str,
    *,
    area_keyword: str = "",
    adults: int = 2,
    rooms: int | None = None,
    max_price: float | None = None,
) -> str:
    """Build Trip hotels/list URL.

    ``adults`` here is **party size** (travelers). Split into ``crn`` rooms ×
    ``adult`` per room so Trip does not treat N travelers as 1 room × N adults.
    ``max_price`` is an upper bound (以内), mapped to ``highPrice``.
    """
    city_q = quote_plus(city.strip())
    area = quote_plus(area_keyword.strip()) if area_keyword.strip() else city_q
    room_n, adults_per = split_hotel_occupancy(adults, rooms=rooms)
    url = (
        "https://www.trip.com/hotels/list"
        f"?city={city_q}&cityName={city_q}"
        f"&checkin={check_in}&checkout={check_out}"
        f"&keyword={area}"
        f"&crn={room_n}&adult={adults_per}&children=0"
    )
    # HOT-03 / P127: 每晚预算上限（以内均可）
    if max_price is not None and max_price > 0:
        url += f"&highPrice={int(max_price)}"
    return url
