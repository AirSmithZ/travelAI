"""Trip.com 酒店 deep link（Affiliate Phase 1）。"""

from urllib.parse import quote_plus


def build_tripcom_hotel_url(
    city: str,
    check_in: str,
    check_out: str,
    *,
    area_keyword: str = "",
    adults: int = 2,
    max_price: float | None = None,
) -> str:
    city_q = quote_plus(city.strip())
    area = quote_plus(area_keyword.strip()) if area_keyword.strip() else city_q
    url = (
        "https://www.trip.com/hotels/list"
        f"?city={city_q}&cityName={city_q}"
        f"&checkin={check_in}&checkout={check_out}"
        f"&keyword={area}&adult={adults}"
    )
    # HOT-03: 每晚预算上限（Trip 深链筛选；无库存 API 时仍只作链接参数）
    if max_price is not None and max_price > 0:
        url += f"&highPrice={int(max_price)}"
    return url
