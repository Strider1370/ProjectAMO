import { CloudLightning, Mountain, Tornado } from 'lucide-react'

export default function HazardIcon({ source, size = 14 }) {
  const Icon = source?.includes('TYPHOON')
    ? Tornado
    : (source?.includes('SIGMET') || source?.includes('AIRMET') ? CloudLightning : Mountain)
  return <Icon size={size} style={{ flex: '0 0 auto' }} />
}
