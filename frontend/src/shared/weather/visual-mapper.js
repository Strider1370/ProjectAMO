export function convertWeatherToKorean(weatherStr, cavok, clouds = []) {
  if (cavok) return '맑음';
  if (!weatherStr || weatherStr === 'NSW') return getCloudKorean(clouds);

  const mapping = {
    'RA': '비', '-RA': '약한 비', '+RA': '강한 비',
    'SN': '눈', '-SN': '약한 눈', '+SN': '강한 눈',
    'DZ': '이슬비', '-DZ': '약한 이슬비', '+DZ': '강한 이슬비',
    'FG': '안개', 'BR': '박무', 'HZ': '연무',
    'TS': '뇌전', 'TSRA': '뇌우', 'SHRA': '소나기',
    'SCT': '구름 조금', 'BKN': '구름 많음', 'OVC': '흐림', 'FEW': '구름 약간',
  };

  const normalized = String(weatherStr || '').toUpperCase().trim();
  if (mapping[normalized]) return mapping[normalized];

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const precipitationPriority = [
    'TSRA', 'SHRA', '+RA', '-RA', 'RA',
    '+SN', '-SN', 'SN',
    '+DZ', '-DZ', 'DZ', 'TS',
  ];

  const primaryToken = precipitationPriority.find((token) => tokens.includes(token));
  if (primaryToken && mapping[primaryToken]) return mapping[primaryToken];

  const firstMappedToken = tokens.find((token) => mapping[token]);
  return (firstMappedToken && mapping[firstMappedToken]) || weatherStr;
}

function getCloudKorean(clouds) {
  if (!Array.isArray(clouds) || clouds.length === 0) return '맑음';
  const cloudPriority = { OVC: 5, BKN: 4, SCT: 3, FEW: 2, SKC: 1, CLR: 1 };
  const topLayer = clouds.reduce((prev, curr) =>
    (cloudPriority[curr.amount] || 0) > (cloudPriority[prev.amount] || 0) ? curr : prev
  );
  const cloudMapping = {
    FEW: '맑음', SCT: '구름 조금', BKN: '구름 많음',
    OVC: '흐림', SKC: '맑음', CLR: '맑음',
  };
  return cloudMapping[topLayer?.amount] || '맑음';
}
