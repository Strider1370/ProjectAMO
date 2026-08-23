import assert from 'node:assert/strict'
import test from 'node:test'

import { mapGroundForecastIcon } from './groundForecastIcons.js'

const sunTimes = { sunrise: '06:00', sunset: '19:14' }

test('clear and partly cloudy hourly forecasts use night icons after the actual sunset', () => {
  assert.equal(mapGroundForecastIcon('sunny', '2000', sunTimes), 'clear-night')
  assert.equal(mapGroundForecastIcon('partly_cloudy', '0500', sunTimes), 'few-clouds-night')
})

test('clear hourly forecasts remain day icons before the actual sunset', () => {
  assert.equal(mapGroundForecastIcon('sunny', '1800', sunTimes), 'clear-day')
  assert.equal(mapGroundForecastIcon('partly_cloudy', '1900', sunTimes), 'few-clouds-day')
})

test('weekly forecasts always use day icons because they have no hourly timestamp', () => {
  assert.equal(mapGroundForecastIcon('sunny'), 'clear-day')
  assert.equal(mapGroundForecastIcon('partly_cloudy'), 'few-clouds-day')
})
