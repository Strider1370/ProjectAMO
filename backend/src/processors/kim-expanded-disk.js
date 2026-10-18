// 확대 회차가 쓰는 디스크 기준. 확대 수집(kim-expanded-processor.js)과 시연 스냅샷 저장(dev/snapshot-store.js)이 같이 쓴다.

// 확대 영역 06 UTC 한 회차(33시각) 최대 크기. 2026-10-09 06 UTC 실측 5.83 GB(기본 격자 + GKTG·권계면 + 지도 이진 파일
// + ACI + 강수 장)에 날씨에 따른 압축률 차이를 더했다.
export const EXPECTED_RUN_BYTES = 6.5e9
// 확대 수집이 남겨 둘 디스크 여유. 다른 저장(지도·자료실)의 기준(3 GiB)보다 낮춰, 시연 스냅샷(약 2 GB)을 둘 자리를 만든다
// (30 GB 디스크에서 확대 회차 2개가 잠깐 함께 있는 동안에도 한반도·레이더 등 다른 수집이 쓸 여유는 남는다).
export const EXPANDED_MIN_FREE_BYTES = 1.5 * 1024 ** 3
// 다음 확대 회차를 시작하려면 비어 있어야 하는 크기. 스냅샷은 저장 뒤에도 이만큼 남을 때만 저장한다.
export const EXPANDED_START_FREE_BYTES = EXPECTED_RUN_BYTES + EXPANDED_MIN_FREE_BYTES
