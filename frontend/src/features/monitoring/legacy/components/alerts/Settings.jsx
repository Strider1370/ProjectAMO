import { useEffect, useState } from "react";
import { BASEMAP_OPTIONS, knownBasemapId } from "../../../../map/mapConfig.js";
import {
  SIGMET_FILTER_GROUPS,
  AIRMET_FILTER_GROUPS,
  SIGWX_FILTER_GROUPS,
  getDefaultAdvisoryFilterSettings,
  saveAdvisoryFilterSettings,
} from "../../utils/advisory-filter";
import {
  MONITORING_SLIDE_IMAGE_TYPES,
  MONITORING_SLIDE_LABELS,
  validateMonitoringSlideshowConfig,
} from "../../../lib/monitoringSlideshow.js";

const TRAFFIC_ALTITUDE_OPTIONS = [
  "0-10000",
  "10000-20000",
  "20000-30000",
  "30000-40000",
  "40000-50000",
];

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

const SETTINGS_TABS = [
  { id: "general", label: "일반" },
  { id: "traffic", label: "항적" },
  { id: "advisory", label: "공역예보" },
  { id: "slideshow", label: "화면 전환" },
];

export default function Settings({
  onClose,
  onSettingsChange,
  groundForecastDisplayMode,
  setGroundForecastDisplayMode,
  timeZone,
  setTimeZone,
  mapTheme,
  setMapTheme,
  basemapId,
  setBasemapId,
  trafficCallsignFilter,
  setTrafficCallsignFilter,
  trafficAltitudeBands,
  setTrafficAltitudeBands,
  advisoryFilter,
  setAdvisoryFilter,
  slideshowConfig,
  slideshowStatusLabel,
  slideshowImageInfo,
  slideshowPersistenceNotice,
  slideshowDisabled,
  onSlideshowConfigChange,
  onSlideImageChoose,
  onSlideImageRemove,
  onSlideshowPreview,
  onSlideshowStop,
  onSlideshowNextPage,
  variant = "modal",
  isGroundMode = false,
}) {
  const isInline = variant === "inline";
  const [localTimeZone, setLocalTimeZone] = useState(timeZone || "KST");
  const [localMapTheme, setLocalMapTheme] = useState(mapTheme || localStorage.getItem("map_theme") || "light");
  const [localGroundForecastDisplayMode, setLocalGroundForecastDisplayMode] = useState(groundForecastDisplayMode || localStorage.getItem("ground_forecast_display_mode") || "signage");
  const [localBasemapId, setLocalBasemapId] = useState(knownBasemapId(basemapId || localStorage.getItem("map_basemap_monitoring")));
  const [localTrafficCallsignFilter, setLocalTrafficCallsignFilter] = useState(trafficCallsignFilter || "");
  const [localTrafficAltitudeBands, setLocalTrafficAltitudeBands] = useState(trafficAltitudeBands || []);
  const [localAdvisoryFilter, setLocalAdvisoryFilter] = useState(
    advisoryFilter || getDefaultAdvisoryFilterSettings()
  );
  const [activeTab, setActiveTab] = useState("general");
  const visibleTabs = isGroundMode
    ? SETTINGS_TABS.filter((tab) => tab.id === "general" || tab.id === "slideshow")
    : SETTINGS_TABS;

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab("general");
  }, [activeTab, visibleTabs]);

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

  function applySettings() {
    localStorage.setItem("time_zone", localTimeZone);
    localStorage.setItem("map_theme", localMapTheme);
    localStorage.setItem("ground_forecast_display_mode", localGroundForecastDisplayMode);
    localStorage.setItem("map_basemap_monitoring", localBasemapId);
    localStorage.setItem("traffic_callsign_filter", localTrafficCallsignFilter);
    localStorage.setItem("traffic_altitude_bands", JSON.stringify(localTrafficAltitudeBands));
    saveAdvisoryFilterSettings(localAdvisoryFilter);

    setTimeZone?.(localTimeZone);
    setMapTheme?.(localMapTheme);
    setGroundForecastDisplayMode?.(localGroundForecastDisplayMode);
    setBasemapId?.(localBasemapId);
    setTrafficCallsignFilter?.(localTrafficCallsignFilter);
    setTrafficAltitudeBands?.(localTrafficAltitudeBands);
    setAdvisoryFilter?.(localAdvisoryFilter);

    onSettingsChange?.();
  }

  function handleApply() {
    applySettings();
  }

  function handleSave() {
    applySettings();
    if (!isInline) onClose?.();
  }

  function handleReset() {
    localStorage.removeItem("time_zone");
    localStorage.removeItem("map_theme");
    localStorage.removeItem("ground_forecast_display_mode");
    localStorage.removeItem("map_basemap_monitoring");
    localStorage.removeItem("traffic_callsign_filter");
    localStorage.removeItem("traffic_altitude_bands");
    localStorage.removeItem("advisory_filter_settings");

    setTimeZone?.("KST");
    setMapTheme?.("light");
    setGroundForecastDisplayMode?.("signage");
    setBasemapId?.("standard");
    setTrafficCallsignFilter?.("");
    setTrafficAltitudeBands?.([]);
    setAdvisoryFilter?.(getDefaultAdvisoryFilterSettings());

    onSettingsChange?.(null);
    if (!isInline) onClose?.();
  }

  const settingsContent = (
    <div className={`alert-settings-modal${isInline ? " phone-settings-inline" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="alert-settings-header">
          <h2>설정</h2>
          {!isInline && <button className="alert-popup-close" onClick={onClose}>&times;</button>}
        </div>

        <div className="alert-settings-layout">
          <div className="alert-settings-tabs">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                className={`alert-settings-tab-btn${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
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
                <label className="alert-settings-row">
                  <span>지도 배경</span>
                  <select value={localBasemapId} onChange={(e) => setLocalBasemapId(e.target.value)}>
                    {BASEMAP_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {isGroundMode && <label className="alert-settings-row">
                  <span>지상 예보 표시</span>
                  <select aria-label={`지상 예보 표시 ${isInline ? '인라인' : '모달'}`} value={localGroundForecastDisplayMode} onChange={(e) => setLocalGroundForecastDisplayMode(e.target.value)}>
                    <option value="signage">사이니지형</option>
                    <option value="classic">기존 카드형</option>
                  </select>
                </label>}
                <p className="alert-settings-help">공항·경로 기상 알림은 <a href="/alerts/settings">통합 알림 설정</a>에서 관리합니다.</p>
              </fieldset>
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
            {activeTab === "slideshow" && (
              <fieldset className="alert-settings-section alert-settings-slideshow" disabled={slideshowDisabled}>
                <legend>화면 전환</legend>
                {slideshowDisabled && (
                  <p className="alert-settings-help">
                    모바일 화면에서는 화면 전환 기능을 사용할 수 없습니다.
                  </p>
                )}
                <p className="alert-settings-help">
                  지도와 기상정보를 자동으로 번갈아 표시합니다. 선택한 이미지는 이 기기의 이 브라우저에만 저장됩니다.
                </p>

                <fieldset className="alert-settings-subsection">
                  <legend>기본 설정</legend>
                  <label className="alert-settings-row alert-settings-switch-row">
                    <span>화면 전환 사용</span>
                    <input
                      type="checkbox"
                      checked={Boolean(slideshowConfig?.enabled)}
                      onChange={(e) => onSlideshowConfigChange?.({ enabled: e.target.checked })}
                    />
                  </label>
                  <div className="alert-settings-row alert-settings-status-row">
                    <span>현재 상태: {slideshowStatusLabel || "꺼짐"}</span>
                    <span className="alert-settings-inline-actions">
                      <button type="button" className="alert-settings-preview-btn" onClick={() => onSlideshowPreview?.()}>
                        미리보기
                      </button>
                      <button type="button" className="alert-settings-preview-btn" onClick={() => onSlideshowStop?.()}>
                        중지
                      </button>
                      <button type="button" className="alert-settings-preview-btn" onClick={() => onSlideshowNextPage?.()}>
                        다음 페이지
                      </button>
                    </span>
                  </div>
                  <label className="alert-settings-row">
                    <span>전환 대상</span>
                    <select
                      value={slideshowConfig?.target || "whole-screen"}
                      onChange={(e) => onSlideshowConfigChange?.({ target: e.target.value })}
                    >
                      <option value="whole-screen">전체 화면</option>
                      <option value="map-panel">지도 패널만</option>
                    </select>
                  </label>
                </fieldset>

                <fieldset className="alert-settings-subsection">
                  <legend>표시할 장면</legend>
                  <p className="alert-settings-help">
                    선택한 장면을 위에서 아래 순서로 반복합니다. 각 장면의 표시 시간을 따로 정할 수 있습니다.
                  </p>
                  {(slideshowConfig?.slides || []).map((slide) => (
                    <label className="alert-settings-row alert-settings-slide-row" key={slide.id}>
                      <span>
                        <input
                          type="checkbox"
                          aria-label={`${MONITORING_SLIDE_LABELS[slide.id] || slide.id} 장면 사용`}
                          checked={Boolean(slide.enabled)}
                          onChange={(e) => onSlideshowConfigChange?.({
                            slides: (slideshowConfig?.slides || []).map((item) => (
                              item.id === slide.id ? { ...item, enabled: e.target.checked } : item
                            )),
                          })}
                        />
                        {" "}{MONITORING_SLIDE_LABELS[slide.id] || slide.id}
                      </span>
                      <span className="alert-settings-inline-actions">
                        <input
                          type="number"
                          aria-label={`${MONITORING_SLIDE_LABELS[slide.id] || slide.id} 머무는 시간(초)`}
                          min={5}
                          max={3600}
                          value={slide.durationSec ?? 30}
                          disabled={!slide.enabled}
                          onChange={(e) => onSlideshowConfigChange?.({
                            slides: (slideshowConfig?.slides || []).map((item) => (
                              item.id === slide.id ? { ...item, durationSec: Number(e.target.value) } : item
                            )),
                          })}
                        />
                        초
                      </span>
                    </label>
                  ))}
                  <p className="alert-settings-help">
                    기상정보는 선택한 공항의 항공기상청 공문 원문입니다. 자료가 없으면 해당 장면은 건너뜁니다.
                  </p>
                </fieldset>

                <fieldset className="alert-settings-subsection">
                  <legend>표시 시간</legend>
                  <label className="alert-settings-row">
                    <span>시작 시각</span>
                    <input
                      type="time"
                      value={slideshowConfig?.startTime || "00:00"}
                      onChange={(e) => onSlideshowConfigChange?.({ startTime: e.target.value })}
                    />
                  </label>
                  <label className="alert-settings-row">
                    <span>종료 시각</span>
                    <input
                      type="time"
                      value={slideshowConfig?.endTime || "23:59"}
                      onChange={(e) => onSlideshowConfigChange?.({ endTime: e.target.value })}
                    />
                  </label>
                  {!validateMonitoringSlideshowConfig(slideshowConfig || {}).valid && (
                    <p className="alert-settings-help">
                      {Object.values(validateMonitoringSlideshowConfig(slideshowConfig || {}).errors).join(" ")}
                    </p>
                  )}
                </fieldset>

                <fieldset className="alert-settings-subsection">
                  <legend>안내 이미지</legend>
                  <label className="alert-settings-row">
                    <span>이미지 선택 (PNG/JPEG/WebP)</span>
                    <input
                      type="file"
                      aria-label="표시할 이미지 (PNG/JPEG/WebP)"
                      accept={MONITORING_SLIDE_IMAGE_TYPES.join(",")}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) onSlideImageChoose?.(file)
                        e.target.value = ""
                      }}
                    />
                  </label>
                  {slideshowImageInfo && (
                    <div className="alert-settings-row">
                      <span>선택된 이미지: {slideshowImageInfo.name}</span>
                      <button type="button" className="alert-settings-preview-btn" onClick={() => onSlideImageRemove?.()}>
                        제거
                      </button>
                    </div>
                  )}
                </fieldset>

                <details className="alert-settings-advanced">
                  <summary>고급 설정</summary>
                  <label className="alert-settings-row">
                    <span>전환 효과</span>
                    <select
                      value={slideshowConfig?.transitionEffect || "fade"}
                      onChange={(e) => onSlideshowConfigChange?.({ transitionEffect: e.target.value })}
                    >
                      <option value="fade">페이드 (부드럽게 전환)</option>
                      <option value="slide">슬라이드 (밀려서 전환)</option>
                    </select>
                  </label>
                  <label className="alert-settings-row">
                    <span>전환 애니메이션 속도(ms)</span>
                    <input
                      type="number"
                      min={100}
                      max={2000}
                      step={50}
                      value={slideshowConfig?.transitionDurationMs ?? 1000}
                      onChange={(e) => onSlideshowConfigChange?.({ transitionDurationMs: Number(e.target.value) })}
                    />
                  </label>
                </details>

                {slideshowPersistenceNotice && (
                  <p className="alert-settings-help">{slideshowPersistenceNotice}</p>
                )}
              </fieldset>
            )}
          </div>
        </div>

        <div className="alert-settings-footer">
          <button className="btn-reset" onClick={handleReset}>초기화</button>
          <button className="btn-apply" onClick={handleApply}>적용</button>
          <button className="btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
  );

  if (isInline) return settingsContent;

  return (
    <div className="alert-settings-overlay" onClick={onClose}>
      {settingsContent}
    </div>
  );
}
