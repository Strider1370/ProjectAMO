import { assignTyphoonColors } from './typhoonColors.js'

// 목록 모델. 렌더와 분리해 두어야 JSX 변환 없이 테스트할 수 있다.
export function buildTyphoonListItems(typhoons = []) {
  const colors = assignTyphoonColors(typhoons.map((t) => t.number))
  return typhoons.map((typhoon) => ({
    number: typhoon.number,
    color: colors[typhoon.number],
    // 이름은 typ_lst에서 온다. 못 받았으면 번호만 쓴다.
    title: typhoon.name ? `${typhoon.number}호 태풍 ${typhoon.name}` : `${typhoon.number}호 태풍`,
    name: typhoon.name ?? null,
    pressureHpa: typhoon.current?.pressureHpa ?? null,
    maxWindMs: typhoon.current?.maxWindMs ?? null,
    location: typhoon.current?.location ?? '',
    analyzedAt: typhoon.analyzedAt,
    center: { lat: typhoon.current?.lat, lon: typhoon.current?.lon },
  }))
}

export default { buildTyphoonListItems }
