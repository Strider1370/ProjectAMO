import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const componentSources = {
  'components/TafTimeline.jsx': [
    "../../../../shared/ui/WeatherIcon.jsx",
    "../../../../shared/weather/weather-visual-resolver.js",
  ],
  'components/MetarCard.jsx': [
    "../../../../shared/ui/WeatherIcon.jsx",
    "../../../../shared/weather/weather-visual-resolver.js",
  ],
  'components/GroundForecastPanel.jsx': ["../../../../shared/ui/WeatherIcon.jsx"],
  'components/GroundCurrentWeatherCard.jsx': ["../../../../shared/ui/WeatherIcon.jsx"],
  'components/GroundHourlyStrip.jsx': ["../../../../shared/weather/weather-icon-registry.js"],
}

describe('monitoring weather rendering', () => {
  for (const [file, imports] of Object.entries(componentSources)) {
    it(`${file} uses the shared weather implementation`, async () => {
      const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8')

      for (const modulePath of imports) assert.ok(source.includes(`from \"${modulePath}\"`))
      assert.doesNotMatch(source, /from ["']\.\/(WeatherIcon)|from ["']\.\.\/utils\/weather-/)
    })
  }
})
