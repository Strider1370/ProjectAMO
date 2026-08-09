# 기상청 항공기상 TAF API 이상 보고 (RKTH AMD 미반영)

- 작성일: 2026-08-08
- 관측 시각: 2026-08-08 01:40Z ~ 01:57Z (모든 조회는 이 구간에서 반복 수행)
- 대상 API: 기상청 API 허브 `https://apihub.kma.go.kr/api/typ02/openApi`
- 문서에 인증키는 싣지 않는다. 아래 예시의 `${AUTH_KEY}`는 실제 키로 치환해 재현한다.

---

## 1. 요약

국내 TAF를 `AmmIwxxmService/getTaf`로 수집하고 있다. 2026-08-07 23:35Z에 발표된
**RKTH(포항경주) AMD 전문이 API로 들어오지 않는다.** 발표 2시간 22분 뒤에도 API는
직전 정시본(072300Z, NORMAL)만 반환한다.

누락된 내용이 하필 **뇌우(-TSRA)와 적란운(FEW015CB)** 이다. API 응답만 보면
"약한 비 오는 평범한 날씨"로 보이며, 위험기상이 완전히 사라진다.

부수적으로 두 가지를 함께 확인했다.

- `AmmService/getTaf`(원문 TAC)가 군 비행장 7개 공항에서 일관되게 `DB_ERROR`를 낸다.
- `AmmIwxxmService/getTaf` 문서에 명시된 출력 항목 `msgText`(TAF 전문)가 실제 응답에 없다.

---

## 2. 사례: RKTH 2026-08-07 23:35Z AMD

### 2.1 실제 발표된 전문

```
2026년 08월 07일 23시 35분 발표 (UTC) 수정/지연: AAA
포항경주 RKTH

TAF AMD RKTH 072335Z 0800/0906 03012KT 4800 -TSRA BR BKN010 FEW015CB OVC020
TX29/0806Z TN24/0821Z
FM080030 03012KT 4800 -RA BR BKN010 BKN020=
```

두 구간으로 이루어져 있다.

| 구간 | 유효 시각 | 내용 |
|---|---|---|
| 기본 | 08일 00:00Z ~ 00:30Z | `03012KT 4800 -TSRA BR BKN010 FEW015CB OVC020` |
| FM080030 | 08일 00:30Z ~ 09일 06:00Z | `03012KT 4800 -RA BR BKN010 BKN020` |

### 2.2 API가 반환하는 것

요청:

```
GET https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getTaf
    ?pageNo=1&numOfRows=10&dataType=XML&icao=RKTH&authKey=${AUTH_KEY}
```

2026-08-08 01:57Z 응답에서 추출한 값:

| 항목 | 값 |
|---|---|
| `reportStatus` | `NORMAL` (AMENDMENT 아님) |
| `iwxxm:issueTime` | `2026-08-07T23:00:00Z` (23:35Z 아님) |
| `iwxxm:validPeriod` | `2026-08-08T00:00:00Z` ~ `2026-08-09T06:00:00Z` |
| `iwxxm:changeForecast` | **0개** |
| 풍 | `030도 / 12KT` |
| 시정 | `4800 m` |
| 일기현상 | `-RA`, `BR` |
| 구름 | `BKN 1000ft`, `BKN 2000ft` |
| 기온 | `TX29/0806Z`, `TN24/0821Z` |

응답 본문 발췌(개행 복원, 일부 생략):

```xml
<iwxxm:TAF ... reportStatus="NORMAL">
  <iwxxm:issueTime>
    <gml:TimeInstant><gml:timePosition>2026-08-07T23:00:00Z</gml:timePosition></gml:TimeInstant>
  </iwxxm:issueTime>
  <iwxxm:validPeriod>
    <gml:TimePeriod>
      <gml:beginPosition>2026-08-08T00:00:00Z</gml:beginPosition>
      <gml:endPosition>2026-08-09T06:00:00Z</gml:endPosition>
    </gml:TimePeriod>
  </iwxxm:validPeriod>
  <iwxxm:baseForecast>
    <iwxxm:MeteorologicalAerodromeForecast cloudAndVisibilityOK="false">
      <iwxxm:prevailingVisibility uom="m">4800</iwxxm:prevailingVisibility>
      <iwxxm:meanWindDirection uom="deg">030</iwxxm:meanWindDirection>
      <iwxxm:meanWindSpeed uom="[kn_i]">12</iwxxm:meanWindSpeed>
      <iwxxm:weather xlink:href="http://codes.wmo.int/306/4678/-RA"/>
      <iwxxm:weather xlink:href="http://codes.wmo.int/306/4678/BR"/>
      <iwxxm:cloud>
        <iwxxm:AerodromeCloudForecast>
          <iwxxm:layer><iwxxm:CloudLayer>
            <iwxxm:amount xlink:href=".../CloudAmountReportedAtAerodrome/BKN"/>
            <iwxxm:base uom="[ft_i]">1000</iwxxm:base>
          </iwxxm:CloudLayer></iwxxm:layer>
          <iwxxm:layer><iwxxm:CloudLayer>
            <iwxxm:amount xlink:href=".../CloudAmountReportedAtAerodrome/BKN"/>
            <iwxxm:base uom="[ft_i]">2000</iwxxm:base>
          </iwxxm:CloudLayer></iwxxm:layer>
        </iwxxm:AerodromeCloudForecast>
      </iwxxm:cloud>
      ...
    </iwxxm:MeteorologicalAerodromeForecast>
  </iwxxm:baseForecast>
</iwxxm:TAF>
```

### 2.3 대조

| | 실제 AMD | API 응답 |
|---|---|---|
| 발표 시각 | 072335Z | 072300Z |
| 종별 | AMD (AAA) | NORMAL |
| 00:00~00:30 구간 | `-TSRA BR BKN010 FEW015CB OVC020` | **없음** |
| 00:30 이후 구간 | `-RA BR BKN010 BKN020` | `-RA BR BKN010 BKN020` (일치) |
| 변화군 개수 | 1개 (FM080030) | 0개 |

**API 응답 내용은 AMD의 FM080030 구간과 일치한다. 누락된 것은 AMD의 기본 구간, 즉 뇌우와 적란운이다.**

### 2.4 시각 경과

| 시각(UTC) | 확인 내용 |
|---|---|
| 2026-08-07 23:35Z | RKTH AMD 발표 |
| 2026-08-08 01:40Z | API 응답 `NORMAL / 072300Z / 변화군 0` |
| 2026-08-08 01:47Z | 동일 |
| 2026-08-08 01:48Z | 동일 |
| 2026-08-08 01:52Z | 동일 |
| 2026-08-08 01:57Z | 동일 |

**발표 후 2시간 22분 경과 시점까지 반영되지 않음.** 다음 정시 발표는 08일 05:00Z이므로,
그때까지 반영되지 않으면 최대 5시간 25분 동안 위험기상이 빠진 전문이 제공된다.

---

## 3. 정시본은 정상이다 (대조군)

같은 시각에 15개 공항 전체를 조회해 실제 발표 전문과 변화군 구성을 비교했다.
AMD가 발표되지 않은 13개 공항은 **모두 정확히 일치**한다. 어긋난 곳은 AMD가 발표된 RKTH뿐이다.

| ICAO | 공항 | 실제 전문의 변화군 | API 변화군 | 일치 |
|---|---|---|---|---|
| RKSI | 인천 | BECMG, TEMPO, BECMG | BECOMING, TEMPORARY_FLUCTUATIONS, BECOMING | O |
| RKSS | 김포 | TEMPO, BECMG, BECMG | TEMPORARY_FLUCTUATIONS, BECOMING, BECOMING | O |
| RKPC | 제주 | BECMG ×2 | BECOMING ×2 | O |
| RKPK | 김해 | BECMG ×4 | BECOMING ×4 | O |
| RKTU | 청주 | TEMPO | TEMPORARY_FLUCTUATIONS | O |
| RKTN | 대구 | BECMG ×2 | BECOMING ×2 | O |
| **RKTH** | **포항경주** | **AMD + FM080030** | **(없음), NORMAL 072300Z** | **X** |
| RKJB | 무안 | TEMPO | TEMPORARY_FLUCTUATIONS | O |
| RKJJ | 광주 | BECMG | BECOMING | O |
| RKJK | 군산 | (별도 계통) | BECOMING, TEMPORARY_FLUCTUATIONS, BECOMING | - |
| RKJY | 여수 | BECMG ×5 | BECOMING ×5 | O |
| RKNW | 원주 | BECMG | BECOMING | O |
| RKPS | 사천 | 없음 | 없음 | O |
| RKPU | 울산 | BECMG ×2, TEMPO ×2 | BECOMING ×2, TEMPORARY_FLUCTUATIONS ×2 | O |
| RKNY | 양양 | TEMPO, BECMG, BECMG, TEMPO | TEMPORARY_FLUCTUATIONS, BECOMING, BECOMING, TEMPORARY_FLUCTUATIONS | O |

즉 **BECMG·TEMPO 변환과 정시본 전달은 정상 동작한다.** 문제는 AMD 전달에 한정된다.

---

## 4. 함께 확인된 사항

### 4.1 `AmmService/getTaf` — 군 비행장 7개 공항 `DB_ERROR`

원문 TAC를 제공하는 `AmmService/getTaf`에 활용신청 후 조회한 결과다.
같은 요청을 3회씩 반복해도 결과가 동일하다(일시적 오류 아님).

```
GET .../AmmService/getTaf?pageNo=1&numOfRows=10&dataType=XML&icao=<ICAO>&authKey=${AUTH_KEY}
```

| 결과 | 공항 |
|---|---|
| `NORMAL_SERVICE` (8) | RKSI 인천, RKSS 김포, RKPC 제주, RKJB 무안, RKJK 군산, RKJY 여수, RKPU 울산, RKNY 양양 |
| `DB_ERROR` (7) | **RKPK 김해, RKTU 청주, RKTN 대구, RKTH 포항경주, RKJJ 광주, RKNW 원주, RKPS 사천** |

실패하는 7곳은 모두 군 비행장(공군·해군 공용)이다. 정상 응답 예시:

```xml
<item>
  <icaoCode>RKSI</icaoCode>
  <airportName>인천공항</airportName>
  <metarMsg>TAF RKSI 072300Z 0800/0906 06008KT 9999 SCT035
    TX35/0806Z TN24/0820Z TX34/0906Z
    BECMG 0801/0803 13007KT
    TEMPO 0805/0809 06015G25KT 3500 -SHRA SCT008CB BKN020 OVC050
    BECMG 0810/0812 05010G20KT=</metarMsg>
</item>
```

참고: `AmmService/getMetar`는 `403 허용되지 않은 API 입니다`로 접근이 막혀 있다
(`getTaf`의 신청 전 메시지 `403 활용신청이 필요한 API 입니다`와 문구가 다르다).

### 4.2 `AmmIwxxmService/getTaf` — 문서의 `msgText` 항목이 실제 응답에 없음

API 문서의 출력결과 표에는 `msgText`(TAF 전문)가 명시되어 있으나,
XML·JSON 어느 형식으로 요청해도 응답에 존재하지 않는다.

실제 `item` 하위 항목:

```
icaoCode, airportName, tafMsg
```

`tafMsg`에는 IWXXM 구조체만 들어 있고 TAF 원문 문자열은 없다.
또한 RKTH 응답에서는 `icaoCode`와 `airportName`이 빈 값으로 온다.

문서대로 `msgText`가 제공된다면 원문을 그대로 사용할 수 있어
IWXXM 구조체 재조립 과정과 이번 누락 문제가 함께 해소된다.

---

## 5. 문의 사항

1. **`AmmIwxxmService/getTaf`에 AMD(수정 전문)가 반영되지 않는 조건이 있는지.**
   RKTH 072335Z AMD가 2시간 22분 경과 시점까지 반영되지 않았다.
   민간 공항은 AMD가 정상 수신되는 것으로 확인했으므로, 군 비행장 공통 문제인지 확인이 필요하다.

2. **`AmmService/getTaf`에서 군 비행장 7개 공항이 `DB_ERROR`를 반환하는 원인.**
   활용신청 범위의 문제인지, 데이터 계통의 문제인지.

3. **문서에 기재된 `msgText`(TAF 전문) 항목이 실제 응답에 없는 사유.**
   문서 오기인지, 제공 예정인지.

---

## 6. 재현 방법

`${AUTH_KEY}`를 실제 키로 치환한다.

```bash
# 1) IWXXM TAF — reportStatus / issueTime / 변화군 개수 확인
curl -s "https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getTaf\
?pageNo=1&numOfRows=10&dataType=XML&icao=RKTH&authKey=${AUTH_KEY}" \
  | sed 's/&#xD;/\n/g' \
  | grep -E 'reportStatus|timePosition|changeIndicator|prevailingVisibility|4678'

# 2) 원문 TAC — 공항별 결과코드 확인
for ic in RKSI RKSS RKPC RKPK RKTU RKTN RKTH RKJB RKJJ RKJK RKJY RKNW RKPS RKPU RKNY; do
  printf '%s ' "$ic"
  curl -s "https://apihub.kma.go.kr/api/typ02/openApi/AmmService/getTaf\
?pageNo=1&numOfRows=10&dataType=XML&icao=$ic&authKey=${AUTH_KEY}" \
    | grep -o '<resultMsg>[^<]*' | cut -d'>' -f2
done

# 3) msgText 존재 여부
curl -s "https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getTaf\
?pageNo=1&numOfRows=10&dataType=JSON&icao=RKTH&authKey=${AUTH_KEY}" | grep -c msgText
```

---

## 7. 확인하지 못한 것

보고의 정확성을 위해 밝혀 둔다.

- **"군 비행장이어서 AMD가 누락된다"는 인과는 확인되지 않았다.** AMD 누락 표본은 RKTH 한 건뿐이다.
  같은 날 AMD가 발표된 강릉(RKNN)으로 표본을 늘리려 했으나, 해당 공항은 이 API에서
  `<tafMsg><![CDATA[null]]></tafMsg>`로 빈 응답이 와 비교가 불가능했다.
- **민간 공항의 AMD 정상 수신은 운영자가 확인한 내용이며, 본 조사 구간(01:40Z~01:57Z)에는
  AMENDMENT 상태인 공항이 하나도 없어 직접 관측하지 못했다.**
- `AmmService/getTaf`의 `DB_ERROR`와 군 비행장의 대응(7:7)은 확인했으나,
  그것이 AMD 누락과 같은 원인인지는 확인하지 못했다.
