/**
 * js/map.js — pages/map.html(안전지도) 전용 로직
 * - 시도/구 선택(로컬, 사이드바 전역 위치와 별개로 이 페이지에서만 바꿀 수 있음)
 * - 주소/장소 검색(카카오 Geocoder·Places) + "현 지도에서 검색"(네이버지도 스타일 지도 이동 후 재검색)
 * - 카카오맵(실제 병원/AED/대피소 좌표 + 카카오 장소검색 경찰) + 시설 필터
 * - 실패 시 SVG 서울/경기/인천 개요도로 대체
 * - 주변 안전 인프라 리스트(가장 가까운 병원/대피소/AED/경찰, 거리순, 전부 실데이터)
 */
(function () {
  let regions;
  let mapMarkers = { hospital: [], aed: [], police: [], shelter: [], pharmacy: [], fire: [], search: [] };
  let kakaoMapInstance = null;
  let searchResultMarker = null;
  // 장소검색(키워드) 결과 - 있으면 "주변 안전 인프라" 목록이 이 결과를 그대로 보여줍니다
  // (전체/카테고리 필터를 누르거나 지역을 바꾸면 다시 null로 초기화됨)
  let activeSearchResults = null;
  // 마커를 여러 번 클릭해도 말풍선(InfoWindow)이 계속 쌓이지 않도록, 항상 직전에 열린 것
  // 하나만 열려 있게 관리 (지도 빈 곳 클릭 시에도 닫힘)
  let activeInfoWindow = null;
  // 시설 필터 버튼으로 "주변 안전 인프라" 리스트도 같이 바꾸기 위해, 마지막으로 불러온
  // 데이터와 현재 선택된 필터를 기억해둡니다 (지역 변경 후에도 필터 유지).
  let lastLoadData = null;
  let activeMapCategory = "all";
  // 우측 툴바 "반경" 아이콘에 마우스를 올리면 나오는 목록에서 직접 고름
  const RADIUS_PRESETS = [0.5, 1, 2, 3, 5];
  let radiusIndex = 1; // 기본 1km

  // 핀 클릭 시 확대 표시 + 좌측 패널 상세정보/출발·도착 선택
  let selectedMarker = null; // 지금 확대돼 있는 마커 (하나만)
  let currentPlaceDetail = null; // { title, lat, lng } - 상세 패널에 지금 열려 있는 장소
  let routeStart = null; // { title, lat, lng }
  let routeEnd = null;
  let routeLine = null;
  let routeStartMarker = null;
  let routeEndMarker = null;

  // 카카오맵 기본 마커 대신, 클릭했을 때 커질 수 있도록 우리가 직접 만든 파란 물방울 핀 이미지
  // (실제 경로 계산은 안 하고, "선택된 핀은 커진다"만 구현하는 용도)
  function buildMarkerImage(w, h) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 34"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="#2563eb"/><circle cx="12" cy="12" r="5.5" fill="#ffffff"/></svg>`;
    const src = "data:image/svg+xml;base64," + btoa(svg);
    return new kakao.maps.MarkerImage(src, new kakao.maps.Size(w, h), { offset: new kakao.maps.Point(w / 2, h) });
  }
  let normalMarkerImage = null;
  let selectedMarkerImage = null;

  // 병원/AED/대피소/카카오 장소검색 결과 등 실데이터(이름·주소·전화번호)는 번역 대상이
  // 아니고, 그 주변에 우리가 직접 붙이는 라벨/상태 문구만 아래 헬퍼들로 번역한다.
  function t(key, vars) {
    return window.olaI18n ? olaI18n.t(key, vars) : key;
  }

  // 시설 종류(카테고리) 표시 라벨 - 지도 필터 버튼(map.html)과 동일한 문구를 재사용
  const FACILITY_LABEL_KEYS = {
    hospital: "map.filterHospital",
    shelter: "map.filterShelter",
    aed: "map.filterAed",
    police: "map.filterPolice",
    pharmacy: "map.filterPharmacy",
    fire: "map.filterFire",
  };
  function facilityLabel(categoryKey) {
    const key = FACILITY_LABEL_KEYS[categoryKey];
    return key ? t(key) : categoryKey;
  }

  function hospitalStatusLabel(h) {
    return h && h.er_beds > 0 ? t("map.js.erOperating") : (h && h.type) || t("map.js.hospitalDefault");
  }

  function capacityLabel(capacity) {
    return t("map.js.capacityLabel", { n: capacity ?? "-" });
  }

  // 시설 종류별 아이콘·색 (지도 핀 클릭 시 좌측 상세 패널에 표시할 때 사용)
  const FACILITY_STYLE = {
    hospital: { icon: "heart-pulse", cls: "bg-red-50 text-red-500" },
    shelter: { icon: "house", cls: "bg-emerald-50 text-emerald-600" },
    aed: { icon: "zap", cls: "bg-amber-50 text-amber-600" },
    police: { icon: "shield-check", cls: "bg-blue-50 text-blue-600" },
    pharmacy: { icon: "pill", cls: "bg-teal-50 text-teal-600" },
    fire: { icon: "flame", cls: "bg-orange-50 text-orange-600" },
    search: { icon: "map-pin", cls: "bg-purple-50 text-purple-600" },
  };

  // 클릭된 마커만 확대 표시하고, 이전에 선택돼 있던 마커는 원래 크기로 되돌림
  function selectMarker(marker) {
    if (selectedMarker && selectedMarker !== marker) {
      selectedMarker.setImage(normalMarkerImage);
    }
    if (marker) marker.setImage(selectedMarkerImage);
    selectedMarker = marker;
  }

  async function init() {
    regions = await olaData.getRegions();
    populateSelects();
    updateRadiusOptionStyles();

    document.getElementById("map-sido-select").addEventListener("change", () => {
      // 시도가 바뀌면 시군구 옵션을 그 시도 것으로 다시 채우고(첫 항목 선택) 갱신
      const sido = document.getElementById("map-sido-select").value;
      olaPopulateGuSelect(document.getElementById("map-gu-select"), sido);
      loadAll();
    });
    document.getElementById("map-gu-select").addEventListener("change", loadAll);

    await loadAll();
  }

  function populateSelects() {
    const sidoSel = document.getElementById("map-sido-select");
    const guSel = document.getElementById("map-gu-select");
    const key = window.olaLocation ? olaLocation.getKey() : olaRegionKey(OLA_CONFIG.DEFAULT_REGION.sido, OLA_CONFIG.DEFAULT_REGION.gu);
    const [sido, gu] = key.split("|");
    olaPopulateSidoSelect(sidoSel, sido);
    olaPopulateGuSelect(guSel, sido, gu);

    if (window.olaSettings) {
      const defaultRadius = olaSettings.getRadiusKm();
      const idx = RADIUS_PRESETS.indexOf(defaultRadius);
      if (idx >= 0) radiusIndex = idx;
    }
  }

  // olaPopulateSidoSelect/olaPopulateGuSelect는 호출 시점의 언어로 <option> 텍스트를 한 번만
  // 채우고 이후엔 그대로 남는다 — 언어가 바뀌어도 자동으로 다시 그려지지 않아서, 로케일이 바뀔
  // 때마다 지금 선택돼 있는 시도/구(항상 한국어 원본값)를 유지한 채 라벨만 다시 채워준다.
  function refreshRegionSelectLabels() {
    const sidoSel = document.getElementById("map-sido-select");
    const guSel = document.getElementById("map-gu-select");
    if (!sidoSel || !guSel) return;
    const currentSido = sidoSel.value;
    const currentGu = guSel.value;
    olaPopulateSidoSelect(sidoSel, currentSido);
    olaPopulateGuSelect(guSel, currentSido, currentGu);
  }

  function currentKey() {
    const sido = document.getElementById("map-sido-select").value;
    const gu = document.getElementById("map-gu-select").value;
    return olaRegionKey(sido, gu);
  }

  async function loadAll() {
    const key = currentKey();
    const [sido, gu] = key.split("|");
    const radius = RADIUS_PRESETS[radiusIndex];

    const regionData = regions[key];
    if (!regionData) return;

    // 지역이 바뀌면 지도를 다시 그 지역 중심으로 옮기므로, 이전에 "현 지도에서 검색"으로
    // 옮겨간 화면이나 장소검색 결과, 선택했던 핀·경로 미리보기도 의미가 없어져 초기화합니다.
    const searchHereBtn = document.getElementById("map-search-here-btn");
    if (searchHereBtn) searchHereBtn.style.display = "none";
    activeSearchResults = null;
    selectedMarker = null;
    currentPlaceDetail = null;
    routeStart = null;
    routeEnd = null;
    if (routeLine) {
      routeLine.setMap(null);
      routeLine = null;
    }
    if (routeStartMarker) {
      routeStartMarker.setMap(null);
      routeStartMarker = null;
    }
    if (routeEndMarker) {
      routeEndMarker.setMap(null);
      routeEndMarker = null;
    }
    setPanelMode("default");

    // 반경 내 대피시설
    let shelters = [];
    if (regionData.center) {
      shelters = await olaData.getNearbyShelters(regionData.center.lat, regionData.center.lng, radius, { sido, gu }).catch(() => []);
    }

    // 반경 내 병원
    let hospitals = [];
    if (regionData.center) {
      hospitals = await olaData.getNearbyHospitals(regionData.center.lat, regionData.center.lng, radius, { sido, gu }).catch(() => []);
    }

    // AED
    let aed = { ok: false };
    try {
      aed = await olaApi.getAedList({ sido: regionData.sido, gugun: gu });
    } catch (e) {
      /* ignore */
    }

    // 지도 (카카오맵 실패 시 SVG 서울/경기/인천 개요도로 대체)
    if (regionData.center) {
      try {
        await renderMapKakao(regionData, hospitals, aed, shelters);
      } catch (e) {
        console.warn("[OLA] 카카오맵 로드 실패 — 기본 지도로 대체:", e);
        try {
          renderMiniMap(regions, key);
        } catch (_) {
          const c = document.getElementById("map-mini-map-container");
          if (c) {
            // data-i18n이 남아있으면 언어를 바꿀 때마다 이 에러 문구가 "지도를 불러오는
            // 중…"으로 되돌아가버리므로(HTML의 초기 로딩 placeholder용 속성), 실제 콘텐츠를
            // 그려 넣는 시점부터는 떼어낸다.
            c.removeAttribute("data-i18n");
            c.textContent = t("map.js.mapLoadFailed");
          }
        }
      }
    }
    lastLoadData = { regionData, hospitals, aed, shelters };
    renderNearbyInfraList(activeMapCategory);
  }

  function loadMapKakaoSdk(appKey) {
    return new Promise((resolve, reject) => {
      if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = `${OLA_CONFIG.KAKAO_MAP_SDK_URL}?appkey=${appKey}&autoload=false&libraries=services`;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function renderMapKakao(regionData, hospitals, aed, shelters) {
    const container = document.getElementById("map-mini-map-container");
    if (!container) return;
    container.className = "w-full h-full";
    container.innerHTML = "";
    // data-i18n이 남아있으면 언어를 바꿀 때마다 olaI18n.apply()가 이 안에 이미 그려진
    // 카카오맵을 통째로 지우고 "지도를 불러오는 중…" 로딩 문구로 되돌려버린다(실제 지도가
    // 안 나오는 원인). 실제 지도를 그리기 시작하는 시점부터는 이 속성을 떼어낸다.
    container.removeAttribute("data-i18n");

    const keyResponse = await fetch(OLA_CONFIG.KAKAO_MAP_KEY_URL);
    const keyData = await keyResponse.json();
    if (!keyData.javascriptKey) {
      renderMiniMap(regions, currentKey());
      return;
    }
    await loadMapKakaoSdk(keyData.javascriptKey);

    await new Promise((resolve) => {
      kakao.maps.load(async () => {
        const center = new kakao.maps.LatLng(regionData.center.lat, regionData.center.lng);
        const map = new kakao.maps.Map(container, { center, level: 5 });
        kakaoMapInstance = map;
        searchResultMarker = null;
        selectedMarker = null;
        if (!normalMarkerImage) {
          normalMarkerImage = buildMarkerImage(26, 36);
          selectedMarkerImage = buildMarkerImage(38, 52);
        }

        new kakao.maps.Marker({ map, position: center, title: regionData.gu });

        // 네이버지도처럼, 지도를 드래그하거나 줌을 바꾸면 "현 지도에서 검색" 버튼을 보여줌
        const showSearchHereBtn = () => {
          const btn = document.getElementById("map-search-here-btn");
          if (btn) btn.style.display = "inline-flex";
        };
        kakao.maps.event.addListener(map, "dragend", showSearchHereBtn);
        kakao.maps.event.addListener(map, "zoom_changed", showSearchHereBtn);
        kakao.maps.event.addListener(map, "click", () => {
          if (activeInfoWindow) {
            activeInfoWindow.close();
            activeInfoWindow = null;
          }
        });

        await plotFacilityMarkers(center, hospitals, aed, shelters);
        resolve();
      });
    });
  }

  // 마커 추가(+말풍선) 로직을 지도 최초 생성 시와 "현 지도에서 검색" 후 재조회 시 둘 다에서
  // 재사용 — 매번 지도를 새로 만들지 않고 마커만 지우고 다시 찍습니다.
  async function plotFacilityMarkers(centerLatLng, hospitals, aed, shelters) {
    const map = kakaoMapInstance;
    if (!map) return;

    Object.values(mapMarkers).forEach((list) => list.forEach((m) => m.setMap(null)));
    mapMarkers = { hospital: [], aed: [], police: [], shelter: [], pharmacy: [], fire: [], search: [] };
    activeSearchResults = null;
    if (activeInfoWindow) {
      activeInfoWindow.close();
      activeInfoWindow = null;
    }

    const addMarker = (categoryKey, lat, lng, title, contentHtml, sub) => {
      const marker = new kakao.maps.Marker({ map, position: new kakao.maps.LatLng(lat, lng), title, image: normalMarkerImage });
      const infoWindow = new kakao.maps.InfoWindow({ content: `<div style="padding:8px;font-size:12px;line-height:1.4;width:180px;box-sizing:border-box;word-break:keep-all;overflow-wrap:break-word;">${contentHtml}</div>` });
      kakao.maps.event.addListener(marker, "click", () => {
        if (activeInfoWindow) activeInfoWindow.close();
        infoWindow.open(map, marker);
        activeInfoWindow = infoWindow;
        const style = FACILITY_STYLE[categoryKey] || FACILITY_STYLE.search;
        showPlaceDetail({ icon: style.icon, cls: style.cls, title, sub: sub || "", lat, lng, marker });
      });
      mapMarkers[categoryKey].push(marker);
    };

    hospitals.forEach((h) => {
      if (!h.lat || !h.lng) return;
      addMarker(
        "hospital",
        h.lat,
        h.lng,
        h.name,
        `<strong style="font-size:13px;">${h.name}</strong><br>${h.type || t("map.js.hospitalDefault")}<br>${h.tel || ""}`,
        hospitalStatusLabel(h)
      );
    });

    if (aed.ok && Array.isArray(aed.items)) {
      aed.items.forEach((it) => {
        if (!it.lat || !it.lng) return;
        addMarker(
          "aed",
          it.lat,
          it.lng,
          it.org || "AED",
          `<strong style="font-size:13px;">${it.org || t("map.js.aedLocationDefault")}</strong><br>${it.buildPlace || ""}<br>${it.buildAddress || ""}`,
          it.buildPlace || it.buildAddress || t("map.js.aedLocationDefault")
        );
      });
    }

    shelters.forEach((s) => {
      if (!s.lat || !s.lng) return;
      addMarker(
        "shelter",
        s.lat,
        s.lng,
        s.name,
        `<strong style="font-size:13px;">${s.name}</strong><br>${s.location || ""}<br>${capacityLabel(s.capacity)}`,
        capacityLabel(s.capacity)
      );
    });

    // 경찰(지구대)/약국/소방서는 자체 데이터셋이 없어서, 카카오 장소검색(키워드)으로 실시간 조회
    // (전부 실데이터 — Kakao Local API가 실제로 찾아준 곳만 마커로 올림)
    if (kakao.maps.services) {
      const places = new kakao.maps.services.Places();
      const searchNearby = (keyword) =>
        new Promise((resolve2) => {
          places.keywordSearch(
            keyword,
            (results, status) => resolve2(status === kakao.maps.services.Status.OK ? results : []),
            { location: centerLatLng, radius: 3000, sort: kakao.maps.services.SortBy.DISTANCE }
          );
        });
      const KEYWORD_CATEGORIES = [
        { key: "police", keyword: "지구대" },
        { key: "pharmacy", keyword: "약국" },
        { key: "fire", keyword: "소방서" },
      ];
      for (const { key, keyword } of KEYWORD_CATEGORIES) {
        try {
          const results = await searchNearby(keyword);
          results.slice(0, 10).forEach((place) => {
            addMarker(
              key,
              Number(place.y),
              Number(place.x),
              place.place_name,
              `<strong style="font-size:13px;">${place.place_name}</strong><br>${place.road_address_name || place.address_name || ""}<br>${place.phone || ""}`,
              place.road_address_name || place.address_name || ""
            );
          });
        } catch (e) {
          console.warn(`[OLA] ${keyword} 검색 실패:`, e);
        }
      }
    }
  }

  function renderMiniMap(allRegions, currentSelectedKey) {
    const container = document.getElementById("map-mini-map-container");
    if (!container) return;
    // data-i18n이 남아있으면 언어를 바꿀 때마다 olaI18n.apply()가 이 SVG 대체 지도를 통째로
    // 지우고 "지도를 불러오는 중…" 로딩 문구로 되돌려버리므로, 실제로 그려 넣는 시점부터는
    // 이 속성을 떼어낸다.
    container.removeAttribute("data-i18n");
    const entries = Object.entries(allRegions).filter(([, r]) => r.center);
    if (!entries.length) {
      container.textContent = t("map.js.noMapData");
      return;
    }
    const lats = entries.map(([, r]) => r.center.lat);
    const lngs = entries.map(([, r]) => r.center.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const W = 400, H = 260, PAD = 28;

    function project(lat, lng) {
      const x = PAD + ((lng - minLng) / (maxLng - minLng || 1)) * (W - PAD * 2);
      const y = PAD + (1 - (lat - minLat) / (maxLat - minLat || 1)) * (H - PAD * 2);
      return [x, y];
    }
    function scoreColor(score) {
      if (score >= 80) return "#ABD5BA";
      if (score >= 50) return "#5FA8D3";
      if (score >= 20) return "#FFD6A5";
      return "#EF4444";
    }

    let shapes = "";
    entries.forEach(([key, r]) => {
      const score = olaData.calcSafetyScore({
        crimeRiskIndex: r.crime?.crime_risk_index ?? 50,
        weatherRisk: 0,
        hospitalCount: r.medical?.hospital_count ?? 0,
        shelterCount: r.shelter_count ?? 0,
      });
      const [x, y] = project(r.center.lat, r.center.lng);
      const isCurrent = key === currentSelectedKey;
      const radius = isCurrent ? 9 : 4;
      const color = scoreColor(score);
      if (isCurrent) {
        shapes += `<circle cx="${x}" cy="${y}" r="${radius + 5}" fill="${color}" opacity="0.25"><animate attributeName="r" values="${radius + 3};${radius + 9};${radius + 3}" dur="2s" repeatCount="indefinite"/></circle>`;
      }
      const [rSido] = key.split("|");
      const guLabel = window.olaGuDisplay ? olaGuDisplay(rSido, r.gu) : r.gu;
      shapes += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="${isCurrent ? "#333D4B" : "#fff"}" stroke-width="${isCurrent ? 2 : 1}"><title>${t("map.js.safetyScoreTooltip", { gu: guLabel, score })}</title></circle>`;
      if (isCurrent) {
        shapes += `<text x="${x}" y="${y - radius - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#333D4B">${guLabel}</text>`;
      }
    });
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full h-full">${shapes}</svg>`;
  }

  // 시설 바로찾기 필터 (전체/경찰/병원/AED/대피소는 실데이터, CCTV는 아직 연동 전이라 안내만 표시)
  const MAP_FACILITY_PENDING_KEYS = { cctv: "map.js.cctvPending" };
  function facilityPendingNotice(category) {
    const key = MAP_FACILITY_PENDING_KEYS[category];
    return key ? t(key) : null;
  }

  window.filterMapFacility = function (category) {
    activeMapCategory = category;
    if (activeSearchResults) clearSearchMarkers();
    activeSearchResults = null;
    document.querySelectorAll(".map-filter-btn").forEach((btn) => {
      const active = btn.dataset.category === category;
      btn.className = active
        ? "map-filter-btn px-3 py-1.5 rounded-full font-bold bg-slate-900 text-white shrink-0 transition text-xs flex items-center gap-1"
        : "map-filter-btn px-3 py-1.5 rounded-full font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0 transition text-xs flex items-center gap-1";
    });

    const noticeEl = document.getElementById("map-facility-notice");
    if (facilityPendingNotice(category)) {
      if (noticeEl) {
        noticeEl.textContent = facilityPendingNotice(category);
        noticeEl.classList.remove("hidden");
      }
      if (kakaoMapInstance) {
        Object.keys(mapMarkers).forEach((k) => mapMarkers[k].forEach((m) => m.setMap(null)));
      }
      renderNearbyInfraList(category);
      return;
    }
    if (noticeEl) noticeEl.classList.add("hidden");
    if (kakaoMapInstance) {
      Object.keys(mapMarkers).forEach((k) => {
        const show = category === "all" || category === k;
        mapMarkers[k].forEach((m) => m.setMap(show ? kakaoMapInstance : null));
      });
    }
    renderNearbyInfraList(category);
  };

  // 우측 툴바 "테마" 버튼 - 클릭 시 시설 카테고리 칩 패널을 왼쪽으로 펼침/접음
  // (기본 상태는 HTML의 hidden 클래스로 선언, 실제 토글은 인라인 style.display로 처리)
  window.toggleMapPanel = function () {
    const panel = document.getElementById("map-theme-panel");
    if (!panel) return;
    const currentlyHidden = panel.style.display === "none" || (panel.style.display === "" && panel.classList.contains("hidden"));
    panel.style.display = currentlyHidden ? "block" : "none";
  };

  // 좌측 패널(검색 + 주변 안전 인프라) 접기/펼치기 - 기본은 펼침 상태
  window.toggleMapSidePanel = function () {
    const panel = document.getElementById("map-side-panel");
    const icon = document.getElementById("map-panel-toggle-icon");
    if (!panel) return;
    const currentlyVisible = panel.style.display !== "none";
    panel.style.display = currentlyVisible ? "none" : "flex";
    if (icon) {
      icon.setAttribute("data-lucide", currentlyVisible ? "chevron-right" : "chevron-left");
      if (window.lucide) lucide.createIcons();
    }
  };

  // 우측 툴바 "반경" 아이콘에 마우스를 올리면 나오는 목록에서 원하는 범위를 직접 선택
  window.setMapRadius = function (value) {
    const idx = RADIUS_PRESETS.indexOf(value);
    if (idx < 0) return;
    radiusIndex = idx;
    updateRadiusOptionStyles();
    loadAll();
  };

  function updateRadiusOptionStyles() {
    document.querySelectorAll(".map-radius-option").forEach((btn) => {
      const active = Number(btn.dataset.radius) === RADIUS_PRESETS[radiusIndex];
      btn.className = active
        ? "map-radius-option px-3 py-1 rounded text-xs text-left bg-primary text-white font-bold"
        : "map-radius-option px-3 py-1 rounded text-xs text-left text-slate-600 hover:bg-bg";
    });
  }

  // 카카오 좌표→행정동 역지오코딩 - 임의 좌표가 어느 시/도, 시군구에 속하는지 알아내서
  // (AED 정부 API는 시도/시군구 이름으로만 조회 가능하므로) "현 지도에서 검색" 시 사용
  function reverseGeocodeRegion(lat, lng) {
    return new Promise((resolve) => {
      if (!window.kakao || !kakao.maps.services) {
        resolve(null);
        return;
      }
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.coord2RegionCode(lng, lat, (result, status) => {
        if (status !== kakao.maps.services.Status.OK || !result.length) {
          resolve(null);
          return;
        }
        const region = result.find((r) => r.region_type === "H") || result[0];
        resolve({ sido: region.region_1depth_name, gugun: region.region_2depth_name });
      });
    });
  }

  // 좌표 기준으로 병원/대피소/AED를 실제로 다시 조회하고 지도·리스트를 갱신
  // ("현 지도에서 검색"과 "접속위치" 둘 다 여기로 모여서, 어느 쪽이든 항상 진짜 좌표 기준 재검색을 함)
  async function refetchFacilitiesAround(lat, lng, radiusKm) {
    if (!window.kakao || !kakao.maps) return;
    const radius = radiusKm ?? RADIUS_PRESETS[radiusIndex];
    const centerLatLng = new kakao.maps.LatLng(lat, lng);

    const [hospitals, shelters] = await Promise.all([
      olaData.getNearbyHospitals(lat, lng, radius).catch(() => []),
      olaData.getNearbyShelters(lat, lng, radius).catch(() => []),
    ]);

    let aed = { ok: false };
    try {
      const regionInfo = await reverseGeocodeRegion(lat, lng);
      if (regionInfo) {
        aed = await olaApi.getAedList({ sido: regionInfo.sido, gugun: regionInfo.gugun });
      }
    } catch (e) {
      /* ignore */
    }

    await plotFacilityMarkers(centerLatLng, hospitals, aed, shelters);

    const regionData = { ...(lastLoadData?.regionData || {}), center: { lat, lng } };
    lastLoadData = { regionData, hospitals, aed, shelters };
    // plotFacilityMarkers는 마커를 전부 지도에 새로 찍기만 하므로, 이전에 골라둔 시설 필터
    // (예: 약국만 보기)를 마커 표시에도 다시 적용해줘야 "전체"로 되돌아가 보이지 않습니다.
    filterMapFacility(activeMapCategory);
  }

  // "현 지도에서 검색" 버튼 - 네이버지도의 "이 지역 재검색"처럼, 지도를 옮기거나 줌한 뒤 누르면
  // 지금 지도 중심 좌표를 기준으로 실제로 다시 조회해서 새로 표시합니다.
  window.searchInCurrentMapBounds = async function () {
    if (!kakaoMapInstance) return;
    const btn = document.getElementById("map-search-here-btn");
    if (btn) btn.style.display = "none";
    const center = kakaoMapInstance.getCenter();
    await refetchFacilitiesAround(center.getLat(), center.getLng());
  };

  // 우측 툴바 "접속위치" - 가장 가까운 시군구를 찾아 사이드바 위치·다른 페이지와는 맞추되,
  // 지도 자체는 그 구의 중심점이 아니라 실제 GPS 좌표로 정확히 이동해서 그 좌표 기준으로 재조회합니다.
  // maximumAge:0으로 매번 새로 측정해서, 오래된 캐시 위치 때문에 부정확해지는 것도 방지합니다.
  window.useMyPreciseLocation = function () {
    if (!navigator.geolocation) {
      alert(window.olaLocation ? olaLocation.reasonMessage("unsupported") : t("map.js.geoUnsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        let nearestKey = null;
        let minDist = Infinity;
        Object.entries(regions).forEach(([key, r]) => {
          if (!r.center) return;
          const d = olaData.distanceKm(latitude, longitude, r.center.lat, r.center.lng);
          if (d < minDist) {
            minDist = d;
            nearestKey = key;
          }
        });
        if (nearestKey && window.olaLocation) {
          olaLocation.setKey(nearestKey);
          if (window.olaLocationUI) olaLocationUI.updateLocationBadge();
          const [sido, gu] = nearestKey.split("|");
          const sidoSel = document.getElementById("map-sido-select");
          const guSel = document.getElementById("map-gu-select");
          if (sidoSel) sidoSel.value = sido;
          if (guSel) olaPopulateGuSelect(guSel, sido, gu);
        }

        if (kakaoMapInstance) {
          kakaoMapInstance.setCenter(new kakao.maps.LatLng(latitude, longitude));
          kakaoMapInstance.setLevel(4);
        }
        await refetchFacilitiesAround(latitude, longitude);
      },
      (err) => {
        const reasonMap = { 1: "permission-denied", 2: "unavailable", 3: "timeout" };
        const reason = reasonMap[err.code] || "error";
        alert(window.olaLocation ? olaLocation.reasonMessage(reason) : t("map.js.geoFailed"));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // 검색어/카카오 카테고리코드로 "병원 검색하면 병원처럼, 경찰서 검색하면 경찰서처럼" 보이도록
  // 결과에 어울리는 아이콘·색을 추정 (정확한 카테고리가 없으면 일반 검색결과 스타일로)
  function guessSearchResultStyle(place) {
    const code = place.category_group_code || "";
    const text = `${place.category_name || ""} ${place.place_name || ""}`;
    if (code === "HP8" || text.includes("병원") || text.includes("의원") || text.includes("한의원")) {
      return { icon: "heart-pulse", cls: "bg-red-50 text-red-500" };
    }
    if (code === "PM9" || text.includes("약국")) {
      return { icon: "pill", cls: "bg-teal-50 text-teal-600" };
    }
    if (text.includes("소방서") || text.includes("119안전센터")) {
      return { icon: "flame", cls: "bg-orange-50 text-orange-600" };
    }
    if (text.includes("경찰") || text.includes("지구대") || text.includes("파출소")) {
      return { icon: "shield-check", cls: "bg-blue-50 text-blue-600" };
    }
    if (text.includes("대피소") || text.includes("대피시설")) {
      return { icon: "house", cls: "bg-emerald-50 text-emerald-600" };
    }
    return { icon: "map-pin", cls: "bg-purple-50 text-purple-600" };
  }

  // 장소검색(키워드) 마커·검색결과 마커를 지도에서 지움 ("뒤로" 버튼, 다른 필터 클릭, 새 검색 시작 시 사용)
  function clearSearchMarkers() {
    mapMarkers.search.forEach((m) => m.setMap(null));
    mapMarkers.search = [];
    if (searchResultMarker) {
      searchResultMarker.setMap(null);
      searchResultMarker = null;
    }
  }

  // 좌측 패널 검색결과 상단의 "뒤로" - 장소검색 결과를 닫고 원래 필터 목록으로 되돌아감
  window.clearSearchResults = function () {
    clearSearchMarkers();
    activeSearchResults = null;
    const inputEl = document.getElementById("map-search-input");
    if (inputEl) inputEl.value = "";
    renderNearbyInfraList(activeMapCategory);
  };

  // 좌측 패널 표시 모드 전환 - "기본"(목록/검색결과) ↔ "상세"(핀 클릭 시 장소 정보 + 출발/도착)
  function setPanelMode(mode) {
    const defaultView = document.getElementById("map-infra-default-view");
    const detail = document.getElementById("map-place-detail");
    if (defaultView) defaultView.style.display = mode === "detail" ? "none" : "block";
    if (detail) detail.style.display = mode === "detail" ? "flex" : "none";
  }

  // 지도 핀(마커)을 클릭했을 때 - 핀을 확대하고 좌측 패널에 상세정보 + 출발/도착 버튼을 보여줌
  function showPlaceDetail({ icon, cls, title, sub, lat, lng, marker }) {
    currentPlaceDetail = { title, lat, lng };
    selectMarker(marker);

    const iconEl = document.getElementById("map-place-detail-icon");
    if (iconEl) {
      iconEl.className = `w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${cls}`;
      iconEl.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5"></i>`;
    }
    const titleEl = document.getElementById("map-place-detail-title");
    if (titleEl) titleEl.textContent = title;
    const subEl = document.getElementById("map-place-detail-sub");
    if (subEl) subEl.textContent = sub || "";

    updateRouteButtonStyles();
    setPanelMode("detail");
    if (window.lucide) lucide.createIcons();
  }

  // 좌측 패널 상세정보의 "뒤로"/"닫기" - 확대돼 있던 핀을 원래 크기로 되돌리고 목록으로 복귀
  window.closePlaceDetail = function () {
    if (selectedMarker) {
      selectedMarker.setImage(normalMarkerImage);
      selectedMarker = null;
    }
    currentPlaceDetail = null;
    setPanelMode("default");
    renderNearbyInfraList(activeMapCategory);
  };

  // 출발/도착 버튼 - 지금 열려 있는 장소를 경로의 출발점/도착점으로 지정
  window.setRouteEndpoint = function (which) {
    if (!currentPlaceDetail) return;
    const point = { title: currentPlaceDetail.title, lat: currentPlaceDetail.lat, lng: currentPlaceDetail.lng };
    if (which === "start") routeStart = point;
    else routeEnd = point;
    updateRouteButtonStyles();
    drawRoutePreview();
  };

  function updateRouteButtonStyles() {
    const startBtn = document.getElementById("map-route-start-btn");
    const endBtn = document.getElementById("map-route-end-btn");
    const isSamePoint = (p) => p && currentPlaceDetail && p.lat === currentPlaceDetail.lat && p.lng === currentPlaceDetail.lng;
    if (startBtn) {
      startBtn.className = isSamePoint(routeStart)
        ? "flex-1 flex items-center justify-center gap-1 border-2 border-emerald-400 bg-emerald-50 rounded-lg py-2 text-xs font-bold text-emerald-700 transition-colors"
        : "flex-1 flex items-center justify-center gap-1 border border-slate-200 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-bg transition-colors";
    }
    if (endBtn) {
      endBtn.className = isSamePoint(routeEnd)
        ? "flex-1 flex items-center justify-center gap-1 border-2 border-red-400 bg-red-50 rounded-lg py-2 text-xs font-bold text-red-700 transition-colors"
        : "flex-1 flex items-center justify-center gap-1 border border-slate-200 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-bg transition-colors";
    }
    const clearBtn = document.getElementById("map-route-clear-btn");
    if (clearBtn) clearBtn.style.display = routeStart || routeEnd ? "block" : "none";
    if (window.lucide) lucide.createIcons();
  }

  // 출발/도착이 둘 다 정해지면 지도에 점선으로 직선 미리보기를 그림 (실제 도로 경로 계산은 아님 —
  // 카카오모빌리티 길찾기 API는 REST 키를 따로 발급받아야 해서, 일단 직선거리 미리보기만 제공)
  function drawRoutePreview() {
    if (routeLine) {
      routeLine.setMap(null);
      routeLine = null;
    }
    if (routeStartMarker) {
      routeStartMarker.setMap(null);
      routeStartMarker = null;
    }
    if (routeEndMarker) {
      routeEndMarker.setMap(null);
      routeEndMarker = null;
    }

    const summaryEl = document.getElementById("map-route-summary");
    if (!routeStart || !routeEnd || !kakaoMapInstance) {
      if (summaryEl) summaryEl.style.display = "none";
      return;
    }

    const startPos = new kakao.maps.LatLng(routeStart.lat, routeStart.lng);
    const endPos = new kakao.maps.LatLng(routeEnd.lat, routeEnd.lng);

    routeStartMarker = new kakao.maps.Marker({ map: kakaoMapInstance, position: startPos, image: normalMarkerImage, title: `${t("map.routeStart")}: ${routeStart.title}` });
    routeEndMarker = new kakao.maps.Marker({ map: kakaoMapInstance, position: endPos, image: normalMarkerImage, title: `${t("map.routeEnd")}: ${routeEnd.title}` });
    routeLine = new kakao.maps.Polyline({
      map: kakaoMapInstance,
      path: [startPos, endPos],
      strokeWeight: 4,
      strokeColor: "#2563eb",
      strokeOpacity: 0.85,
      strokeStyle: "shortdash",
    });

    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(startPos);
    bounds.extend(endPos);
    kakaoMapInstance.setBounds(bounds);

    const dist = olaData.distanceKm(routeStart.lat, routeStart.lng, routeEnd.lat, routeEnd.lng);
    if (summaryEl) {
      summaryEl.innerHTML = `<strong>${routeStart.title}</strong> → <strong>${routeEnd.title}</strong><br>${t("map.js.straightDistance", { km: dist.toFixed(1) })} <span class="text-gray-400">${t("map.js.routePreviewNote")}</span>`;
      summaryEl.style.display = "block";
    }
  }

  // "경로 지우기"
  window.clearRoute = function () {
    routeStart = null;
    routeEnd = null;
    drawRoutePreview();
    updateRouteButtonStyles();
  };

  // 장소검색(키워드) 결과를 전부(최대 15곳) 지도에 표시하고, 지도 범위를 결과에 맞춰 이동
  function showKeywordResults(results) {
    const center = kakaoMapInstance.getCenter();
    const bounds = new kakao.maps.LatLngBounds();

    clearSearchMarkers();

    // 이전에 핀을 클릭해서 좌측 패널이 "상세정보" 모드에 남아있으면, 새 검색 결과 목록이 그 뒤에 가려져
    // 화면이 안 바뀐 것처럼 보였습니다. 새로 검색할 때는 항상 목록 화면으로 되돌립니다.
    if (selectedMarker) {
      selectedMarker.setImage(normalMarkerImage);
      selectedMarker = null;
    }
    currentPlaceDetail = null;
    setPanelMode("default");

    activeSearchResults = results.slice(0, 15).map((place) => {
      const lat = Number(place.y);
      const lng = Number(place.x);
      const pos = new kakao.maps.LatLng(lat, lng);
      bounds.extend(pos);
      const style = guessSearchResultStyle(place);
      const sub = place.road_address_name || place.address_name || "";
      const marker = new kakao.maps.Marker({ map: kakaoMapInstance, position: pos, title: place.place_name, image: normalMarkerImage });
      const infoWindow = new kakao.maps.InfoWindow({
        content: `<div style="padding:8px;font-size:12px;line-height:1.4;width:180px;box-sizing:border-box;word-break:keep-all;overflow-wrap:break-word;"><strong style="font-size:13px;">${place.place_name}</strong><br>${sub}<br>${place.phone || ""}</div>`,
      });
      kakao.maps.event.addListener(marker, "click", () => {
        if (activeInfoWindow) activeInfoWindow.close();
        infoWindow.open(kakaoMapInstance, marker);
        activeInfoWindow = infoWindow;
        showPlaceDetail({ icon: style.icon, cls: style.cls, title: place.place_name, sub, lat, lng, marker });
      });
      mapMarkers.search.push(marker);
      return {
        compact: true,
        icon: style.icon,
        cls: style.cls,
        title: place.place_name,
        sub,
        dist: olaData.distanceKm(center.getLat(), center.getLng(), lat, lng),
        marker,
      };
    });
    kakaoMapInstance.setBounds(bounds);
    renderNearbyInfraList(activeMapCategory);
  }

  // 주소/장소 검색 - 카카오 Geocoder(도로명·지번 주소) 또는 Places(키워드) API 사용.
  // 장소검색(키워드)은 결과를 전부 지도·리스트에 보여주고, 도로명검색은 한 지점을 정확히 가리키므로
  // 그 위치로만 이동합니다.
  window.olaMapSearchSubmit = function () {
    const inputEl = document.getElementById("map-search-input");
    const query = inputEl ? inputEl.value.trim() : "";
    if (!query) return;
    if (!kakaoMapInstance || !window.kakao || !kakao.maps.services) {
      alert(t("map.js.mapNotReady"));
      return;
    }

    const showAddressResult = (lat, lng, label) => {
      const pos = new kakao.maps.LatLng(lat, lng);
      kakaoMapInstance.setCenter(pos);
      kakaoMapInstance.setLevel(4);
      if (searchResultMarker) searchResultMarker.setMap(null);
      searchResultMarker = new kakao.maps.Marker({ map: kakaoMapInstance, position: pos, image: normalMarkerImage });
      const infoWindow = new kakao.maps.InfoWindow({ content: `<div style="padding:8px;font-size:12px;width:180px;box-sizing:border-box;word-break:keep-all;overflow-wrap:break-word;">${label}</div>` });
      infoWindow.open(kakaoMapInstance, searchResultMarker);
      kakao.maps.event.addListener(searchResultMarker, "click", () => {
        showPlaceDetail({ icon: "map-pin", cls: "bg-purple-50 text-purple-600", title: label, sub: "", lat, lng, marker: searchResultMarker });
      });
      showPlaceDetail({ icon: "map-pin", cls: "bg-purple-50 text-purple-600", title: label, sub: "", lat, lng, marker: searchResultMarker });
      const btn = document.getElementById("map-search-here-btn");
      if (btn) btn.style.display = "inline-flex";
    };

    const runKeywordSearch = (onEmpty) => {
      const places = new kakao.maps.services.Places();
      places.keywordSearch(
        query,
        (results, status) => {
          if (status === kakao.maps.services.Status.OK && results.length) {
            showKeywordResults(results);
          } else if (onEmpty) {
            onEmpty();
          } else {
            alert(t("map.js.noSearchResults"));
          }
        },
        { location: kakaoMapInstance.getCenter() }
      );
    };

    const type = document.getElementById("map-search-type-select")?.value || "address";
    if (type === "keyword") {
      runKeywordSearch();
    } else {
      // "도로명검색"은 정확한 주소 문자열에만 반응하므로, "병원"처럼 주소가 아닌 검색어를
      // 넣었을 때는 실패로 끝내지 않고 장소검색(키워드)으로 자동 재시도합니다.
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.addressSearch(query, (results, status) => {
        if (status === kakao.maps.services.Status.OK && results.length) {
          showAddressResult(Number(results[0].y), Number(results[0].x), results[0].address_name);
        } else {
          runKeywordSearch(() => alert(t("map.js.noSearchResults")));
        }
      });
    }
  };

  // 지금 화면에 그려진 "주변 안전 인프라" 행들 - 행을 클릭했을 때 어떤 마커를 흔들지 찾기 위해 기억해둠
  let currentInfraRows = [];

  function infraRowsHtml(rows) {
    currentInfraRows = rows;
    if (!rows.length) {
      return `<p class="text-sm text-gray-400 text-center py-6 col-span-full">${t("map.js.noInfraInRadius")}</p>`;
    }
    return rows
      .map((r, i) => {
        const clickable = r.marker ? "cursor-pointer" : "";
        const onclick = r.marker ? `onclick="focusInfraMarker(${i})"` : "";
        const distHtml = r.dist != null ? `<span class="text-xs font-bold text-primary flex-shrink-0">${r.dist.toFixed(1)}km</span>` : "";

        // 장소검색(키워드) 결과는 카테고리 아이콘 없이, 이름·주소를 크게 보여주는 카드형으로
        if (r.compact) {
          return `
      <div class="p-2.5 rounded-lg hover:bg-bg ${clickable}" ${onclick}>
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm font-bold leading-snug min-w-0 truncate">${r.title}</p>
          ${distHtml}
        </div>
        ${r.sub ? `<p class="text-xs text-gray-400 truncate mt-0.5">${r.sub}</p>` : ""}
      </div>`;
        }

        return `
      <div class="flex items-center gap-3 p-2.5 rounded-lg hover:bg-bg ${clickable}" ${onclick}>
        <div class="w-9 h-9 rounded-full ${r.cls} flex items-center justify-center flex-shrink-0"><i data-lucide="${r.icon}" class="w-4 h-4"></i></div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold truncate">${r.title}</p>
          <p class="text-xs text-gray-400 truncate">${r.sub}</p>
        </div>
        ${distHtml}
      </div>`;
      })
      .join("");
  }

  // 리스트 행 클릭 - 지도의 해당 마커로 이동해서 통통 튀게 흔들고 말풍선을 엶
  window.focusInfraMarker = function (index) {
    const row = currentInfraRows[index];
    if (!row || !row.marker || !kakaoMapInstance) return;
    kakaoMapInstance.panTo(row.marker.getPosition());
    bounceMarker(row.marker);
    kakao.maps.event.trigger(row.marker, "click");
  };

  // 카카오맵 마커에는 기본 "바운스" 애니메이션이 없어서, 위치를 아주 살짝(북쪽으로) 튕겼다
  // 내려오는 걸 반복해 흉내냅니다 (진폭이 점점 줄어들며 원래 위치로 돌아옴)
  function bounceMarker(marker) {
    const original = marker.getPosition();
    const lat = original.getLat();
    const lng = original.getLng();
    const amplitude = 0.00035;
    const steps = [0.7, 1, 0.5, 1, 0.25, 1, 0];
    let i = 0;
    (function step() {
      if (i >= steps.length) {
        marker.setPosition(original);
        return;
      }
      marker.setPosition(new kakao.maps.LatLng(lat + amplitude * steps[i], lng));
      i += 1;
      setTimeout(step, 70);
    })();
  }

  // 경찰/약국/소방서는 자체 데이터셋이 없어 카카오 장소검색 마커 기준으로 리스트를 만듭니다
  // (Places.keywordSearch를 거리순 정렬로 호출해뒀으므로 마커 배열 자체가 이미 거리순)
  // label/sub은 화면 표시용이라 t()로 조회하고, icon/cls는 스타일이라 고정값 유지.
  const KEYWORD_CATEGORY_META = {
    police: { icon: "shield-check", cls: "bg-blue-50 text-blue-600" },
    pharmacy: { icon: "pill", cls: "bg-teal-50 text-teal-600" },
    fire: { icon: "flame", cls: "bg-orange-50 text-orange-600" },
  };
  function keywordCategoryLabel(key) {
    return facilityLabel(key);
  }
  function keywordCategorySub(key) {
    return key === "police" ? t("map.js.police24h") : facilityLabel(key);
  }

  // 데이터 배열(병원/대피소/AED)의 좌표와 정확히 일치하는 마커를 찾음 - 리스트 행을 클릭했을 때
  // 지도의 그 마커를 흔들고 말풍선을 열기 위해 필요 (mapMarkers는 이미 실제로 지도에 찍힌 마커들)
  function findMarkerByLatLng(categoryKey, lat, lng) {
    return (mapMarkers[categoryKey] || []).find((m) => {
      const p = m.getPosition();
      return Math.abs(p.getLat() - lat) < 1e-6 && Math.abs(p.getLng() - lng) < 1e-6;
    });
  }

  function rowsFromMarkerCategory(categoryKey, center) {
    const meta = KEYWORD_CATEGORY_META[categoryKey];
    return (mapMarkers[categoryKey] || [])
      .map((m) => {
        const pos = m.getPosition();
        return { marker: m, title: m.getTitle(), dist: center ? olaData.distanceKm(center.lat, center.lng, pos.getLat(), pos.getLng()) : null };
      })
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity))
      .map((p) => ({ icon: meta.icon, cls: meta.cls, title: p.title, sub: keywordCategorySub(categoryKey), dist: p.dist, marker: p.marker }));
  }

  // "전체" 선택 시 - 가장 가까운 경찰/병원/대피소/AED/약국/소방서 각 1곳만 요약으로 보여줌 (전부 실데이터)
  // 여러 종류가 한 목록에 섞이므로, 제목 앞에 "대피소(갑을아파트)"처럼 시설 종류를 붙여 헷갈리지 않게 함
  function buildSummaryRows({ regionData, hospitals, aed, shelters }) {
    const rows = [];
    if (hospitals.length) {
      const h = hospitals.slice().sort((a, b) => a.distanceKm - b.distanceKm)[0];
      rows.push({ icon: "heart-pulse", cls: "bg-red-50 text-red-500", title: `${facilityLabel("hospital")}(${h.name})`, sub: hospitalStatusLabel(h), dist: h.distanceKm, marker: findMarkerByLatLng("hospital", h.lat, h.lng) });
    }
    if (shelters.length) {
      const s = shelters.slice().sort((a, b) => a.distanceKm - b.distanceKm)[0];
      rows.push({ icon: "house", cls: "bg-emerald-50 text-emerald-600", title: `${facilityLabel("shelter")}(${s.name})`, sub: capacityLabel(s.capacity), dist: s.distanceKm, marker: findMarkerByLatLng("shelter", s.lat, s.lng) });
    }
    if (aed.ok && Array.isArray(aed.items) && regionData?.center) {
      const center = regionData.center;
      const nearest = aed.items
        .filter((it) => it.lat && it.lng)
        .map((it) => ({ ...it, distanceKm: olaData.distanceKm(center.lat, center.lng, it.lat, it.lng) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];
      if (nearest) {
        rows.push({ icon: "zap", cls: "bg-amber-50 text-amber-600", title: `${facilityLabel("aed")}(${nearest.org || t("map.js.aedLocationDefault")})`, sub: t("map.js.withinRadiusCount", { n: aed.count }), dist: nearest.distanceKm, marker: findMarkerByLatLng("aed", nearest.lat, nearest.lng) });
      }
    }
    ["police", "pharmacy", "fire"].forEach((key) => {
      const list = mapMarkers[key];
      if (list && list.length) {
        const meta = KEYWORD_CATEGORY_META[key];
        rows.push({ icon: meta.icon, cls: meta.cls, title: `${keywordCategoryLabel(key)}(${list[0].getTitle()})`, sub: keywordCategorySub(key), dist: null, marker: list[0] });
      }
    });
    return rows;
  }

  // 시설 필터 버튼과 연동 - 특정 카테고리를 고르면 지도에 표기된 그 시설 전체를 거리순으로 나열
  // (병원/대피소는 반경 내 실데이터, AED/경찰/약국/소방서는 지도에 실제로 찍힌 마커 기준 — 전부 실데이터, 지어내지 않음)
  function setSearchResultsBarVisible(visible) {
    const bar = document.getElementById("map-search-results-bar");
    if (bar) bar.style.display = visible ? "flex" : "none";
  }

  // "주변 안전 인프라" 제목 옆에 - 숫자 없이, 아래 목록이 거리순(최단거리부터)이라는 것만 안내
  function updateNearestDistBadge(rows) {
    const badge = document.getElementById("map-infra-nearest-dist");
    if (!badge) return;
    const hasDist = rows.some((r) => r.dist != null);
    badge.textContent = hasDist ? t("map.js.shortestDistBadge") : "";
  }

  function renderNearbyInfraList(category) {
    const el = document.getElementById("map-nearby-infra-list");
    if (!el || !lastLoadData) return;

    if (activeSearchResults) {
      setSearchResultsBarVisible(true);
      const rows = sortRowsByDistance(activeSearchResults);
      updateNearestDistBadge(rows);
      el.innerHTML = infraRowsHtml(rows);
      if (window.lucide) lucide.createIcons();
      return;
    }
    setSearchResultsBarVisible(false);

    if (facilityPendingNotice(category)) {
      updateNearestDistBadge([]);
      el.innerHTML = `<p class="text-sm text-gray-400 text-center py-6 col-span-full">${facilityPendingNotice(category)}</p>`;
      return;
    }

    const { regionData, hospitals, aed, shelters } = lastLoadData;
    const center = regionData?.center;
    let rows;

    if (category === "hospital") {
      rows = hospitals
        .slice()
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .map((h) => ({ icon: "heart-pulse", cls: "bg-red-50 text-red-500", title: h.name, sub: hospitalStatusLabel(h), dist: h.distanceKm, marker: findMarkerByLatLng("hospital", h.lat, h.lng) }));
    } else if (category === "shelter") {
      rows = shelters
        .slice()
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .map((s) => ({ icon: "house", cls: "bg-emerald-50 text-emerald-600", title: s.name, sub: capacityLabel(s.capacity), dist: s.distanceKm, marker: findMarkerByLatLng("shelter", s.lat, s.lng) }));
    } else if (category === "aed") {
      rows = (aed.ok && Array.isArray(aed.items) ? aed.items : [])
        .filter((it) => it.lat && it.lng)
        .map((it) => ({ ...it, distanceKm: center ? olaData.distanceKm(center.lat, center.lng, it.lat, it.lng) : null }))
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
        .map((it) => ({ icon: "zap", cls: "bg-amber-50 text-amber-600", title: it.org || t("map.js.aedLocationDefault"), sub: it.buildPlace || it.buildAddress || "", dist: it.distanceKm, marker: findMarkerByLatLng("aed", it.lat, it.lng) }));
    } else if (category === "police" || category === "pharmacy" || category === "fire") {
      rows = rowsFromMarkerCategory(category, center);
    } else {
      rows = buildSummaryRows(lastLoadData);
    }

    const sortedRows = sortRowsByDistance(rows);
    updateNearestDistBadge(sortedRows);
    el.innerHTML = infraRowsHtml(sortedRows);
    if (window.lucide) lucide.createIcons();
  }

  // 가까운 순 정렬 - 거리 정보가 없는 항목(dist: null)은 항상 맨 뒤로
  function sortRowsByDistance(rows) {
    return rows.slice().sort((a, b) => {
      if (a.dist == null && b.dist == null) return 0;
      if (a.dist == null) return 1;
      if (b.dist == null) return -1;
      return a.dist - b.dist;
    });
  }

  document.addEventListener("DOMContentLoaded", init);
  // 헤더 위치 배지(GPS)로 지역이 바뀌면 이 페이지의 시도/구 select도 그 값으로 맞춰줍니다.
  window.onOlaLocationChange = function (key) {
    const [sido, gu] = key.split("|");
    const sidoSel = document.getElementById("map-sido-select");
    const guSel = document.getElementById("map-gu-select");
    if (sidoSel) sidoSel.value = sido;
    if (guSel) olaPopulateGuSelect(guSel, sido, gu);
    loadAll();
  };

  // 언어를 바꾸면, 이미 화면에 떠 있는 동적 콘텐츠(주변 안전 인프라 목록, 시설 안내
  // 문구, 경로 미리보기 요약, SVG 대체 지도 툴팁)를 새 언어로 다시 그린다.
  // ※ filterMapFacility()는 검색 결과(activeSearchResults)를 초기화해버리므로 여기서는
  // 쓰지 않고, 지금 화면 상태를 그대로 둔 채 텍스트만 다시 그리는 함수들만 호출한다.
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.olaI18n) return;
    olaI18n.onLocaleChange(() => {
      refreshRegionSelectLabels();
      renderNearbyInfraList(activeMapCategory);

      const noticeEl = document.getElementById("map-facility-notice");
      if (noticeEl && !noticeEl.classList.contains("hidden")) {
        const notice = facilityPendingNotice(activeMapCategory);
        if (notice) noticeEl.textContent = notice;
      }

      if (routeStart && routeEnd) drawRoutePreview();

      // 카카오맵이 실패해서 SVG 개요도로 대체된 상태라면(지도 안에 원형 마커가 있는지로 판단),
      // 지역명·안전도 툴팁이 담긴 SVG를 새 언어로 다시 그린다.
      const mapContainer = document.getElementById("map-mini-map-container");
      if (!kakaoMapInstance && mapContainer && mapContainer.querySelector("svg")) {
        try {
          renderMiniMap(regions, currentKey());
        } catch (_) {
          /* ignore */
        }
      }
    });
  });
})();
