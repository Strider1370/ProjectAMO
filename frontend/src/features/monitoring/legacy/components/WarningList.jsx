import { useEffect, useMemo, useRef, useState } from "react";
import { safe, warningMeta, getDisplayDate } from "../utils/helpers";

const EMPTY_LIST = [];

const WARNING_NAME_KO = {
  WIND_SHEAR: "급변풍",
  LOW_VISIBILITY: "저시정",
  STRONG_WIND: "강풍",
  HEAVY_RAIN: "호우",
  LOW_CEILING: "저운고",
  THUNDERSTORM: "뇌우",
  TYPHOON: "태풍",
  HEAVY_SNOW: "대설",
  YELLOW_DUST: "황사",
  UNKNOWN: "미확인경보",
};

function formatValidTime(value, tz = "UTC") {
  if (!value) return "--일 --시 --분";
  const date = getDisplayDate(value, tz);
  if (Number.isNaN(date.getTime())) return "--일 --시 --분";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day}일 ${hour}시 ${minute}분`;
}

export default function WarningList({ warningData, groundOverviewData, icao, warningTypes, dashboardMode = "ops", tz = "UTC" }) {
  const block = warningData?.airports?.[icao];
  const overview = groundOverviewData?.airports?.[icao] || null;
  const list = useMemo(() => (
    Array.isArray(block?.warnings) ? block.warnings : EMPTY_LIST
  ), [block?.warnings]);
  const viewportRef = useRef(null);
  const measureRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageHeight, setPageHeight] = useState(52);
  const [isAnimating, setIsAnimating] = useState(false);
  const [nextPageIndex, setNextPageIndex] = useState(0);

  useEffect(() => {
    if (list.length === 0) {
      setPages((prev) => (prev.length === 0 ? prev : []));
      setPageIndex((prev) => (prev === 0 ? prev : 0));
      setNextPageIndex((prev) => (prev === 0 ? prev : 0));
      setIsAnimating((prev) => (prev ? false : prev));
      return undefined;
    }

    const updateLayout = () => {
      const viewport = viewportRef.current;
      const measure = measureRef.current;

      if (!viewport || !measure) {
        return;
      }

      const itemNodes = Array.from(measure.children);
      const nextPages = [];
      let currentTop = null;
      let currentPage = [];

      itemNodes.forEach((node, index) => {
        const top = Math.round(node.offsetTop);
        if (currentTop === null || top === currentTop) {
          currentTop = top;
          currentPage.push(index);
          return;
        }

        nextPages.push(currentPage);
        currentTop = top;
        currentPage = [index];
      });

      if (currentPage.length > 0) {
        nextPages.push(currentPage);
      }

      const measuredHeight = itemNodes.length > 0
        ? Math.ceil(Math.max(...itemNodes.map((node) => node.getBoundingClientRect().height)) + 8)
        : Math.ceil(measure.getBoundingClientRect().height);
      if (measuredHeight > 0) {
        setPageHeight((prev) => (prev === measuredHeight ? prev : measuredHeight));
      }

      setPages((prev) => {
        const same =
          prev.length === nextPages.length &&
          prev.every((page, index) =>
            page.length === nextPages[index].length &&
            page.every((itemIndex, itemPos) => itemIndex === nextPages[index][itemPos])
          );
        return same ? prev : nextPages;
      });
    };

    updateLayout();

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => updateLayout())
      : null;

    if (resizeObserver) {
      if (viewportRef.current) resizeObserver.observe(viewportRef.current);
      if (measureRef.current) resizeObserver.observe(measureRef.current);
    } else {
      window.addEventListener("resize", updateLayout);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", updateLayout);
      }
    };
  }, [list, tz, warningTypes]);

  useEffect(() => {
    setPages([]);
    setPageIndex(0);
    setNextPageIndex(0);
    setIsAnimating(false);
  }, [icao, list]);

  useEffect(() => {
    if (pages.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNextPageIndex((pageIndex + 1) % pages.length);
      setIsAnimating(true);
    }, 4200);

    return () => window.clearInterval(interval);
  }, [pageIndex, pages]);

  useEffect(() => {
    if (!isAnimating) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setPageIndex(nextPageIndex);
      setIsAnimating(false);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isAnimating, nextPageIndex]);

  function renderWarningItem(item, keyPrefix, i) {
      if (!item) {
        return null;
      }

      const meta = warningMeta(item.wrng_type, warningTypes || {}) || {};
      const key = item.wrng_type_key === "UNKNOWN" && meta.key ? meta.key : item.wrng_type_key;
      const name = WARNING_NAME_KO[key] || safe(item.wrng_type_name) || "미확인경보";

      return (
        <span key={`${keyPrefix}-${i}`} className="warning-banner-item">
          <span className="warning-banner-entry">
            <strong className="warning-banner-name">{name}</strong>
            <span className="warning-banner-time">
              {formatValidTime(item.valid_start, tz)} ~ {formatValidTime(item.valid_end, tz)}
            </span>
          </span>
        </span>
      );
  }

  function renderWarningPage(page, keyPrefix) {
    return page
      .map((itemIndex, i) => renderWarningItem(list[itemIndex], keyPrefix, i))
      .filter(Boolean);
  }

  const displayPages = (pages.length > 0 ? pages : [list.map((_, index) => index)])
    .map((page) => page.filter((itemIndex) => itemIndex >= 0 && itemIndex < list.length))
    .filter((page) => page.length > 0);
  const normalizedPages = displayPages.length > 0 ? displayPages : [list.map((_, index) => index)];
  const activePageIndex = Math.min(pageIndex, normalizedPages.length - 1);
  const incomingPageIndex = Math.min(nextPageIndex, normalizedPages.length - 1);
  const activePage = normalizedPages[activePageIndex] || [];
  const incomingPage = normalizedPages[incomingPageIndex] || activePage;

  if (list.length === 0) {
    if (dashboardMode === "ground" && overview?.summary) {
      return (
        <div className="warning-banner warning-banner--ok warning-banner--overview">
          <div className="warning-banner-side">
            <span className="warning-banner-icon">&#9788;</span>
            <span className="warning-banner-label">일기개황</span>
          </div>
          <div className="warning-banner-text warning-banner-text--overview">
            <div className="warning-banner-overview-copy">
              <span className="warning-banner-overview-summary">{overview.summary}</span>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="warning-banner warning-banner--ok">
        <div className="warning-banner-side warning-banner-side--single">
          <span className="warning-banner-icon">&#10003;</span>
          <span className="warning-banner-label">공항경보 없음</span>
        </div>
      </div>
    );
  }

  return (
    <div className="warning-banner warning-banner--danger">
      <div className="warning-banner-side">
        <span className="warning-banner-icon warning-banner-icon--alert">&#9888;</span>
        <span className="warning-banner-label">공항경보</span>
      </div>
      <div
        ref={viewportRef}
        className="warning-banner-text"
        style={{ "--warning-page-height": `${pageHeight}px` }}
      >
        <div className={`warning-banner-page${isAnimating ? " warning-banner-page--leave" : " warning-banner-page--active"}`}>
          <div className="warning-banner-group">
            {renderWarningPage(activePage, `page-${pageIndex}`)}
          </div>
        </div>
        {isAnimating && (
          <div className="warning-banner-page warning-banner-page--enter">
            <div className="warning-banner-group">
              {renderWarningPage(incomingPage, `page-${nextPageIndex}`)}
            </div>
          </div>
        )}
        <div className="warning-banner-measure" aria-hidden="true">
          <div ref={measureRef} className="warning-banner-group">
            {list.map((item, i) => renderWarningItem(item, "measure", i))}
          </div>
        </div>
      </div>
    </div>
  );
}
