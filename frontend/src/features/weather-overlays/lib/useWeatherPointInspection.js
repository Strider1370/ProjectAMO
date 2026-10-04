import { useState } from 'react'

export function useWeatherPointInspection({ visibility, enableWindOverlay, controlsVisible }) {
  const [selected, setSelected] = useState(false)
  const available = Boolean(
    (enableWindOverlay && ['wind', 'temp', 'cloud', 'icing', 'turbulence'].some(id => visibility[id]))
    || visibility.ci || visibility.ctps || visibility.echoTop,
  )
  return {
    available,
    enabled: selected && available && controlsVisible,
    toggle: () => setSelected(value => !value),
  }
}
