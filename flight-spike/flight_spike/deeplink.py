from urllib.parse import quote


def google_flights_url(origin: str, destination: str, date: str) -> str:
    q = quote(f"Flights {origin.upper()} to {destination.upper()} on {date}")
    return f"https://www.google.com/travel/flights?q={q}"


def skyscanner_url(origin: str, destination: str, date: str) -> str:
    # YYMMDD for skyscanner path segment
    y, m, d = date.split("-")
    return (
        f"https://www.skyscanner.com/transport/flights/"
        f"{origin.lower()}/{destination.lower()}/{y[-2:]}{m}{d}/"
    )
