/**
 * js/location.js — 브라우저 GPS(Geolocation API)로 현재 위치를 가져와
 * 서울/경기/인천(수도권) 66개 시군구 중 가장 가까운 곳을 찾고, 선택한
 * 지역을 localStorage에 저장해 모든 페이지가 공유하도록 합니다.
 *
 * 저장 형식은 "시도|시군구" 복합 키입니다 (예: "서울특별시|강남구").
 * js/regions-list.js 의 olaRegionKey() 와 동일한 형식입니다.
 *
 * ⚠️ 수도권 데이터만 있어서, 수도권 밖에 계시면 "가장 가까운 수도권
 * 시군구"가 나오는 것뿐이라 실제 위치와 거리가 있을 수 있어요.
 * distanceKm이 크면(예: 20km 이상) UI에서 안내 문구를 보여줍니다.
 */
const olaLocation = (() => {
  const KEY = "ola_selected_region";

  function defaultKey() {
    const d = window.OLA_CONFIG ? OLA_CONFIG.DEFAULT_REGION : { sido: "서울특별시", gu: "강남구" };
    return `${d.sido}|${d.gu}`;
  }

  function getKey() {
    return localStorage.getItem(KEY) || defaultKey();
  }

  function setKey(key) {
    localStorage.setItem(KEY, key);
  }

  function resetKey() {
    localStorage.removeItem(KEY);
  }

  function getSidoGu() {
    const [sido, gu] = getKey().split("|");
    return { sido, gu };
  }

  // 하위호환: gu만 필요한 기존 코드용
  function getGu() {
    return getSidoGu().gu;
  }

  function setGu(gu) {
    // sido 없이 gu만 넘어오면 현재 sido를 유지
    const { sido } = getSidoGu();
    setKey(`${sido}|${gu}`);
  }

  /**
   * @returns {Promise<{key:string, sido:string, gu:string, lat:number, lng:number, distanceKm:number}>}
   */
  function detectNearestGu() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ reason: "unsupported" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const regions = await window.olaData.getRegions();
            let nearestKey = null;
            let minDist = Infinity;
            Object.entries(regions).forEach(([key, r]) => {
              if (!r.center) return;
              const d = window.olaData.distanceKm(latitude, longitude, r.center.lat, r.center.lng);
              if (d < minDist) {
                minDist = d;
                nearestKey = key;
              }
            });
            if (!nearestKey) {
              reject({ reason: "no-region-data" });
              return;
            }
            setKey(nearestKey);
            const [sido, gu] = nearestKey.split("|");
            resolve({ key: nearestKey, sido, gu, lat: latitude, lng: longitude, distanceKm: minDist });
          } catch (e) {
            reject({ reason: e.message });
          }
        },
        (err) => {
          // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
          const reasonMap = { 1: "permission-denied", 2: "unavailable", 3: "timeout" };
          reject({ reason: reasonMap[err.code] || "error" });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
      );
    });
  }

  function reasonMessage(reason) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    return (
      {
        unsupported: t("location.unsupported"),
        "permission-denied": t("location.permissionDenied"),
        unavailable: t("location.unavailable"),
        timeout: t("location.timeout"),
      }[reason] || t("location.genericError")
    );
  }

  return { getKey, setKey, resetKey, getSidoGu, getGu, setGu, detectNearestGu, reasonMessage };
})();

window.olaLocation = olaLocation;
