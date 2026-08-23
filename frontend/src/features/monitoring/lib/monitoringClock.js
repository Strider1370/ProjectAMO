const WEEKDAY_KO = {
  Sun: '일', Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토',
}

export function monitoringClockParts(value, tz = 'KST') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz === 'KST' ? 'Asia/Seoul' : 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const field = (type) => parts.find((part) => part.type === type)?.value
  return {
    date: `${field('year')}년 ${field('month')}월 ${field('day')}일`,
    weekday: WEEKDAY_KO[field('weekday')],
    time: `${field('hour')}:${field('minute')}`,
  }
}

export function formatMonitoringClock(value, tz = 'KST') {
  const { date, weekday, time } = monitoringClockParts(value, tz)
  return `${date} (${weekday}) ${time}`
}
