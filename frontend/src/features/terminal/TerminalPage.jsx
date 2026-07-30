import { App as DestinationWeatherPrototype } from '../../../../prototypes/destination-weather-comparison/src/App.jsx'
import '../../../../prototypes/destination-weather-comparison/src/styles.css'

/**
 * Passenger terminal display. It deliberately uses fixture data until the
 * flight/weather adapter is introduced; /monitoring remains an ops screen.
 */
export default function TerminalPage() {
  return <DestinationWeatherPrototype />
}
