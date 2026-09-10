# EFB / Pro Flight-Planning Input Standards — ICAO FPL + SimBrief/Jeppesen

Reference for ProjectAMO pre-flight weather briefing form. Domain: ICAO flight plan
field encoding + professional OFP (SimBrief, Jeppesen FliteDeck Pro) conventions for
**route / time / cruise speed / cruise altitude**.

Status tags: **[SOURCED]** = directly from a cited reference. **[INFERRED]** =
my synthesis/recommendation, not a verbatim standard.

---

## 1. ICAO Flight Plan Form — field-by-field encoding (the standard everyone files against)

The ICAO model flight plan form is defined in **ICAO Doc 4444 (PANS-ATM), Appendix 2**,
and reproduced as **FAA Form 7233-4**. All times are **UTC (Zulu)**.

### Item 13 — Departure aerodrome + EOBT **[SOURCED]**
- **13a** = departure aerodrome ICAO 4-letter location indicator (ICAO Doc 7910), e.g. `RKSI`.
  If none assigned, use `ZZZZ` and give the name in Item 18 (`DEP/`).
- **13b** = **EOBT (Estimated Off-Block Time)** — the time the aircraft starts ground
  movement for departure. **4 digits, HH MM, in UTC.** e.g. `1430` = 14:30 Z.
- Combined, no space: `RKSI1430`.

### Item 15 — Route: cruising **speed**, cruising **level**, route **[SOURCED]**
First sub-field is the **initial cruising speed**, second is the **initial cruising level**,
written together with no space (e.g. `N0485F450`), then the route string.

**Cruising speed** (true airspeed) — letter + figures:
| Code | Meaning | Format | Example |
|------|---------|--------|---------|
| `N` | knots TAS | N + 4 figures | `N0485` = 485 kt TAS |
| `K` | km/h TAS | K + 4 figures | `K0830` = 830 km/h |
| `M` | Mach number | M + 3 figures (hundredths) | `M083` = Mach 0.83 |

**Cruising level** — letter + figures:
| Code | Meaning | Format | Example |
|------|---------|--------|---------|
| `F` | Flight Level | F + 3 figures | `F450` = FL450 |
| `A` | Altitude, hundreds of ft | A + 3 figures | `A100` = 10,000 ft |
| `S` | Std metric level, tens of metres | S + 4 figures | `S1130` = 11,300 m |
| `M` | Metric altitude, tens of metres | M + 4 figures | `M0840` = 8,400 m |
| `VFR` | Uncontrolled VFR (level not specified) | literal | `VFR` |

- `S`/`M` metric levels are used only in some countries (e.g. China/Russia RVSM metric).
- A planned change of speed/level mid-route: `<point>/<speed><level>`, e.g.
  `DUB180040/M082F330` (change to Mach .82, FL330 at that point). **[SOURCED]**
- Typical combined first element: `N0485F450` = 485 kt TAS, FL450.

### Item 16 — Destination + Total EET + Alternate(s) **[SOURCED]**
- **16a** = destination aerodrome ICAO 4-letter code, e.g. `KORD`.
- **16b** = **Total EET (Estimated Elapsed Time)** — total time from EOBT/takeoff to
  destination. **4 figures, HH MM.** e.g. `0645` = 6 h 45 min. Combined: `KORD0645`.
- **16c** = up to two **alternate** aerodrome ICAO codes, space-separated (`ZZZZ` + Item 18
  `ALTN/` if none). EETs to FIR boundaries also go in Item 18 (`EET/`).

> ETA is **not a filed field** — it is derived: `ETA = EOBT + Total EET` (UTC). This is the
> key takeaway for our form. **[SOURCED — derivation; ICAO files EOBT + EET, not ETA]**

Sources:
- ICAO Doc 4444 PANS-ATM App.2 — https://ibs.rlp.cz/ext/aktuality/Doc4444.pdf
- ICAO Doc 4444 Amendment 1 — https://ffac.ch/wp-content/uploads/2020/10/ICAO-DOC-4444-Amendment.pdf
- FAA FSS Appendix A (Form 7233-4) — https://www.faa.gov/air_traffic/publications/atpubs/fss/AppendixA.htm
- SKYbrary "Flight Plan Completion" — https://skybrary.aero/articles/flight-plan-completion
- IVAO Flightplan wiki — https://wiki.ivao.aero/en/home/training/main/documentation/Flightplan
- code7700 Flight Plan — https://code7700.com/flight_plan.htm
- EuroFPL ICAO Flightplan Basics — https://files.eurofpl.eu/originalfpl/pdfs/EuroFPL-ICAO_Flightplan_Form_Basics-latest.pdf

---

## 2. SimBrief / professional OFP planners **[SOURCED]**

SimBrief is the de-facto consumer/prosumer dispatch planner; its "Dispatch Input Request
Form" mirrors airline dispatch.

**Inputs collected:**
- **Departure / Destination / Alternate** — ICAO 4-letter codes. Alternate selectable.
- **Route** — waypoint/airway string; direct legs as `DCT` (e.g. `DCT MOBLE DCT ADIME`).
  Often auto-generated from a route database, user-editable.
- **Cruise altitude** — requested as a **Flight Level**, e.g. `FL350` (35,000 ft).
- **Speed / Cost Index** — jets planned by **Cost Index** (time-vs-fuel tradeoff), which
  SimBrief converts to a **cruise Mach** (e.g. `M078`); props/GA by **TAS in knots**.
  TAS is also listed in the nav log per leg (e.g. `455` kt).
- **ETD / off-block** — entered in **Zulu (UTC)**; OFP shows airport + `HHMM` Z
  (e.g. `KORD2015`).

**Auto-computed (not entered):**
- **ETE / EET** — estimated time enroute, `HH MM`, from route distance + winds + perf.
- **ETA** — gate-departure (off-block) + total block time, in Zulu.
- **Fuel** — trip/burn, reserves, alternate, taxi — broken out in the fuel plan table.

Pattern worth stealing: user enters **few hard facts** (dep/dest/altn, cruise FL, ETD-Z,
CI or speed), the planner **derives ETE/ETA/fuel**. Times are Zulu by default.

Sources:
- SimBrief Dispatch Guide — https://dispatch.simbrief.com/guide
- vAAirlines OFP/Flightplan breakdown — https://fom.aalva.org/genops_refs/ofp-flightplan/
- FlightGear Advanced SimBrief Tutorial — https://wiki.flightgear.org/Advanced_SimBrief_Tutorial

---

## 3. Jeppesen FliteDeck Pro / airline EFB briefing **[SOURCED, partial]**

FliteDeck Pro is the airline-grade EFB. Its **Briefing Module** lets pilots interact with a
**digital operational flight plan (OFP)** inside the navigation workflow: it digitizes the
full flight release — dispatched docs, weather, NOTAMs, sign-off workflow, and a **NavLog
for recording actuals**. Route can be entered several ways and edited from the **Flight Info
drawer** in the Enroute view; selecting the route then drives terminal-chart selection.

Takeaway: the EFB **presents a pre-computed OFP** (times, route, levels already planned by
dispatch) and the pilot **confirms / records actuals** against it — read-mostly, not a
data-entry form. Times are Zulu throughout.

Sources:
- FliteDeck Pro — https://ww2.jeppesen.com/navigation-solutions/flitedeck-pro/
- Briefing Module — https://ww2.jeppesen.com/navigation-solutions/flitedeck-pro/briefing-module/
- FliteDeck Pro User Guide (iOS 2.9.1) — http://ww1.jeppesen.com/documents/support/mobile/mobile-pro/FliteDeck-Pro-2.9.1-User-Guide.pdf

---

## 4. Conventions worth adopting (industry consensus)

- **Zulu-default times.** Every filed/dispatch time is UTC. KST is a local convenience layer. **[SOURCED]**
- **EOBT / EET / ETA terminology.** ETD = EOBT (off-block, Z); ETE/EET = elapsed time;
  ETA = EOBT + EET. ETA is derived, never separately filed. **[SOURCED]**
- **Flight Level for altitude.** `FL` (hundreds of ft) above transition; raw `ft`/altitude
  below. Speed in **TAS knots** (GA) or **Mach** (jets). **[SOURCED]**
- **Required-field minimalism.** Pro planners ask for the few irreducible facts and compute
  the rest. **[SOURCED — SimBrief pattern]**

---

## 5. "Steal for ProjectAMO" — mapping to our fields

Current form: route/route-type, dep/arr, SID/STAR/IAP, alternate, ETD (월/일+시각, UTC/KST),
순항속도(kt), 순항고도(ft).

| ProjectAMO field | Recommendation | Basis |
|---|---|---|
| **순항속도 (cruise speed)** | Label as **TAS (kt)** — matches ICAO `N`nnnn (knots TAS) and SimBrief nav-log TAS. Optionally accept **Mach** for jets, display as `M083`-style. Keep kt as default since current input is kt. | **[SOURCED]** label; **[INFERRED]** Mach option |
| **순항고도 (cruise altitude)** | Primary unit **Flight Level (FLnnn)**, with **ft fallback** for low/VFR (ICAO `A`nnn = hundreds of ft). e.g. show `FL350` but accept `35000 ft`. Map ICAO: F=FL, A=altitude-ft. | **[SOURCED]** F/A codes; **[INFERRED]** FL-primary UI |
| **ETD** | Treat as **EOBT in Zulu HHMM** (UTC canonical, store UTC ISO — already done). Display KST as secondary. Format the Z time as `HHMMZ`. | **[SOURCED]** EOBT=UTC HHMM |
| **ETA (derived)** | **Do not collect** — compute `ETA = ETD(EOBT) + ETE`. Show as read-only, both Z and KST. (Already auto-computed read-only per recent commits — keep it.) | **[SOURCED]** ETA = EOBT+EET |
| **ETE / EET (new, optional)** | Surface **ETE (HH:MM)** explicitly = plannedDistance ÷ TAS (+wind if available). This is the bridge between ETD and ETA and matches OFP convention. plannedDistanceNm already exposed. | **[INFERRED]** from SimBrief auto-compute pattern |
| **route / alternate** | Keep ICAO 4-letter codes for dep/arr/altn; allow up to 2 alternates (ICAO 16c) if expanding. | **[SOURCED]** Item 13/16 |

**Concrete UX rules to adopt:**
1. Speed label → **"순항속도 (TAS, kt)"**; optionally a kt/Mach toggle.
2. Altitude → **FL-first** (`FL350`), ft as fallback/VFR. Internally normalize to ft.
3. ETD → label/contextualize as **EOBT**, render Zulu as `HHMMZ` alongside KST.
4. ETA → keep **derived & read-only**; show **ETE (HH:MM)** next to it (ETA = ETD + ETE).
5. Default the whole time layer to **Zulu**, KST as secondary label.

These keep the form filing-compatible with ICAO and legible to anyone who reads an OFP,
without adding required fields beyond what we already collect.
