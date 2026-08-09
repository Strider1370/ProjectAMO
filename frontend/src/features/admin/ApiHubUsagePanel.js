import { createElement as h, useState } from 'react'

export function sortEndpointUsage(endpoints = []) {
  return [...endpoints].sort((a, b) => b.bytes - a.bytes)
}

function gb(bytes) { return `${(Number(bytes || 0) / 1e9).toFixed(2)} GB` }
function time(iso) { return iso ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso)) : '—' }
function status(key) {
  if (key.status === 'unconfigured') return '키 미설정'
  if (key.blockedReason === 'daily_budget') return '일일 한도 보호'
  if (key.blockedReason === 'upstream_403') return 'KMA 403 차단'
  return '정상'
}

function KeyRow({ item }) {
  const [open, setOpen] = useState(false)
  const id = `api-hub-endpoints-${item.category}`
  const percentage = item.limitBytes ? Math.min(100, (item.bytes / item.limitBytes) * 100) : 0
  return h('div', { className: `admin-api-hub-row is-${item.status}` },
    h('button', { type: 'button', className: 'admin-api-hub-summary', onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-controls': id },
      h('span', { className: 'admin-api-hub-name' }, item.label),
      h('span', { className: 'admin-api-hub-value' }, `${gb(item.bytes)} / ${gb(item.limitBytes)}`),
      h('span', { className: 'admin-api-hub-status' }, status(item)),
      h('span', { className: 'admin-api-hub-chevron', 'aria-hidden': true }, open ? '⌃' : '⌄'),
    ),
    h('div', { className: 'admin-gauge-bar admin-api-hub-bar' }, h('span', { style: { width: `${percentage}%` } })),
    h('div', { className: 'admin-api-hub-meta' }, `호출 ${item.requests} · 성공 ${item.successes} · 실패 ${item.failures} · 마지막 ${time(item.lastCalledAt)}`),
    item.status === 'blocked' && h('div', { className: 'admin-api-hub-reset' }, `자동 재개: ${time(item.resetsAt)} KST`),
    open && h('div', { id, className: 'admin-api-hub-endpoints' },
      item.endpoints?.length
        ? sortEndpointUsage(item.endpoints).map((endpoint) => h('div', { className: 'admin-api-hub-endpoint', key: endpoint.label },
          h('span', null, endpoint.label), h('span', null, gb(endpoint.bytes)), h('span', null, `호출 ${endpoint.requests} · 실패 ${endpoint.failures}`), h('span', null, time(endpoint.lastCalledAt)),
        ))
        : h('p', { className: 'admin-empty' }, '오늘 기록된 API 호출이 없습니다.'),
    ),
  )
}

export default function ApiHubUsagePanel({ usage }) {
  return h('section', { className: 'admin-card admin-api-hub-usage' },
    h('div', { className: 'admin-card-head' }, h('h2', null, 'API Hub 사용량')),
    usage?.keys?.map((item) => h(KeyRow, { key: item.category, item })) || h('p', { className: 'admin-empty' }, '사용량 정보를 불러오는 중입니다.'),
  )
}
