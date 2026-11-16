/**
 * js/location-ui.js — 헤더의 위치 배지(#location-btn) 클릭 시 GPS로 현재
 * 위치를 가져와 가장 가까운 서울 자치구로 전환합니다. (js/location.js 사용)
 * 페이지별로 `window.onOlaLocationChange(gu)` 훅을 정의해두면, 위치가 바뀔 때
 * 그 페이지의 데이터를 다시 불러오도록 연결됩니다.
 */
const olaLocationUI = (() => {
  // 사이드바 위치 배지(#current-location, #current-location-radius)를
  // 실제 저장된 지역/반경으로 채운다. 예전엔 이 로직이 js/home.js 안에만
  // 있어서 index.html 말고 다른 페이지는 항상 하드코딩된 기본값만 보였다.
  function updateLocationBadge() {
    if (!window.olaLocation) return;
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const { sido, gu } = olaLocation.getSidoGu();
    const label = window.olaRegionLabel ? olaRegionLabel(sido, gu) : `${sido} ${gu}`;
    const radius = window.olaSettings ? olaSettings.getRadiusKm() : 1;

    const locEl = document.getElementById("current-location");
    if (locEl) locEl.textContent = label;
    const radiusEl = document.getElementById("current-location-radius");
    if (radiusEl) radiusEl.textContent = t("nav.radiusHint", { km: Number(radius).toFixed(1) });

    // 홈 화면 전용 위치 표시 (안심 지도 배지 / 커뮤니티 톡 자동입력)
    const mapBadgeEl = document.getElementById("safety-map-location-badge");
    if (mapBadgeEl) mapBadgeEl.textContent = `📍 ${label}`;
    const talkBadgeEl = document.getElementById("talk-location-badge");
    if (talkBadgeEl) talkBadgeEl.textContent = t("talk.autoFilledLocation", { label });

    // 커뮤니티 톡 예시 게시글의 위치 표시도 실제 지역명으로 맞춤 (게시글 자체는 데모용 예시 콘텐츠)
    document.querySelectorAll(".talk-seed-area").forEach((el) => {
      el.textContent = `📍 ${label}`;
    });
  }

  async function useMyLocation() {
    const icon = document.getElementById("location-btn-icon");
    const btn = document.getElementById("location-btn");
    setLoading(icon, btn, true);

    try {
      const result = await olaLocation.detectNearestGu();
      if (result.distanceKm > 25) {
        const t = window.olaI18n ? olaI18n.t : (k) => k;
        alert(
          t("location.tooFarAlert", { sido: result.sido, gu: result.gu, km: result.distanceKm.toFixed(1) })
        );
      }
      updateLocationBadge(); // 페이지별 onOlaLocationChange 훅 유무와 상관없이 배지는 항상 즉시 갱신
      if (typeof window.onOlaLocationChange === "function") {
        await window.onOlaLocationChange(result.key);
      }
    } catch (err) {
      alert(olaLocation.reasonMessage(err.reason));
    } finally {
      setLoading(icon, btn, false);
    }
  }

  function setLoading(icon, btn, loading) {
    if (btn) btn.disabled = loading;
    if (!icon) return;
    icon.setAttribute("data-lucide", loading ? "loader-circle" : "navigation");
    icon.classList.toggle("animate-spin", loading);
    if (window.lucide) lucide.createIcons();
  }

  document.addEventListener("DOMContentLoaded", updateLocationBadge);
  document.addEventListener("DOMContentLoaded", () => {
    if (window.olaI18n) olaI18n.onLocaleChange(updateLocationBadge);
  });

  return { useMyLocation, updateLocationBadge };
})();

window.olaLocationUI = olaLocationUI;
