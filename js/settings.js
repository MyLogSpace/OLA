/**
 * js/settings.js — 사용자 설정(반경 등)을 localStorage에 저장/불러오기.
 * 마이페이지(pages/mypage.html)에서 바꾸면 index.html / briefing.html /
 * emergency.html 등 위치 기반 화면 전체에 공통 반영됩니다.
 * (Claude 아티팩트가 아닌 실제 배포용 웹페이지이므로 localStorage 사용 가능)
 */
const olaSettings = (() => {
  const RADIUS_KEY = "ola_radius_km";
  const RADIUS_OPTIONS = [0.5, 1, 2, 3, 5];

  function getRadiusKm() {
    const saved = localStorage.getItem(RADIUS_KEY);
    const parsed = saved !== null ? Number(saved) : NaN;
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return window.OLA_CONFIG ? window.OLA_CONFIG.DEFAULT_RADIUS_KM : 1;
  }

  function setRadiusKm(km) {
    localStorage.setItem(RADIUS_KEY, String(km));
  }

  function resetRadiusKm() {
    localStorage.removeItem(RADIUS_KEY);
  }

  return { getRadiusKm, setRadiusKm, resetRadiusKm, RADIUS_OPTIONS };
})();

window.olaSettings = olaSettings;
