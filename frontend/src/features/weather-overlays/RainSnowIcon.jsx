// 강수 형태(HCI) 타일 아이콘: 구름 아래 비(물방울) / 눈(눈송이). lucide에 비·눈을 함께 보여주는
// 모양이 없어 직접 그린다. 구름은 다른 타일 아이콘과 같은 두께, 물방울·슬래시·눈송이는 60% 두께다.
export default function RainSnowIcon({ size = 24, strokeWidth = 2, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 12.4A6.3 6.3 0 1 1 14.6 6.2h1.6a4 4 0 0 1 2.4 7.3" />
      <g strokeWidth={strokeWidth * 0.6}>
        <path d="M7.5 15.18c-1.36 1.96-2.38 3.06-2.38 4.42a2.38 2.38 0 0 0 4.76 0c0-1.36-1.02-2.46-2.38-4.42z" />
        <path d="M13.5 12.5 10.5 22" />
        <path d="M17 14.6v6.8M14.06 16.3l5.88 3.4M14.06 19.7l5.88-3.4" />
      </g>
    </svg>
  )
}
