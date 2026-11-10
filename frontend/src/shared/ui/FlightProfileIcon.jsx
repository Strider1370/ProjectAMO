// 상승·순항·강하를 연직단면도 안의 선으로 표현한다.
export default function FlightProfileIcon({ size = 20, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2" y="5.5" width="20" height="13" rx="2" />
      <path d="M6 16 9 9.5h6l3 6.5" />
    </svg>
  )
}
