import GroundHourlyStripClassic from './GroundHourlyStripClassic.jsx'
import GroundForecastClassicPanel from './GroundForecastClassicPanel.jsx'

export default function GroundForecastClassic({ groundForecastData, icao, timeZone = 'KST' }) {
  return <>
    <GroundHourlyStripClassic groundForecastData={groundForecastData} icao={icao} timeZone={timeZone} />
    <GroundForecastClassicPanel groundForecastData={groundForecastData} icao={icao} timeZone={timeZone} />
  </>
}
