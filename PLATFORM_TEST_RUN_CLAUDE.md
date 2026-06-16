# Platform test run — all personas (run by Claude)
Run 2026-06-16. Method: each distinct capability exercised through the real
code path the UI calls (HSG.api / HSG.bidding / vdr-room / property-view) plus
live render checks in the demo, on `localhost:8765` (same files as production).
This is a functional sweep covering every case's underlying behavior, not a
literal click of all ~70 checklist rows.

## Errors found

| # | Case | Severity | Finding | Status |
|---|------|----------|---------|--------|
| 1 | GD9 | Test-script (not platform) | Known figures are **stale from before the demo scale-up (#45)**. Test said HVLS 55.12345% → 619,588 and HLS base 40,024,350. Live data: HVLS-2026-DEMO pool 0 = 450 loans / $129.35M ULB → **$71,302,744** at 55.12345%; HLS-2026-DEMO pool base = **$55,206,000**. The platform math is correct; the test's hardcoded expected values are stale. | **FIXED** — GD9 reworded to a reproducible relationship check (derived $ = % × pool ULB, summed per loan; deposit = greater of $100k or 10%). |
| 2 | TD8 | Platform (bidder) | (Trish's run) Document download did nothing — `window.open()` from an async callback was popup-blocked. | **FIXED earlier** (anchor download). |
| 3 | TD10 | Test-script | (Trish's run) Ginnie Mae not a HUD-dropdown option. | **FIXED earlier** (reworded — separate seller demo). |
| — | TD intake | Platform (admin) | (Trish's run) single-file drag-drop replaced the prior pending file. | **FIXED earlier** (append). |

No other failures surfaced.

## Per-persona result

| Persona | Cases | Result |
|---|---|---|
| **Jelani (JA1–JA15)** | 16 | 16/16 PASS (full run logged separately) |
| **Trish (TD1–TD12)** | 12 | Trish ran it: 10 PASS, 2 fail (TD8, TD10) — both fixed + re-verified |
| **Maurice (MB1–MB17)** | 17 | PASS. Directly verified: data room render + download (MB5), property view — 50 map pins, 50 View-BPO, 50 Street-View, pool pills (MB14–17). Bid loop + qualification rely on the engine/build verification + JA9 (8 live bids present). |
| **Gilda (GD1–GD15)** | 15 | PASS except GD9 (fixed). Verified: GD1 (200 loans, 0 UPB≤ULB≤BPO violations), bid math correct ($71.3M computed exactly), GD10 portal separation (residential shows only HVLS/HNVLS/SFLS, no commercial leak), GD11 GNMA pools 220/120, GD15 BPO+map. |
| **Team (TT1–TT10)** | 10 | PASS by inheritance from MB/JA (same bid engine, isolation, commercial sheet). Not separately exercised: TT8/TT10 (real-device responsive) and TT9 (REAL multi-entity) — these need real people on real devices. |

## Caveats (honest)
- A headless browser can't judge the human cases (MB13 "looks premium", TT8/TT10 device feel) — those still want a human eye.
- TT9 and TD12 are REAL (live logged-in) and are for the team to run.
- The Sale Setup wizard's "Start over" uses a native confirm() that hangs a *headless* browser (not a human) — verified the create path directly instead.

File: `platform\PLATFORM_TEST_RUN_CLAUDE.md`
