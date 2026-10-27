const warningTypes = {
  "00": { key: "WIND_SHEAR", nameKo: "급변풍경보", name: "Wind Shear Warning", color: "#FF4444", sound: "alert-critical" },
  "0": { key: "WIND_SHEAR", nameKo: "급변풍경보", name: "Wind Shear Warning", color: "#FF4444", sound: "alert-critical" },
  "1": { key: "LOW_VISIBILITY", nameKo: "저시정경보", name: "Low Visibility Warning", color: "#FF8800", sound: "alert-warning" },
  "2": { key: "STRONG_WIND", nameKo: "강풍경보", name: "Strong Wind Warning", color: "#FF6600", sound: "alert-warning" },
  "3": { key: "HEAVY_RAIN", nameKo: "호우경보", name: "Heavy Rain Warning", color: "#0088FF", sound: "alert-warning" },
  "4": { key: "LOW_CEILING", nameKo: "저운고경보", name: "Low Ceiling Warning", color: "#888888", sound: "alert-warning" },
  "5": { key: "THUNDERSTORM", nameKo: "뇌우경보", name: "Thunderstorm Warning", color: "#CC00FF", sound: "alert-critical" },
  "7": { key: "TYPHOON", nameKo: "태풍경보", name: "Typhoon Warning", color: "#FF0000", sound: "alert-critical" },
  "8": { key: "HEAVY_SNOW", nameKo: "대설경보", name: "Heavy Snow Warning", color: "#00CCFF", sound: "alert-warning" },
  "13": { key: "YELLOW_DUST", nameKo: "황사경보", name: "Yellow Dust Warning", color: "#CC9900", sound: "alert-warning" }
};

export default warningTypes;

// 알림·푸시·라운지가 쓰는 한글 경보 이름. 예전에 영어 이름(name)으로 저장된 알림도 key로 다시 찾는다.
export function warningNameKo(warning) {
  if (!warning) return null
  const byKey = Object.values(warningTypes).find((type) => type.key === warning.wrng_type_key)
  return byKey?.nameKo ?? warning.wrng_type_name ?? null
}
