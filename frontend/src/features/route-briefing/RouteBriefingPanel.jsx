import { KNOWN_AIRPORTS } from './lib/procedureData.js'
import { calcVfrDistance } from './lib/routePreview.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
  ROUTE_SEQUENCE_COLORS,
  buildIfrDistanceBreakdown,
  buildIfrSequenceTokens,
  getVfrAirportAltitudeFt,
} from './lib/routeBriefingModel.js'
import './RouteBriefing.css'

export default function RouteBriefingPanel({ state, refs = {}, derived, actions, airports = [] }) {
  const {
    routeForm,
    routeResult,
    routeError,
    routeLoading,
    cruiseAltitudeFt,
    verticalProfile,
    verticalProfileLoading,
    verticalProfileError,
    verticalProfileStale,
    editingVfrAltitudeIndex,
    vfrWaypoints,
    hoveredWpInfo,
    starOptions,
    selectedSid,
    selectedStar,
    iapCandidates,
    selectedIapKey,
    firInOptions,
    firExitOptions,
  } = state
  const { hideTimerRef } = refs
  const { isFirInMode, isFirExitMode, selectedIap, visibleSidOptions } = derived
  const {
    updateRouteField,
    handleDepartureAirportChange,
    handleArrivalAirportChange,
    handleEntryFixChange,
    handleExitFixChange,
    switchFlightRule,
    handleAutoRecommend,
    handleSidChange,
    handleStarChange,
    handleIapChange,
    handleRouteReset,
    deleteVfrWaypoint,
    handleRouteSearch,
    updateVfrWaypointAltitude,
    applyCruiseAltitudeToVfrWaypoints,
    handleVerticalProfileRequest,
    setHoveredWpInfo,
    setEditingVfrAltitudeIndex,
    setVerticalProfileWindowOpen,
    setCruiseAltitudeFt,
  } = actions

  return (
    <>
      {hoveredWpInfo && (
        <button
          className="vfr-wp-delete"
          style={{ left: hoveredWpInfo.x + 8, top: hoveredWpInfo.y - 16 }}
          onClick={() => deleteVfrWaypoint(hoveredWpInfo.idx)}
          onMouseEnter={() => clearTimeout(hideTimerRef?.current)}
          onMouseLeave={() => setHoveredWpInfo(null)}
        >X</button>
      )}

      <section className="route-check-panel" aria-label={'\uacbd\ub85c \ud655\uc778 \ud328\ub110'}>
        <div className="route-check-header">
          <div>
            <div className="route-check-eyebrow">Flight Plan</div>
            <div className="route-check-title">{'\uacbd\ub85c \ud655\uc778'}</div>
          </div>
          <span className="route-check-status">{routeForm.flightRule}</span>
        </div>
        <form className="route-check-form" onSubmit={handleRouteSearch}>
          <div className="route-check-section route-check-section--conditions">
            <div className="route-check-section-title">{'\uc6b4\ud56d \uc870\uac74'}</div>
            <div className="route-check-section-grid">
              <div className={`route-check-field route-check-flight-rule-field${routeForm.flightRule === 'VFR' ? ' full-width' : ''}`}>
                <div className="route-check-field-label">{'\ube44\ud589 \uaddc\uce59'}</div>
                <div className="route-check-flight-rule">
                  <label className={`route-check-radio route-check-flight-option${routeForm.flightRule === 'IFR' ? ' is-active' : ''}`}>
                    <input type="radio" name="flightRule" value="IFR" checked={routeForm.flightRule === 'IFR'} onChange={() => switchFlightRule('IFR')} />
                    <span>IFR</span>
                  </label>
                  <span className="route-check-flight-divider">/</span>
                  <label className={`route-check-radio route-check-flight-option${routeForm.flightRule === 'VFR' ? ' is-active' : ''}`}>
                    <input type="radio" name="flightRule" value="VFR" checked={routeForm.flightRule === 'VFR'} onChange={() => switchFlightRule('VFR')} />
                    <span>VFR</span>
                  </label>
                </div>
              </div>
              {routeForm.flightRule === 'IFR' && (
                <label>{'\uacbd\ub85c \uc720\ud615'}
                  <select value={routeForm.routeType} onChange={(e) => updateRouteField('routeType', e.target.value)}>
                    <option value="ALL">{'\uc804\uccb4'}</option>
                    <option value="RNAV">RNAV</option>
                    <option value="ATS">ATS</option>
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="route-check-section">
            <div className="route-check-section-title">{'\ucd9c\ubc1c'}</div>
            <div className="route-check-section-grid">
              <label>{'\ucd9c\ubc1c \uacf5\ud56d'}
                <select
                  value={routeForm.departureAirport === FIR_IN_AIRPORT ? FIR_IN_AIRPORT : KNOWN_AIRPORTS.includes(routeForm.departureAirport) ? routeForm.departureAirport : '__direct__'}
                  onChange={(e) => handleDepartureAirportChange(e.target.value === '__direct__' ? '' : e.target.value)}
                >
                  {KNOWN_AIRPORTS.map((ap) => <option key={ap} value={ap}>{ap}</option>)}
                  <option value={FIR_IN_AIRPORT}>FIR IN</option>
                  <option value="__direct__">{'\uc9c1\uc811 \uc785\ub825'}</option>
                </select>
                {!KNOWN_AIRPORTS.includes(routeForm.departureAirport) && routeForm.departureAirport !== FIR_IN_AIRPORT && (
                  <input className="proc-direct-input" value={routeForm.departureAirport} placeholder="ICAO" onChange={(e) => updateRouteField('departureAirport', e.target.value)} />
                )}
              </label>
              {routeForm.flightRule === 'IFR' && (
              <label>{isFirInMode ? '\uc9c4\uc785 FIX' : visibleSidOptions.length > 0 ? 'SID' : '\uc9c4\uc785 FIX'}
                {isFirInMode
                  ? (
                      <select
                      value={routeForm.entryFix}
                      onChange={(e) => handleEntryFixChange(e.target.value)}
                      disabled={firInOptions.length === 0}
                    >
                      {firInOptions.length === 0
                        ? <option value="">{'\uc9c4\uc785 FIX \uc5c6\uc74c'}</option>
                        : [
                            <option key="__empty__" value="">{'-- \uc5c6\uc74c --'}</option>,
                            ...firInOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>),
                          ]}
                    </select>
                  )
                  : visibleSidOptions.length > 0
                  ? (
                    <select value={selectedSid?.id ?? ''} onChange={(e) => {
                      const proc = visibleSidOptions.find((p) => p.id === e.target.value) ?? null
                      handleSidChange(proc)
                    }}>
                      <option value="">{'-- \uc5c6\uc74c --'}</option>
                      {visibleSidOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  )
                  : <input value={routeForm.entryFix} onChange={(e) => handleEntryFixChange(e.target.value)} />
                }
              </label>
              )}
            </div>
          </div>

          <div className="route-check-section">
            <div className="route-check-section-title">{'\ub3c4\ucc29'}</div>
            <div className="route-check-section-grid">
              <label>{'\ub3c4\ucc29 \uacf5\ud56d'}
                <select
                  value={
                    routeForm.arrivalAirport === FIR_EXIT_AIRPORT
                      ? FIR_EXIT_AIRPORT
                      : KNOWN_AIRPORTS.includes(routeForm.arrivalAirport)
                        ? routeForm.arrivalAirport
                        : '__direct__'
                  }
                  onChange={(e) => handleArrivalAirportChange(e.target.value === '__direct__' ? '' : e.target.value)}
                >
                  {KNOWN_AIRPORTS.map((ap) => <option key={ap} value={ap}>{ap}</option>)}
                  <option value={FIR_EXIT_AIRPORT}>FIR EXIT</option>
                  <option value="__direct__">{'\uc9c1\uc811 \uc785\ub825'}</option>
                </select>
                {!KNOWN_AIRPORTS.includes(routeForm.arrivalAirport) && routeForm.arrivalAirport !== FIR_EXIT_AIRPORT && (
                  <input className="proc-direct-input" value={routeForm.arrivalAirport} placeholder="ICAO" onChange={(e) => updateRouteField('arrivalAirport', e.target.value)} />
                )}
              </label>
              {routeForm.flightRule === 'IFR' && (
              <label>{isFirExitMode ? '\uc774\ud0c8 FIX' : starOptions.length > 0 ? 'STAR' : '\uc774\ud0c8 FIX'}
                {isFirExitMode
                  ? (
                    <select
                      value={routeForm.exitFix}
                      onChange={(e) => handleExitFixChange(e.target.value)}
                      disabled={firExitOptions.length === 0}
                    >
                      {firExitOptions.length === 0
                        ? <option value="">{'\uc774\ud0c8 FIX \uc5c6\uc74c'}</option>
                        : [
                            <option key="__empty__" value="">{'-- \uc5c6\uc74c --'}</option>,
                            ...firExitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>),
                          ]}
                    </select>
                  )
                  : starOptions.length > 0
                  ? (
                    <select value={selectedStar?.id ?? ''} onChange={(e) => {
                      const proc = starOptions.find((p) => p.id === e.target.value) ?? null
                      handleStarChange(proc)
                    }}>
                      <option value="">{'-- \uc5c6\uc74c --'}</option>
                      {starOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  )
                  : <input value={routeForm.exitFix} onChange={(e) => handleExitFixChange(e.target.value)} />
                }
              </label>
              )}
              {!isFirExitMode && iapCandidates.length > 1 && (
                <label>RWY
                  <select value={selectedIapKey ?? ''} onChange={(e) => {
                    handleIapChange(e.target.value)
                  }}>
                    {iapCandidates.map(({ key, label }) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className={`route-check-actions${routeForm.flightRule === 'VFR' ? ' is-vfr' : ''}`}>
            <button className="route-check-search-button" type="submit" disabled={routeLoading}>{routeLoading ? '\uac80\uc0c9 \uc911...' : '\uac80\uc0c9'}</button>
            {routeForm.flightRule === 'IFR' && (
              <button className="route-check-secondary-button" type="button" onClick={handleAutoRecommend} disabled={routeLoading}>{'\uc790\ub3d9\uac80\uc0c9'}</button>
            )}
            <button className="route-check-secondary-button" type="button" onClick={handleRouteReset} disabled={routeLoading}>{'\ucd08\uae30\ud654'}</button>
          </div>
        </form>
        {routeError && <div className="route-check-error">{routeError}</div>}
        {routeResult && (
          <div className="route-check-result">
            {routeResult.flightRule === 'IFR' && (() => {
              const displayTokens = buildIfrSequenceTokens(routeResult, { selectedSid, selectedStar, selectedIap })
              const { totalDistanceNm, items: distanceBreakdown } = buildIfrDistanceBreakdown({
                routeResult,
                selectedSid,
                selectedStar,
                selectedIap,
              })

              return (
                <>
                  <div className="route-check-total-dist">
                    {'\ucd1d \uac70\ub9ac'}: <strong>{totalDistanceNm} NM</strong>
                    {distanceBreakdown.length > 0 && (
                      <span className="dist-breakdown">
                        {' ('}
                        {distanceBreakdown.map((item, index) => (
                          <span key={`${item.kind}-${item.label}`}>
                            {index > 0 && <span className="dist-breakdown-sep">{' + '}</span>}
                            <span
                              className={`dist-breakdown-token is-${item.kind}`}
                              style={{ color: ROUTE_SEQUENCE_COLORS[item.kind] }}
                            >
                              {`${item.label} ${item.value.toFixed(1)}`}
                            </span>
                          </span>
                        ))}
                        {')'}
                      </span>
                    )}
                  </div>
                  <div className="route-check-sequence">
                    {displayTokens.map((token, index) => (
                      <span key={`${token.kind}-${token.text}-${index}`}>
                        {index > 0 && <span className="route-check-sequence-sep">{' -> '}</span>}
                        <span
                          className={`route-check-sequence-token is-${token.kind}`}
                          style={{ color: ROUTE_SEQUENCE_COLORS[token.kind] }}
                        >
                          {token.text}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )
            })()}
            {routeResult.flightRule === 'VFR' && vfrWaypoints.length >= 2 && (
              <>
                <div className="route-check-total-dist">
                  {'\ucd1d \uac70\ub9ac'}: <strong>{calcVfrDistance(vfrWaypoints).toFixed(1)} NM</strong>
                </div>
                <div className="vfr-altitude-tools">
                  <span>{'VFR WP \uacc4\ud68d\uace0\ub3c4'}</span>
                  <button type="button" onClick={applyCruiseAltitudeToVfrWaypoints}>
                    {'\uc21c\ud56d\uace0\ub3c4 \uc804\uccb4 \uc801\uc6a9'}
                  </button>
                </div>
                <div className="vfr-waypoint-altitude-list">
                  {vfrWaypoints.map((wp, index) => {
                    const fallbackAltitudeFt = Number(cruiseAltitudeFt)
                    const displayAltitudeFt = wp.fixed
                      ? getVfrAirportAltitudeFt(airports, wp)
                      : Number.isFinite(Number(wp.altitudeFt))
                      ? Number(wp.altitudeFt)
                      : fallbackAltitudeFt
                    const isEditing = !wp.fixed && editingVfrAltitudeIndex === index
                    return (
                      <div className="vfr-waypoint-altitude-row" key={`${wp.id}-${index}`}>
                        <span className="vfr-waypoint-altitude-id">{wp.id}</span>
                        {isEditing ? (
                          <input
                            className="vfr-waypoint-altitude-input"
                            type="number"
                            min="100"
                            step="100"
                            autoFocus
                            value={Number.isFinite(displayAltitudeFt) ? Math.round(displayAltitudeFt) : ''}
                            onChange={(e) => updateVfrWaypointAltitude(index, e.target.value)}
                            onBlur={() => setEditingVfrAltitudeIndex(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                              if (e.key === 'Escape') setEditingVfrAltitudeIndex(null)
                            }}
                          />
                        ) : wp.fixed ? (
                          <span className="vfr-waypoint-altitude-pill is-fixed" title="怨듯빆 ?쒓퀬">
                            {`${Math.round(displayAltitudeFt).toLocaleString()} ft`}
                          </span>
                        ) : (
                          <button
                            className="vfr-waypoint-altitude-pill"
                            type="button"
                            onClick={() => setEditingVfrAltitudeIndex(index)}
                          >
                            {Number.isFinite(displayAltitudeFt)
                              ? `${Math.round(displayAltitudeFt).toLocaleString()} ft`
                              : '\uace0\ub3c4 \uc785\ub825'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            <div className="vertical-profile-control">
              <label>
                <span>{'\uc21c\ud56d\uace0\ub3c4(ft)'}</span>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={cruiseAltitudeFt}
                  onChange={(e) => setCruiseAltitudeFt(e.target.value)}
                />
              </label>
              <button type="button" onClick={handleVerticalProfileRequest} disabled={verticalProfileLoading}>
                {verticalProfileLoading ? '\uc0dd\uc131 \uc911...' : '\uc5f0\uc9c1\ub2e8\uba74\ub3c4 \uc0dd\uc131'}
              </button>
            </div>
            {verticalProfileStale && (
              <div className="vertical-profile-stale">
                {'\uacbd\ub85c\uac00 \ubcc0\uacbd\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc5f0\uc9c1\ub2e8\uba74\ub3c4\ub97c \ub2e4\uc2dc \uc0dd\uc131\ud574\uc8fc\uc138\uc694.'}
              </div>
            )}
            {verticalProfileError && <div className="vertical-profile-error">{verticalProfileError}</div>}
            {verticalProfile && (
              <button
                className="vertical-profile-open-button"
                type="button"
                onClick={() => setVerticalProfileWindowOpen(true)}
              >
                {'\uc5f0\uc9c1\ub2e8\uba74\ub3c4 \uc5f4\uae30'}
              </button>
            )}
          </div>
        )}
      </section>
    </>
  )
}
