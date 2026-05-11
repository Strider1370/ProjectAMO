import { useState } from "react";
import {
  resolveSettings,
  savePersonalSettings,
  clearPersonalSettings,
} from "../../utils/alerts";
import {
  DEFAULT_AIRPORT_MINIMA_RULES,
  normalizeAirportMinimaSettings,
} from "../../utils/helpers";
import {
  SIGMET_FILTER_GROUPS,
  AIRMET_FILTER_GROUPS,
  SIGWX_FILTER_GROUPS,
  getDefaultAdvisoryFilterSettings,
  saveAdvisoryFilterSettings,
} from "../../utils/advisory-filter";

const TRIGGER_LABELS = {
  warning_issued: "공항경보가 발령되면 알림",
  warning_cleared: "공항경보 해제는 조용히 표시",
  low_visibility: "시정이 나빠지면 알림",
  high_wind: "바람이 강해지면 알림",
  weather_phenomenon: "특이기상(TS/SN/FG)이 나타나면 알림",
  low_ceiling: "구름고도가 낮아지면 알림",
  taf_adverse_weather: "예보에 악기상이 들어오면 알림",
  lightning_detected: "공항 주변 낙뢰가 발생하면 알림",
};

const TRAFFIC_ALTITUDE_OPTIONS = [
  "0-10000",
  "10000-20000",
  "20000-30000",
  "30000-40000",
  "40000-50000",
];

const MINIMA_AIRPORT_ORDER = ["RKSI", "RKSS", "RKPC", "RKPK", "RKJY", "RKJB", "RKPU", "RKNY"];

const SIGMET_FILTER_LABELS = {
  thunderstorm:     "뇌우",
  turbulence:       "난류",
  icing:            "착빙",
  hail:             "우박",
  tropical_cyclone: "열대저기압",
  volcanic_ash:     "화산재",
  duststorm:        "황사/모래폭풍",
};

const AIRMET_FILTER_LABELS = {
  turbulence:           "난류",
  icing:                "착빙",
  sfc_wind:             "지상강풍",
  sfc_vis:              "지상시정",
  llws:                 "저고도윈드시어",
  mountain_obscuration: "산악차폐",
};

const SIGWX_FILTER_LABELS = {
  cloud:                "구름/CB",
  turbulence:           "난류",
  icing_area:           "착빙구역",
  freezing_level:       "빙결고도",
  sfc_wind:             "지상바람",
  sfc_vis:              "지상시정",
  mountain_obscuration: "산악차폐",
  pressure:             "저/고기압",
  front_line:           "전선",
  jet_stream:           "제트기류",
};

const ALERT_USER_SECTIONS = [
  {
    id: "method",
    title: "알림 방식",
    description: "알림이 어떤 방식으로 표시될지 정합니다.",
  },
  {
    id: "current-risk",
    title: "현재 위험",
    description: "현재 관측이나 주변 상황이 위험해질 때 알립니다.",
    triggerIds: ["low_visibility", "low_ceiling", "high_wind", "weather_phenomenon", "lightning_detected"],
  },
  {
    id: "forecast-official",
    title: "예고 / 공식 알림",
    description: "앞으로 대비해야 할 상황이나 공식 경보를 알려줍니다.",
    triggerIds: ["taf_adverse_weather", "warning_issued", "warning_cleared"],
  },
  {
    id: "repeat",
    title: "반복 알림 방식",
    description: "한 번 알린 뒤 언제 다시 알릴지 정합니다.",
  },
];

export default function Settings({
  defaults,
  onClose,
  onSettingsChange,
  onPreviewAlert,
  timeZone,
  setTimeZone,
  mapTheme,
  setMapTheme,
  trafficCallsignFilter,
  setTrafficCallsignFilter,
  trafficAltitudeBands,
  setTrafficAltitudeBands,
  minimaSettings,
  setMinimaSettings,
  advisoryFilter,
  setAdvisoryFilter,
}) {
  const current = resolveSettings(defaults);

  const [globalEnabled, setGlobalEnabled] = useState(current.global.alerts_enabled);
  const [cooldown, setCooldown] = useState(current.global.cooldown_seconds);
  const [pollInterval, setPollInterval] = useState(current.global.poll_interval_seconds);
  const [quietStart, setQuietStart] = useState(current.global.quiet_hours?.start || "");
  const [quietEnd, setQuietEnd] = useState(current.global.quiet_hours?.end || "");

  const [popupEnabled, setPopupEnabled] = useState(current.dispatchers.popup.enabled);
  const [autoDismiss, setAutoDismiss] = useState(current.dispatchers.popup.auto_dismiss_seconds);
  const [soundEnabled, setSoundEnabled] = useState(current.dispatchers.sound.enabled);
  const [volume, setVolume] = useState(current.dispatchers.sound.volume);
  const [marqueeEnabled, setMarqueeEnabled] = useState(current.dispatchers.marquee.enabled);

  const [localTimeZone, setLocalTimeZone] = useState(timeZone || "KST");
  const [localMapTheme, setLocalMapTheme] = useState(mapTheme || localStorage.getItem("map_theme") || "light");
  const [localTrafficCallsignFilter, setLocalTrafficCallsignFilter] = useState(trafficCallsignFilter || "");
  const [localTrafficAltitudeBands, setLocalTrafficAltitudeBands] = useState(trafficAltitudeBands || []);
  const [localMinimaSettings, setLocalMinimaSettings] = useState(
    normalizeAirportMinimaSettings(minimaSettings || DEFAULT_AIRPORT_MINIMA_RULES)
  );
  const [localAdvisoryFilter, setLocalAdvisoryFilter] = useState(
    advisoryFilter || getDefaultAdvisoryFilterSettings()
  );
  const [activeTab, setActiveTab] = useState("general");
  const [openAlertHelp, setOpenAlertHelp] = useState({});

  const [triggers, setTriggers] = useState(() => {
    const nextTriggers = {};
    for (const [id, cfg] of Object.entries(current.triggers)) {
      nextTriggers[id] = { enabled: cfg.enabled, params: { ...cfg.params } };
    }
    return nextTriggers;
  });

  function toggleTrigger(id) {
    setTriggers((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id].enabled },
    }));
  }

  function updateTriggerParam(id, key, value) {
    setTriggers((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        params: { ...prev[id].params, [key]: value },
      },
    }));
  }

  function toggleTrafficAltitudeBand(band) {
    setLocalTrafficAltitudeBands((prev) => (
      prev.includes(band)
        ? prev.filter((item) => item !== band)
        : [...prev, band]
    ));
  }

  function toggleAdvisoryChip(section, key) {
    setLocalAdvisoryFilter((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: !prev[section][key] },
    }));
  }

  function setAllAdvisorySection(section, value) {
    setLocalAdvisoryFilter((prev) => ({
      ...prev,
      [section]: Object.fromEntries(Object.keys(prev[section]).map((k) => [k, value])),
    }));
  }

  function updateMinimaValue(icao, key, value) {
    setLocalMinimaSettings((prev) => ({
      ...prev,
      [icao]: {
        ...prev[icao],
        [key]: value === "" ? null : Number(value),
      },
    }));
  }

  function applySettings() {
    const overrides = {
      global: {
        alerts_enabled: globalEnabled,
        cooldown_seconds: Number(cooldown),
        poll_interval_seconds: Number(pollInterval),
        quiet_hours: quietStart && quietEnd ? { start: quietStart, end: quietEnd } : null,
      },
      dispatchers: {
        popup: { enabled: popupEnabled, auto_dismiss_seconds: Number(autoDismiss) },
        sound: { enabled: soundEnabled, volume: Number(volume) },
        marquee: { enabled: marqueeEnabled },
      },
      triggers,
    };

    savePersonalSettings(overrides);
    localStorage.setItem("time_zone", localTimeZone);
    localStorage.setItem("map_theme", localMapTheme);
    localStorage.setItem("traffic_callsign_filter", localTrafficCallsignFilter);
    localStorage.setItem("traffic_altitude_bands", JSON.stringify(localTrafficAltitudeBands));
    localStorage.setItem("airport_minima_settings", JSON.stringify(localMinimaSettings));
    saveAdvisoryFilterSettings(localAdvisoryFilter);

    setTimeZone?.(localTimeZone);
    setMapTheme?.(localMapTheme);
    setTrafficCallsignFilter?.(localTrafficCallsignFilter);
    setTrafficAltitudeBands?.(localTrafficAltitudeBands);
    setMinimaSettings?.(normalizeAirportMinimaSettings(localMinimaSettings));
    setAdvisoryFilter?.(localAdvisoryFilter);

    onSettingsChange?.(overrides);
  }

  function handleApply() {
    applySettings();
  }

  function handleSave() {
    applySettings();
    onClose();
  }

  function handleReset() {
    clearPersonalSettings();
    localStorage.removeItem("time_zone");
    localStorage.removeItem("map_theme");
    localStorage.removeItem("traffic_callsign_filter");
    localStorage.removeItem("traffic_altitude_bands");
    localStorage.removeItem("airport_minima_settings");
    localStorage.removeItem("advisory_filter_settings");

    setTimeZone?.("KST");
    setMapTheme?.("light");
    setTrafficCallsignFilter?.("");
    setTrafficAltitudeBands?.([]);
    setMinimaSettings?.(normalizeAirportMinimaSettings(DEFAULT_AIRPORT_MINIMA_RULES));
    setAdvisoryFilter?.(getDefaultAdvisoryFilterSettings());

    onSettingsChange?.(null);
    onClose();
  }

  function toggleAlertHelp(sectionId) {
    setOpenAlertHelp((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  function renderAlertSectionHeader(sectionId, title, description) {
    const isOpen = Boolean(openAlertHelp[sectionId]);

    return (
      <>
        <legend className="alert-settings-section-head">
          <span>{title}</span>
          <button
            type="button"
            className={`alert-settings-info-btn${isOpen ? " is-open" : ""}`}
            onClick={() => toggleAlertHelp(sectionId)}
            aria-label={`${title} 설명 보기`}
            aria-expanded={isOpen}
          >
            i
          </button>
        </legend>
        {isOpen && <p className="alert-settings-help">{description}</p>}
      </>
    );
  }

  function renderTriggerFields(id, cfg) {
    if (cfg.enabled && id === "low_visibility") {
      return (
        <label className="alert-settings-row alert-settings-sub">
          <span>시정 임계치(m)</span>
          <input
            type="number"
            min={100}
            max={10000}
            step={100}
            value={cfg.params.threshold}
            onChange={(e) => updateTriggerParam(id, "threshold", Number(e.target.value))}
          />
        </label>
      );
    }

    if (cfg.enabled && id === "high_wind") {
      return (
        <>
          <label className="alert-settings-row alert-settings-sub">
            <span>풍속 임계치(kt)</span>
            <input
              type="number"
              min={10}
              max={100}
              value={cfg.params.speed_threshold}
              onChange={(e) => updateTriggerParam(id, "speed_threshold", Number(e.target.value))}
            />
          </label>
          <label className="alert-settings-row alert-settings-sub">
            <span>돌풍 임계치(kt)</span>
            <input
              type="number"
              min={10}
              max={100}
              value={cfg.params.gust_threshold}
              onChange={(e) => updateTriggerParam(id, "gust_threshold", Number(e.target.value))}
            />
          </label>
        </>
      );
    }

    if (cfg.enabled && id === "low_ceiling") {
      return (
        <label className="alert-settings-row alert-settings-sub">
          <span>운고 임계치(ft)</span>
          <input
            type="number"
            min={100}
            max={5000}
            step={100}
            value={cfg.params.threshold}
            onChange={(e) => updateTriggerParam(id, "threshold", Number(e.target.value))}
          />
        </label>
      );
    }

    if (cfg.enabled && id === "taf_adverse_weather") {
      return (
        <label className="alert-settings-row alert-settings-sub">
          <span>TAF 시정 임계치(m)</span>
          <input
            type="number"
            min={500}
            max={10000}
            step={500}
            value={cfg.params.vis_threshold}
            onChange={(e) => updateTriggerParam(id, "vis_threshold", Number(e.target.value))}
          />
        </label>
      );
    }

    return null;
  }

  function renderTriggerToggle(id) {
    const cfg = triggers[id];
    if (!cfg) return null;

    return (
      <div key={id} className="alert-settings-trigger">
        <label className="alert-settings-row">
          <span>{TRIGGER_LABELS[id] || id}</span>
          <input type="checkbox" checked={cfg.enabled} onChange={() => toggleTrigger(id)} />
        </label>
        {renderTriggerFields(id, cfg)}
      </div>
    );
  }

  function getPreviewDispatchers() {
    return {
      popup: {
        enabled: popupEnabled,
        auto_dismiss_seconds: Number(autoDismiss),
      },
      sound: {
        enabled: soundEnabled,
        volume: Number(volume),
        repeat_count: current.dispatchers.sound.repeat_count,
      },
      marquee: {
        enabled: marqueeEnabled,
        min_severity: current.dispatchers.marquee.min_severity,
        speed: current.dispatchers.marquee.speed,
        show_duration_seconds: current.dispatchers.marquee.show_duration_seconds,
      },
    };
  }

  return (
    <div className="alert-settings-overlay" onClick={onClose}>
      <div className="alert-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="alert-settings-header">
          <h2>설정</h2>
          <button className="alert-popup-close" onClick={onClose}>&times;</button>
        </div>

        <div className="alert-settings-layout">
          <div className="alert-settings-tabs">
            <button
              className={`alert-settings-tab-btn${activeTab === "general" ? " active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              일반
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "alert" ? " active" : ""}`}
              onClick={() => setActiveTab("alert")}
            >
              알림
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "traffic" ? " active" : ""}`}
              onClick={() => setActiveTab("traffic")}
            >
              항적
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "minima" ? " active" : ""}`}
              onClick={() => setActiveTab("minima")}
            >
              LIFR
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "advisory" ? " active" : ""}`}
              onClick={() => setActiveTab("advisory")}
            >
              공역예보
            </button>
          </div>

          <div className="alert-settings-body">
            {activeTab === "general" && (
              <fieldset className="alert-settings-section">
                <legend>표시 설정</legend>
                <label className="alert-settings-row">
                  <span>시간대</span>
                  <select value={localTimeZone} onChange={(e) => setLocalTimeZone(e.target.value)}>
                    <option value="UTC">UTC</option>
                    <option value="KST">KST (UTC+9)</option>
                  </select>
                </label>
                <label className="alert-settings-row">
                  <span>사이트 테마</span>
                  <select value={localMapTheme} onChange={(e) => setLocalMapTheme(e.target.value)}>
                    <option value="light">라이트</option>
                    <option value="dark">다크</option>
                  </select>
                </label>
              </fieldset>
            )}

            {activeTab === "alert" && (
              <>
                <fieldset className="alert-settings-section">
                  {renderAlertSectionHeader("method", ALERT_USER_SECTIONS[0].title, ALERT_USER_SECTIONS[0].description)}
                  <label className="alert-settings-row">
                    <span>알림 사용</span>
                    <input type="checkbox" checked={globalEnabled} onChange={(e) => setGlobalEnabled(e.target.checked)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>팝업 사용</span>
                    <span className="alert-settings-inline-actions">
                      <button
                        type="button"
                        className="alert-settings-preview-btn"
                        onClick={() => onPreviewAlert?.("popup", getPreviewDispatchers())}
                      >
                        예시
                      </button>
                      <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} />
                    </span>
                  </label>
                  <label className="alert-settings-row">
                    <span>소리 사용</span>
                    <span className="alert-settings-inline-actions">
                      <button
                        type="button"
                        className="alert-settings-preview-btn"
                        onClick={() => onPreviewAlert?.("sound", getPreviewDispatchers())}
                      >
                        예시
                      </button>
                      <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
                    </span>
                  </label>
                  <label className="alert-settings-row">
                    <span>하단 알림 바 표시</span>
                    <span className="alert-settings-inline-actions">
                      <button
                        type="button"
                        className="alert-settings-preview-btn"
                        onClick={() => onPreviewAlert?.("marquee", getPreviewDispatchers())}
                      >
                        예시
                      </button>
                      <input type="checkbox" checked={marqueeEnabled} onChange={(e) => setMarqueeEnabled(e.target.checked)} />
                    </span>
                  </label>
                  <label className="alert-settings-row">
                    <span>야간 시작</span>
                    <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>야간 종료</span>
                    <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>볼륨 ({volume}%)</span>
                    <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
                  </label>
                </fieldset>

                <fieldset className="alert-settings-section">
                  {renderAlertSectionHeader("current-risk", ALERT_USER_SECTIONS[1].title, ALERT_USER_SECTIONS[1].description)}
                  {ALERT_USER_SECTIONS[1].triggerIds.map((id) => renderTriggerToggle(id))}
                </fieldset>

                <fieldset className="alert-settings-section">
                  {renderAlertSectionHeader("forecast-official", ALERT_USER_SECTIONS[2].title, ALERT_USER_SECTIONS[2].description)}
                  {ALERT_USER_SECTIONS[2].triggerIds.map((id) => renderTriggerToggle(id))}
                </fieldset>

                <fieldset className="alert-settings-section">
                  {renderAlertSectionHeader("repeat", ALERT_USER_SECTIONS[3].title, ALERT_USER_SECTIONS[3].description)}
                  <label className="alert-settings-row">
                    <span>같은 상태가 이어질 때 다시 알리는 간격(초)</span>
                    <input type="number" min={0} max={3600} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>팝업이 화면에 머무는 시간(초)</span>
                    <input type="number" min={0} max={60} value={autoDismiss} onChange={(e) => setAutoDismiss(e.target.value)} />
                  </label>
                </fieldset>
              </>
            )}

            {activeTab === "traffic" && (
              <fieldset className="alert-settings-section">
                <legend>TRAFFIC 필터</legend>
                <label className="alert-settings-row">
                  <span>호출부호 필터</span>
                  <input
                    type="text"
                    value={localTrafficCallsignFilter}
                    onChange={(e) => setLocalTrafficCallsignFilter(e.target.value.toUpperCase())}
                    placeholder="예: KAL, AAR123, JJA"
                  />
                </label>
                <fieldset className="alert-settings-section">
                  <legend>고도 필터(ft)</legend>
                  {TRAFFIC_ALTITUDE_OPTIONS.map((band) => (
                    <label key={band} className="alert-settings-row">
                      <span>{band}</span>
                      <input
                        type="checkbox"
                        checked={localTrafficAltitudeBands.includes(band)}
                        onChange={() => toggleTrafficAltitudeBand(band)}
                      />
                    </label>
                  ))}
                </fieldset>
              </fieldset>
            )}

            {activeTab === "minima" && (
              <fieldset className="alert-settings-section">
                <legend>공항별 LIFR(MINIMA) 기준</legend>
                <div className="minima-grid">
                  {MINIMA_AIRPORT_ORDER.map((icao) => {
                    const rule = localMinimaSettings[icao] || { visibilityM: null, ceilingFt: null };
                    const noDhAirport = icao === "RKSI" || icao === "RKSS";
                    return (
                      <div key={icao} className="minima-card">
                        <div className="minima-card-head">{icao}</div>
                        <label className="minima-card-row">
                          <span>시정(m)</span>
                          <input
                            type="number"
                            min={50}
                            max={5000}
                            step={25}
                            value={rule.visibilityM ?? ""}
                            onChange={(e) => updateMinimaValue(icao, "visibilityM", e.target.value)}
                          />
                        </label>
                        <label className="minima-card-row">
                          <span>운고(ft)</span>
                          <input
                            type="number"
                            min={50}
                            max={1000}
                            step={10}
                            value={rule.ceilingFt ?? ""}
                            onChange={(e) => updateMinimaValue(icao, "ceilingFt", e.target.value)}
                            placeholder={noDhAirport ? "NO DH(기본값)" : ""}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {activeTab === "advisory" && (
              <div className="advisory-filter-tab">
                {[
                  { section: "sigmet", label: "SIGMET", groups: SIGMET_FILTER_GROUPS, labelMap: SIGMET_FILTER_LABELS },
                  { section: "airmet", label: "AIRMET", groups: AIRMET_FILTER_GROUPS, labelMap: AIRMET_FILTER_LABELS },
                  { section: "sigwx",  label: "SIGWX",  groups: SIGWX_FILTER_GROUPS,  labelMap: SIGWX_FILTER_LABELS  },
                ].map(({ section, label, groups, labelMap }) => {
                  const allOn = Object.keys(groups).every((k) => localAdvisoryFilter[section][k] !== false);
                  return (
                    <fieldset key={section} className="alert-settings-section advisory-filter-section">
                      <legend className="advisory-filter-legend">
                        <span>{label}</span>
                        <button
                          type="button"
                          className="advisory-filter-toggle-all"
                          onClick={() => setAllAdvisorySection(section, !allOn)}
                        >
                          {allOn ? "전체 해제" : "전체 선택"}
                        </button>
                      </legend>
                      <div className="advisory-filter-chips">
                        {Object.keys(groups).map((key) => {
                          const on = localAdvisoryFilter[section][key] !== false;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`advisory-filter-chip${on ? " active" : ""}`}
                              onClick={() => toggleAdvisoryChip(section, key)}
                            >
                              {labelMap[key] || key}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="alert-settings-footer">
          <button className="btn-reset" onClick={handleReset}>초기화</button>
          <button className="btn-apply" onClick={handleApply}>적용</button>
          <button className="btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}
