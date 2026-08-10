import GroundHourlyStripClassic from './GroundHourlyStripClassic.jsx'
import GroundForecastClassicPanel from './GroundForecastClassicPanel.jsx'

export default function GroundForecastClassic({ groundForecastData, icao }) {
  return <>
    <GroundHourlyStripClassic groundForecastData={groundForecastData} icao={icao} />
    <GroundForecastClassicPanel groundForecastData={groundForecastData} icao={icao} />
  </>
}
