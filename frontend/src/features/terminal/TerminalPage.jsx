import { App as DestinationWeatherPrototype } from './DestinationWeatherPage.jsx'
import './terminal.css'

/**
 * Passenger terminal display. It deliberately uses fixture data until the
 * flight/weather adapter is introduced; /monitoring remains an ops screen.
 */
export default function TerminalPage() {
  return <DestinationWeatherPrototype />
}
