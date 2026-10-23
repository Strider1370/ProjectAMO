import { useRef, useState, useLayoutEffect } from 'react'
import { Monitor, Smartphone, Signal, BatteryFull, Wifi } from 'lucide-react'

import AlertDeviceApp from './AlertDeviceApp.jsx'
import './AlertDeviceApp.css'

export default function DevicePreview({ kind, watches, history, popup, onAcknowledge, onDismiss, ...management }) {
  const phone = kind === 'phone'
  const presets = phone
    ? [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 430, height: 932 }]
    : [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1366, height: 768 }]
  const [presetIndex, setPresetIndex] = useState(0)
  const [zoom, setZoom] = useState('fit')
  const [availableWidth, setAvailableWidth] = useState(0)
  const previewHost = useRef(null)
  const viewport = presets[presetIndex]
  const frameWidth = viewport.width + 16
  const frameHeight = viewport.height + 16 + (phone ? 0 : 40)
  const scale = zoom === 'actual' ? 1 : Math.min(1, (availableWidth || frameWidth) / frameWidth)
  useLayoutEffect(() => {
    const host = previewHost.current
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])
  return <section className={`al-device-preview al-device-${kind}`} aria-label={phone ? '휴대폰 미리보기' : 'PC 미리보기'}>
    <h3>{phone ? <Smartphone size={18} /> : <Monitor size={18} />}{phone ? '휴대폰 · 푸시 미리보기' : '컴퓨터 · 웹 알림 미리보기'}</h3>
    <div className="al-device-tools">
      <label>화면 크기<select aria-label={phone ? '휴대폰 화면 크기' : 'PC 화면 크기'} value={presetIndex} onChange={event => setPresetIndex(Number(event.target.value))}>
        {presets.map((size, index) => <option key={index} value={index}>{size.width} × {size.height}</option>)}
      </select></label>
      <label>배율<select aria-label={phone ? '휴대폰 미리보기 배율' : 'PC 미리보기 배율'} value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">영역에 맞춤</option><option value="actual">100% · 원래 크기</option></select></label>
    </div>
    <a className="al-open-device" href={`?preview=${phone ? 'phone' : 'desktop'}`} target="_blank" rel="noreferrer">{phone ? '휴대폰 화면만 열기 ↗' : 'PC 화면만 열기 ↗'}</a>
    <p className="al-scale-label">{viewport.width} × {viewport.height} CSS px · 표시 배율 {Math.round(scale * 100)}%</p>
    <div className={`al-device-host ${zoom === 'actual' ? 'is-actual' : ''}`} ref={previewHost}>
    <div className="al-scaled-space" style={{ width: frameWidth * scale, height: frameHeight * scale }}>
    <div className="al-device-native" style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})`, '--device-width': `${viewport.width}px`, '--device-height': `${viewport.height}px` }}>
    <div className="al-device-frame">
      {phone && <div className="al-phone-status" aria-hidden="true"><span>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(popup?.time ?? Date.now())}</span><span className="al-camera" /><span><Signal size={13} /><Wifi size={13} /><BatteryFull size={16} /></span></div>}
      {!phone && <div className="al-browser-bar" aria-hidden="true"><span>● ● ●</span><span>ProjectAMO / 공항 감시</span></div>}
      <div className="al-device-screen">
        <AlertDeviceApp {...management} phone={phone} watches={watches} history={history} popup={popup} onAcknowledge={onAcknowledge} onDismiss={onDismiss} />
      </div>
      {phone && <div className="al-home-indicator" aria-hidden="true"><span /></div>}
    </div>
    {!phone && <div className="al-monitor-stand" aria-hidden="true"><span /></div>}
    </div></div></div>
    <p className="al-device-caption">{phone ? '잠금화면 알림을 누르면 관련 화면으로 이동합니다. 실제 푸시 발송은 아닙니다.' : '팝업을 누르면 관련 공항 또는 경로 화면으로 이동합니다.'}</p>
  </section>
}
