import { LineChart } from '../components/Chart.jsx'
import { formatAge, formatBytes, levelTone, percent } from '../lib/adminFormat.js'

// 서버 자원. 게이지와 추이는 기존 화면에서 이어받고, 여기에 세 가지를 더한다 —
// 디스크가 며칠 남았는지, 지금 돌고 있는 버전이 뭔지, 인증서가 언제 만료되는지.
// 목업에 그려진 "사용자 응답"(응답시간·오류율)은 아직 재는 코드가 없어 2단계로 미뤘다.
const CPU_COLOR = '#3d5a80'
const MEM_COLOR = '#a9701d'
const DISK_COLOR = '#6d28d9'
const DISK_TOP_N = 6
const CERT_WARN_DAYS = 14

const timeLabel = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

function Gauge({ label, value, sub }) {
  const tone = levelTone(value)
  return (
    <div className="ac-gauge">
      <div className="ac-gl2">{label}</div>
      <div className="ac-gv n" style={{ color: tone === 'ok' ? 'var(--ac-tx)' : `var(--ac-${tone})` }}>{value}%</div>
      <div className="ac-gb"><span style={{ width: `${Math.min(100, value)}%`, background: tone === 'ok' ? 'var(--ac-tx)' : `var(--ac-${tone})` }} /></div>
      <div className="ac-gs">{sub}</div>
    </div>
  )
}

function DiskRow({ entry, total }) {
  return (
    <div className="ac-bar-row">
      <span className="ac-bn">{entry.name}</span>
      <span className="ac-bar"><span style={{ width: `${total > 0 ? Math.max((entry.bytes / total) * 100, 0.5) : 0}%` }} /></span>
      <span className="ac-bv n">{formatBytes(entry.bytes)}</span>
    </div>
  )
}

export default function ServerResourceScreen({ server, metrics }) {
  if (!server || !metrics?.current) return null

  const current = metrics.current
  const series = metrics.series ?? []
  const disk = server.disk ?? []
  const diskTotal = disk.reduce((sum, entry) => sum + entry.bytes, 0)
  const top = disk.slice(0, DISK_TOP_N)
  const rest = disk.slice(DISK_TOP_N)
  const forecast = server.diskForecast
  const cert = server.deployment?.cert
  const cpuPoints = series.map((row) => row.cpu_pct)
  const peakIndex = cpuPoints.reduce((best, value, i) => (value > (cpuPoints[best] ?? -1) ? i : best), 0)

  return (
    <>
      <section className="ac-sec">
        <h2>시스템 리소스<em>24시간</em></h2>
        <div className="ac-gauges">
          <Gauge label="CPU" value={Math.round(current.cpuPct)} sub="" />
          <Gauge
            label="메모리"
            value={percent(current.memUsed, current.memTotal)}
            sub={`${(current.memUsed / 1024 ** 3).toFixed(1)} / ${(current.memTotal / 1024 ** 3).toFixed(1)} GB`}
          />
          <Gauge
            label="디스크"
            value={percent(current.diskUsed, current.diskTotal)}
            sub={`${(current.diskUsed / 1024 ** 3).toFixed(1)} / ${(current.diskTotal / 1024 ** 3).toFixed(1)} GB${
              forecast ? ` · 하루 ${formatBytes(forecast.perDayBytes)} 증가 → 약 ${forecast.daysLeft}일 남음` : ''
            }`}
          />
        </div>
        {series.length > 1 && (
          <>
            <LineChart
              height={230}
              max={100}
              unit="%"
              xUnit="24시간"
              xLabels={[timeLabel(series[0].ts), timeLabel(series[series.length - 1].ts)]}
              peak={{ index: peakIndex, value: cpuPoints[peakIndex], color: CPU_COLOR, text: `피크 ${Math.round(cpuPoints[peakIndex])}% · ${timeLabel(series[peakIndex].ts)}` }}
              series={[
                { label: 'CPU', color: CPU_COLOR, points: cpuPoints },
                { label: '메모리', color: MEM_COLOR, points: series.map((row) => percent(row.mem_used, row.mem_total)) },
                { label: '디스크', color: DISK_COLOR, dashed: true, points: series.map((row) => percent(row.disk_used, row.disk_total)) },
              ]}
            />
            <div className="ac-clg">
              <span><i style={{ background: CPU_COLOR }} />CPU</span>
              <span><i style={{ background: MEM_COLOR }} />메모리</span>
              <span><i style={{ background: DISK_COLOR }} />디스크</span>
            </div>
          </>
        )}
      </section>

      <div className="ac-two-eq">
        <section className="ac-sec">
          <h2>프로세스<em>projectamo-backend</em></h2>
          <div className="ac-stats">
            <div>
              <div className="ac-sv n" style={server.process.bootCount > 10 ? { color: 'var(--ac-warn)' } : undefined}>{server.process.bootCount}</div>
              <div className="ac-sl">재시작 횟수</div>
            </div>
            <div>
              <div className="ac-sv n">{Math.floor(server.process.uptimeSec / 3600)}<s>시간 </s>{Math.floor((server.process.uptimeSec % 3600) / 60)}<s>분</s></div>
              <div className="ac-sl">이번 가동시간</div>
            </div>
            <div>
              <div className="ac-sv n">{formatBytes(server.process.heapUsed)}</div>
              <div className="ac-sl">메모리 사용 (전체 {formatBytes(server.process.heapTotal)})</div>
            </div>
          </div>
          <table className="ac-t" style={{ marginTop: 18 }}>
            <tbody>
              <tr>
                <td className="ac-nm">돌고 있는 버전</td>
                <td className="ac-r n">{server.deployment?.commit || '—'}</td>
                <td className="ac-r ac-muted">
                  {server.deployment?.deployedAt ? `${formatAge(Date.now() - Date.parse(server.deployment.deployedAt))} 전 배포` : '—'}
                </td>
              </tr>
              {cert && (
                <tr>
                  <td className="ac-nm">HTTPS 인증서</td>
                  <td className="ac-r">
                    <span className={`ac-chip ac-${cert.daysLeft < CERT_WARN_DAYS ? 'bad' : 'ok'}`}>{cert.daysLeft}일 남음</span>
                  </td>
                  <td className="ac-r ac-muted">{new Date(cert.notAfter).toLocaleDateString('ko-KR')} 만료</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="ac-sec">
          <h2>디스크 사용량<em className="n">{formatBytes(diskTotal)}</em></h2>
          {top.map((entry) => <DiskRow key={entry.name} entry={entry} total={diskTotal} />)}
          {rest.length > 0 && (
            <details className="ac-more">
              <summary>나머지 {rest.length}개 · {formatBytes(rest.reduce((sum, e) => sum + e.bytes, 0))}</summary>
              {rest.map((entry) => <DiskRow key={entry.name} entry={entry} total={diskTotal} />)}
            </details>
          )}
        </section>
      </div>

      <section className="ac-sec ac-flush">
        <h2>최근 수집 실패<em>최근 실행 50건 중</em></h2>
        {server.recentErrors?.length ? (
          <table className="ac-t">
            <tbody>
              {server.recentErrors.map((error, i) => (
                <tr key={`${error.type}-${error.time}-${i}`}>
                  <td className="ac-nm">{error.type}</td>
                  <td className="ac-muted">{error.error}</td>
                  <td className="ac-r ac-muted n">{new Date(error.time).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="ac-sub" style={{ padding: '0 22px 16px' }}>최근 실패가 없습니다.</p>
        )}
      </section>
    </>
  )
}
