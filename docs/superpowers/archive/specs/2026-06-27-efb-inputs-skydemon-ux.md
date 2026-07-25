# EFB Flight-Plan Input UX — SkyDemon + Other Planners + Conventions

Reference research for ProjectAMO pre-flight briefing form. Focus: input UX for **route**, **time/ETD (월/일+시각)**, **cruise speed (순항속도)**, **cruise altitude (순항고도)**.

Date: 2026-06-27. Tags: `[SOURCED]` = direct from cited doc; `[INFERRED]` = my UX reasoning extrapolated from sources.

---

## 1. SkyDemon

**Route building** `[SOURCED]`
- Routes are built by **touching consecutive waypoints on the map** — tap-to-add. Waypoints include towns, airfields, navaids, VRPs, airway reporting points, plus user-defined waypoints.
- Source: https://www.skydemon.aero/start/planning

**Cruise altitude** `[SOURCED]`
- Set in the **Flight Details** window. On PC, the current level is a blue underlined hyperlink — **click it and type** a new level.
- Accepts **feet by default**; type `FL` prefix to enter a flight level instead (e.g. `FL080`). One field, dual-unit by prefix.
- Source: https://skydemon.aero/help?handler=Manual

**Cruise speed** `[SOURCED]`
- Set via the **Pwr/Speed** control in Flight Details → **select a power setting from a list** (not a raw knots field).
- Each entry is a **cruise profile** tied to the aircraft: a named power setting (e.g. `"2400 RPM"`) that maps to a known IAS and a known fuel-burn rate. Users can define many profiles per aircraft.
- Aircraft setup also captures climb/descent model: rate of climb at sea level + at service ceiling, fuel burn at sea level + ceiling, descent rate (ft/min), descent IAS, descent fuel burn. SkyDemon then models every climb/descent stage.
- Sources: https://skydemon.aero/help?handler=Manual , https://www.aero-hesbaye.be/pdf_doc/skydemon_manual.pdf

**Takeoff time** `[SOURCED]`
- Optional field. Default state is a **"Not Set" / "Takeoff Unspecified Time"** hyperlink.
- PC: click the hyperlink → pick a **date from a calendar** + type **time in UTC**.
- iPad/iPhone/Android: Flight Details tab → tap the time → **scroll a date/time wheel**.
- Checking **"Populate ETA Column"** auto-fills the PLOG ETA column per leg from the takeoff time.
- Source: https://skydemon.aero/help?handler=Manual

**Computed** `[SOURCED]`: headings, fuel consumption, enroute hazards, minimum safe altitude per leg, weight & balance, ETA per leg, landing time (shown once takeoff time set). Fuel plan with a min-required floor and aircraft-max ceiling (slider on PC, tap-and-type on tablet).
- Source: https://www.skydemon.aero/start/planning

---

## 2. Other Planners

### autorouter.aero `[SOURCED]`
- Departure time = **DOF (Date of Flight) + EOBT (Estimated Off-Block Time)**.
- Speed = **Target Speed in knots**; FP speeds are **always TAS**, auto-inserted from aircraft advanced performance data when available. Optional **Initial Airspeed** (kt) overrides default at top-of-climb.
- Altitude = **Target FL** (flight level, hundreds of feet); optional **Initial Level**.
- File ≥2 h before EOBT.
- Sources: https://www.autorouter.aero/wiki/api/flightplan/ , https://www.autorouter.aero/wiki/flight-path-profiles/

### RocketRoute `[SOURCED]`
- **DOF + EOBT** for departure. **Initial Airspeed (kt)** and **Initial Level (FL)** = state at top-of-climb. **Target Level (FL)** + **Cruise Profile** when aircraft has advanced performance data.
- Source: https://man.rocketroute.com/flightplan/Preparing_and_Filing_Flight_Plan/Calculating_a_Route.htm

### FltPlan.com `[SOURCED]`
- Enter departure date + dep/arr airports first, then a Flight Plan Entry page shows **Possible Altitudes, Altitude, Speed, ETE, Alternates, Preferred Routes, SID/STAR**.
- **Altitude is auto-filled** by comparing aircraft type vs route distance; **TAS text box is auto-filled** on first display. Smart defaults the user can override.
- Source: https://www.fltplan.com/tutorial.htm

### EuroFPL `[SOURCED]` (ICAO field conventions — the canonical units)
- **Departure time: UTC, 24-hour HHMM** (typed, 4 digits).
- **Cruising speed**: prefix-coded — `N` + 4 digits = knots TAS; `M` + 3 digits = Mach; `K` + 4 digits = km/h.
- **Cruising level**: `F`=Flight Level (100s ft), `A`=altitude (100s ft), `S`=metric std level (tens of m), `M`=altitude (tens m), `V`=uncontrolled VFR.
- Sources: https://www.eurofpl.eu/ , https://files.eurofpl.eu/originalfpl/pdfs/EuroFPL-ICAO_Flightplan_Form_Basics-latest.pdf

### ForeFlight / Garmin Pilot `[SOURCED]`
- Both: enter aircraft performance, route, then **choose altitude/speed/fuel burn**; compute distance, fuel, ETE, ETA.
- Garmin Pilot: adjust **Power Setting (RPM)** to see resulting **Cruise TAS** and **Cruise Fuel Burn**; tap altitude button to preview **winds-aloft impact across altitudes** — i.e. altitude picker doubles as a what-if comparison view.
- ForeFlight default time display is **Zulu**; time setting toggles Local / Station / Zulu.
- Sources: https://ipadpilotnews.com/2016/11/use-new-pre-flight-planning-tools-garmin-pilot/ , https://cloudfront.foreflight.com/docs/ff/14.9/ForeFlight%20Mobile%20Pilot's%20Guide%20v14.9.pdf

---

## 3. Input-UX Conventions

### Time / ETD
- **Zulu default, local as secondary** `[SOURCED]`: EFBs display Zulu by default and show local alongside. ProjectAMO already has a UTC/KST toggle — keep Zulu authoritative, show the other inline. Sources: ForeFlight time setting; https://northstarvfr.com/blogs/news/what-is-zulu-time-the-aviation-industry-s-universal-clock
- **Typed HHMM is the filing-grade primitive** `[SOURCED]` (EuroFPL/ICAO). Fastest for proficient pilots. Mobile EFBs add a **date/time wheel** for touch (SkyDemon). `[INFERRED]` Offer both: typed `시각` for desktop speed, wheel/stepper for touch.
- **EOBT vs ETD** `[SOURCED]`: filing world uses EOBT (off-block). ProjectAMO's ETD (takeoff) is fine for a briefing tool; just be consistent in labeling.
- **Quick chips ("now / +15 / +30")** `[INFERRED]` — not found verbatim in sources, but a natural, low-cost accelerator for a briefing tool where ETD is usually "soon."
- **Day without year** `[SOURCED]`: SkyDemon's calendar + ICAO DOF both omit a year-prominent display; 월/일 is the right granularity. `[INFERRED]` Auto-roll to next day if entered time is already past.

### Speed
- **Profile-driven default, raw entry as fallback** `[SOURCED]`: SkyDemon (named power profiles), autorouter/RocketRoute (auto from performance data), FltPlan (auto-filled TAS). The dominant pattern is **don't make the pilot type a number — derive it, let them override.**
- **TAS is the canonical unit** `[SOURCED]` for flight plans (ICAO/autorouter). ProjectAMO's `순항속도 kt` aligns.
- **Mach toggle for jets** `[SOURCED]` (ICAO `M` prefix) — only relevant if ProjectAMO targets turbine/jet ops; otherwise skip. `[INFERRED]` GA piston tool → knots only.
- **GS shown separately** `[SOURCED]`: Garmin shows Cruise TAS distinctly; GS is computed (TAS±wind), never a manual input.

### Altitude
- **One field, prefix or unit-aware** `[SOURCED]`: SkyDemon = feet default, `FL` prefix switches; ICAO = `F`/`A` prefixes. Avoid a separate toggle widget if a prefix convention works.
- **Smart default from distance + aircraft** `[SOURCED]`: FltPlan auto-picks altitude by aircraft type vs route distance.
- **VFR cruising-altitude helper** `[SOURCED]`: FAR 91.159 hemispherical rule — course 0–179° → odd-thousand + 500 (3500/5500…); 180–359° → even-thousand + 500 (4500/6500…), applies >3000 ft AGL. Source: https://www.law.cornell.edu/cfr/text/14/91.159 . `[INFERRED]` Since ProjectAMO knows departure→arrival, it can compute magnetic course and **suggest/validate** a compliant VFR altitude inline. (Korea uses ICAO semicircular — verify local rule before hard-coding the FAA +500 VFR offset.)
- **Stepper, not free text, for tablets** `[SOURCED]`: tap-and-type on tablets (SkyDemon fuel); `[INFERRED]` 500/1000 ft steppers reduce typos vs free text.

### Validation & Defaults
- **Auto-fill then allow override** `[SOURCED]` is the universal pattern (FltPlan, autorouter, RocketRoute, SkyDemon profiles). Pre-populate from last-used / aircraft profile; never start blank.
- **Progressive disclosure** `[SOURCED]`: SkyDemon hides climb/descent/fuel-burn detail inside aircraft setup; the planning screen stays minimal (level + power + time). Keep ProjectAMO's main form lean; push aircraft-perf detail to a profile screen.
- **Inline computed feedback** `[SOURCED]`: SkyDemon shows landing time the instant takeoff time is set; Garmin shows TAS/fuel update live as power changes. Recompute ETA/GS live on every input change.

---

## 4. Steal for ProjectAMO (prioritized)

**P1 — ETD (월/일 + 시각)**
1. `[SOURCED-pattern]` Keep **Zulu authoritative**; render the opposite zone (KST/UTC) inline beside it, plus auto-computed ETA — mirror SkyDemon's "landing time appears" feedback.
2. `[INFERRED]` Add **"now / +15 / +30 / +60" quick chips** above the 시각 field — biggest speed win for a briefing tool.
3. `[SOURCED]` Support **typed HHMM** (desktop) and a **stepper/wheel** (touch). 월/일 granularity is correct; **auto-roll to next day** if time already passed `[INFERRED]`.

**P1 — 순항속도 (kt)**
4. `[SOURCED]` **Default from an aircraft/last-used profile**, don't start blank (autorouter/FltPlan/SkyDemon). Field stays a numeric kt TAS with override.
5. `[SOURCED]` Show **computed GS** (TAS ± wind) read-only next to it — never an input.
6. `[INFERRED]` Skip Mach toggle unless jets are in scope.

**P2 — 순항고도 (ft)**
7. `[SOURCED]` **One unit-aware field**: feet default, `FL` prefix accepted (SkyDemon model) — avoids an extra toggle.
8. `[SOURCED]` **500/1000-ft stepper** to cut typos; smart **default by route distance + aircraft** (FltPlan).
9. `[SOURCED+INFERRED]` **VFR-altitude helper**: compute magnetic course from dep→arr and show a non-blocking hint ("course 070° → suggest odd+500, e.g. 5500 ft"). Confirm Korean semicircular rule before encoding the +500 VFR offset.

**Cross-cutting**
10. `[SOURCED]` **Auto-fill + override** everywhere; **progressive disclosure** of aircraft-performance detail to a profile screen; **live recompute** of ETA/GS/fuel on every change.

---

## Sources
- SkyDemon planning: https://www.skydemon.aero/start/planning
- SkyDemon manual (help): https://skydemon.aero/help?handler=Manual
- SkyDemon manual (PDF): https://www.aero-hesbaye.be/pdf_doc/skydemon_manual.pdf
- autorouter flightplan: https://www.autorouter.aero/wiki/api/flightplan/
- autorouter flight-path-profiles: https://www.autorouter.aero/wiki/flight-path-profiles/
- RocketRoute calculating a route: https://man.rocketroute.com/flightplan/Preparing_and_Filing_Flight_Plan/Calculating_a_Route.htm
- FltPlan tutorial: https://www.fltplan.com/tutorial.htm
- EuroFPL ICAO form basics: https://files.eurofpl.eu/originalfpl/pdfs/EuroFPL-ICAO_Flightplan_Form_Basics-latest.pdf
- Garmin Pilot pre-flight tools: https://ipadpilotnews.com/2016/11/use-new-pre-flight-planning-tools-garmin-pilot/
- ForeFlight Mobile Pilot's Guide: https://cloudfront.foreflight.com/docs/ff/14.9/ForeFlight%20Mobile%20Pilot's%20Guide%20v14.9.pdf
- FAR 91.159 VFR cruising altitude: https://www.law.cornell.edu/cfr/text/14/91.159
- Zulu time background: https://northstarvfr.com/blogs/news/what-is-zulu-time-the-aviation-industry-s-universal-clock
