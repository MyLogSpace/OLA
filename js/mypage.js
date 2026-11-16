/**
 * js/mypage.js — pages/mypage.html의 "위치 기반 설정" (반경) UI.
 * 선택값은 js/settings.js(olaSettings)를 통해 localStorage에 저장되고,
 * index.html / pages/briefing.html / pages/emergency.html이 공통으로 읽어갑니다.
 */

// 즐겨찾기 id("district:시도|구", "safety:시도|구")에서 시도/구를 복원하는 공통 헬퍼.
// 지역 기반 즐겨찾기는 title/subtitle을 저장 시점 언어로 얼리지 않고, 매번 현재 언어로 다시 계산하기 위해 사용한다.
function regionFromFavId(id, prefix) {
  if (!id || !id.startsWith(prefix + ":")) return null;
  const key = id.slice(prefix.length + 1);
  const idx = key.indexOf("|");
  if (idx < 0) return null;
  return { sido: key.slice(0, idx), gu: key.slice(idx + 1) };
}

(function () {
  function renderProfile() {
    const session = window.olaAuth ? olaAuth.getSession() : null;
    const nameEl = document.getElementById("profile-name");
    const subEl = document.getElementById("profile-sub");
    const btnEl = document.getElementById("profile-auth-btn");
    const avatarEl = document.getElementById("profile-avatar");
    if (!nameEl || !subEl || !btnEl) return;
    const t = window.olaI18n ? olaI18n.t : (k) => k;

    if (session) {
      const suffix = window.olaI18n && olaI18n.getLocale() === "ko" ? "님" : "";
      nameEl.textContent = `${session.name}${suffix}`;
      subEl.textContent = session.email;
      btnEl.textContent = t("nav.logout");
      btnEl.onclick = () => {
        olaAuth.logOut();
        if (window.olaAuthUI) olaAuthUI.renderAuthState();
        renderProfile();
      };
      if (avatarEl) avatarEl.innerHTML = `<span class="text-xl font-bold">${session.name.trim().charAt(0).toUpperCase()}</span>`;
    } else {
      nameEl.textContent = t("mypage.guestName");
      subEl.textContent = t("mypage.guestSub");
      btnEl.textContent = t("nav.login");
      btnEl.onclick = () => uiJS.openLoginModal();
      if (avatarEl) avatarEl.innerHTML = `<i data-lucide="user" class="w-8 h-8"></i>`;
    }
    if (window.lucide) lucide.createIcons();
  }

  window.onOlaAuthChange = renderProfile;
  document.addEventListener("DOMContentLoaded", renderProfile);
  // ⚠️ renderFavorites는 아래 두 번째 IIFE에 정의되어 있어, DOMContentLoaded가 실제로 발생하는
  // 시점(모든 <script>가 다 실행된 후)에는 window.renderFavorites가 존재한다. 화살표 함수로 감싸서
  // 참조를 지연시키지 않으면(과거처럼 renderFavorites를 직접 넘기면) 이 줄에서 즉시 ReferenceError가
  // 발생해 이 파일의 나머지 코드(즐겨찾기·반경 설정·자주 가는 지역)가 전혀 실행되지 않는다.
  document.addEventListener("DOMContentLoaded", () => {
    if (window.renderFavorites) renderFavorites();
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (window.olaI18n) olaI18n.onLocaleChange(renderProfile);
  });
})();

(function () {
  const TYPE_ICON = { 생활안전: "shield-check", 재난: "cloud-rain-wind", 응급: "hospital", 지역: "map-pin" };
  // 화면 표시용 대체 라벨 — TYPE_ICON/필터 매칭에 쓰이는 f.type 원본 값(한국어)은 절대 바꾸지 않는다.
  const TYPE_LABEL_KEY = { 생활안전: "mypage.typeSafety", 재난: "mypage.typeDisaster", 응급: "mypage.typeEmergency", 지역: "mypage.typeDistrict" };

  // 지역 기반 즐겨찾기(자주 가는 지역/생활안전 즐겨찾기)는 title·subtitle을 저장 당시 언어로 얼리지 않고,
  // id에 담긴 시도/구 정보로 매번 현재 언어에 맞게 다시 계산한다.
  function favDisplay(f, t) {
    const district = regionFromFavId(f.id, "district");
    if (district && window.olaRegionLabel) {
      return { title: olaRegionLabel(district.sido, district.gu), subtitle: t("mypage.frequentDistrict") };
    }
    const safety = regionFromFavId(f.id, "safety");
    if (safety && window.olaRegionLabel) {
      return { title: t("safety.favTitle", { region: olaRegionLabel(safety.sido, safety.gu) }), subtitle: t("safety.favSubtitle") };
    }
    return { title: f.title, subtitle: f.subtitle || t(TYPE_LABEL_KEY[f.type] || "") || f.type };
  }

  function renderFavorites() {
    const container = document.getElementById("favorites-list");
    if (!container || !window.olaFavorites) return;
    const t = window.olaI18n ? olaI18n.t : (k) => k;

    const favs = olaFavorites.getAll();
    if (!favs.length) {
      container.innerHTML = `
        <div class="p-4 border border-border rounded-xl flex items-center gap-3 text-gray-400">
          <i data-lucide="plus" class="w-5 h-5"></i>
          <p class="text-sm">${t("mypage.favEmpty")}</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = favs
      .map((f) => {
        const { title, subtitle } = favDisplay(f, t);
        return `
      <a href="${f.url || "#"}" class="p-4 border border-border rounded-xl flex items-center justify-between hover:bg-bg">
        <div class="flex items-center gap-3">
          <i data-lucide="${TYPE_ICON[f.type] || "star"}" class="w-5 h-5 text-primary"></i>
          <div>
            <p class="font-medium">${title}</p>
            <p class="text-xs text-gray-500">${subtitle}</p>
          </div>
        </div>
        <button onclick="event.preventDefault(); removeFavorite('${f.id}')" class="p-1 text-point1 hover:text-red-500" title="${t("common.delete")}">
          <i data-lucide="star" class="w-5 h-5" fill="#FFD6A5"></i>
        </button>
      </a>`;
      })
      .join("");
    if (window.lucide) lucide.createIcons();
  }

  window.removeFavorite = function (id) {
    olaFavorites.remove(id);
    renderFavorites();
  };

  window.renderFavorites = renderFavorites;

  document.addEventListener("DOMContentLoaded", () => {
    if (window.olaI18n) olaI18n.onLocaleChange(renderFavorites);
  });
})();

(function () {
  function init() {
    renderOptions();
  }

  function renderOptions() {
    const container = document.getElementById("radius-options");
    const currentEl = document.getElementById("radius-current");
    const current = olaSettings.getRadiusKm();

    container.innerHTML = olaSettings.RADIUS_OPTIONS.map((km) => {
      const active = km === current;
      return `<button type="button" data-km="${km}"
        class="px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
          active ? "bg-primary text-white border-primary" : "bg-white text-dark border-border hover:bg-bg"
        }">${km}km</button>`;
    }).join("");

    currentEl.textContent = window.olaI18n ? olaI18n.t("mypage.radiusCurrent", { km: current }) : `현재 설정: 반경 ${current}km`;

    container.querySelectorAll("button[data-km]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const km = Number(btn.dataset.km);
        olaSettings.setRadiusKm(km);
        renderOptions();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("DOMContentLoaded", () => {
    if (window.olaI18n) olaI18n.onLocaleChange(renderOptions);
  });
})();

// 자주 가는 지역 - 홈 화면 "관심 자치구 지수" 카드에 표시할 자치구를 여기서 등록/삭제한다.
// olaFavorites에 type:"지역", id:"district:시도|구" 형식으로 저장해 js/home.js와 공유한다.
(function () {
  const TYPE = "지역";

  function favId(key) {
    return `district:${key}`;
  }

  function init() {
    const sidoSel = document.getElementById("frequent-sido-select");
    const guSel = document.getElementById("frequent-gu-select");
    if (!sidoSel || !guSel || !window.olaPopulateSidoSelect) return;

    olaPopulateSidoSelect(sidoSel, "서울특별시");
    olaPopulateGuSelect(guSel, sidoSel.value);
    sidoSel.addEventListener("change", () => olaPopulateGuSelect(guSel, sidoSel.value));

    renderList();
  }

  // <option> 텍스트는 olaPopulateSidoSelect/olaPopulateGuSelect 호출 시점의 언어로 한 번만
  // 채워지고 이후엔 그대로 남는다 — 언어가 바뀌어도 자동으로 다시 그려지지 않아서, 로케일이
  // 바뀔 때마다 지금 선택된 값(시도/구, 항상 한국어 원본값)을 유지한 채 다시 채워준다.
  function refreshSelectLabels() {
    const sidoSel = document.getElementById("frequent-sido-select");
    const guSel = document.getElementById("frequent-gu-select");
    if (!sidoSel || !guSel || !window.olaPopulateSidoSelect) return;

    const currentSido = sidoSel.value;
    const currentGu = guSel.value;
    olaPopulateSidoSelect(sidoSel, currentSido);
    olaPopulateGuSelect(guSel, currentSido, currentGu);
  }

  function renderList() {
    const container = document.getElementById("frequent-district-list");
    if (!container || !window.olaFavorites) return;
    const t = window.olaI18n ? olaI18n.t : (k) => k;

    const items = olaFavorites.getAll().filter((f) => f.type === TYPE);
    if (!items.length) {
      container.innerHTML = `<p class="text-sm text-gray-400 px-1">${t("mypage.frequentDistrictEmpty", { add: t("mypage.addBtn") })}</p>`;
      return;
    }

    container.innerHTML = items
      .map((f) => {
        const region = regionFromFavId(f.id, "district");
        const title = region && window.olaRegionLabel ? olaRegionLabel(region.sido, region.gu) : f.title;
        return `
      <div class="p-3 border border-border rounded-xl flex items-center justify-between">
        <span class="text-sm font-medium">${title}</span>
        <button onclick="removeFrequentDistrict('${f.id}')" class="p-1 text-gray-400 hover:text-red-500" title="${t("common.delete")}">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>`;
      })
      .join("");
    if (window.lucide) lucide.createIcons();
  }

  window.addFrequentDistrict = function () {
    const sidoSel = document.getElementById("frequent-sido-select");
    const guSel = document.getElementById("frequent-gu-select");
    if (!sidoSel || !guSel || !window.olaFavorites) return;

    const key = olaRegionKey(sidoSel.value, guSel.value);
    if (olaFavorites.isFavorited(favId(key))) return;
    olaFavorites.add({
      id: favId(key),
      type: TYPE,
      title: olaRegionLabel(sidoSel.value, guSel.value),
      subtitle: window.olaI18n ? olaI18n.t("mypage.frequentDistrict") : "자주 가는 지역",
      url: "../index.html",
    });
    renderList();
    if (window.renderFavorites) renderFavorites();
  };

  window.removeFrequentDistrict = function (id) {
    olaFavorites.remove(id);
    renderList();
    if (window.renderFavorites) renderFavorites();
  };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("DOMContentLoaded", () => {
    if (window.olaI18n) olaI18n.onLocaleChange(renderList);
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (window.olaI18n) olaI18n.onLocaleChange(refreshSelectLabels);
  });
})();
