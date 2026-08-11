---
name: travel-product-flow
description: >-
  Enforces this travel app's product pipeline contracts when changing generate,
  flights/hotels gates, stay zones, evidence/印证 adopt, ACT-POOL, or playability
  fixes. Use when editing itinerary generate, planReadiness, StayZonePanel,
  EvidencePanel, travel_intel locks, FLOW/HOT/WS items, or docs 18/24/34/36.
---

# Travel product flow (dev Agent)

SOP for **coding this repo**. Does **not** improve runtime generate by itself.

## Before coding

1. Read anchors in [references/doc-anchors.md](references/doc-anchors.md) for the touched domain.
2. Prefer **data/API → closed pool → code enforce** over “add another LLM role”.
3. Confirm-before-expensive-work: keep flight + locked hotel gates for first generate.

## Hard rules (do not violate)

| Rule | Detail |
|------|--------|
| Generate gate | First `generate` / `regenerate` need confirmed flights + locked hotel (name+coords). `optimize` may reuse itinerary. |
| Evidence ≠ copy paste | UGC is L-pattern reference. Adopt at **玩法印证**, **per link after fetch** (doc 34). Generate prefers **adopted** slices. |
| No UGC prices/hours as fact | Deep links / Places / official only. |
| Viator | Cancelled (`COST-01` ❌). No ticket Partner API. |
| No Crew shell fix | Multi-agent “search web then write itinerary” does not fix geocode/playability. |
| Stay after generate | Users must be able to reopen stay panel to search/replace hotels (doc 36). Do not kick `stay` solely because `phase === 'detailed'`. |
| Query ≠ book | RollingGo/Trip are CTA/deeplink; never auto-purchase. |
| Rooms vs travelers | Do not map total `travelers` to RollingGo per-room `adultCount` without `roomCount` (P123). |

## Playability gap (default fix order)

1. Closed POI pool (map/Places) + **code** reject out-of-pool attractions  
2. Evidence adopt ∩ fence → candidates  
3. Rule reviewer (distance / overstuff / return-day hotel)  
4. Prompt weight tweaks last  

## Pushback (bad ideas)

| Proposal | Response |
|----------|----------|
| “Add CrewAI / 7 agents to fix bad POIs” | No — closed pool + enforce |
| “Skip hotel lock for faster generate” | No — FLOW-01c |
| “Adopt only at generate CTA” | No — adopt on evidence card after fetch |
| “Block stay panel after itinerary exists” | No — blocks hotel replace (doc 36) |
| “YAML world KB as main POI source” | Deprioritize vs live closed pool |

## Key code

| Area | Paths |
|------|--------|
| Readiness / next step | `frontend/src/utils/planReadiness.ts` |
| Generate gates | `backend/app/api/v1/itineraries.py` · `usePlanStore.generateItinerary` |
| Evidence inject | `backend/app/services/itinerary_llm.py` · `EvidencePanel.tsx` |
| Closed pool | `backend/app/services/closed_poi_pool.py` · `itinerary_credibility.py` |
| Stay / lodging | `StayZonePanel.tsx` · `InputPanel.tsx` · `stay_zones.py` |
| Day loop / multi-hotel | `hotelDayLoop.ts` · `hotelStayValidate.ts` |

## Verify

```bash
cd frontend && npx tsx src/utils/planReadiness.test.ts
cd backend && PYTHONPATH=. python scripts/test_itinerary_credibility.py
cd backend && PYTHONPATH=. python scripts/test_closed_poi_pool.py
cd backend && PYTHONPATH=. python scripts/test_evidence_borrow.py
# lodging / evidence as touched:
# python scripts/test_lodging_trip_first.py
# python scripts/test_evidence_from_link.py
```

Update `docs/llm-travel-data/TODO.md` + source analysis docs when shipping FLOW/HOT/WS/UX/`ACT-POOL-ENFORCE`/`WS-EVID-REFS` ids.
