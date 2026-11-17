import { annotateMetarTac } from '../parsers/tac-annotation.js'
import { convertSmToMeters } from '../parsers/noaa-metar-parser.js'
import { METRIC_LABELS } from './rules.js'

// 알림이 발생한 시점의 감시 기준과 판정 근거를 함께 보존한다. 나중에 설정을
// 바꾸더라도 과거 알림의 색이 달라지지 않으며, 원문의 공백·줄바꿈도 유지한다.
export function buildTafAlertSegments(text, rules) {
  // 줄을 재배열하는 TAF 표출기 대신 원문의 공백을 보존하는 공통 TAC 토큰화를 사용한다.
  const tokens = annotateMetarTac(text)?.display_lines[0].tokens ?? []
  const segments = []
  let inRemark = false
  for (let i = 0; i < tokens.length; i++) {
    let { text: value, role } = tokens[i]
    let token = value.replace(/=$/, '')
    if (token === 'RMK') inRemark = true
    // 미국식 혼합분수 시정은 정수부까지 한 항목으로 강조한다.
    if (!inRemark && /^\d+$/.test(token) && tokens[i + 1]?.role === 'separator'
      && /^\d+\/\d+SM=?$/.test(tokens[i + 2]?.text ?? '')) {
      value += tokens[i + 1].text + tokens[i + 2].text
      token = value.replace(/=$/, '')
      role = 'visibility'
      i += 2
    }
    const metrics = []
    const add = (key, measured, qualifier = null) => {
      const rule = rules[key]
      if (!rule?.enabled || !Number.isFinite(measured)) return
      const [label, unit, defaultDirection] = METRIC_LABELS[key]
      const direction = rule.direction ?? defaultDirection
      if (direction !== 'event' && !Number.isFinite(rule.threshold)) return
      const hit = direction === 'event' ? measured === 1
        : direction === 'below' ? measured < rule.threshold : measured >= rule.threshold
      if (hit) metrics.push({ key, label, value: measured, unit, direction, ...(qualifier ? { qualifier } : {}),
        threshold: direction === 'event' ? null : rule.threshold })
    }
    if (!inRemark) {
      const wind = role === 'wind' && /^(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/.exec(token)
      if (wind) {
        const factor = wind[3] === 'MPS' ? 1.943844 : wind[3] === 'KMH' ? 0.539957 : 1
        add('wind', Math.round(Number(wind[1]) * factor))
        if (wind[2]) add('gust', Math.round(Number(wind[2]) * factor))
      }
      if (role === 'visibility') {
        // 9999 / P6SM은 하한값이므로 기준 미만이라고 단정하지 않는다.
        if (/^\d{4}(?:[NSEW]{1,2})?$/.test(token) && !token.startsWith('9999')) add('visibility', Number(token.slice(0, 4)))
        else if (/^(?:\d+ )?\d+(?:\/\d+)?SM$/.test(token)) add('visibility', convertSmToMeters(token))
        else if (/^M\d+(?:\/\d+)?SM$/.test(token)) {
          const upperBound = convertSmToMeters(token.slice(1))
          if (Number.isFinite(upperBound)) add('visibility', upperBound, 'lessThan')
        }
      }
      const cloud = /^(?:BKN|OVC|VV)(\d{3})(?:CB|TCU)?$/.exec(token)
      if (cloud) add('ceiling', Number(cloud[1]) * 100)
      const temp = /^(?:TX|TN)(M?)(\d{2})\/\d{4}Z$/.exec(token)
      if (temp) add('temperature', Number(temp[2]) * (temp[1] ? -1 : 1))
      if (role === 'weather-special' && token.includes('FZRA')) add('fzra', 1)
      if (/^WS\d{3}\/\d{3}\d{2,3}(?:KT|MPS|KMH)$/.test(token)) add('windshear', 1)
    }
    segments.push(metrics.length ? { text: value, metrics } : { text: value })
  }
  return segments
}
