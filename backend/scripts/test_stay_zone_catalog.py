"""HOT-ZONE-CATALOG D knife3 — closed pool enforce + second city."""

from __future__ import annotations

from app.services.stay_zone.catalog import (
    entry_to_zone_dict,
    get_stay_zone_catalog_for_city,
    has_stay_zone_catalog,
    order_catalog_by_ids,
)


def test_hcmc_and_danang_catalogs() -> None:
    assert has_stay_zone_catalog("胡志明市")
    assert has_stay_zone_catalog("Ho Chi Minh")
    hcmc = get_stay_zone_catalog_for_city("西贡")
    assert len(hcmc) >= 6
    assert all(e["id"].startswith("catalog:hcmc:") for e in hcmc)

    assert has_stay_zone_catalog("岘港")
    assert has_stay_zone_catalog("Da Nang")
    danang = get_stay_zone_catalog_for_city("danang")
    assert len(danang) >= 6
    assert all(e["id"].startswith("catalog:danang:") for e in danang)

    assert not has_stay_zone_catalog("东京")


def test_order_drops_unknown_and_appends_missing() -> None:
    catalog = get_stay_zone_catalog_for_city("胡志明")
    first = catalog[0]["id"]
    second = catalog[1]["id"]
    ordered = order_catalog_by_ids(
        catalog,
        ["fake:zone", second, first, "also-fake"],
    )
    assert ordered[0]["id"] == second
    assert ordered[1]["id"] == first
    assert len(ordered) == len(catalog)
    assert all(e["id"].startswith("catalog:") for e in ordered)
    assert "fake:zone" not in {e["id"] for e in ordered}


def test_entry_to_zone_has_geometry() -> None:
    catalog = get_stay_zone_catalog_for_city("岘港")
    z = entry_to_zone_dict(
        catalog[0],
        sequence=1,
        check_in="2026-09-01",
        check_out="2026-09-04",
        day_indices=[0, 1],
    )
    assert z["id"].startswith("catalog:danang:")
    assert z["geometry"]["type"] == "circle"
    assert z["tag_note"] and "目录" in z["tag_note"]


if __name__ == "__main__":
    test_hcmc_and_danang_catalogs()
    test_order_drops_unknown_and_appends_missing()
    test_entry_to_zone_has_geometry()
    print("test_stay_zone_catalog.py ok")
