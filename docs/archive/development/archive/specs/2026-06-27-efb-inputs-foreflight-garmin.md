# EFB Flight-Plan Inputs — ForeFlight & Garmin Pilot (reference)

Research date: 2026-06-27
Purpose: inform redesign of ProjectAMO's route-check flight-plan inputs (route, ETD/time, cruise speed, cruise altitude) to match how the two dominant GA/business EFBs collect them.

Tags: **[S]** = sourced (URL below), **[I]** = inferred from sources / general EFB convention.

---

## ForeFlight

### 1. Route entry
- **Route box is free-text with live autocomplete.** You tap the route box, type the 3–4 char departure ID, press Return, then type the destination ID; waypoints/airways/procedures go in between as space-separated tokens. The autocomplete engine returns matches "as fast as you type" across waypoints, navaids, airport names, routes, and city names. **[S]**
  - https://ipadpilotnews.com/2020/02/understanding-all-the-foreflight-fpl-and-edit-features/
  - https://ipadpilotnews.com/2012/01/advanced-navigation-tips-for-foreflight/
- **Route Advisor**: enter departure + destination, then pick from a list of recently-cleared and preferred ATC routes; each option shows distance, time en route, and estimated fuel burn so you compare before selecting. **[S]**
  - https://ipadpilotnews.com/2025/04/how-to-file-an-ifr-flight-plan-in-foreflight-a-comprehensive-guide/
- **Procedure Advisor** for SID/STAR/approach: with an airport in the route, tap **Procedure** in the Flight Plan Editor, choose Departures/Arrivals from a georeferenced list; it inserts the procedure with correct syntax. Manual syntax rules: SID must be the first token and tied to a valid departure airport (e.g. `BARMY3.BARMY`); STAR must be the last token preceded by its transition fix; airways coded as entry-fix → airway designator → exit-fix. **[S]**
  - https://support.foreflight.com/hc/en-us/articles/360057742073-How-is-the-Procedure-Advisor-used
- **Rubber-banding on the map**: tap-drag the magenta route line to a new point; on release a popup offers nearby waypoint / navaid / airport / lat-long to insert. Right-click (web) lists nearby fixes. **[S]**
  - https://support.foreflight.com/hc/en-us/articles/215453597-How-can-a-waypoint-be-added-to-an-existing-route-in-ForeFlight-on-the-Web
- **Recents**: most-recent flight's airports/waypoints appear top-left of the Edit view for one-tap reuse. **[S]**
- **Departure/destination**: dedicated fields; tapping shows a popup of suggestions + favorites, or type the identifier. **Alternate**: Alternate Advisor ranks candidates by time/fuel to reach, forecast weather, and available approaches; you can also type any identifier. **[S]**

### 2. Time / ETD
- **ETD button** lives at lower-right of the Edit screen. Primary purpose stated explicitly: so ForeFlight pulls the **correct winds-aloft forecast** to estimate groundspeed and time en route. **[S]**
- Default entry is **ETD in local time**; a toggle switches to **ETA mode** (Performance Plus), where you give a target arrival time and FF back-computes the required departure. **[S]**
- App-wide **time setting toggles Local / Station / Zulu**. **[S]**
  - https://support.foreflight.com/hc/en-us/articles/216657478
- Terminology used: **EOBT** (Estimated Off-Block Time), **ETD**, **ETE**, **ETA**. Flight Summary shows ETD + ETE + ETA together. **[S]**
- **ETE and ETA are auto-computed and shown live** in the summary strip; not entered. **[S]**

### 3. Cruise speed
- **Not typed per flight** — derived from the selected **aircraft performance profile** (cruise **TAS** by altitude). You pick the profile top-left of the Edit screen; FF uses its TAS + fuel-burn tables. **[S]**
- TAS is combined with winds-aloft (keyed off ETD) to produce **groundspeed → ETE**. So the user-facing speed concept is TAS (planned), and GS is an output. **[S][I]**
- Performance Plus ships preloaded factory profiles; speed is essentially never hand-entered for those aircraft. **[S]**

### 4. Cruise altitude
- Tap the **altitude number** (lower-left of Edit) to open the **Altitude Advisor**, which recommends an optimum altitude using aircraft performance + winds aloft, showing the tradeoff per altitude. **[S]**
- Altitude is entered/selected as a value (feet; FL above transition altitude by convention). VFR vs IFR hemispherical rules are a planning consideration but FF presents candidate altitudes rather than forcing the rule. **[S][I]**

### 5. Aircraft profile
- Profiles store **climb, cruise, descent** models: low/high-altitude fuel-flow for climb & descent, plus a cruise table (min requirement: lowest + highest altitude rows, top = ceiling). **[S]**
- Tunable with **+/- percentage bias** on time and fuel for cruise; fixed +/- bias for climb/descent (0.1 min / 1 lb increments). Recommended: track ~10 real flights and bias to actuals. **[S]**
  - https://support.foreflight.com/hc/en-us/articles/115008028848
  - https://support.foreflight.com/hc/en-us/articles/21470436775959
  - http://cloudfront.foreflight.com/docs/ff/11.9a/v11.9%20-%20foreflight%20performance%20guide%20optimized.pdf
- Profile also holds ICAO equipment list for filing. **[S]**

### 6. Defaults, units, validation
- Route **defaults to "Direct"** between the two airports until you add waypoints. **[S]**
- Required: aircraft profile, departure, destination. Route detail, alternate, ETD are effectively optional for a quick plan but required to file ICAO. **[S][I]**
- Units kt / ft / nm throughout (US GA convention). **[I]**
- Syntax validation surfaces at "Proceed to File"; the recommended workflow is to use Route/Procedure Advisors precisely so manual-typing syntax errors never reach ATC. **[S]**

---

## Garmin Pilot

### 1. Route entry
- Start with **Add Trip** (top-left); enter **tail number** + **departure** + **destination** airports. **[S]**
  - https://ipadpilotnews.com/2020/09/step-by-step-guide-to-planning-a-flight-in-garmin-pilot/
- **Routing button** (right of the waypoint strip) opens **View Routes**: real ATC-cleared routes between the pair, sortable by **Popular** (% frequency), **Aircraft type**, and **Altitude** (filter out routes unsuitable for your aircraft). **[S]**
- Five documented ways to build a route incl. graphical map rubber-banding, textual entry, and route selection. **[S]**
  - https://ipadpilotnews.com/2017/03/5-ways-plan-route-garmin-pilot/
- **Alternate**: Alternate Selection Guide lists airports near the destination that qualify, sorted by distance with forecast weather at ETA. **[S]**

### 2. Time / ETD
- Trip carries a departure time used for winds-aloft and fuel/time estimates; ETE, wind component, and fuel burn are computed and displayed against route + altitude. **[S]**
- Local vs Zulu specifics not confirmed in the walkthrough articles **[I]** (Garmin Pilot supports a Zulu/local app setting in practice, but treat as inferred here).

### 3. Cruise speed
- On the **Flight Plan page** you adjust the **Power Setting (RPM)** and the app shows resulting **Cruise TAS** and **Cruise Fuel Burn Rate** — i.e. speed is driven by the aircraft performance table, not free-typed. **[S]**
  - https://www.garmin.com/en-US/blog/aviation/announcement-new-garmin-pilot-tools-for-pre-flight-planning-in-flight-operations/
- Basic profile setup = just **TAS + GPH at a given altitude**; advanced adds temperature, weight, power settings. So a manual single-number TAS is the floor, full tables the ceiling. **[S]**
  - https://www.pilotsofamerica.com/community/threads/garmin-pilot-editing-aircraft-performance.117830/

### 4. Cruise altitude
- Tap the **Cruise Altitude** line → list of altitude options, each annotated with **ETE, wind component, and fuel burn**; selection **defaults to IFR/VFR and East/West** (hemispherical) based on the flight plan, changeable via buttons above the list. **[S]**
- This is the strongest pattern of the lot: altitude picker that pre-applies the VFR/IFR + odd/even hemispherical rule and shows the wind/fuel/time tradeoff inline. **[S]**

### 5. Aircraft profile
- **Settings → Aircraft → Add Aircraft**: pick from common types (C152/172/182, SR20/22, A36, DA40, PA-28…) which preload performance tables for takeoff/climb/cruise/descent. **[S]**
- Basic vs Advanced entry as above; graphically-rich table editor for time/power/fuel/distance. **[S]**

### 6. Defaults, units, validation
- Defaults: hemispherical altitude rule pre-selected; routes default to direct until a cleared route is chosen. **[S][I]**
- Fuel Planner, Brief (METAR/TAF/AIRMET/NOTAM), and Pack (offline cache) hang off the same trip. **[S]**
- Required: tail #, departure, destination. **[S]**

---

## Steal for ProjectAMO (prioritized)

Current ProjectAMO form: IFR/VFR, route type (전체/RNAV/ATS), dep/arr, SID/STAR/IAP, alternate, ETD (월/일 + 시각, no year), cruise speed (kt), cruise altitude (ft).

**P0 — adopt the aircraft-profile pattern for speed.** Both EFBs never make the pilot retype speed per flight; cruise speed comes from a stored profile as **TAS** (with fuel burn). Recommendation: add a lightweight aircraft/profile concept (even just one saved TAS + optional fuel-burn). Default cruise-speed field to the profile's TAS; let it be overridden per-flight. Label it **TAS (순항속도, kt)** explicitly so it's clear it's true airspeed, not GS/IAS. **[S]**

**P0 — show ETE + ETA live, don't ask for them.** ProjectAMO already auto-computes ETA from ETD; go further and surface **ETE (소요시간)** alongside, computed from planned distance ÷ TAS (winds-corrected later). Mirror FF's summary strip: distance · ETE · ETA in one row. This is universal in both apps. **[S]**

**P1 — altitude picker with hemispherical defaults + tradeoff hints.** Steal Garmin's Cruise Altitude list: offer candidate altitudes, **pre-apply the VFR/IFR + odd/even (East/West) rule** from the chosen flight rule and route heading, and (later) annotate each with wind/ETE/fuel. Even without winds data, defaulting to a rule-valid altitude is a real UX win. Enter as **feet with an FL display** above transition altitude. **[S]**

**P1 — route box: free-text tokens + autocomplete + "recents".** Move toward FF's single route box: `RKSS DCT … RKPC` as space-separated tokens with airport/fix autocomplete, and surface the last-used route/airports for one-tap reuse. Keep the structured dep/arr/alternate fields, but let the middle (route) be free-text with validation deferred to submit. The route-type toggle (전체/RNAV/ATS) maps to Garmin's route-source filter concept. **[S]**

**P2 — alternate advisor.** Rank alternate candidates by distance + forecast weather at ETA (ProjectAMO already does weather briefing, so this is reuse, not new data). **[S]**

**P2 — ETD ergonomics.** Keep month/day + time, but: (a) make the **Local/Zulu (KST/UTC) toggle explicit and visible** at the field (both apps treat this as first-class), and (b) consider a "now + offset" quick option in addition to the picker. Use **EOBT/ETD/ETE/ETA** as the canonical labels. **[S]**

**Inferred-only items to validate before building:** exact local/Zulu behavior in Garmin Pilot **[I]**; whether ProjectAMO wants winds-aloft integration for GS (both EFBs depend on it — without it, ETE is TAS-based and should be labeled "no-wind") **[I]**; FL-vs-feet transition-altitude convention for Korean airspace **[I]**.

---

## Source index
- FF FPL/Edit walkthrough — https://ipadpilotnews.com/2020/02/understanding-all-the-foreflight-fpl-and-edit-features/
- FF IFR filing guide (2025) — https://ipadpilotnews.com/2025/04/how-to-file-an-ifr-flight-plan-in-foreflight-a-comprehensive-guide/
- FF Procedure Advisor — https://support.foreflight.com/hc/en-us/articles/360057742073-How-is-the-Procedure-Advisor-used
- FF web rubber-band / add waypoint — https://support.foreflight.com/hc/en-us/articles/215453597
- FF time setting (Local/Station/Zulu) — https://support.foreflight.com/hc/en-us/articles/216657478
- FF performance profiles (cruise/fuel) — https://support.foreflight.com/hc/en-us/articles/115008028848 · https://support.foreflight.com/hc/en-us/articles/21470436775959
- FF Performance Planning guide (PDF) — http://cloudfront.foreflight.com/docs/ff/11.9a/v11.9%20-%20foreflight%20performance%20guide%20optimized.pdf
- FF advanced nav tips — https://ipadpilotnews.com/2012/01/advanced-navigation-tips-for-foreflight/
- GP step-by-step planning — https://ipadpilotnews.com/2020/09/step-by-step-guide-to-planning-a-flight-in-garmin-pilot/
- GP 5 ways to plan a route — https://ipadpilotnews.com/2017/03/5-ways-plan-route-garmin-pilot/
- GP new pre-flight tools (TAS/altitude/power) — https://www.garmin.com/en-US/blog/aviation/announcement-new-garmin-pilot-tools-for-pre-flight-planning-in-flight-operations/ · https://ipadpilotnews.com/2016/11/use-new-pre-flight-planning-tools-garmin-pilot/
- GP editing aircraft performance — https://www.pilotsofamerica.com/community/threads/garmin-pilot-editing-aircraft-performance.117830/
