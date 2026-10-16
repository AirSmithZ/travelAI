"""HOT-ROOM-01: split travelers into rooms × adults-per-room for lodging search."""

from __future__ import annotations

import math


def split_hotel_occupancy(
    travelers: int,
    *,
    rooms: int | None = None,
    max_per_room: int = 4,
) -> tuple[int, int]:
    """Return ``(room_count, adults_per_room)``.

    Default: ~2 adults/room → ``rooms = ceil(travelers / 2)``.
    RollingGo ``adultCount`` / Trip ``adult`` are **per room**; Trip rooms = ``crn``.
    """
    total = max(1, int(travelers or 1))
    cap = max(1, int(max_per_room or 4))
    if rooms is not None and int(rooms) >= 1:
        room_n = max(1, min(int(rooms), total))
    else:
        room_n = max(1, int(math.ceil(total / 2.0)))
    per = max(1, int(math.ceil(total / float(room_n))))
    per = min(per, cap)
    return room_n, per
