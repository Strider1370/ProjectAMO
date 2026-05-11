export function getRouteContext(pathname = "/") {
  const normalizedPath = typeof pathname === "string" && pathname.trim() ? pathname : "/";
  const isTestPage = normalizedPath === "/test";
  const dashboardMode = normalizedPath === "/ground" ? "ground" : "ops";
  const selectedAirportKey = isTestPage
    ? "selected_airport_test"
    : dashboardMode === "ground"
      ? "selected_airport_ground"
      : "selected_airport_ops";

  return {
    pathname: normalizedPath,
    isTestPage,
    dashboardMode,
    selectedAirportKey,
  };
}

export function getCurrentRouteContext() {
  if (typeof window === "undefined") {
    return getRouteContext("/");
  }
  return getRouteContext(window.location.pathname);
}
