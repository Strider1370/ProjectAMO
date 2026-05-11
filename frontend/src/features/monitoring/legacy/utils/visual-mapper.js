/**
 * weather-parsing.md 기준의 기상 시각화 유틸리티
 */

export function isDaytime(isoString) {
  if (!isoString) return true;
  const hour = new Date(isoString).getUTCHours() + 9;
  const kstHour = hour % 24;
  return kstHour >= 6 && kstHour < 18;
}

/**
 * 영문 기상 현상을 한글로 변환
 */
function getCloudKorean(clouds) {
  if (!Array.isArray(clouds) || clouds.length === 0) return "맑음";

  const cloudPriority = { OVC: 5, BKN: 4, SCT: 3, FEW: 2, SKC: 1, CLR: 1 };
  const topLayer = clouds.reduce((prev, curr) =>
    (cloudPriority[curr.amount] || 0) > (cloudPriority[prev.amount] || 0) ? curr : prev
  );

  const cloudMapping = {
    FEW: "맑음",
    SCT: "구름 조금",
    BKN: "구름 많음",
    OVC: "흐림",
    SKC: "맑음",
    CLR: "맑음"
  };

  return cloudMapping[topLayer?.amount] || "맑음";
}

export function convertWeatherToKorean(weatherStr, cavok, clouds = []) {
  if (cavok) return "맑음";
  if (!weatherStr || weatherStr === "NSW") return getCloudKorean(clouds);

  const mapping = {
    "RA": "비", "-RA": "약한 비", "+RA": "강한 비",
    "SN": "눈", "-SN": "약한 눈", "+SN": "강한 눈",
    "DZ": "이슬비", "-DZ": "약한 이슬비", "+DZ": "강한 이슬비", "FG": "안개", "BR": "박무", "HZ": "연무",
    "TS": "뇌전", "TSRA": "뇌우", "SHRA": "소나기",
    "SCT": "구름 조금", "BKN": "구름 많음", "OVC": "흐림", "FEW": "구름 약간"
  };

  const normalized = String(weatherStr || "").toUpperCase().trim();
  if (mapping[normalized]) {
    return mapping[normalized];
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const precipitationPriority = [
    "TSRA", "SHRA", "+RA", "-RA", "RA",
    "+SN", "-SN", "SN",
    "+DZ", "-DZ", "DZ", "TS"
  ];

  const primaryToken = precipitationPriority.find((token) => tokens.includes(token));
  if (primaryToken && mapping[primaryToken]) {
    return mapping[primaryToken];
  }

  const firstMappedToken = tokens.find((token) => mapping[token]);
  return (firstMappedToken && mapping[firstMappedToken]) || weatherStr;
}

/**
 * 각 요소별 심각도 색상 코드 산출
 */
export function getTimelineColor(type, value) {
  switch (type) {
    case 'wind':
      if (value > 25) return '#f44336'; // Red
      if (value > 15) return '#ff9800'; // Orange
      return '#4caf50'; // Green
    case 'ceiling':
      if (value === null || value >= 5000) return '#4caf50';
      if (value >= 3000) return '#8bc34a'; // Lime
      if (value >= 1500) return '#ff9800';
      return '#f44336';
    case 'visibility':
      if (value === null || value >= 9999) return '#4caf50';
      if (value >= 5000) return '#8bc34a';
      if (value >= 1000) return '#ff9800';
      return '#f44336';
    default:
      return '#4caf50';
  }
}

/**
 * 연속된 동일 값을 그룹화하여 세그먼트 생성
 * @param {Array} dataList TAF hourly 데이터 배열
 * @param {Function} valueGetter 그룹화 기준 값을 뽑는 함수
 */
export function groupElementsByValue(dataList, valueGetter) {
  if (!dataList || dataList.length === 0) return [];
  
  const groups = [];
  let currentGroup = {
    value: valueGetter(dataList[0]),
    hourCount: 0,
    startIndex: 0,
    data: dataList[0]
  };

  dataList.forEach((item, index) => {
    const val = valueGetter(item);
    if (val === currentGroup.value) {
      currentGroup.hourCount++;
    } else {
      groups.push(currentGroup);
      currentGroup = {
        value: val,
        hourCount: 1,
        startIndex: index,
        data: item
      };
    }
  });
  groups.push(currentGroup);
  
  return groups.map(g => ({
    ...g,
    width: (g.hourCount / dataList.length) * 100
  }));
}

/**
 * 아이콘 키 산출
 */
export function resolveIconKey(data, time) {
  if (!data) return "UNKNOWN";
  const suffix = isDaytime(time) ? "D" : "N";

  const explicitIcon = data.display?.weather_icon;
  if (explicitIcon && explicitIcon !== "NSW") {
    return `wx_${explicitIcon}_${suffix}`;
  }
  
  if (data.weather && data.weather.length > 0) {
    const wp = data.weather[0];
    let baseKey = wp.descriptor ? wp.descriptor + (wp.phenomena ? wp.phenomena.join("") : "") : (wp.phenomena?.[0] || "");
    if (baseKey) return `wx_${baseKey}_${suffix}`;
  }

  if (data.clouds && data.clouds.length > 0) {
    const cloudPriority = { OVC: 5, BKN: 4, SCT: 3, FEW: 2, SKC: 1, CLR: 1 };
    let maxLayer = data.clouds.reduce((prev, curr) => 
      (cloudPriority[curr.amount] || 0) > (cloudPriority[prev.amount] || 0) ? curr : prev
    );
    return `wx_${maxLayer.amount}_${suffix}`;
  }

  return data.cavok ? `wx_CAVOK_${suffix}` : `wx_SKC_${suffix}`;
}

/**
 * 풍향 데이터를 기반으로 Wind Barb 회전각 및 키 산출
 */
export function resolveWindBarb(wind) {
  if (!wind || wind.speed === 0) return { key: "calm", rotation: 0 };
  
  // 5kt 단위 반올림
  const rounded = Math.round(wind.speed / 5) * 5;
  return {
    key: `barb_${rounded}`,
    rotation: wind.direction || 0
  };
}
