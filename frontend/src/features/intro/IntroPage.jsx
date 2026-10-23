// 소개 페이지(/, /intro).
// 스크롤 연출은 외부 라이브러리 없이 고정(sticky) 구간의 진행률로 그린다(lib/scrollTimeline.js).
import { useEffect, useRef, useState } from 'react'

import { buildLiveObservation } from './lib/liveObservation.js'
import { rememberDashboardEntry } from './introEntry.js'
import { approach, clamp01, easeInOut, easeOut, lerp, pinnedProgress, segment, stepIndex } from './lib/scrollTimeline.js'
import './IntroPage.css'

import imgMain from './assets/main.webp'
import imgHero from './assets/hero.webp'
import imgHumid0 from './assets/humid-0.webp'
import imgHumid1 from './assets/humid-1.webp'
import imgHumid2 from './assets/humid-2.webp'
import imgPrecip from './assets/precip.webp'
import imgTurb0 from './assets/turb-0.webp'
import imgTurb1 from './assets/turb-1.webp'
import imgTurb2 from './assets/turb-2.webp'
import imgSat0 from './assets/sat-0.webp'
import imgSat1 from './assets/sat-1.webp'
import imgSat2 from './assets/sat-2.webp'
import imgSat3 from './assets/sat-3.webp'
import imgAirport from './assets/airport.webp'
import imgModels from './assets/models.webp'
import imgRouteBefore from './assets/route-before.webp'
import imgRouteAfter from './assets/route-after.webp'
import imgCompare from './assets/compare.webp'
import imgPrep from './assets/prep.webp'
import imgResult from './assets/result.webp'
import imgProfile from './assets/profile.webp'
import imgMyMap from './assets/mymap.webp'
import imgLounge from './assets/lounge.webp'
import imgMonitoring from './assets/monitoring.webp'
import videoPrecip from './assets/precip.webm'
import videoAirport from './assets/airport.webm'

const NAV = [['gis', '기상정보'], ['airport', '공항'], ['brief', '브리핑'], ['custom', '맞춤형'], ['alerts', '알림']]
// 고정 구간 길이(화면 높이의 배수). 길수록 같은 연출을 천천히 스크롤한다.
const PIN_SCREENS = { gis: 4.8, brief: 4.8, custom: 3, alerts: 3.2 }

// 캡처 시각(2026-09-28 운영 서버 화면) 기준 레이어 시퀀스
const LAYERS = [
  { key: 'base', label: '기본 지도', frames: [[imgMain, null]] },
  { key: 'humid', label: '습도', frames: [[imgHumid0, '01:00 KST'], [imgHumid1, '02:00 KST'], [imgHumid2, '03:00 KST']], alt: 'KIM 습도 예보' },
  { key: 'precip', label: '강수와 등압선', video: videoPrecip, poster: imgPrecip, alt: 'KIM 지상일기도: 강수, 등압선, 바람 입자' },
  { key: 'turb', label: '난류', frames: [[imgTurb0, '03:00 KST'], [imgTurb1, '06:00 KST'], [imgTurb2, '09:00 KST']], alt: 'KIM 난류(GKTG) 예보' },
  { key: 'sat', label: '적외 위성', frames: [[imgSat0, '21:30 KST'], [imgSat1, '22:30 KST'], [imgSat2, '23:30 KST'], [imgSat3, '00:30 KST']], alt: '적외 위성 영상' },
]
// 목록은 위에서부터(맨 위 레이어 먼저) 보여 준다.
const LEGEND = [
  ['linear-gradient(90deg,#222,#EEE)', '적외 위성, 천리안위성 2A호'],
  ['linear-gradient(90deg,#3DB24B,#F2C230,#E07B22)', '난류, KIM GKTG'],
  ['linear-gradient(90deg,#A7D3F5,#3D8BD9,#1F4FA8)', '강수와 등압선, 바람, KIM 지상일기도'],
  ['linear-gradient(90deg,#DDEBD8,#7FB78C,#2F7D5B)', '습도, KIM'],
  ['#DCE6EE', '기본 지도와 공항, FIR'],
]
const BRIEF_TABS = ['경로 생성', '경로 비교', '브리핑 준비', '비행 전 브리핑', '연직단면도']
const BRIEF_STEPS = [0.22, 0.38, 0.56, 0.76]
// 경로 생성 장면: 전체 화면에서 경로가 찍힌 뒤 왼쪽 패널 자리로 확대된다. 확대가 끝나는 자리는
// 경로 비교 이후 캡처와 같은 영역(화면 x 56~1112, y 0~660 / 1600×1000)이라 이음새 없이 넘어간다.
const ROUTE_ZOOM = 1600 / 1056
const ROUTE_ZOOM_ORIGIN = `${((ROUTE_ZOOM * (56 / 1600)) / (ROUTE_ZOOM - 1)) * 100}% 0%`

function Arrow() {
  return (
    <svg className="arr" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Frame({ title, children, className = '', ...rest }) {
  return (
    <div className={`frame ${className}`} {...rest}>
      <div className="frame-bar"><i /><i /><i /><span>{title}</span></div>
      {children}
    </div>
  )
}

function Callout({ x, y, side, children }) {
  return <span className="pt" data-side={side} style={{ '--x': x, '--y': y }}><i /><em>{children}</em></span>
}

function LoopVideo({ src, poster, label }) {
  return <video src={src} poster={poster} muted loop playsInline autoPlay preload="auto" aria-label={label} />
}

function Sequence({ frames, alt }) {
  return (
    <>
      <div className="seq" data-times={frames.map(([, time]) => time).join(',')}>
        {frames.map(([src], index) => <img key={src} src={src} alt={index === 0 ? alt : ''} className={index === 0 ? 'on' : undefined} />)}
      </div>
      <span className="stamp">{frames[0][1]}</span>
    </>
  )
}

export default function IntroPage() {
  const rootRef = useRef(null)
  const [live, setLive] = useState(null)
  const [motion, setMotion] = useState(false)
  const [compact, setCompact] = useState(false)
  const [activeNav, setActiveNav] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    document.title = 'ProjectAMO · 통합형 항공기상정보 브리핑 플랫폼'
    const controller = new AbortController()
    fetch('/api/metar', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setLive(buildLiveObservation(payload)))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // 움직임 줄이기를 켜지 않았으면 스크롤 연출을 쓴다. 좁은 화면(compact)은 그림 영역만 화면에 붙인다.
  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: no-preference)')
    const compactQuery = window.matchMedia('(max-width: 899px)')
    const update = () => { setMotion(motionQuery.matches); setCompact(compactQuery.matches) }
    update()
    motionQuery.addEventListener('change', update)
    compactQuery.addEventListener('change', update)
    return () => {
      motionQuery.removeEventListener('change', update)
      compactQuery.removeEventListener('change', update)
    }
  }, [])

  // 시간대 캡처를 서서히 바꾸고, 영상은 보일 때만 재생한다.
  useEffect(() => {
    const root = rootRef.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cleanups = []
    const videos = [...root.querySelectorAll('video')]
    if (reduce) {
      videos.forEach((video) => { video.removeAttribute('autoplay'); video.pause() })
    } else {
      const videoObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.play().catch(() => {})
        else entry.target.pause()
      }), { root, threshold: 0.15 })
      videos.forEach((video) => videoObserver.observe(video))
      cleanups.push(() => videoObserver.disconnect())
      root.querySelectorAll('.seq').forEach((seq) => {
        const images = [...seq.querySelectorAll('img')]
        const times = seq.dataset.times.split(',')
        const stamp = seq.parentElement.querySelector('.stamp')
        let index = 0
        let timer = null
        const step = () => {
          images[index].classList.remove('on')
          index = (index + 1) % images.length
          images[index].classList.add('on')
          if (stamp) stamp.textContent = times[index]
        }
        const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting && !timer) timer = setInterval(step, 1900)
          else if (!entry.isIntersecting && timer) { clearInterval(timer); timer = null }
        }, { root, threshold: 0.1 })
        observer.observe(seq)
        cleanups.push(() => { observer.disconnect(); clearInterval(timer) })
      })
    }
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  // 스크롤 위치에 따라 상단 메뉴 강조와 모든 고정 구간 연출을 그린다.
  useEffect(() => {
    const root = rootRef.current
    const $ = (selector) => root.querySelector(selector)
    const $$ = (selector) => [...root.querySelectorAll(selector)]
    const sections = NAV.map(([id]) => [id, root.querySelector(`#${id}`)])

    const onScroll = () => {
      const top = root.scrollTop
      setScrolled(top > 40)
      const probe = top + root.clientHeight * 0.5
      let current = null
      for (const [id, element] of sections) if (element && element.offsetTop <= probe) current = id
      setActiveNav(current)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    if (!motion) return () => root.removeEventListener('scroll', onScroll)

    // 요소 참조
    const heroShot = $('.hero-shot')
    const tilt = $('.tilt')
    const heroCallouts = $$('#co-hero .pt')
    const stack = $('#gis .stack')
    const layers = $$('#gis .layer')
    const layerLabels = $$('#gis .plane-label')
    const layerNow = $('#gis .now')
    const legend = $$('#gis .legend li')
    const pairSecond = $('.pair figure:last-child')
    const pairEl = $('.pair')
    const briefFrames = [1, 2, 3, 4, 5].map((n) => $(`#br-${n}`))
    const briefTabStrip = $('#brief .tabs')
    const briefTabs = $$('#brief .tabs span')
    let briefTabShown = -1
    const routeAfter = $('#br-1 .route-after')
    const routeZoom = $('#br-1 .zoom-in')
    const briefCallouts4 = $$('#br-4 .pt')
    const briefCallouts5 = $$('#br-5 .pt')
    const customFrames = [$('#cu-1'), $('#cu-2')]
    const notis = $$('.noti').reverse() // 오래된 알림부터 도착해 위에 쌓인다
    const notiHeights = notis.map((noti) => noti.scrollHeight)

    const pinned = Object.keys(PIN_SCREENS).map((id) => {
      const element = root.querySelector(`#${id}`)
      return { id, element, copy: element.querySelector('.copy'), stage: element.querySelector('.stage'), shown: -1 }
    })
    // 좁은 화면에서는 설명이 먼저 지나간 뒤 그림 영역이 붙는다. 그만큼 늦게 시작한다.
    const leadOf = (pin) => {
      if (!compact) return 0
      const gap = parseFloat(getComputedStyle(pin.copy.parentElement).rowGap) || 0
      return pin.copy.offsetTop + pin.copy.offsetHeight + gap - (parseFloat(getComputedStyle(pin.stage).top) || 0)
    }
    // 연출이 바꾼 인라인 속성만 기록해 두었다가 끌 때 되돌린다(React가 넣은 스타일은 건드리지 않는다).
    const touched = new Set()
    const css = (element, props) => { touched.add(element); Object.assign(element.style, props) }
    const setOn = (items, predicate) => items.forEach((item, index) => item.classList.toggle('on', predicate(index)))
    const popIn = (items, t) => items.forEach((item, index) => {
      const e = easeOut(segment(t, index * 0.25, index * 0.25 + 0.5))
      css(item, { opacity: e, transform: `scale(${lerp(0.6, 1, e)})` })
    })

    const render = {
      gis(p) {
        const appear = segment(p, 0, 0.22)
        const collapse = easeInOut(segment(p, 0.3, 0.5))
        css(stack, { transform: `rotateX(${56 * (1 - collapse)}deg) rotateZ(${-34 * (1 - collapse)}deg) scale(${lerp(0.7, 1, collapse)})` })
        const zStep = compact ? stack.offsetWidth * 0.12 : 110
        let top = 0
        // 레이어는 기본 지도(0) 위로 습도, 강수, 난류, 위성(4) 순서다. 합친 뒤 위성부터 한 장씩 걷어 낸다.
        const peelRanges = [null, null, [0.84, 0.92], [0.7, 0.78], [0.56, 0.64]]
        layers.forEach((layer, index) => {
          const shown = index === 0 ? 1 : segment(appear, (index - 1) / 4, index / 4)
          const peeled = peelRanges[index] ? segment(p, ...peelRanges[index]) : 0
          if (shown * (1 - peeled) > 0.5) top = index
          css(layer, { opacity: shown * (1 - peeled), transform: `translateZ(${(index - 2) * zStep * (1 - collapse)}px)` })
          css(layerLabels[index], { opacity: shown * (1 - segment(collapse, 0, 0.3)) })
        })
        if (layerNow.textContent !== LAYERS[top].label) layerNow.textContent = LAYERS[top].label
        if (p < 0.22) {
          const count = 1 + Math.floor(appear * 4.99)
          setOn(legend, (index) => 4 - index < count)
        } else {
          const active = stepIndex(p, [0.6, 0.74, 0.88])
          setOn(legend, (index) => index === active)
        }
      },
      brief(p) {
        // 공항만 고른 화면 → 경로가 찍힌 화면 → 왼쪽 패널 쪽으로 확대 → 경로 비교
        css(routeAfter, { opacity: easeOut(segment(p, 0.05, 0.11)) })
        css(routeZoom, { transform: `scale(${lerp(1, ROUTE_ZOOM, easeInOut(segment(p, 0.13, 0.21)))})` })
        css(briefFrames[1], { opacity: segment(p, 0.22, 0.26) })
        css(briefFrames[2], { opacity: segment(p, 0.38, 0.44) })
        const result = easeOut(segment(p, 0.56, 0.64))
        css(briefFrames[3], { opacity: result, transform: `translateX(${6 * (1 - result)}%)` })
        popIn(briefCallouts4, segment(p, 0.64, 0.72))
        const profile = easeOut(segment(p, 0.76, 0.84))
        css(briefFrames[4], { opacity: profile, transform: `translateY(${12 * (1 - profile)}%)` })
        popIn(briefCallouts5, segment(p, 0.84, 0.94))
        const tab = stepIndex(p, BRIEF_STEPS)
        setOn(briefTabs, (index) => index === tab)
        // 좁은 화면에서는 탭 줄이 잘리므로 지금 단계 탭이 보이게 옆으로 민다.
        if (compact && tab !== briefTabShown) {
          briefTabShown = tab
          briefTabStrip.scrollTo({ left: briefTabs[tab].offsetLeft - briefTabStrip.offsetLeft - 16, behavior: 'smooth' })
        }
      },
      custom(p) {
        const e = easeInOut(segment(p, 0.3, 0.65))
        css(customFrames[0], { opacity: 1 - e, transform: `scale(${1 - 0.16 * e})` })
        const lounge = easeInOut(segment(p, 0.35, 0.7))
        css(customFrames[1], { opacity: lounge, transform: `scale(${1.06 - 0.06 * lounge})` })
      },
      alerts(p) {
        notis.forEach((noti, index) => {
          const e = easeOut(segment(p, 0.15 + index * 0.25, 0.27 + index * 0.25))
          css(noti, { height: `${notiHeights[index] * e}px`, opacity: e })
          css(noti.firstElementChild, { transform: `translateY(${-18 * (1 - e)}px) scale(${lerp(0.96, 1, e)})` })
        })
      },
    }

    let frame = 0
    const tick = () => {
      const top = root.scrollTop
      const viewport = root.clientHeight
      let moving = false
      for (const pin of pinned) {
        const lead = leadOf(pin)
        const target = pinnedProgress(top - lead, pin.element.offsetTop, pin.element.offsetHeight - lead, viewport)
        const next = pin.shown < 0 ? target : approach(pin.shown, target)
        if (next !== pin.shown) { pin.shown = next; render[pin.id](next) }
        if (next !== target) moving = true
      }
      // 넓은 화면: 첫 화면 오른쪽에 기울어 있던 캡처가 스크롤하면 평평하게 펴진다. 말풍선은 처음부터 보인다.
      // 좁은 화면: 캡처가 글 아래에 있으므로 화면에 들어오며 선다.
      if (compact) {
        const heroP = clamp01((viewport * 0.9 - heroShot.getBoundingClientRect().top) / (viewport * 0.65))
        css(tilt, { transform: `rotateX(${20 * (1 - heroP)}deg) scale(${lerp(0.94, 1, heroP)})` })
        popIn(heroCallouts, segment(heroP, 0.6, 1))
      } else {
        const heroP = clamp01(top / (viewport * 0.55))
        css(tilt, { transform: `rotateY(${-16 * (1 - heroP)}deg) rotateX(${5 * (1 - heroP)}deg) scale(${lerp(0.97, 1, heroP)})` })
        popIn(heroCallouts, 1)
      }
      if (pairEl) {
        const rect = pairEl.getBoundingClientRect()
        const through = clamp01((viewport - rect.top) / (viewport + rect.height))
        css(pairSecond, { transform: `translateY(${lerp(70, -10, through)}px)` })
      }
      frame = moving ? requestAnimationFrame(tick) : 0
    }
    const request = () => { if (!frame) frame = requestAnimationFrame(tick) }
    root.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    request()

    return () => {
      root.removeEventListener('scroll', onScroll)
      root.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      cancelAnimationFrame(frame)
      // 연출을 끄면 바꾼 속성을 되돌려 일반 흐름(최종 상태)으로 보인다.
      touched.forEach((element) => { element.style.opacity = ''; element.style.transform = ''; element.style.height = '' })
    }
  }, [motion, compact])

  // 대시보드 열기: 누른 자리에서 원이 퍼진 뒤 대시보드로 이동한다.
  const enterDashboard = (event, skipFuture = false) => {
    rememberDashboardEntry({ skipFuture, localStorage: window.localStorage, sessionStorage: window.sessionStorage })
    const rect = event.currentTarget.getBoundingClientRect()
    const overlay = rootRef.current.querySelector('.enter')
    overlay.style.setProperty('--cx', `${rect.left + rect.width / 2}px`)
    overlay.style.setProperty('--cy', `${rect.top + rect.height / 2}px`)
    setEntering(true)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => window.location.assign('/dashboard'), reduce ? 0 : 750)
  }

  const scrollToId = (event, id) => {
    event.preventDefault()
    const root = rootRef.current
    const target = id === 'top' ? 0 : root.querySelector(`#${id}`).offsetTop
    root.scrollTo({ top: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  // 연출이 없으면 단계 탭 대신 창 제목으로 단계를 알린다.
  const briefTitle = (index) => (motion ? '비행 계획' : BRIEF_TABS[index])
  const pinStyle = (id) => {
    if (!motion) return undefined
    return compact ? { '--pin': PIN_SCREENS[id] } : { height: `${PIN_SCREENS[id] * 100}vh` }
  }
  const navIndex = NAV.findIndex(([id]) => id === activeNav)

  return (
    <div ref={rootRef} className={`intro${motion ? ' motion' : ''}`}>
      <header className={`top${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap top-in">
          <a className="lockup" href="#top" onClick={(event) => scrollToId(event, 'top')}><b>ProjectAMO</b><span>통합형 항공기상정보 브리핑 플랫폼</span></a>
          <nav className="lnav" aria-label="페이지 구간">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className={activeNav === id ? 'on' : undefined} onClick={(event) => scrollToId(event, id)}>{label}</a>
            ))}
            <NavIndicator index={navIndex} />
          </nav>
          <button className="btn btn-primary btn-sm" type="button" onClick={enterDashboard}>대시보드 열기</button>
        </div>
      </header>

      <main>
        <section className="band hero" id="top" aria-labelledby="intro-title">
          <div className="wrap hero-grid">
            <div className="hero-copy">
            <h1 id="intro-title" className="hero-anim">항공기상, 지도 한&nbsp;장으로 확인하세요</h1>
            <p className="lede hero-anim" style={{ animationDelay: '.09s' }}>레이더와 위성, 수치예보부터 METAR, TAF, SIGMET까지 비행 전에 필요한 기상정보를 한 화면에서 보고, 경로별 브리핑까지 받을 수 있어요.</p>
            <div className="actions hero-anim" style={{ animationDelay: '.18s' }}>
              <button className="btn btn-primary" type="button" onClick={enterDashboard}>대시보드 열기<Arrow /></button>
              <a className="btn btn-line" href="#gis" onClick={(event) => scrollToId(event, 'gis')}>기능 살펴보기</a>
            </div>
            <button className="skip-intro hero-anim" type="button" onClick={(event) => enterDashboard(event, true)} style={{ animationDelay: '.22s' }}>다음부터 이 화면 보지 않기</button>
            {live && (
              <p className="live hero-anim" style={{ animationDelay: '.27s', '--vfr': live.color }}>
                <i className="dot" aria-hidden="true" />
                <b>인천</b>
                <span className="cat">{live.category}</span>
                <span>{live.observed}</span>
                {live.details.map((detail) => <span key={detail}>{detail}</span>)}
              </p>
            )}
            <p className="news hero-anim" style={{ animationDelay: '.36s' }}><b>v0.6.0</b>지도 위에서 보는 비행 전 브리핑과 공항 카드가 추가됐어요. 2026년 10월 23일</p>
            </div>
            {/* 첫 화면 오른쪽에 제품 화면을 크게, 기울여 둔다. 스크롤하면 평평하게 펴진다(넓은 화면). */}
            <div className="hero-shot hero-anim" style={{ animationDelay: '.3s' }}>
              <div className="tilt">
                <Frame title="ProjectAMO">
                  <img src={imgHero} alt="인천에서 제주로 가는 지도형 비행 전 브리핑: 레이더 위 경로, 위험기상 요약, 경로상 위험 막대와 연직단면도" />
                  <div className="co" id="co-hero">
                    <Callout x="20.2%" y="30%">내 고도에 걸리는 위험을 차례로 요약해요</Callout>
                    <Callout x="61.8%" y="45%" side="left">공항 카드에 METAR·TAF</Callout>
                    <Callout x="32%" y="58.4%" side="up">경로를 따라 위험 구간을 막대로</Callout>
                    <Callout x="40%" y="79%">연직단면도에 난류·착빙·SIGMET을 고도별로</Callout>
                  </div>
                </Frame>
              </div>
            </div>
          </div>
        </section>

        <section className="band grey pin" id="gis" style={pinStyle('gis')} aria-labelledby="gis-title">
          <div className="wrap feature">
            <div className="copy">
              <h2 id="gis-title">지난 관측부터 30시간 예보까지 한 지도에서</h2>
              <p>위성, 레이더, 낙뢰, KIM 수치예보의 강수와 구름·착빙, 난류, 권계면·제트, SIGWX까지 20여 종의 레이어를 필요한 만큼 겹쳐 보세요. 하단 타임라인으로 지난 관측과 앞으로의 예보를 이어서 넘겨볼 수 있어요.</p>
              <ul className="legend">
                {LEGEND.map(([swatch, label]) => <li key={label}><i style={{ background: swatch }} />{label}</li>)}
              </ul>
            </div>
            <div className="stage">
              <p className="now" aria-hidden="true">{LAYERS[0].label}</p>
              <div className="layers-stage">
                <div className="stack fit">
                  {LAYERS.map((layer) => (
                    <div key={layer.key} className="layer">
                      {layer.video ? <LoopVideo src={layer.video} poster={layer.poster} label={layer.alt} />
                        : layer.frames.length > 1 ? <Sequence frames={layer.frames} alt={layer.alt} />
                          : <img src={layer.frames[0][0]} alt="" />}
                      <span className="plane-label">{layer.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="band" id="airport" aria-labelledby="apt-title">
          <div className="wrap">
            <div className="pair-head">
              <h2 id="apt-title">공항을 누르면 METAR, TAF, AMOS가 한 번에</h2>
              <p>공항별 관측과 예보를 한 패널에서 보고, TAF와 KIM, ECMWF, GFS, ICON 네 가지 모델 예보를 같은 시각 기준으로 비교할 수 있어요.</p>
            </div>
            <div className="pair">
              <figure>
                <Frame title="공항 패널"><LoopVideo src={videoAirport} poster={imgAirport} label="인천국제공항 공항 패널에서 METAR, TAF, AMOS 탭을 넘기는 화면" /></Frame>
                <figcaption><b>공항 패널</b>METAR, TAF, AMOS, NOTAM을 탭으로 나눠 보여줘요.</figcaption>
              </figure>
              <figure>
                <Frame title="상세 예보 분석"><img src={imgModels} alt="인천국제공항 상세 예보 분석: 모델별 지상 바람 비교" /></Frame>
                <figcaption><b>상세 예보 분석</b>모델마다 다른 예보를 표와 그래프로 나란히 비교해요.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="band grey pin" id="brief" style={pinStyle('brief')} aria-labelledby="brief-title">
          <div className="wrap feature">
            <div className="copy">
              <h2 id="brief-title">경로만 입력하면 브리핑이 정리돼요</h2>
              <p>출발·도착 공항과 교체공항을 고르면 SID와 STAR를 포함한 경로를 자동으로 만들어요. 브리핑은 지도 위에서 열려 내 고도에 걸리는 위험을 차례로 요약하고, 경로를 따라 현상별 위험 구간과 연직단면도, 공항 카드의 METAR·TAF를 함께 보여줘요. 내 미니마 기준으로 이륙 가부까지 확인할 수 있어요.</p>
            </div>
            <div className="stage">
              <div className="tabs fit" aria-hidden="true">
                {BRIEF_TABS.map((tab, index) => <span key={tab} className={index === 0 ? 'on' : undefined}>{tab}</span>)}
              </div>
              <div className="flow fit">
                <Frame id="br-1" title={briefTitle(0)}>
                  <div className="zoom">
                    <div className="zoom-in" style={{ transformOrigin: ROUTE_ZOOM_ORIGIN }}>
                      <img className="route-before" src={imgRouteBefore} alt="" />
                      <img className="route-after" src={imgRouteAfter} alt="경로 생성: 인천에서 제주, 교체 김해. 자동 생성한 SID, 항로, STAR가 경로칸에 알약으로 들어가고 지도에 경로가 그려진 화면" />
                    </div>
                  </div>
                </Frame>
                <Frame id="br-2" title={briefTitle(1)}><img src={imgCompare} alt="경로 비교: 총 거리 330NM, 소요시간 44분, 위험기상 2건" /></Frame>
                <Frame id="br-3" title={briefTitle(2)}><img src={imgPrep} alt="브리핑 준비: 출발, 도착 시각과 순항고도, 교체공항" /></Frame>
                <Frame id="br-4" title="비행 전 브리핑">
                  <img src={imgResult} alt="인천에서 제주로 가는 지도형 비행 전 브리핑: 위험 요약 카드와 공항 카드, 경로상 위험 막대" />
                  <div className="co">
                    <Callout x="25.8%" y="46%">내 고도에 걸리는 위험을 차례로</Callout>
                    <Callout x="53%" y="86%" side="up">경로상 위험 구간과 SIGMET</Callout>
                  </div>
                </Frame>
                <Frame id="br-5" title="연직단면도">
                  <img src={imgProfile} alt="경로 연직단면도: 순항고도에 걸린 SIGMET 심한 난류 구간, 착빙 구역, 난류 강도" />
                  <div className="co">
                    <Callout x="50.7%" y="36.4%" side="up">내 고도에 걸린 SIGMET 심한 난류</Callout>
                    <Callout x="75.6%" y="67%" side="left">착빙 구역</Callout>
                    <Callout x="55.4%" y="76.6%" side="left">난류 강도(GKTG)</Callout>
                  </div>
                </Frame>
              </div>
            </div>
          </div>
        </section>

        <section className="band pin" id="custom" style={pinStyle('custom')} aria-labelledby="custom-title">
          <div className="wrap feature">
            <div className="copy">
              <h2 id="custom-title">자주 쓰는 경로와 구역은 내 지도에</h2>
              <p>KML 파일을 올리거나 지도에 직접 그려 나만의 레이어를 만들 수 있어요. 기관 라운지에서는 비행계획을 공유하고 합동 브리핑을 진행할 수 있어요.</p>
            </div>
            <div className="stage">
              <div className="flow fit">
                <Frame id="cu-1" title="내 지도"><img src={imgMyMap} alt="내 지도 패널: 새 지도 그리기, 파일 불러오기" /></Frame>
                <Frame id="cu-2" title="기관 라운지"><img src={imgLounge} alt="기관 라운지 미리보기: 예정 비행, 공지, 라운지 지도" /></Frame>
              </div>
            </div>
          </div>
        </section>

        <section className="band grey pin" id="alerts" style={pinStyle('alerts')} aria-labelledby="alerts-title">
          <div className="wrap feature">
            <div className="copy">
              <h2 id="alerts-title">지정한 공항과 경로에 변화가 생기면 알려드려요</h2>
              <p>공항 패널이나 경로 생성 화면의 종 버튼으로 감시 조건을 정해 두면, METAR 기준 도달, 새 TAF·AMD 발표, 공항경보와 주변 낙뢰, 경로에 걸리는 SIGMET을 웹 팝업과 휴대폰 푸시로 알려드려요. 알림을 누르면 해당 공항이나 경로의 그 자료로 바로 이동해요.</p>
              <p>벽면 모니터용 상황판에서는 공항 상태를 한눈에 볼 수 있어요.</p>
            </div>
            <div className="stage">
              <div className="alerts-vis">
                <Frame title="상황판"><img src={imgMonitoring} alt="상황판: 인천국제공항 METAR와 TAF" /></Frame>
                <div className="phone">
                  <div className="phone-screen">
                    <div className="lock"><div className="lock-date">9월 23일 수요일</div><div className="lock-time">14:20</div></div>
                    <div className="phone-tag">알림 예시</div>
                    <div className="notis">
                      <Notification when="지금" title="SIGMET · RKSI → RKPC" body="심한 착빙 FL150–230이 경로 2구간과 겹쳐요. 13:00–17:00 KST" />
                      <Notification when="6분 전" title="RKSI TAF AMD 발표" body="230520Z · TEMPO 2306/2309 27018G28KT 2000 +TSRA BKN008" />
                      <Notification when="8분 전" title="RKPC METAR 기준 도달" body="시정 1200m(기준 1600m) · 운고 400ft(기준 500ft) · 14:00 KST 관측" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="band" aria-labelledby="src-title">
          <div className="wrap sources">
            <h2 id="src-title">어디서 온 자료인지 모두 표시해요</h2>
            <p>기상청 관측과 수치예보, 해외 모델 자료를 사용하고, 화면의 모든 자료에 발표 시각과 유효 시각을 함께 보여드려요.</p>
            <table className="src-table">
              <tbody>
                <tr><th>레이더, 낙뢰, 지상 관측</th><td>기상청</td></tr>
                <tr><th>위성 영상, 대류 가능성, 운정고도</th><td>천리안위성 2A호 (국가기상위성센터)</td></tr>
                <tr><th>KIM 수치예보</th><td>기상청 (난류 GKTG는 KIM 자료로 계산)</td></tr>
                <tr><th>METAR, TAF, SIGMET, AIRMET, SIGWX, AMOS</th><td>항공기상청</td></tr>
                <tr><th>해외 모델 비교</th><td>ECMWF, NOAA GFS, DWD ICON</td></tr>
                <tr><th>해외 레이더</th><td>RainViewer</td></tr>
                <tr><th>항로, 절차, 공역</th><td>항공정보간행물(AIP), 국토교통부</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="cta" aria-labelledby="cta-title">
          <div className="wrap">
            <div><h2 id="cta-title">지금 바로 확인해 보세요</h2><p>로그인 없이 대시보드를 볼 수 있어요.</p></div>
            <p className="cta-note" role="note">ProjectAMO는 시험 운영 중인 프로토타입이며 기상청 공식 서비스가 아니에요. 자료가 늦거나 빠지거나 틀릴 수 있으니, <b>실제 운항 판단에는 항공기상청 공식 자료와 정식 브리핑을 기준으로 하세요.</b></p>
            <button className="btn btn-white" type="button" onClick={enterDashboard}>대시보드 열기<Arrow /></button>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap foot-bottom">
          <b className="foot-name">ProjectAMO</b>
          <span>통합형 항공기상정보 브리핑 플랫폼</span>
          <span>현재 버전 v0.6.0, 2026년 10월 23일 업데이트</span>
        </div>
      </footer>

      <div className={`enter${entering ? ' open' : ''}`} aria-hidden={!entering}>
        <Frame title="ProjectAMO"><img src={imgMain} alt="" /></Frame>
      </div>
    </div>
  )
}

function Notification({ when, title, body }) {
  return (
    <div className="noti">
      <div className="noti-in">
        <small><i className="app-icon" aria-hidden="true" /><span>ProjectAMO</span><span className="when">{when}</span></small>
        <b>{title}</b><br />{body}
      </div>
    </div>
  )
}

// 상단 메뉴 밑줄. 보고 있는 구간의 메뉴로 미끄러진다.
function NavIndicator({ index }) {
  const ref = useRef(null)
  useEffect(() => {
    const indicator = ref.current
    const link = index >= 0 ? indicator.parentElement.children[index] : null
    if (!link) { indicator.style.opacity = 0; return }
    indicator.style.opacity = 1
    indicator.style.left = `${link.offsetLeft + 10}px`
    indicator.style.width = `${link.offsetWidth - 20}px`
  }, [index])
  return <span ref={ref} className="lnav-ind" aria-hidden="true" />
}
