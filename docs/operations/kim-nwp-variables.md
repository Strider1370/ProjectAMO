# KIM 수치모델 API 변수 참고

출처: 기상청 API허브 `한국형수치모델(KIM)변수정보.pdf` + `한국형수치예보모델(KIM) 표준화 자료 조회(NC)` 문서.
2026-08-08 기준. 수치모델 변수를 추가할 때 이 문서만 보면 되도록 정리했다.

---

## 1. API 주소

### 사용할 주소 (표준화, typ06)

```
격자영역: https://apihub.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std
임의지점: https://apihub.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_pt_txt2_std
```

### 구 주소 (typ01) — 언젠가 닫힐 예정

```
격자영역: https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_xy_txt2
임의지점: https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_pt_txt2
```

구 주소 문서에 명시: **2026.7.1. 이후 표준화 자료(NC)와 동일한 데이터 사용.**
2026-08-08 실측으로 두 주소의 응답이 완전히 일치함을 확인했다(아래 5절).

### 인증키 주의

typ06는 typ01과 **별도 활용신청**이 필요하다. 실측 결과:

| 주소 | `KMA_KIM_NWP_AUTH_KEY` | `KMA_AVIATION_AUTH_KEY` |
|---|---|---|
| typ01 (구) | 정상 | (미확인) |
| typ06 (표준화) | **403 "활용신청이 필요한 API 입니다"** | 정상 |

즉 typ06로 옮기려면 항공 키를 쓰거나, KIM 키로 typ06 활용신청을 추가로 해야 한다.

---

## 2. 요청 인자

| 인자 | 의미 | 값 |
|---|---|---|
| `group` | 모델 구분 | `KIMG`(전구) / `KIMR`(지역) / `KIML`(국지) |
| `nwp` | 모델기반 종류 | `NE57`(전구, '26.1.19.~) / `R030`(지역, '26.2.9.~) / `L010`(국지, '26.2.9.~) |
| `data` | 자료 종류 | `P`(등압면) / `U`(단일면) |
| `name` | 변수명 | 아래 3절 표 참조. **대소문자 구분** |
| `level` | 고도 | 등압면=hPa 값. 단일면=층이 있으면 값 필요, 없으면 0. 생략 시 전 고도 표출 |
| `map` | 사용 영역 | `F`(전체) / `S`(일부 격자) |
| `sub` | 격자영역 | `map=S`일 때 `x_min,y_min,x_max,y_max`. 최소 격자점은 `[1,1]` |
| `tmfc` | 분석시간 | UTC `YYYYMMDDHH`. 조회기간은 영역별 상이 (구 문서 기준 최근 180일) |
| `hf` | 예측시간 | 시간 단위. 전지구는 '26.6.22. 이후 1~135는 1시간 간격, 138~288은 3시간 간격 |
| `disp` | 표출형식 | `A` |
| `help` | 도움말 | `1`이면 헤더에 도움말 추가 |
| `X`, `Y` | 격자번호 | `pt` 주소에서 임의 격자점 조회 시 |
| `lat`, `lon` | 위경도 | `pt` 주소에서 임의 위경도 조회 시 |
| `authKey` | 인증키 | 위 인증키 주의 참조 |

### 격자번호 ↔ 경위도 환산 (전구 NE57, 1/12° 격자)

```
경도 = (x - 1) / 12
위도 = (y - 1) / 12 - 90

x = 경도 * 12 + 1
y = (위도 + 90) * 12 + 1
```

전구 전체 격자는 4321 x 2161. 응답 헤더가 `lon1/lat1/lon2/lat2`를 직접 알려주므로 새 영역을
잡을 때는 `help=1`로 한 번 호출해 확인하면 된다.

ProjectAMO 현재값 `sub=1429,1441,1633,1609` = 119.0~136.0E / 30.0~44.0N, 205 x 169 격자.
(2026-08-08 응답 헤더 `lon1 = 119.0, lat1 = 30.0`으로 검증됨)

---

## 3. 변수 목록

### 3.1 전구모델 (KIMG / NE57) — 등압면 `data=P`

연직층 24개: `1000 975 950 925 900 875 850 800 750 700 650 600 550 500 450 400 350 300 250 200 150 100 70 50` hPa
※ 상층 7층(30, 20, 10, 7, 5, 3, 1 hPa) 자료는 별도 생산

| 생산요소 | 변수이름 | 변수명 | 단위 | 유효자릿수 |
|---|---|---|---|---|
| 기압 | Geopotential Height | `hgt` | m | 정수 |
| 기온 | Air temperature | `T` | K | 2자리 |
| 바람 | Zonal wind | `u` | m/s | 2자리 |
| 바람 | Meridional wind | `v` | m/s | 2자리 |
| 바람 | Vertical wind | `w` | m/s | 3자리 |
| 습도 | Relative Humidity | `rh` | % | 2자리 |
| 습도 | Specific Humidity | `q` | kg/kg | 6자리 |
| 습도 | Relative Humidity With Respect to Water | `rh_liq` | % | 2자리 |
| 구름물리량 | Cloud Liquid Water Content | `tqc` | kg/kg | 7자리 |
| 구름물리량 | Rain Water Content | `tqr` | kg/kg | 6자리 |
| 구름물리량 | Cloud Ice Content | `tqi` | kg/kg | 7자리 |
| 구름물리량 | Snow Content | `tqs` | kg/kg | 6자리 |
| 구름물리량 | Area Cloud Fraction in Each Layer | `cld` | 1 | 2자리 |
| 구름물리량 | Bulk Cloud Fraction in Each Layer | `cldbulk` | 1 | 2자리 |

### 3.2 전구모델 (KIMG / NE57) — 단일면 `data=U`

| 생산요소 | 변수이름 | 변수명 | 연직고도 | 단위 | 유효자릿수 |
|---|---|---|---|---|---|
| 기압(고도) | Surface pressure | `ps` | surface | Pa | 정수 |
| 기압(고도) | Mean sea level pressure | `psl` | mean sea level | Pa | 정수 |
| 기압(고도) | Freezing level height | `frl` | 0℃ isotherm | m | 1자리 |
| 기압(고도) | Wet bulb temperature freezing level height | `wbfrlh` | lowest level of the wet bulb zero | m | 1자리 |
| 기온 | Sea surface temperature | `sst` | surface | K | 2자리 |
| 기온 | Surface temperature | `tsfc` | surface | K | 2자리 |
| 기온 | 2m temperature | `t2m` | 2 m above ground | K | 2자리 |
| 기온 | 2m max temperature | `tmax` | 2 m above ground | K | 2자리 |
| 기온 | 2m min temperature | `tmin` | 2 m above ground | K | 2자리 |
| 바람 | 10m zonal wind | `u10m` | 10 m above ground | m/s | 2자리 |
| 바람 | 10m meridional wind | `v10m` | 10 m above ground | m/s | 2자리 |
| 바람 | 10m gust: max wind speed | `gust` | 10 m above ground | m/s | 2자리 |
| 바람 | 80m zonal wind | `u80m` | 80 m above ground | m/s | 2자리 |
| 바람 | 80m meridional wind | `v80m` | 80 m above ground | m/s | 2자리 |
| 습도 | 2m relative humidity | `rh2m` | 2 m above ground | % | 2자리 |
| 습도 | 2m relative humidity with respect to water | `rh2m_liq` | 2 m above ground | % | 2자리 |
| 습도 | 2m mixing ratio | `qv2m` | 2 m above ground | kg/kg | 6자리 |
| 습도 | 2m specific humidity | `q2m` | 2 m above ground | kg/kg | 6자리 |
| 습도 | Dew Point Temperature | `td2m` | 2 m above ground | K | 2자리 |
| 습도 | Evapotranspiration rate | `evptrnr` | - | kg/(m²·s) | 8자리 |
| 강수 | Precipitation flux | `pr` | surface | kg/(m²·s) | 6자리 |
| 강수 | Large scale precipitation amount | `precl` | surface | kg/m² | 2자리 |
| 강수 | Convective precipitation amount | `precc` | surface | kg/m² | 2자리 |
| 강수 | Precipitation amount | `prec_acc` | surface | kg/m² | 1자리 |
| 강수 | Large scale rainfall amount | `rainl_acc` | surface | kg/m² | 1자리 |
| 강수 | Convective rainfall amount | `rainc_acc` | surface | kg/m² | 1자리 |
| 강설 | Large scale snowfall amount | `snowl_acc` | surface | kg/m² | 1자리 |
| 강설 | Convective snow amount | `snowc_acc` | surface | kg/m² | 1자리 |
| 강설 | Snow Depth | `snowd` | surface | m | 2자리 |
| 강설 | Snow Density | `sndens` | surface | kg/m³ | 2자리 |
| 강설 | Snow water equivalent | `weasd` | surface | kg/m² | 1자리 |
| 강설 | Snow fraction | `srflag` | surface | 0~1 | 2자리 |
| 운량/운고/운저 | Low Cloud Cover | `lcld` | entire atmosphere (single layer) | 0~1 | 2자리 |
| 운량/운고/운저 | Medium Cloud Cover | `mcld` | entire atmosphere (single layer) | 0~1 | 2자리 |
| 운량/운고/운저 | High Cloud Cover | `hcld` | entire atmosphere (single layer) | 0~1 | 2자리 |
| 운량/운고/운저 | Total Cloud Cover | `tcld` | atmos col. | 0~1 | 2자리 |
| 운량/운고/운저 | Convective Cloud Cover | `tcldc` | entire atmosphere (single layer) | 0~1 | 2자리 |
| 운량/운고/운저 | Air pressure at convective cloud base | `ccb` | convective cloud bottom level | Pa | 정수 |
| 운량/운고/운저 | Air pressure at convective cloud top | `cct` | convective cloud top level | Pa | 정수 |
| land/ice mask | Land Cover | `slmsk` | surface | 0=sea, 1=land, 2=seaice | 정수 |
| land/ice mask | Ice Cover | `seaice` | surface | 0~1 | 2자리 |
| 경계층 | Planetary Boundary Layer Regime | `pbltype` | planetary boundary layer | - | 정수 |
| 경계층 | Planetary Boundary Layer Height | `hpbl` | planetary boundary layer | m | 1자리 |
| 마찰 | Frictional Velocity | `ustar` | 0 m above ground | m/s | 4자리 |
| 마찰 | Surface Roughness | `znt` | surface | m | 4자리 |
| 토양수분 | Soil Moisture | `soilm` | 0-0.1 / 0.1-0.4 / 0.4-1 / 1-2 m below ground | kg/m³ | 3자리 |
| 지층온도 | Soil Temperature | `soilt` | 0-0.1 / 0.1-0.4 / 0.4-1 / 1-2 m below ground | K | 2자리 |
| 플럭스 | Sensible Heat Net Flux | `shtfl` | surface | W/m² | 1자리 |
| 플럭스 | Latent Heat Net Flux | `lhtfl` | surface | W/m² | 1자리 |
| 플럭스 | Net Short Wave Radiation Flux | `rss` | surface | W/m² | 1자리 |
| 플럭스 | Net Long Wave Radiation Flux | `rls` | surface | W/m² | 2자리 |
| 플럭스 | Downward Long-Wave Rad. Flux | `dlwrsfc` | surface | W/m² | 2자리 |
| 플럭스 | Downward Short-Wave Radiation Flux | `dswrsfc` | surface | W/m² | 1자리 |
| 플럭스 | Upward Long-Wave Rad. Flux | `ulwrtoa` | top of atmosphere | W/m² | 2자리 |
| 플럭스 | Downward Short-Wave Radiation Flux | `dswrtoa` | top of atmosphere | W/m² | 1자리 |
| surface stress | Eastward Turbulent Surface Stress | `tauu` | surface | Pa | 3자리 |
| surface stress | Northward Turbulent Surface Stress | `tauv` | surface | Pa | 3자리 |
| 지형 | topography | `topo` | surface | m | 1자리 |

### 3.3 지역모델 (KIMR / R030), 국지모델 (KIML / L010)

**지역과 국지의 변수 목록은 완전히 동일하다.** 전구와 달리 **변수명이 대문자**다.

#### 등압면 `data=P`

연직층 24개: 전구와 동일 (`1000 … 50 hPa`)

| 생산요소 | 변수설명 | 변수명 | 단위 | 유효자릿수 |
|---|---|---|---|---|
| 기압 | Geopotential height | `GPH` | m | 정수 |
| 기온 | Temperature | `T` | K | 2자리 |
| 바람 | Zonal wind | `U` | m/s | 2자리 |
| 바람 | Meridional wind | `V` | m/s | 2자리 |
| 바람 | Vertical velocity | `W` | m/s | 3자리 |
| 습도 | Relative Humidity | `RH` | % | 2자리 |
| 구름물리량 | Cloud fraction | `CLDFRA` | - | 2자리 |
| 구름물리량 | Water vapor mixing ratio | `QVAPOR` | kg/kg | 6자리 |
| 구름물리량 | Cloud Water Mixing Ratio | `QCLOUD` | kg/kg | 7자리 |
| 구름물리량 | Rain water Mixing Ratio | `QRAIN` | kg/kg | 7자리 |
| 구름물리량 | Ice Water Mixing Ratio | `QICE` | kg/kg | 7자리 |
| 구름물리량 | Snow Mixing Ratio | `QSNOW` | kg/kg | 7자리 |
| 구름물리량 | Graupel mixing ratio | `QGRAUP` | kg/kg | 7자리 |

**주의: `rh_liq`(물에 대한 상대습도)가 없다.** ProjectAMO 착빙 산출의 핵심 입력이므로,
지역/국지 모델만으로는 현재 방식의 착빙 계산을 그대로 옮길 수 없다.

#### 단일면 `data=U`

| 생산요소 | 변수설명 | 변수명 | 층정보 | 단위 | 유효자릿수 |
|---|---|---|---|---|---|
| 기압 | Sea level pressure | `MSLP` | Mean sea level | Pa | 정수 |
| 기압 | Surface pressure | `PSFC` | surface | Pa | 정수 |
| 기온 | Surface skin temperature | `TSKIN` | surface | K | 2자리 |
| 기온 | Temperature at 2 m | `T2` | 2m above ground | K | 2자리 |
| 기온 | Sea surface temperature | `SST` | surface | K | 2자리 |
| 지중온도 | Soil temperature | `SOILT` | 4개층 0.1/0.3/0.6/1.0m 지하 | K | 2자리 |
| 바람 | Wind speed (gust) | `GUST` | single-layer | m/s | 2자리 |
| 바람 | Zonal wind at 10 m | `U10` | 10m above ground | m/s | 2자리 |
| 바람 | Zonal wind at 80 m | `U80` | 80m above ground | m/s | 2자리 |
| 바람 | Zonal wind at 140 m | `U140` | 140m above ground | m/s | 2자리 |
| 바람 | Zonal wind at 220 m | `U220` | 220m above ground | m/s | 2자리 |
| 바람 | Meridional wind at 10 m | `V10` | 10m above ground | m/s | 2자리 |
| 바람 | Meridional wind at 80 m | `V80` | 80m above ground | m/s | 2자리 |
| 바람 | Meridional wind at 140 m | `V140` | 140m above ground | m/s | 2자리 |
| 바람 | Meridional wind at 220 m | `V220` | 220m above ground | m/s | 2자리 |
| 바람 | Maximum wind speed at 10m | `SPDUV10MAX` | 10m above ground | m/s | 2자리 |
| 바람 | Mean wind speed at 10m | `SPDUV10MEAN` | 10m above ground | m/s | 2자리 |
| 바람 | Frictional velocity | `UST` | Surface | m/s | 2자리 |
| 습도 | Relative humidity at 2 m | `RH2` | 2m above ground | % | 2자리 |
| 강수 | Accumulated total cumulus precipitation | `RAINC` | surface | mm | 2자리 |
| 강수 | Accumulated total grid scale precipitation | `RAINNC` | surface | mm | 2자리 |
| 강수 | Accumulated total precipitation | `RAIN` | surface | mm | 2자리 |
| 강설 | Accumulated total grid scale snow and ice | `SNOW` | surface | mm | 2자리 |
| 강설 | Accumulated total grid scale graupel | `GRAUPEL` | surface | mm | 2자리 |
| 경계층 | Planetary boundary layer height | `PBLH` | surface | m | 1자리 |
| 플럭스 | SW surface downward direct irradiance (FARMS) | `SWDDIR2` | surface | W/m² | 2자리 |
| 플럭스 | SW surface downward diffuse irradiance (FARMS) | `SWDDIF2` | surface | W/m² | 2자리 |
| 플럭스 | SW surface downward direct normal irradiance (FARMS) | `SWDDNI2` | surface | W/m² | 2자리 |
| 플럭스 | Accumulated downwelling shortwave flux at bottom | `ACSWDNB` | surface | MJ/m² | 2자리 |
| 플럭스 | Latent heat flux at the surface | `LH` | surface | W/m² | 2자리 |
| 플럭스 | Upward heat flux at the surface | `HFX` | surface | W/m² | 2자리 |
| 플럭스 | TOA outgoing long wave | `OLR` | Top of atmosphere | W/m² | 2자리 |
| 시정 | Visibility | `VIS` | single-layer | m | 정수 |
| 시정 | Fog fraction | `FOGFRAC` | single-layer | - | 2자리 |
| 안정도 | Maximum CAPE | `MCAPE` | single-layer | J/kg | 1자리 |
| 안정도 | Maximum CIN | `MCIN` | single-layer | J/kg | 2자리 |
| 토양수분 | Soil Moisture | `SOILM` | 4개층 0.1/0.3/0.6/1.0m 지하 | m³/m³ | 2자리 |
| 운량 | Low Cloud Cover | `LCDC` | single-layer | 0~1 | 2자리 |
| 운량 | Medium Cloud Cover | `MCDC` | single-layer | 0~1 | 2자리 |
| 운량 | High Cloud Cover | `HCDC` | single-layer | 0~1 | 2자리 |

**전구에 없고 지역/국지에만 있는 항공 관련 변수: `VIS`(시정), `FOGFRAC`(안개), `MCAPE`/`MCIN`(불안정도).**

---

## 4. ProjectAMO 현재 사용 현황

모델: `KIMG` / `NE57` (전구). `backend/src/processors/kim-nwp-model.js` 의 `KIM_NWP_MODEL`.

### 수집 변수 (13개)

| 변수 | `data` | 쓰이는 곳 |
|---|---|---|
| `u`, `v` | P | 바람 오버레이, 항로 단면 |
| `T` | P | 기온 오버레이, 착빙 하드게이트 |
| `hgt` | P | 고도 |
| `rh` | P | 습도 |
| `w`, `rh_liq`, `tqc`, `tqi`, `tqr`, `tqs`, `cld` | P | 착빙(SFIP/K-FIP lite) · 구름 산출 |
| `t2m` | U | 지상 기온 (`level=0`) |

착빙·구름·기온·바람 오버레이는 **저장하지 않고** 요청 시 위 변수로 계산한다
(`/api/kim/{wind,temp,cloud,icing}/field`). 변수를 추가해도 오버레이 종류가 늘 뿐 저장 구조는 그대로다.

### 사용 고도층 (21개)

`1000 975 950 925 900 875 850 800 750 700 650 600 550 500 450 400 350 300 250 200 150` hPa

문서상 24층 중 `100 / 70 / 50 hPa`은 미수집 (약 5만 피트 이상, 항공 순항고도 밖).
착빙은 여기서 다시 300hPa 이상만 사용 (`KIM_NWP_ICING_LEVEL_IDS`, -35℃ 하드게이트로 상층은 항상 class 0).

### 사용 예보시간 (11개)

`0 3 6 9 12 15 18 21 24 27 30` 시간 — TAF 30시간에 맞춘 값 (`config.js` `kim_nwp.forecast_hours`).
API는 '26.6.22. 이후 1시간 간격까지 제공하므로, 촘촘하게 바꾸면 파일 수가 약 3배가 된다.

### 관련 설정 위치

| 무엇 | 파일:줄 |
|---|---|
| API 주소 | `backend/src/config.js` `api.kim_grid_url` |
| 인증키 | `backend/src/config.js` `kimNwpAuthKey` |
| 영역(`sub` + 경위도) | `backend/src/config.js` `kim_surface_wind.sub` / `.bounds` |
| 요청 조립 | `backend/src/api-client.js` `buildKimGridUrl()` |
| 응답 파싱 | `backend/src/parsers/kim-grid-parser.js` `parseKimGridText()` |
| 고도층 정의 | `backend/src/processors/kim-nwp-model.js` `KIM_NWP_LEVELS` |
| 예보시간·착빙변수 | `backend/src/config.js` `kim_nwp` |

### 변수 하나 추가할 때

1. 위 3절에서 변수명·`data` 종류·`level` 필요 여부 확인
2. 등압면 변수면 `config.js` `kim_nwp.icing_variables` 형태의 배열에 추가하거나 새 수집 경로 작성
3. 단일면 변수는 `resolveKimTemperatureComponentRequest()` 패턴 참고 (`data: 'U'`, `level: 0`)
4. 용량: 격자점 하나당 약 151바이트(JSON 무압축). 현 영역(34,645점) 기준
   - 등압면 변수 1개 = 21층 x 11시간 x 5.2MB/12변수 ≈ **약 100MB / 런**
   - 단일면 변수 1개 = 11시간 = **약 5MB / 런**

---

## 5. 구/신 주소 동일성 실측 (2026-08-08)

`tmfc=2026080500`, `sub=1429,1441,1436,1448`(8x8 격자)로 typ01과 typ06를 비교.
처리시간이 적힌 주석 줄을 제외하면 **13개 변수 전부 바이트 단위로 완전히 동일**.

| 조건 | 결과 |
|---|---|
| `data=P`, `level=500`, `hf=0` — `u v T hgt rh w rh_liq tqc tqi tqr tqs cld` | 전부 동일 |
| `data=U`, `name=t2m`, `level=0`, `hf=0` | 동일 |
| `data=P`, `name=u`, `level=150`, `hf=30` | 동일 |
| `data=P`, `name=T`, `level=1000`, `hf=27` | 동일 |
| `data=U`, `name=t2m`, `level=0`, `hf=30` | 동일 |

응답 형식도 같다: 주석 줄은 `#`로 시작하고 EUC-KR, 숫자 줄은 ASCII.
`parseKimGridText()`가 `#` 줄을 건너뛰므로 인코딩은 영향이 없다.
