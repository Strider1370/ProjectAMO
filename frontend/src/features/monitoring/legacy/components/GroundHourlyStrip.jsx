import { getWeatherIconSrc } from '../../../../shared/weather/weather-icon-registry.js'
import { mapGroundForecastIcon } from './GroundForecastPanel.jsx'
import { createTemperatureScale, forecastColumnCenter, precipitationBar, selectHourlyForecastSlots } from '../utils/groundForecastViewModel.js'
const W=1015, H=430, LEFT=28, RIGHT=987, TEMP_TOP=155, TEMP_BOTTOM=250, PRECIP_TOP=155, PRECIP_BOTTOM=355
const hour = (time) => time ? `${Number(String(time).slice(0,2))}시` : '-'
const dateLabel = (date) => {
  const day = Number(String(date || '').slice(6, 8))
  return Number.isFinite(day) ? `${day}일` : null
}
export default function GroundHourlyStrip({ airport }) {
 const slots=selectHourlyForecastSlots(airport?.hourly || []), scale=createTemperatureScale(slots,{top:TEMP_TOP,bottom:TEMP_BOTTOM})
 const temperatures=slots.map((slot)=>slot?.temp).filter(Number.isFinite), minimumTemperature=Math.min(...temperatures), maximumTemperature=Math.max(...temperatures)
 const points=slots.map((s,i)=>{ const y=scale(s?.temp); return y==null?null:`${forecastColumnCenter(i,{start:LEFT,end:RIGHT,count:8})},${y}` }).filter(Boolean).join(' ')
 return <svg className="ground-hourly-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="시간별 기온과 강수확률"><title>시간별 기온과 강수확률</title><desc>8개 시간별 열의 기온과 강수확률</desc><polyline points={points} className="ghs-line" fill="none" />{slots.map((slot,index)=>{const x=forecastColumnCenter(index,{start:LEFT,end:RIGHT,count:8}), y=scale(slot?.temp), rain=precipitationBar(slot?.rainProb,{top:PRECIP_TOP,bottom:PRECIP_BOTTOM}), value=Number.isFinite(slot?.rainProb)?rain.value:'-', changed=index>0&&slot?.date!==slots[index-1]?.date, date=dateLabel(slot?.date), label=(index===0||changed)&&date?`${date} ${hour(slot?.time)}`:hour(slot?.time), extreme=slot?.temp===maximumTemperature?'is-max':slot?.temp===minimumTemperature?'is-min':''; return <g key={index} data-hourly-column={index} data-center-x={x}><text className={`ghs-time${index===0?' is-now':''}${changed?' is-daybreak':''}`} data-hourly-row="time" data-hourly-time x={x} y="45" textAnchor="middle">{label}</text>{slot?<image data-hourly-row="icon" data-hourly-icon href={getWeatherIconSrc(mapGroundForecastIcon(slot.icon))} x={x-34} y="58" width="68" height="68"/>:<text x={x} y="100" textAnchor="middle">-</text>}{y!=null&&<><circle className={`ghs-dot ${extreme}`} data-hourly-row="temp-dot" data-hourly-dot cx={x} cy={y} r="6"/><text className={`ghs-temp ${extreme}`} data-hourly-row="temp-label" data-hourly-temperature x={x} y={y-18} textAnchor="middle">{slot.temp}°</text></>}<rect data-hourly-row="precip-bar" x={x-12} y={rain.y} width="24" height={rain.height}/><text data-hourly-row="precip-label" data-hourly-precipitation x={x} y="405" textAnchor="middle">{value}{value==='-'?'':'%'}</text></g>})}</svg>
}
