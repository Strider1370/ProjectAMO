// Shared front/CB bands keep both chart boundaries switching at the same zoom.
export const SIGWX_ZOOM_LEVELS = [
  { id: 'overview', minzoom: 0, maxzoom: 5.1, reference_zoom: 4.5 },
  { id: 'standard', minzoom: 5.1, maxzoom: 6.4, reference_zoom: 5.75 },
  { id: 'detail', minzoom: 6.4, maxzoom: 24, reference_zoom: 7 },
]
