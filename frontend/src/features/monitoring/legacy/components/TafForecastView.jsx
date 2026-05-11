import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import WeatherIcon from "./WeatherIcon";
import { resolveWeatherVisual } from "../utils/weather-visual-resolver";

const WEATHER_LABELS = {
  clear: "맑음",
  sct: "구름조금",
  bkn: "구름많음",
  ovc: "흐림",
  fog: "안개",
  rain: "비",
  heavy_rain: "강한 비",
  snow: "눈",
  heavy_snow: "강한 눈",
  thunderstorm: "뇌우",
};

const PLAYBACK_DURATION_MS = 40000; // full sweep in 40 seconds
const preloadedForecastImages = new Set();

function getTimePeriod(isoString) {
  if (!isoString) return "day";
  const hour = (new Date(isoString).getUTCHours() + 9) % 24;
  if (hour >= 6 && hour < 18) return "day";
  return "night";
}

function resolveWeatherKey(slot) {
  const rawWeather = String(slot?.display?.weather || "").toUpperCase().trim();

  if (rawWeather) {
    if (rawWeather.includes("TS")) return "thunderstorm";
    if (/\+SN|\+SHSN/.test(rawWeather)) return "heavy_snow";
    if (/\+RA|\+SHRA/.test(rawWeather)) return "heavy_rain";
    if (/SN|SHSN/.test(rawWeather)) return "snow";
    if (/RA|DZ|SHRA/.test(rawWeather)) return "rain";
    if (/FG/.test(rawWeather)) return "fog";
  }

  const clouds = slot?.clouds || [];
  const topAmount = clouds
    .map((c) => c.amount)
    .reduce((best, cur) => {
      const priority = { OVC: 4, BKN: 3, SCT: 2, FEW: 1, SKC: 0, CLR: 0 };
      return (priority[cur] || 0) > (priority[best] || 0) ? cur : best;
    }, "");

  if (topAmount === "OVC") return "ovc";
  if (topAmount === "BKN") return "bkn";
  if (topAmount === "SCT") return "sct";

  if (slot?.cavok || !rawWeather) return "clear";
  return "clear";
}

function getImageFilename(slot) {
  const period = getTimePeriod(slot.time);
  const weather = resolveWeatherKey(slot);
  return `${period}_${weather}`;
}

function formatTafDisplay(slot) {
  const parts = [];
  if (slot.display?.wind) parts.push(`바람 ${slot.display.wind}`);
  if (slot.display?.visibility) parts.push(`시정 ${slot.display.visibility}`);
  if (slot.display?.weather) parts.push(`날씨 ${slot.display.weather}`);
  if (slot.display?.clouds) parts.push(`구름 ${slot.display.clouds}`);
  return parts.join(" / ");
}

function buildSegments(timeline) {
  const segments = [];
  for (const slot of timeline) {
    const imageKey = getImageFilename(slot);
    const prev = segments[segments.length - 1];
    if (prev && prev.imageKey === imageKey) {
      prev.endTime = slot.time;
      prev.slots.push(slot);
      continue;
    }
    segments.push({
      startTime: slot.time,
      endTime: slot.time,
      imageKey,
      weatherKey: resolveWeatherKey(slot),
      period: getTimePeriod(slot.time),
      slots: [slot],
      display: slot.display,
      slot,
    });
  }
  return segments;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDate();
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  return `${day}일 ${hour}시`;
}

function formatHourOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}시`;
}

export default function TafForecastView({ tafData, icao, tz = "UTC" }) {
  const target = tafData?.airports?.[icao];
  const rawTimeline = target?.timeline || [];
  const now = Date.now();
  const timeline = rawTimeline.filter(
    (slot) => new Date(slot.time).getTime() + 3600 * 1000 > now
  );

  const segments = useMemo(() => buildSegments(timeline), [timeline]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0); // 0..1
  const [fadingOut, setFadingOut] = useState(false);
  const [displayImage, setDisplayImage] = useState(null);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const startProgressRef = useRef(0);
  const prevImageRef = useRef(null);

  const totalStart = timeline.length > 0 ? new Date(timeline[0].time).getTime() : 0;
  const totalEnd = timeline.length > 0 ? new Date(timeline[timeline.length - 1].time).getTime() + 3600 * 1000 : 0;
  const totalDuration = totalEnd - totalStart;
  const timelineScale = useMemo(() => {
    if (timeline.length === 0 || totalDuration <= 0) return [];

    const step = timeline.length > 18 ? 3 : timeline.length > 10 ? 2 : 1;
    const ticks = [];

    for (let i = 0; i < timeline.length; i += step) {
      const slot = timeline[i];
      const slotTime = new Date(slot.time).getTime();
      ticks.push({
        key: `${slot.time}-${i}`,
        label: formatHourOnly(slot.time),
        left: ((slotTime - totalStart) / totalDuration) * 100,
      });
    }

    const lastSlot = timeline[timeline.length - 1];
    const lastHourLabel = formatHourOnly(lastSlot?.time);
    if (ticks[ticks.length - 1]?.label !== lastHourLabel) {
      ticks.push({
        key: `${lastSlot.time}-last`,
        label: lastHourLabel,
        left: ((new Date(lastSlot.time).getTime() - totalStart) / totalDuration) * 100,
      });
    }

    return ticks;
  }, [timeline, totalStart, totalDuration]);
  const segmentSignature = useMemo(
    () => segments.map((segment) => `${segment.startTime}:${segment.endTime}:${segment.imageKey}`).join("|"),
    [segments]
  );
  const preloadImagePaths = useMemo(
    () => Array.from(new Set(
      segments.map((segment) => `/airport_weather/${icao}/${segment.imageKey}.png`)
    )),
    [icao, segments]
  );

  useEffect(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
    setSelectedIndex(0);
    setPlayProgress(0);
    setFadingOut(false);
    setDisplayImage(null);
    startTimeRef.current = null;
    startProgressRef.current = 0;
    prevImageRef.current = null;
  }, [icao, segmentSignature]);

  useEffect(() => {
    preloadImagePaths.forEach((imagePath) => {
      if (!imagePath || preloadedForecastImages.has(imagePath)) {
        return;
      }
      const img = new Image();
      img.decoding = "async";
      img.src = imagePath;
      preloadedForecastImages.add(imagePath);
    });
  }, [preloadImagePaths]);

  // Find which segment a given progress (0..1) falls into
  const getSegmentAtProgress = useCallback((progress) => {
    if (segments.length === 0) return 0;
    const t = totalStart + progress * totalDuration;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (t >= new Date(segments[i].startTime).getTime()) return i;
    }
    return 0;
  }, [segments, totalStart, totalDuration]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || segments.length === 0) return;

    startTimeRef.current = performance.now();
    startProgressRef.current = playProgress;

    const tick = (timestamp) => {
      const elapsed = timestamp - startTimeRef.current;
      const delta = elapsed / PLAYBACK_DURATION_MS;
      let newProgress = startProgressRef.current + delta;

      if (newProgress >= 1) {
        newProgress = newProgress - 1;
        startTimeRef.current = timestamp;
        startProgressRef.current = 0;
      }

      setPlayProgress(newProgress);
      const segIdx = getSegmentAtProgress(newProgress);
      setSelectedIndex(segIdx);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, segments.length, getSegmentAtProgress]);

  // Image crossfade
  const activeSegment = segments[Math.min(selectedIndex, segments.length - 1)];
  const currentImagePath = activeSegment
    ? `/airport_weather/${icao}/${activeSegment.imageKey}.png`
    : null;

  useEffect(() => {
    if (!currentImagePath) return;
    if (currentImagePath === displayImage) return;

    if (displayImage) {
      prevImageRef.current = displayImage;
      setFadingOut(true);
      const timer = setTimeout(() => {
        setFadingOut(false);
        prevImageRef.current = null;
      }, 1000);
      setDisplayImage(currentImagePath);
      return () => clearTimeout(timer);
    } else {
      setDisplayImage(currentImagePath);
    }
  }, [currentImagePath]);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // If at the end, restart
      if (playProgress >= 1) {
        setPlayProgress(0);
        setSelectedIndex(0);
        startProgressRef.current = 0;
      }
      setIsPlaying(true);
    }
  };

  const handleSegmentClick = (i) => {
    setIsPlaying(false);
    setSelectedIndex(i);
    // Set playhead to the start of clicked segment
    if (segments.length > 0 && totalDuration > 0) {
      const segStart = new Date(segments[i].startTime).getTime();
      setPlayProgress((segStart - totalStart) / totalDuration);
    }
  };

  if (timeline.length === 0) {
    return (
      <div className="taf-forecast-view taf-forecast-view--empty">
        <p>TAF 데이터가 없습니다.</p>
      </div>
    );
  }

  const weatherLabel = WEATHER_LABELS[activeSegment?.weatherKey] || activeSegment?.weatherKey || "";
  const validStartIso = timeline[0]?.time;
  const validEndIso = timeline[timeline.length - 1]?.time;

  return (
    <div className="taf-forecast-view">
      <div className="taf-forecast-slider">
        <button
          type="button"
          className={`taf-forecast-play-btn ${isPlaying ? "playing" : ""}`}
          onClick={handlePlayPause}
          title={isPlaying ? "일시정지" : "재생"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <rect x="4" y="3" width="4" height="14" rx="1" />
              <rect x="12" y="3" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path d="M5 3.5v13a1 1 0 001.5.86l11-6.5a1 1 0 000-1.72l-11-6.5A1 1 0 005 3.5z" />
            </svg>
          )}
        </button>
        <span className="taf-forecast-slider-label">{formatTime(validStartIso)}</span>
        <div className="taf-forecast-track-shell">
          <div className="taf-forecast-scale">
            {timelineScale.map((tick) => (
              <span
                key={tick.key}
                className="taf-forecast-scale-tick"
                style={{ left: `${tick.left}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          <div className="taf-forecast-track">
            {segments.map((seg, i) => {
              const segStart = new Date(seg.startTime).getTime();
              const segEnd = new Date(seg.endTime).getTime() + 3600 * 1000;
              const left = totalDuration > 0 ? ((segStart - totalStart) / totalDuration) * 100 : 0;
              const width = totalDuration > 0 ? ((segEnd - segStart) / totalDuration) * 100 : 100;

              return (
                <button
                  key={i}
                  type="button"
                  className={`taf-forecast-seg ${i === selectedIndex ? "active" : ""} taf-forecast-seg--${seg.period}`}
                  style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                  onClick={() => handleSegmentClick(i)}
                  title={`${formatTime(seg.startTime)} ~ ${formatTime(seg.endTime)}\n${WEATHER_LABELS[seg.weatherKey] || seg.weatherKey}`}
                >
                  <span className="taf-forecast-seg-content">
                    <span className="taf-forecast-seg-icon" aria-hidden="true">
                      <WeatherIcon
                        visual={{ ...resolveWeatherVisual(seg.slot, seg.slot.time), intensityOverlay: null }}
                        className="mini"
                        alt=""
                      />
                    </span>
                    <span className="taf-forecast-seg-label">
                      {WEATHER_LABELS[seg.weatherKey] || seg.weatherKey}
                    </span>
                  </span>
                </button>
              );
            })}
            <div
              className="taf-forecast-playhead"
              style={{ left: `${playProgress * 100}%` }}
            />
          </div>
        </div>
        <span className="taf-forecast-slider-label">{formatTime(validEndIso)}</span>
      </div>

      <div className="taf-forecast-image-wrap">
        <div className="taf-forecast-image-overlay">
          <div className="taf-forecast-time">
            {formatTime(activeSegment.startTime)}
            {activeSegment.startTime !== activeSegment.endTime && ` ~ ${formatTime(activeSegment.endTime)}`}
          </div>
          <div className="taf-forecast-weather-label">{weatherLabel}</div>
          <div className="taf-forecast-detail">{formatTafDisplay(activeSegment.slot)}</div>
        </div>
        {fadingOut && prevImageRef.current && (
          <img
            className="taf-forecast-image taf-forecast-image--fade-out"
            src={prevImageRef.current}
            alt=""
          />
        )}
        {displayImage && (
          <img
            className={`taf-forecast-image ${fadingOut ? "taf-forecast-image--fade-in" : ""}`}
            src={displayImage}
            alt={`${icao} ${weatherLabel}`}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
      </div>
    </div>
  );
}
