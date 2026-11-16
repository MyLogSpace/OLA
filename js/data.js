/**
 * ============================================================================
 *  OLA 로컬 데이터 로더 (data.js)
 * ============================================================================
 *  data.zip 안의 공공데이터(민방위대피시설.csv, 병원정보서비스.xlsx,
 *  경찰청 범죄통계.csv, 기상청 격자좌표.xlsx)를 미리 가공해 만든
 *  assets/data/*.json 파일을 불러와 씁니다. 서울/경기/인천(수도권) 66개
 *  시군구를 커버합니다. (data.go.kr 실시간 API가 커버하지 못하는 "정적"
 *  데이터(대피소, 범죄통계, 병원 총병상수)는 이 로컬 데이터로 제공합니다.)
 *
 *  지역 키는 "시도|시군구" 형식입니다 (예: "서울특별시|강남구",
 *  "경기도|수원시", "인천광역시|중구"). js/regions-list.js 참고.
 *
 *  각 페이지는 로드 전에 아래처럼 OLA_BASE 를 지정해야 합니다.
 *    - index.html            : window.OLA_BASE = ''
 *    - pages/*.html           : window.OLA_BASE = '../'
 * ============================================================================
 */

const olaData = (() => {
  const BASE = () => (window.OLA_BASE !== undefined ? window.OLA_BASE : "");
  let regionsCache = null;
  let hospitalsCache = null;
  let sheltersCache = null;

  async function loadJson(path) {
    const res = await fetch(BASE() + path);
    if (!res.ok) throw new Error("데이터 로드 실패: " + path);
    return res.json();
  }

  async function getRegions() {
    if (!regionsCache) regionsCache = await loadJson("assets/data/regions.json");
    return regionsCache;
  }

  async function getRegion(key) {
    const regions = await getRegions();
    return regions[key] || null;
  }

  async function getHospitals() {
    if (!hospitalsCache) hospitalsCache = await loadJson("assets/data/hospitals.json");
    return hospitalsCache;
  }

  async function getShelters() {
    if (!sheltersCache) sheltersCache = await loadJson("assets/data/shelters.json");
    return sheltersCache;
  }

  // 두 좌표 사이 거리(km), Haversine 공식
  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // fallbackRegion({sido, gu})을 넘기면, 선택한 반경 안에 결과가 하나도 없을 때 그 시/군/구
  // 전체에서 가까운 순으로 대신 보여준다. 자치구는 넓은데 반경(예: 1km)은 좁아서, 실제로 있는
  // 병원·대피소가 반경 밖이라는 이유만으로 안 보이는 문제를 막기 위함 — 실데이터만 쓰고 새로 지어내지 않음.
  async function getNearbyHospitals(centerLat, centerLng, radiusKm = 1, fallbackRegion = null) {
    const hospitals = await getHospitals();
    const withDistance = hospitals.map((h) => ({ ...h, distanceKm: distanceKm(centerLat, centerLng, h.lat, h.lng) }));
    const withinRadius = withDistance.filter((h) => h.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm);
    if (withinRadius.length || !fallbackRegion) return withinRadius;
    return withDistance
      .filter((h) => h.sido === fallbackRegion.sido && h.gu === fallbackRegion.gu)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async function getNearbyShelters(centerLat, centerLng, radiusKm = 1, fallbackRegion = null) {
    const shelters = await getShelters();
    const withDistance = shelters.map((s) => ({ ...s, distanceKm: distanceKm(centerLat, centerLng, s.lat, s.lng) }));
    const withinRadius = withDistance.filter((s) => s.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm);
    if (withinRadius.length || !fallbackRegion) return withinRadius;
    return withDistance
      .filter((s) => s.sido === fallbackRegion.sido && s.gu === fallbackRegion.gu)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /**
   * SAFETY_SCORE 계산 (기획안 ERD 기준: crime_index + weather_risk → overall_score)
   * crimeRiskIndex: 0(안전)~100(위험), 로컬 범죄통계 기반
   * weatherRisk:    0(안전)~100(위험), 기상특보 활성 여부 기반 (실시간 API 있으면 그 값, 없으면 0)
   * facilityBonus:  응급/대피 인프라가 많을수록 안전도를 소폭 보정
   */
  function calcSafetyScore({ crimeRiskIndex = 50, weatherRisk = 0, hospitalCount = 0, shelterCount = 0 }) {
    const infraBonus = Math.min(10, Math.round((hospitalCount / 10 + shelterCount / 40)));
    const risk = crimeRiskIndex * 0.6 + weatherRisk * 0.4;
    let score = Math.round(100 - risk + infraBonus);
    score = Math.max(0, Math.min(100, score));
    return score;
  }

  return {
    getRegions,
    getRegion,
    getHospitals,
    getShelters,
    getNearbyHospitals,
    getNearbyShelters,
    distanceKm,
    calcSafetyScore,
  };
})();

window.olaData = olaData;
