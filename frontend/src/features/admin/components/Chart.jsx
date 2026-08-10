import { axisTicks, barSlots, heatLevel, labelStride, plotGeometry, xPositions, yScale, CHART_WIDTH, PAD } from '../lib/chartAxis.js'

// 관리자 콘솔 그래프. 축 없는 그래프를 만들지 않기 위해 전부 이 파일을 거친다 —
// y축 눈금과 단위가 없으면 막대가 5인지 500인지 알 수 없고, 계열마다 제 최댓값에 맞춰
// 늘어나면 위아래를 비교했을 때 틀린 결론이 나온다(목업 참고).
//
// 계산은 lib/chartAxis.js에 있다(node:test가 JSX를 못 읽어서 분리했다). 여기는 그리기만 한다.

function Axes({ height, max, ticks, unit, xLabels, xUnit }) {
  const { left, right, bottom } = plotGeometry(height)
  const y = yScale(height, max)
  const stride = labelStride(xLabels.length)
  return (
    <>
      {axisTicks(max, ticks).map((value) => (
        <g key={value}>
          <line x1={left} y1={y(value)} x2={right} y2={y(value)} stroke="#f2f0ec" />
          <text x={left - 10} y={y(value) + 4} textAnchor="end" className="ac-ax">{value}</text>
        </g>
      ))}
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#eae8e4" />
      {unit && <text x={left - 10} y={PAD.t - 7} textAnchor="end" className="ac-axu">{unit}</text>}
      {xUnit && <text x={right} y={height - 6} textAnchor="end" className="ac-ax">{xUnit}</text>}
      {xLabels.map((label, i) => (i % stride === 0 || i === xLabels.length - 1 ? (
        <text key={`${label}-${i}`} x={xPositions(xLabels.length)[i]} y={height - 18} textAnchor="middle" className="ac-ax">{label}</text>
      ) : null))}
    </>
  )
}

// 시계열. series = [{ label, color, points: number[], dashed? }]
export function LineChart({ series, max = 100, unit, xLabels = [], xUnit, height = 190, ticks = 5, peak = null }) {
  const y = yScale(height, max)
  const longest = series.reduce((n, s) => Math.max(n, s.points.length), 0)
  const xs = xPositions(longest)
  return (
    <svg className="ac-chart" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img">
      <Axes height={height} max={max} ticks={ticks} unit={unit} xLabels={xLabels} xUnit={xUnit} />
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeDasharray={s.dashed ? '4 3' : undefined}
          points={s.points.map((v, i) => `${xs[i]?.toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        />
      ))}
      {/* 피크는 색 점만 찍지 않고 숫자로도 적는다 — 색만으로 뜻을 전하지 않는다는 규칙. */}
      {peak && Number.isFinite(peak.index) && xs[peak.index] != null && (
        <>
          <circle cx={xs[peak.index]} cy={y(peak.value)} r="3" fill={peak.color} />
          <text x={xs[peak.index]} y={y(peak.value) - 10} textAnchor="middle" className="ac-axv">{peak.text}</text>
        </>
      )}
    </svg>
  )
}

// 여러 계열을 같은 축에 놓는 막대. groups = [{ label, values: number[] }]
export function GroupedBarChart({ groups, colors, max = 50, unit, xUnit, height = 250, ticks = 6, highlight = null }) {
  const y = yScale(height, max)
  const { barWidth, xOf, slot } = barSlots(groups.length, colors.length)
  const { bottom, left } = plotGeometry(height)
  const stride = labelStride(groups.length)
  return (
    <svg className="ac-chart" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img">
      <Axes height={height} max={max} ticks={ticks} unit={unit} xLabels={[]} xUnit={xUnit} />
      {groups.map((group, gi) => group.values.map((value, si) => (value ? (
        <rect
          key={`${group.label}-${si}`}
          x={xOf(gi, si)}
          y={y(value)}
          width={Math.max(1, barWidth - 1.5)}
          height={Math.max(0, bottom - y(value))}
          fill={colors[si]}
          rx="1.5"
        >
          <title>{`${group.label} · ${value}`}</title>
        </rect>
      ) : null)))}
      {highlight && groups[highlight.index] && (
        <text x={left + highlight.index * slot + slot / 2} y={y(highlight.value) - 8} textAnchor="middle" className="ac-axv">{highlight.value}</text>
      )}
      {groups.map((group, i) => (i % stride === 0 || i === groups.length - 1 ? (
        <text key={group.label} x={left + i * slot + slot / 2} y={height - 18} textAnchor="middle" className="ac-ax">{group.label}</text>
      ) : null))}
    </svg>
  )
}

const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const HEAT_COLORS = ['#f2f0ec', '#e5e1da', '#cfc8bd', '#a8a096', '#6b6459', '#2a2621']

// 요일 x 시각 격자. cells = [{ dow, hour, n }] 168칸.
// 하루치 막대로는 절대 안 보이는 "평일 아침·저녁에 몰린다" 같은 이용 습관이 여기서 드러난다.
export function HourHeatmap({ cells }) {
  const max = cells.reduce((n, c) => Math.max(n, c.n), 0)
  const left = 40
  const top = 28
  const cellWidth = (CHART_WIDTH - left - 14) / 24
  const cellHeight = 22
  const height = top + 7 * cellHeight + 34
  return (
    <svg className="ac-chart" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img">
      {Array.from({ length: 12 }, (_, k) => k * 2).map((hour) => (
        <text key={hour} x={left + hour * cellWidth + cellWidth / 2} y={top - 10} textAnchor="middle" className="ac-ax">{hour}</text>
      ))}
      <text x={CHART_WIDTH - 14} y={top + 7 * cellHeight + 26} textAnchor="end" className="ac-ax">시각(KST)</text>
      {DOW_LABELS.map((label, dow) => (
        <text key={label} x={left - 10} y={top + dow * cellHeight + 15} textAnchor="end" className="ac-ax">{label}</text>
      ))}
      {cells.map((cell) => (
        <rect
          key={`${cell.dow}-${cell.hour}`}
          x={left + cell.hour * cellWidth + 1}
          y={top + cell.dow * cellHeight + 1}
          width={cellWidth - 2}
          height={cellHeight - 2}
          rx="3"
          fill={HEAT_COLORS[heatLevel(cell.n, max, HEAT_COLORS.length)]}
        >
          <title>{`${DOW_LABELS[cell.dow]} ${cell.hour}시 · ${cell.n}건`}</title>
        </rect>
      ))}
    </svg>
  )
}

export const HEATMAP_COLORS = HEAT_COLORS
export default { LineChart, GroupedBarChart, HourHeatmap }
