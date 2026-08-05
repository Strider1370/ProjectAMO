# G. 운정 상부 위험 — 정량 근거

**목적:** "적란운 운정 위로 넘어가면 되지 않나?"라는 조종사 질문에 대한 반박을, 원전 수치로만 구성한다.

**출처 우선순위:** 이 주제는 국내 원전이 희박하다. FAA·NOAA/NWS·AMS·NASA를 1순위 원전으로 삼고, 국내 자료(기상청·항공기상청·국내 학술지)에 대응 서술이 있으면 병기했다.

**판정 태그**
- **[확인됨]** — 원전 문서 본문에서 직접 인용한 수치
- **[조건부 — 단서]** — 수치는 있으나 2차 출처이거나, 적용조건이 제한적이거나, 원전이 다른 맥락에서 쓴 값
- **[미확인]** — 원전을 찾지 못함. 추측하지 않고 공란으로 남김

---

## 이 문서에서 쓰는 핵심 용어 (먼저 정리)

| 용어 | 뜻 |
| --- | --- |
| **에코탑(echo top)** | 레이더가 **강수 입자**를 감지한 가장 높은 고도. 보통 18 dBZ 기준 |
| **운정(cloud top)** | 실제 구름 꼭대기. 강수 입자가 없는 얼음 결정 구역까지 포함하므로 **항상 에코탑보다 높다** |
| **모루(anvil)** | 대류가 평형고도에서 옆으로 퍼지며 만드는 평평한 구름 지붕 |
| **오버슈팅탑(overshooting top, OT)** | 상승기류가 관성으로 평형고도(모루 높이)를 **뚫고 더 올라간** 돌출부 |
| **MoG 난류** | moderate or greater — 중등도 이상 난류 |
| **background risk(배경 위험)** | 뇌우와 무관한 일반 공역에서의 난류 조우 확률. "몇 배"는 전부 이 값 대비 |

---

## 1. 에코탑 vs 실제 운정 — 레이더가 보여주는 숫자는 구름 꼭대기가 아니다

### 1-1. 에코탑의 정의 자체가 운정이 아니다 — [확인됨]

**수치:** 에코탑 = **18 dBZ** 이상 반사도가 관측된 최고 고도 (NEXRAD 표준 산출물)

**원전:** NOAA/NWS Warning Decision Training Division (WDTD), *xx dBZ Echo Top (ET)* 훈련교재
> "The ET product measures the maximum altitude for a particular reflectivity value (e.g., 18 dBZ) within a vertical column."
> (ET 산출물은 연직 기둥 안에서 특정 반사도 값 — 예: 18 dBZ — 이 나타나는 최대 고도를 측정한다.)

**적용조건·한계:** WDTD는 18/30/50/60 dBZ의 네 가지 하위 산출물이 있음을 명시한다. 즉 "에코탑"이라는 단어만으로는 어떤 임계값 기준인지 알 수 없다. 항공용으로 유통되는 값(FIS-B, ForeFlight 등)은 18 dBZ 기준이다.

**보조 확인:** ForeFlight 공식 블로그 *Got Echo Tops?* (2015-12-21)
> "the highest radar echo of 18 dBZ or greater" / "Cloud tops are always higher."
> (18 dBZ 이상 레이더 에코의 최고 고도 / 운정은 **항상** 더 높다.)

또한 ForeFlight는 NEXRAD 모자이크에 **에코탑이 20,000 ft MSL을 지속적으로 넘을 때만** 에코탑 수치를 표시한다고 밝힌다 — 그보다 낮은 뇌우는 화면에 에코탑 숫자 자체가 안 뜬다.

> 학생조종사에게: 에코탑은 "구름 꼭대기"가 아니라 "비 입자가 마지막으로 잡힌 높이"다. 젖은 부분의 천장이지, 구름의 천장이 아니다.

### 1-2. 에코탑이 실제 운정보다 얼마나 낮은가 — [조건부 — 2차 출처]

**수치:** 강한 뇌우에서 **운정이 에코탑보다 5,000~10,000 ft 더 높을 수 있다**

**원전:** *Flying Magazine*, "What Are Echo Tops?" (항공 전문지, 1차 학술 원전 아님)
> "cloud tops can be 5,000 to 10,000 feet higher in intense storms"
> (강한 폭풍에서는 운정이 5,000~10,000 ft 더 높을 수 있다.)

**적용조건·한계:** **이 수치는 FAA·NOAA 공식 문서에서 확인하지 못했다.** 항공 전문지 수준의 2차 출처다. FAA/NWS 공식 문서는 "운정이 항상 더 높다"는 정성적 서술까지만 하고 구체적 ft 값을 제시하지 않는다. 발표에서 쓴다면 "항공 전문지 통용값" 정도로 수위를 낮춰야 한다.

**단, 아래 1-3·1-4의 물리적 근거는 모두 [확인됨]이므로, "에코탑이 낮게 나온다"는 주장 자체는 공식 원전으로 세울 수 있다.**

> 학생조종사에게: 레이더가 "에코탑 30,000 ft"라고 말할 때, 진짜 구름은 35,000~40,000 ft에 있을 수 있다. 넘었다고 생각한 순간이 아직 구름 속이다.

### 1-3. 빔 오버슈팅 — 멀수록 레이더는 폭풍의 꼭대기만 훑는다 — [확인됨]

**수치:** WSR-88D 빔폭 **약 1°**. 빔은 **10마일 진행마다 약 1,000 ft씩 퍼진다.** 120마일 거리에서 빔 폭은 **2마일(약 10,000 ft) 이상**.

**원전:** NOAA JetStream, *JetStream Max: Radar Beams*
> "The radar beam spreads out approximately 1,000 feet for every 10 miles of travel, so at 120 miles from the radar, the beam is over 2 miles wide."
> (레이더 빔은 10마일 진행마다 약 1,000 ft씩 퍼지므로, 레이더에서 120마일 떨어진 곳에서 빔 폭은 2마일이 넘는다.)

**같은 문서의 실측 예시:**
> "The Central TX WSR-88D sampled this storm at a range of 20 miles. The beam height was approximately 1,300' above the ground and the beam width was about 2,000'. The image on the right was taken from the WSR-88D in Fort Worth, TX, at a range of 98 miles. The beam height was approximately 11,600' above the ground and the beam width was nearly 2 miles."
> (중부 텍사스 레이더는 20마일 거리에서 이 폭풍을 관측했다. 빔 고도는 지상 약 1,300 ft, 빔 폭은 약 2,000 ft였다. 오른쪽 영상은 포트워스 레이더가 98마일 거리에서 관측한 것이다. 빔 고도는 지상 약 11,600 ft, 빔 폭은 거의 2마일이었다.)

**아굴절(subrefraction)에 의한 오버슈팅 — 같은 원전:**
> "Subrefraction causes the radar to overshoot objects that would normally be detected. Distant thunderstorms might not be detected with subrefraction, or their intensity may be under-reported as the beam hits only the top portion of the thunderstorm cloud."
> (아굴절은 평소라면 탐지될 물체를 레이더가 지나쳐 버리게 만든다. 아굴절이 있으면 먼 뇌우는 탐지되지 않거나, 빔이 뇌우 구름의 윗부분만 때리기 때문에 강도가 과소 보고될 수 있다.)

**적용조건·한계:** 빔폭 1°와 1,000 ft/10 mi는 WSR-88D(S밴드, 미국) 기준이다. 국내 기상청 레이더도 S밴드 기반이나 구체적 빔폭 사양은 이 문서에서 확인하지 않았다 — [미확인].

> 학생조종사에게: 레이더 빔은 손전등 불빛처럼 퍼진다. 100마일 밖 폭풍을 볼 때 레이더가 한 번에 비추는 세로 폭이 2마일이다. 그 안의 구조는 뭉개져서 하나로 보인다.

### 1-4. Cone of silence와 고도각 공백 — 레이더 머리 위는 사각지대 — [확인됨]

**수치·서술:** 단일 레이더는 고도각 사이의 공백과 빔 특성 때문에 에코탑을 신뢰할 수 없게 산출한다. 다중 레이더 합성이 **cone of silence, 원거리 빔 확산, 지형 차폐**를 보완한다.

**원전:** NOAA/NWS WDTD, *xx dBZ Echo Top (ET)*
> "The 'stair-step' appearance of ET data may not be completely alleviated, especially for stratiform echoes and those areas only sampled by one radar."
> (ET 자료의 '계단' 모양은 완전히 해소되지 않는다. 특히 층상형 에코와, 레이더 한 대만이 관측하는 구역에서 그렇다.)

**보조 확인:** Lakshmanan et al. (2013), *An Improved Method for Estimating Radar Echo-Top Height*, **Weather and Forecasting, 28(2), 481–488**
> "When the radar is so far away that the beams overshoot the top of the storm (the 200-km range) or so near that the top of the storm is not sampled (the 50 km range), there is no improvement using the proposed method."
> (레이더가 너무 멀어 빔이 폭풍 꼭대기를 지나쳐 버리거나(200 km 거리), 너무 가까워 폭풍 꼭대기가 관측되지 않는(50 km 거리) 경우에는 제안된 방법으로도 개선이 없다.)

**적용조건·한계:** 본문 전문은 AMS 유료 장벽으로 열지 못했고 위 문장은 검색 스니펫 수준에서 확보했다. 200 km / 50 km라는 두 실패 구간이 존재한다는 사실이 요점이다. **즉 레이더는 너무 멀어도, 너무 가까워도 폭풍 꼭대기를 놓친다.**

> 학생조종사에게: 레이더 바로 위(약 50 km 이내)와 아주 먼 곳(약 200 km 밖), 두 군데 모두 폭풍 꼭대기가 제대로 안 잡힌다. "레이더에 안 보인다"는 "없다"가 아니다.

### 1-5. 국내 대응 서술 — 국내 관측에서도 레이더 운정이 낮게 나온다 — [조건부 — 다른 장비·다른 맥락]

**수치·결론:** 강수 시간대에 **Ka-밴드 구름레이더가 관측한 운정고도가 천리안위성(COMS) 관측값보다 낮게** 나왔고, **강수강도가 강할수록 그 차이가 커졌다.**

**원전:** 오수빈·원혜영·하종철·정관영 (2014), 「Ka-band 구름레이더와 천리안위성으로 관측된 운정고도 비교」, **『대기(Atmosphere)』 한국기상학회지 24권 1호, 39–48**, doi:10.14191/Atmos.2014.24.1.039
> "the cloud top heights observed by the cloud radar have been estimated to be lower than that observed by the COMS for the rainfall duration due to the signal attenuation caused by raindrops. The stronger rainfall intensity gets, the more the difference grows."
> (강수 시간대에는 빗방울에 의한 신호 감쇠 때문에 구름레이더가 관측한 운정고도가 COMS 관측값보다 낮게 추정되었다. 강수강도가 강할수록 차이는 더 커졌다.)

**적용조건·한계:** **이것은 Ka-밴드 구름레이더이지 기상 감시용 S밴드 레이더가 아니며, 낮게 나온 원인도 빔 오버슈팅이 아니라 강수에 의한 신호 감쇠다.** 물리 기구가 다르므로 1-2의 대체 근거로 쓸 수 없다. 다만 **"강한 비가 올수록 레이더가 보고하는 운정이 실제보다 낮아진다"**는 방향성은 국내 관측으로도 확인된다는 점에서 병기 가치가 있다. 관측 기간도 2013년 5월 25~27일 보성 표준기상관측소, 단기 사례다.

> 학생조종사에게: 비가 셀수록 레이더는 구름 꼭대기를 더 낮게 본다. 가장 위험한 구름일수록 가장 낮게 속인다.

---

## 2. 적란운 상승·운정 성장률 — 관측된 운정은 이미 과거의 숫자다

### 2-1. 상승기류 속도 — [확인됨]

**수치**
| 단계·유형 | 상승기류 속도 | 환산 |
| --- | --- | --- |
| 적운(towering cumulus) 단계 | **3,000 fpm 초과 가능** | 약 15 m/s |
| 슈퍼셀 | **9,000 fpm (100 kt)에 도달 가능** | 약 46 m/s |

**원전:** FAA, *Aviation Weather Handbook* **FAA-H-8083-28, Chapter 22 "Thunderstorms"** (2024년판)
> "The distinguishing feature of the towering cumulus stage is a strong convective updraft. … Updraft speeds can exceed 3,000 fpm." (§22.3, 적운 단계)
> (적운 단계의 특징은 강한 대류 상승기류다. … 상승기류 속도는 3,000 fpm을 넘을 수 있다.)

> "Updraft speeds may reach 9,000 fpm (100 kt)." (§22.4, 슈퍼셀)
> (상승기류 속도는 9,000 fpm(100 kt)에 도달할 수 있다.)

**적용조건·한계:** 이것은 **상승기류(공기 덩어리)의 속도**이지 **운정 상승률**이 아니다. 실제 운정은 상부 안정층의 제동과 주변 공기 유입 때문에 상승기류보다 느리게 오른다. 발표에서 "운정이 분당 3,000 ft 오른다"고 말하면 과장이다. 정확히는 **"내부 상승기류가 분당 3,000 ft"**다.

**운정 자체의 상승률(ft/min) 직접 수치:** **[미확인]** — FAA·NOAA 문서에서 운정 상승률을 ft/min으로 명시한 원전을 찾지 못했다.

> 학생조종사에게: 적란운 안의 공기는 분당 3,000 ft, 슈퍼셀은 분당 9,000 ft로 올라간다. 훈련기 최대 상승률의 3배에서 10배다. 구름은 당신보다 빨리 올라간다.

### 2-2. "관측값은 이미 과거다" — 관측 갱신주기 대 성장 속도 — [확인됨]

**수치**
| 항목 | 값 | 원전 |
| --- | --- | --- |
| FIS-B Echo Top 갱신주기 | **5분** (전송주기도 5분) | FAA AIM **TBL 7-1-9** |
| FIS-B MRMS NEXRAD (CONUS) 갱신 | 2분 / **전송 15분** | FAA AIM TBL 7-1-9 |
| 데이터링크 NEXRAD 영상 실제 지연 | **15~20분** | FAA AC 00-24C §10a(8) |

**원전 인용:** FAA AC 00-24C, *Thunderstorms* (2013-02-19), §10a(8)
> "Do remember that the data-linked NEXRAD mosaic imagery shows where the weather **was**, not where the weather **is**. The weather conditions may be 15 to 20 minutes older than the age indicated on the display."
> (데이터링크 NEXRAD 모자이크 영상은 날씨가 **있었던** 곳을 보여주는 것이지, 날씨가 **있는** 곳을 보여주는 것이 아님을 기억하라. 실제 기상 상태는 화면에 표시된 시각보다 15~20분 더 오래된 것일 수 있다.)

**같은 문서 §8f, §8g:**
> "Thunderstorms build and dissipate rapidly. Therefore, do not attempt to plan a course between echoes."
> (뇌우는 빠르게 발달하고 소멸한다. 따라서 에코 사이로 항로를 계획하려 하지 말라.)

> "As the current location of a thunderstorm cell may be different than the broadcast weather product, do not attempt to find a hole in a thunderstorm solely using data-linked weather."
> (뇌우 셀의 현재 위치는 방송된 기상 산출물과 다를 수 있으므로, 데이터링크 기상만으로 뇌우 사이의 구멍을 찾으려 하지 말라.)

**계산 (2-1과 2-2의 결합, 산술은 본 문서의 유도):**
상승기류 3,000 fpm × 15분 지연 = **45,000 ft 상당의 공기 이동**. 운정 상승률은 이보다 훨씬 느리지만, **15분 전 화면을 보고 "저 구름은 25,000 ft"라고 판단하는 것은 원리적으로 불가능**하다는 결론에는 이 정도 자릿수 차이면 충분하다.

**적용조건·한계:** FIS-B 갱신주기 5분은 미국 UAT 기준이다. 국내 대응 수치는 **[미확인]**.

> 학생조종사에게: 화면의 에코탑은 최대 20분 전 숫자다. 그 20분 동안 구름은 계속 자란다. 당신이 보는 것은 구름의 옛날 사진이다.

### 2-3. 대류 발생 시 위성 운정 냉각률 — [조건부 — 다른 단위]

**수치:** 성장하는 대류운의 10.7 μm 운정 냉각률 **−6.0 K / 15분** (사례값). 대류 개시(CI) 예측 판단에 쓰는 15~30분 간격 모니터링.

**원전:** Mecikalski & Bedka 계열 연구 — *Nowcasting Convective Storm Initiation Using Satellite-Based Box-Averaged Cloud-Top Cooling and Cloud-Type Trends*, **J. Appl. Meteor. Climatol., 50(1)** (2011); 원 개념은 Mecikalski & Bedka (2006), *Mon. Wea. Rev.*, 134(1)

**적용조건·한계:** 이것은 **온도 변화율**이지 고도 변화율이 아니다. 고도로 환산하려면 운정 부근 기온감률이 필요하고, 그 환산은 본 문서에서 하지 않았다(추측 금지). 다만 **"위성으로 15분 간격을 보면 운정이 눈에 띄게 차가워진다 = 자라고 있다"**는 정성적 근거로는 유효하다.

> 학생조종사에게: 위성으로 15분만 지켜봐도 구름 꼭대기 온도가 6도 떨어진다. 그만큼 계속 올라가고 있다는 뜻이다.

---

## 3. Overshooting top

### 3-1. 정의 — [확인됨]

**원전:** EUMETSAT Convection Working Group, *Overshooting Cloud Top Detection*
> "convective updraft regions penetrating through ('overshooting') the local anvil cloud"
> (주변 모루구름을 뚫고('오버슈팅') 올라가는 대류 상승기류 구역)

> "Storms with overshooting tops (OT) typically generate hazardous weather conditions such as hail, damaging wind, tornadoes, and flooding. They also are threats to aviation due to turbulence and aircraft icing conditions."
> (오버슈팅탑을 가진 폭풍은 통상 우박, 파괴적 강풍, 토네이도, 홍수 같은 위험 기상을 만든다. 또한 난류와 항공기 착빙 때문에 항공에 위협이 된다.)

### 3-2. 모루 대비 돌출 높이 — [확인됨]

**수치**
| 값 | 측정 방법 | 원전 |
| --- | --- | --- |
| **최대 약 2 km (≈6,600 ft)** 모루 위 | 항공기 탑재 라이다 직접 관측 | Heymsfield et al. (1991) |
| **평균 0.67 km (≈2,200 ft)** | TRMM 강수레이더 전지구 심층대류 | Liu & Zipser (2005) |

**원전 인용:** Bedka, Brunner, Dworak, Feltz, Otkin, Greenwald (2010), *Objective Satellite-Based Detection of Overshooting Tops Using Infrared Window Channel Brightness Temperature Gradients*, **J. Appl. Meteor. Climatol., 49, 181–202**, doi:10.1175/2009JAMC2286.1 — 서론
> "From several flights over OTs with an airborne lidar, Heymsfield et al. (1991) showed that some OTs reach altitudes up to 2 km above the surrounding anvil cloud. From Tropical Rainfall Measuring Mission (TRMM) precipitation radar data, Liu and Zipser (2005) found an overshooting magnitude of 0.67 km for global deep convective clouds."
> (항공기 탑재 라이다로 오버슈팅탑 위를 여러 차례 비행한 결과, Heymsfield 등(1991)은 일부 오버슈팅탑이 주변 모루구름보다 최대 2 km 높은 고도에 도달함을 보였다. TRMM 강수레이더 자료로부터 Liu와 Zipser(2005)는 전지구 심층대류운의 오버슈팅 크기가 0.67 km임을 찾았다.)

**같은 문서가 밝히는 두 값의 차이 원인 (중요 — 1항의 논지와 직결):**
> "The height difference between lidar and TRMM-based results is likely due to the fact that lidar derives cloud-top height via ice crystal reflectance whereas TRMM requires reflectance from precipitation particles that reside at lower levels within the cloud."
> (라이다와 TRMM 결과의 고도 차이는, 라이다는 얼음 결정 반사로 운정고도를 구하는 반면 TRMM은 구름 내부의 더 낮은 층에 존재하는 강수 입자의 반사를 필요로 한다는 사실 때문일 가능성이 크다.)

**→ 같은 구름을 라이다로 재면 2 km, 강수레이더로 재면 0.67 km다. 레이더 계열 관측이 운정을 낮게 보는 것이 논문에서 직접 관찰된다.** 이것이 1-2의 물리적 근거다.

### 3-3. 크기·형태 — [확인됨]

**수치:** 오버슈팅탑 직경은 통상 **15 km 미만**, Bedka et al.의 450개 뇌우 데이터셋에서 관측된 **최대 직경은 12 km**. Fujita (1992)는 1~10 km로 기술.

**원전:** Bedka et al. (2010), 위 문헌
> "it was found that the largest diameter of an OT was 12 km, which is a bit larger than the 1–10-km diameter described by Fujita (1992)"
> (오버슈팅탑의 최대 직경은 12 km로 밝혀졌는데, 이는 Fujita(1992)가 기술한 1~10 km 직경보다 약간 크다.)

> "typical OT signatures have a diameter < 15 km"
> (전형적인 오버슈팅탑 시그니처의 직경은 15 km 미만이다.)

**부가 — 오버슈팅탑의 냉각률:**
> "OTs continue to cool at a rate of 7–9 K km⁻¹ as they ascend into the lower stratosphere (Negri 1982; Adler et al. 1983)"
> (오버슈팅탑은 하부 성층권으로 상승하면서 7~9 K/km의 비율로 계속 냉각된다.)

### 3-4. 대류권계면 관통 깊이 분포 — [확인됨]

**수치:** 대류권계면 위 고도가 높아질수록 오버슈팅 사례 수는 **지수적으로 감소**. **권계면 위 6 km 이상은 드물다** — 10년간 약 **321건**. 관측된 **최고 에코탑은 24 km**.

**원전:** Cooney, Bowman, Homeyer, Fenske (2018), *Ten Year Analysis of Tropopause-Overshooting Convection Using GridRad Data*, **J. Geophys. Res. Atmos., 123, 329–343**, doi:10.1002/2017JD027718
> "the number of overshooting events decreases exponentially with height above the tropopause; and it is rare to observe echoes 6 km or more above the tropopause (∼321 overshoot events in 10 years). The highest echo tops observed in this study reached an altitude of 24 km."
> (오버슈팅 사례 수는 대류권계면 위 고도에 따라 지수적으로 감소한다. 권계면 위 6 km 이상의 에코가 관측되는 것은 드물다(10년간 약 321건). 본 연구에서 관측된 최고 에코탑은 24 km에 달했다.)

> "High echo tops are more likely in July and August than in March, April, May, or June, but the tropopause is also higher later in the summer."
> (높은 에코탑은 3·4·5·6월보다 7·8월에 더 잘 나타나지만, 여름 후반에는 대류권계면 자체도 더 높다.)

**적용조건·한계:** 미국 본토(CONUS), NEXRAD GridRad 합성, 2004–2013년 3~8월. **이 값들도 "에코탑" 기준이므로 실제 운정은 더 높다** — 24 km도 하한값이다.

> 학생조종사에게: 7~8월이 운정이 가장 높은 계절이다. 여름 한국에서 훈련한다면, 통계적으로 가장 높은 구름을 만나는 시기에 비행하고 있는 것이다.

### 3-5. 지속시간 — [미확인]

오버슈팅탑의 개별 지속시간(분 단위) 통계를 원전에서 확보하지 못했다. Bedka et al. (2010) 서론이 "typical duration"이 연구되었다고 언급하며 Hung & Smith (1982), Dworak et al. (2012)를 인용하나, 해당 원전 본문의 수치는 확인하지 못했다. **추측하지 않는다.**

### 3-6. 위성 탐지법 — [확인됨]

**방법:** IRW-texture 기법 — 11 μm 적외 창 채널 밝기온도의 **공간 경도(texture)** 로, 주변 모루보다 유의하게 차갑고 크기가 오버슈팅탑에 부합하는 화소 군집을 식별. NWP 권계면 온도 예보와 결합.

**원전:** Bedka et al. (2010), 위 문헌 — 450개 뇌우 사례(MODIS·AVHRR 1 km 영상)로 임계값 도출

**보조:** Griffin, Bedka, Velden (2016), *A Method for Calculating the Height of Overshooting Convective Cloud Tops Using Satellite-Based IR Imager and CloudSat Cloud Profiling Radar Observations*, **J. Appl. Meteor. Climatol., 55, 479–491**
> "Validation indicates that ~75% (65%) of MODIS (geostationary) OT heights are within ±500 m of the coincident CPR-estimated heights."
> (검증 결과 MODIS(정지궤도) 오버슈팅탑 고도의 약 75%(65%)가 동시각 CloudSat CPR 추정 고도의 ±500 m 이내였다.)

**적용조건·한계:** 최고 성능의 위성 기법조차 **오차 ±500 m(약 1,600 ft)** 이고, 그것도 사례의 75%만 그 안에 든다. 나머지 25%는 더 크게 틀린다.

> 학생조종사에게: 세상에서 가장 정밀한 위성 기법도 구름 꼭대기를 ±1,600 ft 오차로 맞힌다. 그것도 네 번 중 세 번만. 조종석에서 눈으로 어림하는 값은 이보다 훨씬 부정확하다.

---

## 4. 운정 상부 중력파 난류 — 구름 위 맑은 하늘이 안전하지 않은 이유

### 4-1. 발생 기구 — [확인됨]

**기구:** 오버슈팅 상승기류가 정적으로 안정한 하부 성층권을 밀고 올라가면 **내부 중력파(gravity wave)** 가 여기(勵起)된다. 이 파동이 부서지면서(wave breaking) 난류가 발생한다. 운정 부근의 강한 흐름 변형에 의한 전단 불안정도 함께 작용한다.

**원전:** Griffin, Bedka, Velden (2016), 위 문헌 — 서론
> "Lane et al. (2003) noted that CIT caused by gravity wave breaking typically occurs about 1 km above an OT."
> (Lane 등(2003)은 중력파 부서짐에 의한 대류유발난류(CIT)가 통상 오버슈팅탑 위 **약 1 km** 지점에서 발생한다고 지적했다.)

**핵심 단서 — 구름이 없다:** 중력파 부서짐은 구름을 동반하지 않으므로 **맑은 공기 속에서 난류를 만난다.** 눈으로 보이지 않는다.

**적용조건·한계:** "약 1 km(≈3,300 ft) 위"는 Lane et al. (2003) 수치제원 결과의 인용이다. Lane et al. (2003) 원논문 본문은 직접 확인하지 못했다 — Griffin et al. (2016) 본문에서의 인용을 통해 확보.

### 4-2. 운정 위로 몇 ft까지, 얼마나 강한가 — [확인됨] ★ 이 항목의 핵심 수치

**원전:** Hitchcock, Lane, Deierling, Sharman, Trier, Homeyer (2025), *Spatial Patterns of Turbulence near Thunderstorms*, **Bull. Amer. Meteor. Soc., 106(1), E1–E17**, doi:10.1175/BAMS-D-23-0142.1
자료: 미국 상공 **9년(2009–2017)** 상용 항공기 자동 난류 보고(EDR) + 레이더

| 위치 | MoG(중등도 이상) 난류 위험 | 원문 |
| --- | --- | --- |
| 에코탑 **2 km(≈6,600 ft) 위** | **배경 위험의 20배 초과** | "At 2 km above echo tops, the risk of MoG turbulence exceeds 20 times the background risk." |
| **모든 연직 이격거리** | 감소하지만 **끝까지 배경보다 높음** | "This decreases exponentially but remains elevated at all vertical separation distances." |
| 에코탑 **2 km 위 + 수평 20 mi(32 km)** | 배경의 **약 5배** | "at 20 mi, … the risk of MoG turbulence is nearly 5 times the background risk at altitudes 2 km above the peak echo-top height" |
| 에코탑 **4 km(≈13,000 ft) 위 + 수평 20 mi** | 여전히 배경의 **2배 초과** | "still more than double the background risk at 4 km above the tallest echoes" |
| 에코탑 **5 km(≈16,400 ft) 초과 위 + 수평 20 km(12.5 mi)** | 배경의 **2배** | "at an altitude more than 5 km above peak echo tops and a horizontal distance of 20 km (12.5 mi), the risk of MoG turbulence is double the background risk" |

**바람 세기에 따른 확대 — 원문:**
> "An aircraft is 5 times more likely to experience MoG turbulence at 2 km above echo tops once wind speeds reach 10 m s⁻¹. When winds reach 25 m s⁻¹, the risk region expands to 4 km above echo tops."
> (풍속이 10 m/s에 이르면 항공기가 에코탑 위 2 km에서 MoG 난류를 겪을 확률은 5배가 된다. 풍속이 25 m/s에 이르면 위험 구역은 에코탑 위 4 km까지 확대된다.)

> "Even when BWD values are less than 5 m s⁻¹, the risk of MoG turbulence is 10 times the background risk for aircraft less than 2 km above echo tops."
> (대기층 전체 바람 시어(BWD)가 5 m/s 미만일 때조차, 에코탑 위 2 km 미만에 있는 항공기의 MoG 난류 위험은 배경의 10배다.)

**감쇠 규칙 — 원문:**
> "At or above the peak echo-top altitude, the vertical extent of the region where risk is twice that of the background decreases around 1 km for every ~12-km horizontal separation distance."
> (최고 에코탑 고도 이상에서, 위험이 배경의 2배가 되는 구역의 연직 두께는 수평 이격거리 약 12 km마다 1 km씩 줄어든다.)

**적용조건·한계:** **미국 상공, 상용 항공기(주로 순항고도) 자료다.** 훈련기가 다니는 고도대의 자료가 아니다. 다만 **"에코탑 위쪽은 어느 높이까지 올라가도 배경보다 위험하다"**는 결론 자체는 고도에 의존하지 않는다. 또한 EDR은 상용기 기준 난류 강도이므로, **같은 대기 상태를 훨씬 가벼운 훈련기가 만나면 체감 강도는 더 크다.**

**FAA 지침이 이 위험을 인정하는 문장 — [확인됨]:** FAA *Aviation Weather Handbook* (FAA-H-8083-28), CIT 절, Hitchcock et al. (2025)가 인용
> "Outside the cloud, shear turbulence has been encountered several thousand feet above and up to 20 mi laterally from a severe storm. Additionally, CAT may be encountered 20 or more miles from the anvil cloud edge."
> (구름 밖에서, 전단 난류는 심한 폭풍의 **수천 ft 위**와 수평 20마일까지에서 조우된 바 있다. 또한 청천난류는 모루구름 가장자리에서 20마일 이상 떨어진 곳에서도 조우될 수 있다.)

동일 문장이 FAA **AC 00-24C §7b(1)** 에도 있다 — 본 문서가 원문 PDF에서 직접 확인:
> "Outside the cloud, shear turbulence is encountered several thousand feet above and up to 20 miles laterally from a severe storm. Additionally, clear air turbulence may be encountered 20 or more miles from the anvil cloud edge."

> 학생조종사에게: 구름 꼭대기 6,600 ft 위, 눈에는 완전히 맑은 하늘에서 중등도 이상 난류를 만날 확률이 평소의 20배다. 위험은 구름이 끝나는 곳에서 끝나지 않는다.

---

## 5. 모루 확장과 청천 우박

### 5-1. 모루는 얼마나 뻗는가 — [확인됨]

**수치:** 뇌우 모루는 **풍하측으로 수백 마일(hundreds of miles)** 뻗을 수 있고, **때로는 풍상측으로도 뻗는다.**

**원전:** FAA AC 00-24C (2013-02-19) §6a "Anvil" — 동일 정의가 FAA *Aviation Weather Handbook* Ch.22 용어절에도 그대로 수록
> "Anvil. The flat, spreading top of a cumulonimbus cloud, often shaped like an anvil. Thunderstorm anvils may spread hundreds of miles downwind from the thunderstorm itself, and sometimes may spread upwind."
> (모루. 종종 모루 모양을 한, 적란운의 평평하게 퍼진 꼭대기. 뇌우 모루는 뇌우 본체로부터 풍하측으로 수백 마일까지 퍼질 수 있고, 때로는 풍상측으로도 퍼질 수 있다.)

**적용조건·한계:** "수백 마일"은 상한 표현이며, 통상값이나 분포 통계는 이 문서에 없다. 구체적 NM 분포는 **[미확인]**.

### 5-2. 구름 밖 우박 — [확인됨] / 거리 수치는 [조건부]

**수치:** 우박은 **가시 구름에서 수 마일(several miles) 떨어진 맑은 공기 중**에서 조우될 수 있다.

**원전 1:** FAA AC 00-24C §7d(1)
> "Eventually, the hailstones fall, possibly some distance from the storm core. **Hail may be encountered in clear air several miles from the thunderstorm.**"
> (결국 우박은 낙하하는데, 폭풍 핵으로부터 어느 정도 떨어진 곳일 수 있다. **우박은 뇌우로부터 수 마일 떨어진 맑은 공기 중에서 조우될 수 있다.**)

**원전 2:** FAA AC 00-24C §9b (기재 레이더 절) — 동일 문장이 *Aviation Weather Handbook* Ch.22에도 수록
> "Remember that while hail always gives a radar echo, it may fall several miles from the nearest visible cloud, and hazardous turbulence may extend to as much as 20 miles from the echo edge."
> (우박은 항상 레이더 에코를 만들지만, **가장 가까운 가시 구름으로부터 수 마일 떨어진 곳에 떨어질 수 있고**, 위험한 난류는 에코 가장자리로부터 최대 20마일까지 뻗칠 수 있다.)

**원전 3 (1983년판, 표현 확인용):** FAA AC 00-24B §"Hail"
> "Hail may be encountered in clear air several miles from dark thunderstorm clouds."
> (우박은 검은 뇌우구름으로부터 수 마일 떨어진 맑은 공기 중에서 조우될 수 있다.)

**중요한 정정 — [미확인]:** 항공 커뮤니티에서 흔히 인용되는 **"우박이 20마일 밖에서 떨어진다"** 는 표현의 FAA 원전을 찾지 못했다. FAA 원문에서 **20마일은 "난류"에 붙는 숫자**이고, **우박에 붙는 숫자는 "several miles(수 마일)"** 이다. 발표에서 이 둘을 섞으면 안 된다.

**원전 4 — 모루 아래 비행 금지:** FAA AC 00-24C §10a(3), AIM 7-1-27 a.3
> "Don't attempt to fly under the anvil of a thunderstorm. There is a potential for severe and extreme clear air turbulence."
> (뇌우의 모루 아래로 비행하려 하지 말라. 심한 등급과 극심한 등급의 청천난류 가능성이 있다.)

> 학생조종사에게: 구름 밖 몇 마일 떨어진 파란 하늘에서 우박을 맞을 수 있다. 훈련기에서 우박은 표면을 찌그러뜨리는 정도가 아니라 윈드실드를 깨고 날개 앞전을 변형시켜 양력을 잃게 만든다.

**우박 크기 기준 — [확인됨]:** FAA AC 00-24C §7d(2)
> "Hailstones larger than one-half inch in diameter can significantly damage an aircraft in a few seconds."
> (직경 0.5인치(약 13 mm)보다 큰 우박은 몇 초 만에 항공기에 상당한 손상을 줄 수 있다.)

---

## 6. 회피 권고거리 ★ 결론 슬라이드의 핵심

### 6-1. 수평 20 NM — 원문과 적용조건 — [확인됨]

**규정 원문:** FAA **AIM 7-1-27 a.14** (현행) = FAA **AC 00-24C §10a(14)**
> "Do avoid by at least 20 miles any thunderstorm identified as severe or giving an intense radar echo. This is especially true under the anvil of a large cumulonimbus."
> (심한(severe) 것으로 식별되었거나 강한(intense) 레이더 에코를 보이는 뇌우는 **최소 20마일 이상 회피하라.** 큰 적란운의 모루 아래에서는 특히 그렇다.)

**적용조건 (원문이 명시하는 것):**
- **강도 조건:** "severe로 식별" 또는 "intense radar echo". AC 00-24C §9c는 이를 더 구체화한다 —
> "Avoid heavy or extreme level echoes by at least 20 miles (i.e., such echoes should be separated by at least 40 miles before flying between them). Pilots may reduce the distance for avoiding weaker echoes."
> (heavy 또는 extreme 등급 에코는 최소 20마일 회피하라(즉, 그 사이로 비행하려면 에코 간 간격이 최소 40마일이어야 한다). 약한 에코에 대해서는 회피거리를 줄일 수 있다.)
- **강도 정의:** AC 00-24C Table 1 — heavy = **40–50 dBZ**, extreme = **50 dBZ 이상**
- **severe 뇌우 정의:** AC 00-24C §6l — 직경 1인치 이상 우박, 50 kt 이상 대류풍, 또는 토네이도
- **고도 조건:** **원문에 고도 조건은 없다.** 20마일은 모든 고도에 적용된다.

**근거가 되는 난류 서술:** AIM **7-1-26 항 2**
> "Severe turbulence can be expected up to 20 miles from severe thunderstorms. This distance decreases to about 10 miles in less severe storms."
> (심한 난류는 severe 뇌우로부터 20마일까지 예상될 수 있다. 이 거리는 덜 심한 폭풍에서는 약 10마일로 줄어든다.)

**AIM 7-1-26 항 3 (대문자 강조는 원문 그대로):**
> "NO FLIGHT PATH THROUGH AN AREA OF STRONG OR VERY STRONG RADAR ECHOES SEPARATED BY 20-30 MILES OR LESS MAY BE CONSIDERED FREE OF SEVERE TURBULENCE."
> (20~30마일 이하로 이격된 강한 또는 매우 강한 레이더 에코 구역을 통과하는 어떠한 비행 경로도 심한 난류가 없다고 간주될 수 없다.)

**최신 연구의 평가 — [확인됨]:** Hitchcock et al. (2025)
> "at 32 km from 10-dBZ echoes at flight altitude, the risk of MoG turbulence is nearly 5 times the background occurrence and that elevated risk extends beyond 100 km."
> (비행고도에서 10 dBZ 에코로부터 32 km(20마일) 지점에서 MoG 난류 위험은 배경 발생률의 거의 5배이며, 상승된 위험은 100 km 너머까지 뻗는다.)

> "like Lane et al. (2012), we find the risk of turbulence of any severity (including MoG) is twice the background risk as far away as 70 km (43 mi) from the 10-dBZ boundary."
> (Lane 등(2012)과 마찬가지로, 우리는 10 dBZ 경계로부터 **70 km(43마일)** 만큼 떨어진 곳에서도 (MoG 포함) 모든 강도의 난류 위험이 배경의 2배임을 발견했다.)

**→ 20 NM은 "안전선"이 아니라 "최소선"이다. 최신 연구는 20마일 지점에서도 위험이 5배임을 보인다.**

### 6-2. 수직 회피 — 운정 위로 얼마나 여유를 둬야 하는가 ★★ — [확인됨, 단 현행 AIM에서 삭제됨]

**규정 원문:** FAA **AIM 7-1-29 a.6** (2002년 2월 21일 개정판. 이후 7-1-30으로 재지정)
> "Do clear the top of a known or suspected severe thunderstorm by at least 1,000 feet altitude for each 10 knots of wind speed at the cloud top. This should exceed the altitude capability of most aircraft."
> (알려졌거나 의심되는 심한 뇌우의 꼭대기는 **운정에서의 풍속 10노트당 최소 1,000 ft**의 고도 여유를 두고 넘어라. **이는 대부분의 항공기의 고도 성능을 초과할 것이다.**)

*(출처: NTSB 사고조사 자료철에 첨부된 Summit Aviation Computerized Aviation Reference Library 2002-08-01 인쇄본 스캔. OCR 원문의 "1,OOO k t attitude"는 "1,000 feet altitude", "CapabilityOfIzlostaircraft"는 "capability of most aircraft"의 스캔 오류.)*

**같은 문서의 동반 조항 (현행 AIM 7-1-27 a.17에도 그대로 존속):**
> "Do regard as extremely hazardous any thunderstorm with tops 35,000 feet or higher whether the top is visually sighted or determined by radar."
> (운정이 **35,000 ft 이상**인 뇌우는, 그 꼭대기를 눈으로 봤든 레이더로 판정했든, **극도로 위험한 것으로 간주하라.**)

**★ 중대한 단서 — 이 조항은 현행 AIM에 없다 — [확인됨]**

본 문서가 현행 FAA AIM Chapter 7 Section 1(2025년 2월판) 7-1-27 전체 20개 항목을 직접 확인한 결과, **1,000 ft/10 kt 조항은 존재하지 않는다.** 삭제 경위는 다음과 같이 원전으로 확인된다.

Hitchcock et al. (2025), BAMS, Sidebar
> "Sometime after the Lane et al. (2012) study, the guideline in Fig. SB1e that they reference was removed and does not appear in the current guidance (FAA 2022, 2023)."
> (Lane 등(2012) 연구 이후 어느 시점에, 그들이 참조한 Fig. SB1e의 지침은 삭제되어 현행 지침(FAA 2022, 2023)에는 나타나지 않는다.)

> "Earlier studies and versions of FAA guidelines had included risk above cloud tops as a function of wind speed. While these guidelines have since been deleted, understanding this risk is still important."
> (이전 연구들과 FAA 지침의 이전 판본들은 풍속의 함수로서 운정 상부 위험을 포함했다. 이 지침들은 그 후 삭제되었지만, 이 위험을 이해하는 것은 여전히 중요하다.)

**삭제 이유 — [확인됨]:** 규칙이 **틀려서가 아니라, 풍속만으로는 부족하다는 것이 밝혀졌기 때문**이다. avwxtraining 요약에 따르면 NCAR RAL 연구는 1997년 7월 10일 노스다코타 Dickinson 상공 사례에서 **"AIM에 명시된 FAA 지침이 이 난류 조우를 회피하기에 불충분했다(inadequate)"** 고 결론했고, **난류의 연직 범위는 풍속이 아니라 운정 상부의 바람 시어 강도와 관련**되어 있었다.

**→ 발표에서의 올바른 서술:** "FAA는 예전에 운정 풍속 10노트당 1,000 ft를 요구했다. 이 조항은 현재 삭제되었는데, **완화되어서가 아니라 그것으로도 부족하다는 것이 밝혀져서**다. 대체 규정은 아직 없다."

**현행 지침의 수직 관련 문장 (남아 있는 것):**

| 문서 | 문장 | 값 |
| --- | --- | --- |
| FAA AC 00-24C §7b(1) / AWH CIT절 | "shear turbulence is encountered **several thousand feet above** … a severe storm" | 수천 ft 위 |
| AIM 7-1-27 a.17 | tops **35,000 ft** 이상은 극도로 위험 | 35,000 ft |
| AIM 7-1-26 항 1 | "recent studies show **little variation of turbulence intensity with altitude**" | 고도별 차이 거의 없음 |

**계산 예시 (규칙 적용, 산술은 본 문서의 유도):**
| 운정 풍속 | 요구 여유고도 | 운정 30,000 ft일 때 필요 비행고도 |
| --- | --- | --- |
| 30 kt | 3,000 ft | 33,000 ft |
| 50 kt | 5,000 ft | 35,000 ft |
| 80 kt (여름 제트) | 8,000 ft | 38,000 ft |
| 100 kt | 10,000 ft | 40,000 ft |

> 학생조종사에게: FAA의 옛 규칙대로면, 운정에 50노트가 불면 구름 꼭대기 위로 5,000 ft를 더 확보해야 한다. 그리고 FAA는 그 규칙을 쓰면서 직접 이렇게 덧붙였다 — "이것은 대부분의 항공기 성능을 넘어설 것이다."

### 6-3. 국내 대응 권고 — [미확인]

항공기상청·기상청·국토교통부 문서에서 **뇌우 수평 회피거리 또는 운정 상부 여유고도에 대한 정량 권고**를 찾지 못했다. 검색한 범위: 항공기상청 홈페이지·항공기상 용어사전·운항영향정보, 기상청 날씨누리, 한국항공운항학회지(KCI/DBpia 색인).

**국내에서 확인된 관련 정성 서술 (2차 출처, 학술지 본문 아님):** 적란운의 구름 가장자리에서 수십 km 밖까지 강한 난류가 나타날 수 있으며 시각적 탐지가 어렵다는 서술. **원 논문을 특정하지 못했으므로 발표 인용 불가.**

**실무적 판단:** 국내 운항은 ICAO Annex 3 / FAA 계열 지침을 준용하는 것이 통상이나, **그것을 명시한 국내 문서를 확인하지 못했다.** 이 항목은 미해결로 남긴다.

---

## 7. 고고도 성능 한계 — 훈련기는 애초에 올라갈 수 없다

### 7-1. Coffin corner — 개념 — [확인됨]

**정의:** 고고도에서 **저속 실속 버핏 시작 속도**와 **고속 마하 버핏 시작 속도**의 차이가 0에 수렴하는 지점. 비행 포락선에서 고받음각 실속 경계와 임계 마하수 경계가 만나는 지점. Aerodynamic ceiling 또는 Q corner라고도 한다.

**원전:** SKYbrary, *Coffin Corner* (EUROCONTROL 운영)
> "the point at which the Flight Envelope boundary defined by a high incidence stall intersects with that defined by the critical Mach number, occurring when the aircraft has climbed to an altitude where the speed differential between the onset of low speed stall buffet and the onset of high speed Mach buffet approaches zero."
> (고받음각 실속으로 정의된 비행 포락선 경계가 임계 마하수로 정의된 경계와 교차하는 지점으로, 저속 실속 버핏 시작과 고속 마하 버핏 시작 사이의 속도 차이가 0에 접근하는 고도까지 항공기가 상승했을 때 발생한다.)

**FAA 정의 (SKYbrary가 인용):**
> "a term used to describe operations at high altitudes where low IAS yield high True Airspeed (TAS) as indicated by Mach number at high angles of attack (AOA)."
> (높은 받음각에서 마하수로 나타나듯이 낮은 지시대기속도가 높은 진대기속도를 내는, 고고도 운용을 기술하는 용어.)

**위험 기구:**
> "The high limit for Mach buffet and low limit for stall buffet are so close together during steady flight that exceeding the limits, as a result of turning maneuvers or clear air turbulence, may cause loss of control of the aircraft."
> (정상 비행 중 마하 버핏의 상한과 실속 버핏의 하한이 매우 가까워서, **선회 기동이나 청천난류의 결과로** 한계를 초과하면 항공기 조종성 상실을 일으킬 수 있다.)

**★ 정직한 단서 — [본 문서의 판단]:** **Coffin corner는 제트 순항고도(통상 FL350 이상)의 현상이다. 왕복엔진 훈련기는 coffin corner에 도달하기 훨씬 전에 실용상승한도에 막힌다.** 발표에서 "훈련기가 coffin corner에 빠진다"고 말하면 부정확하다. **훈련기의 진짜 벽은 아래 7-2의 실용상승한도다.** Coffin corner는 "고고도로 넘어가는 대형기조차 여유가 좁다"는 맥락에서 언급해야 한다.

### 7-2. 훈련기 실용상승한도 — ★ 이것이 진짜 벽 — [확인됨 / 일부 조건부]

| 기종 | 실용상승한도 | 판정 | 출처 |
| --- | --- | --- | --- |
| **Cessna 172S Skyhawk** | **14,000 ft (4,267 m)** | [확인됨] | Cessna(Textron Aviation) 공식 제원표: "Service Ceiling: 14,000 ft (4,267 m)" |
| **Cirrus SR20** | **17,500 ft** | [조건부 — 2차 출처] | 복수 항공기 제원 데이터베이스에서 일치. 제조사 원문 직접 확인 못함 |
| **Diamond DA40 NG** | **16,400 ft** | [조건부 — 2차 출처] | 복수 2차 출처에서 일치. 제조사 원문 직접 확인 못함 |

**적용조건·한계:** 실용상승한도는 **최대이륙중량·표준대기·신품 엔진** 기준의 인증 수치다. 실제로는 여기에 **여름철 고온(밀도고도 상승)·2인 이상 탑승·연료 만재**가 겹치면 도달 가능 고도는 이보다 **수천 ft 낮아진다.** 또한 실용상승한도의 정의 자체가 "상승률 100 fpm이 남는 고도"이므로, 그 고도에서는 사실상 더 이상 올라가지 못한다.

### 7-3. 여름철 적란운 운정고도 — 비교 대상 — [확인됨 / 일부 조건부]

| 기준 | 고도 | 판정 | 출처 |
| --- | --- | --- | --- |
| FAA "극도로 위험" 기준선 | **35,000 ft** | [확인됨] | AIM 7-1-27 a.17 |
| 미국 최고 에코탑 (10년 관측) | **24 km ≈ 78,700 ft** | [확인됨] | Cooney et al. (2018), JGR |
| 한국 — 2022-08-08 서울 집중호우 강한 뇌우 사례 | **11 ~ 14.8 km ≈ 36,000 ~ 48,500 ft** | [조건부 — 단일 사례] | Asia-Pacific J. Atmos. Sci. (2023) |
| 한국 — 같은 날 중간 강도 사례 | **10 ~ 12.1 km ≈ 32,800 ~ 39,700 ft** | [조건부 — 단일 사례] | 동일 |

**한국 사례 원전:** *Polarimetric Radar Signatures in Various Lightning Activities During Seoul (Korea) Flood on August 8, 2022*, **Asia-Pacific Journal of Atmospheric Sciences (2023)**, doi:10.1007/s13143-023-00346-0. 용인 RKSG WSR-88D 관측.
> "The corresponding heights for these ranges are approximately 11–14.8 km in the intense 1 case and 10–12.1 km in the moderate case."
> (해당 구간의 고도는 강한 1 사례에서 약 11~14.8 km, 중간 사례에서 10~12.1 km이다.)

**적용조건·한계:** 이것은 **2022년 8월 8일 서울 집중호우 단일 사례**의 레이더 관측 고도이지, 한국 여름철 CB 운정의 **기후통계가 아니다.** 국내 여름철 CB 운정고도 기후통계는 **[미확인]** — 기상청 자료개방포털에 원시 레이더 자료는 있으나, 정리된 운정고도 통계 간행물을 찾지 못했다.

### 7-4. ★ 결정적 비교 — 숫자 하나로 끝나는 논증

| | 고도 |
| --- | --- |
| **C172S가 도달할 수 있는 최고 고도** | **14,000 ft** |
| **한국 여름 강한 뇌우의 운정 (2022-08-08 서울 사례, 에코 기준)** | **36,000 ~ 48,500 ft** |
| **차이** | **22,000 ~ 34,500 ft — 훈련기 상승한도의 1.5배에서 2.5배를 더 올라가야 한다** |

여기에 6-2의 여유고도 요구(운정 풍속 50 kt 가정 시 +5,000 ft)를 더하면 필요 고도는 **41,000 ~ 53,500 ft**가 된다.

**그리고 위 운정고도조차 "에코탑" 기준이다 — 실제 구름 꼭대기는 이보다 더 높다(3-2 참조).**

> 학생조종사에게: 당신의 C172는 14,000 ft가 천장이다. 작년 여름 서울 위 뇌우는 36,000~48,500 ft였다. 넘는 게 어려운 게 아니라, **넘을 수 있는 고도의 3분의 1 지점에서 이미 엔진이 더 이상 못 올라간다.** 이건 기술의 문제가 아니라 산수의 문제다.

---

## 종합 — 왜 넘을 수 없는가

확보한 원전 수치만으로, 조종사의 질문에 대한 반론을 다섯 단계로 엮는다.

### ① 넘어야 할 높이를 애초에 모른다

레이더가 보여주는 **에코탑은 18 dBZ 강수 입자의 천장**이지 구름의 천장이 아니다 [WDTD, ForeFlight — 확인됨]. 같은 오버슈팅탑을 항공기 라이다로 재면 모루 위 **2 km**, 강수레이더로 재면 **0.67 km**다 [Bedka et al. 2010 — 확인됨]. **관측 장비가 강수를 보느냐 얼음 결정을 보느냐에 따라 3배가 차이 난다.** 게다가 레이더 빔은 10마일마다 1,000 ft씩 퍼져 120마일에서 2마일 폭이 되고 [NOAA JetStream — 확인됨], 너무 멀어도(200 km) 너무 가까워도(50 km) 폭풍 꼭대기를 놓친다 [Lakshmanan et al. 2013 — 확인됨]. 국내 관측에서도 강수가 셀수록 레이더 운정이 낮아진다 [오수빈 외 2014, 『대기』 — 조건부].

**→ "저 구름은 30,000 ft"라는 숫자는 하한값이지 실제값이 아니다.**

### ② 그 숫자마저 이미 과거다

에코탑 갱신은 5분 주기이고 [FAA AIM TBL 7-1-9 — 확인됨], 데이터링크 영상은 표시된 시각보다 **15~20분 더 오래된 것**이다 [AC 00-24C §10a(8) — 확인됨]. 그 사이 적운 단계 상승기류는 **3,000 fpm**, 슈퍼셀은 **9,000 fpm**으로 올라간다 [FAA-H-8083-28 Ch.22 — 확인됨]. FAA는 같은 문서에서 아예 이렇게 못 박는다 — *"Thunderstorms build and dissipate rapidly. Therefore, do not attempt to plan a course between echoes."*

**→ 당신이 보는 것은 구름의 옛날 사진이다. 그 사진을 보고 넘을 고도를 정할 수 없다.**

### ③ 넘었다 해도 위험은 구름에서 끝나지 않는다

9년간 미국 상공 상용기 난류 보고 자료 기준 [Hitchcock et al. 2025, BAMS — 확인됨]:
- 에코탑 **2 km(6,600 ft) 위** → MoG 난류 위험 **배경의 20배 초과**
- 수평 20마일 + 에코탑 **4 km(13,000 ft) 위** → 여전히 **배경의 2배 초과**
- 에코탑 **5 km(16,400 ft) 초과 위** + 수평 20 km → 여전히 **배경의 2배**
- **"모든 연직 이격거리에서 배경보다 높게 유지된다"**

기구는 중력파 부서짐이다. 오버슈팅탑 **위 약 1 km 지점**에서 전형적으로 발생하며 [Lane et al. 2003, Griffin et al. 2016 인용 — 확인됨], **구름을 동반하지 않으므로 눈에 보이지 않는다.** FAA도 이를 인정한다 — *"shear turbulence is encountered several thousand feet above … a severe storm"* [AC 00-24C §7b(1) — 확인됨].

그리고 모루는 풍하측으로 **수백 마일** 뻗고 [AC 00-24C §6a — 확인됨], 우박은 가시 구름에서 **수 마일 떨어진 맑은 공기 중**에 떨어진다 [AC 00-24C §7d(1) — 확인됨]. 직경 0.5인치 우박이면 몇 초 만에 상당한 손상을 준다.

**→ "구름 위 맑은 하늘"은 안전 구역이 아니다. 통계적으로 평소의 20배 위험한 구역이다.**

### ④ 규정이 요구하는 여유고도가 애초에 성능을 넘는다

FAA는 2002년판 AIM 7-1-29 a.6에서 이렇게 요구했다 [확인됨]:

> *"Do clear the top of a known or suspected severe thunderstorm by at least 1,000 feet altitude for each 10 knots of wind speed at the cloud top. **This should exceed the altitude capability of most aircraft.**"*
> (운정 풍속 10노트당 최소 1,000 ft 여유를 두고 넘어라. **이는 대부분의 항공기의 고도 성능을 초과할 것이다.**)

**FAA가 규칙을 쓰면서 같은 문장 안에 "대부분의 항공기는 못 한다"고 적어 놓았다.**

이 조항은 현행 AIM에서 삭제되었다 [본 문서가 현행 AIM 7-1-27 전문 확인]. **완화되어서가 아니다.** Lane et al. (2012) 이후 삭제되었고 [Hitchcock et al. 2025 — 확인됨], NCAR RAL 연구는 실제 난류 조우 사례에서 **"AIM 지침이 회피에 불충분했다"**, 난류의 연직 범위는 풍속이 아니라 **운정 상부 바람 시어**에 좌우된다고 결론했다.

**→ 규칙이 사라진 이유는 "넘어도 된다"가 아니라 "그 정도로도 부족하다"였다. 그리고 대체 규정은 아직 없다.**

### ⑤ 그리고 훈련기는 애초에 그 고도에 갈 수 없다

| | |
| --- | --- |
| C172S 실용상승한도 | **14,000 ft** [Cessna 공식 — 확인됨] |
| DA40 NG | 16,400 ft [조건부] |
| Cirrus SR20 | 17,500 ft [조건부] |
| FAA "극도로 위험" 기준 운정 | **35,000 ft** [AIM 7-1-27 a.17 — 확인됨] |
| 2022-08-08 서울 강한 뇌우 (에코 기준) | **36,000 ~ 48,500 ft** [APJAS 2023 — 조건부, 단일 사례] |

C172S는 FAA가 "극도로 위험"이라 규정한 35,000 ft의 **40%**까지밖에 올라가지 못한다. 여기에 ④의 여유고도(50 kt 가정 +5,000 ft)를 더하면 필요 고도는 **41,000 ft 이상**이 되고, ①에 따라 실제 운정은 표시된 에코탑보다 더 높다.

**→ "넘을 수 있는가"의 문제가 아니다. 넘을 수 있는 고도의 3분의 1 지점에서 이미 엔진이 멈춘다.**

### 한 문장 결론

**넘어야 할 높이는 알 수 없고(①), 안다 해도 그 숫자는 과거이며(②), 넘어도 위험은 위로 수천 ft 더 이어지고(③), 규정이 요구하는 여유고도는 FAA 스스로 "대부분의 항공기 성능을 넘는다"고 적었으며(④), 훈련기는 그 고도의 3분의 1도 못 올라간다(⑤).**

> 학생조종사에게: 적란운을 넘는다는 계획은 다섯 군데에서 동시에 무너진다. 그중 마지막 하나만으로도 충분하다 — **당신의 비행기는 거기 못 올라간다.**

---

## 부록 A — 확보 실패 항목 (추측 금지 원칙에 따라 공란)

| 항목 | 필요했던 수치 | 상태 |
| --- | --- | --- |
| 1 | 에코탑–운정 차이의 FAA/NOAA 공식 ft 값 | **[미확인]** — 2차 출처(항공 전문지) 5,000~10,000 ft만 확보 |
| 1 | 국내 기상청 S밴드 레이더 빔폭 사양 | **[미확인]** |
| 2 | 운정 자체의 상승률 (ft/min) | **[미확인]** — 상승기류 속도만 확보 |
| 2 | 국내 레이더/에코탑 산출물 갱신주기 | **[미확인]** |
| 3 | 오버슈팅탑 개별 지속시간 (분) | **[미확인]** |
| 5 | 모루 확장거리의 통상값·분포 (NM) | **[미확인]** — "수백 마일" 상한 표현만 확보 |
| 5 | 구름 밖 우박 조우 거리의 구체값 | **[미확인]** — "several miles"만 확보. **널리 인용되는 "20마일"의 FAA 원전은 존재하지 않는 것으로 보임** |
| 6 | 항공기상청·국토교통부의 정량 회피 권고 | **[미확인]** |
| 7 | DA40 NG / SR20 제조사 원문 제원 | **[조건부]** — 2차 출처 일치 |
| 7 | 한국 여름철 CB 운정고도 기후통계 | **[미확인]** — 단일 사례 연구만 확보 |

## 부록 B — 원전 목록

**FAA 규정·지침**
1. FAA, *Aeronautical Information Manual*, Chapter 7 Section 1 (현행, 2025-02-20판) — 7-1-26 Thunderstorms, 7-1-27 Thunderstorm Flying, TBL 7-1-9 FIS-B Product Update and Transmission Intervals
2. FAA, *Aeronautical Information Manual* 7-1-29 (2002-02-21 개정판) — NTSB 사고자료철 첨부 스캔본. **1,000 ft/10 kt 조항의 원전**
3. FAA, Advisory Circular **AC 00-24C**, *Thunderstorms*, 2013-02-19
4. FAA, Advisory Circular **AC 00-24B**, *Thunderstorms*, 1983-01-20 — NTSB 사고자료철 첨부
5. FAA, *Aviation Weather Handbook* **FAA-H-8083-28**, Chapter 22 *Thunderstorms* (2024)

**학술 원전**
6. Hitchcock, Lane, Deierling, Sharman, Trier, Homeyer (2025), *Spatial Patterns of Turbulence near Thunderstorms*, **Bull. Amer. Meteor. Soc., 106(1), E1–E17**, doi:10.1175/BAMS-D-23-0142.1
7. Bedka, Brunner, Dworak, Feltz, Otkin, Greenwald (2010), *Objective Satellite-Based Detection of Overshooting Tops Using Infrared Window Channel Brightness Temperature Gradients*, **J. Appl. Meteor. Climatol., 49, 181–202**, doi:10.1175/2009JAMC2286.1
8. Griffin, Bedka, Velden (2016), *A Method for Calculating the Height of Overshooting Convective Cloud Tops Using Satellite-Based IR Imager and CloudSat Cloud Profiling Radar Observations*, **J. Appl. Meteor. Climatol., 55, 479–491**
9. Cooney, Bowman, Homeyer, Fenske (2018), *Ten Year Analysis of Tropopause-Overshooting Convection Using GridRad Data*, **J. Geophys. Res. Atmos., 123, 329–343**, doi:10.1002/2017JD027718
10. Lakshmanan, Hondl, Potvin, Preignitz (2013), *An Improved Method for Estimating Radar Echo-Top Height*, **Wea. Forecasting, 28(2), 481–488** — 초록·스니펫 수준만 확보
11. Lane, Sharman, Trier, Fovell, Williams (2012), *Recent Advances in the Understanding of Near-Cloud Turbulence*, **Bull. Amer. Meteor. Soc., 93, 499–515** — Hitchcock et al. (2025)를 통한 간접 확보
12. Lane, Sharman, Clark, Hsu (2003) — Griffin et al. (2016)을 통한 간접 확보 ("CIT ~1 km above an OT")

**NOAA/NWS**
13. NOAA JetStream, *JetStream Max: Radar Beams*
14. NOAA/NWS Warning Decision Training Division, *xx dBZ Echo Top (ET)*

**국내**
15. 오수빈·원혜영·하종철·정관영 (2014), 「Ka-band 구름레이더와 천리안위성으로 관측된 운정고도 비교」, **『대기』 한국기상학회지 24(1), 39–48**, doi:10.14191/Atmos.2014.24.1.039
16. *Polarimetric Radar Signatures in Various Lightning Activities During Seoul (Korea) Flood on August 8, 2022*, **Asia-Pacific J. Atmos. Sci. (2023)**, doi:10.1007/s13143-023-00346-0

**기타**
17. SKYbrary (EUROCONTROL), *Coffin Corner*
18. Cessna / Textron Aviation, Skyhawk 공식 제원표
19. EUMETSAT Convection Working Group, *Overshooting Cloud Top Detection*
20. ForeFlight, *Got Echo Tops?* (2015-12-21)
21. *Flying Magazine*, *What Are Echo Tops?* — 2차 출처, 5,000~10,000 ft 값의 유일한 근거
