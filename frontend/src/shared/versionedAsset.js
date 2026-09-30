// 이름이 바뀌지 않는 정적 자료(/data/*.geojson, /data/navdata/)는 운영 nginx가 1년 동안 다시 묻지 않고
// 캐시한다(immutable). 그래서 자료를 고쳐 배포해도 브라우저가 옛 파일을 계속 쓴다(예: 지운 공항이 지도에 남음).
// 배포(빌드)마다 바뀌는 값을 주소에 붙여, 배포 뒤 한 번은 새로 받게 한다. 테스트처럼 빌드 값이 없으면 주소를 그대로 둔다.
const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : ''

export function versionedAsset(url) {
  if (!BUILD_ID || !url) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${BUILD_ID}`
}
