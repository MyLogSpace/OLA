/**
 * js/home.js — index.html(홈) 대시보드 위젯에 실데이터를 채워 넣습니다.
 * 로컬 데이터(범죄통계/병원/대피소)는 항상 사용 가능하고,
 * 실시간 API(기상특보/AED/미세먼지)는 js/config.js 에 키가 있을 때만 시도합니다.
 */
(function () {
  const BRIEFING_TIMEOUT_MS = 8000;
  // ⚠️ 언어 전환 후에도 현재 언어로 나오도록, 상수로 한 번만 굳히지 않고 매번 조회해서 씁니다.
  function briefingFallbackMsg() {
    return window.olaI18n
      ? olaI18n.t("briefing.fallbackMsg")
      : "오늘의 안전 정보를 불러올 수 없습니다.<br>잠시 후 다시 시도해주세요.";
  }
  let briefingTimeoutId = null;
  let briefingSettled = false;

  // 오늘의 올라 브리핑 - 확성기 아이콘을 누르면 브리핑 문구를 음성으로 읽어줌
  // (브라우저 내장 Web Speech API, 별도 서버/과금 없음). 재생 중엔 버튼이 흔들리는 모션으로
  // 재생 중임을 보여주고, 다시 누르면 멈추고 아이콘·모션 모두 원래대로 돌아옴.
  // ⚠️ 흔들림 모션은 아이콘(svg)이 아니라 버튼 자체에 건다 — lucide.createIcons()가 아이콘을
  // 다시 그릴 때마다 그 안에 직접 붙인 class는 사라질 수 있어서, 안 사라지는 버튼에 건다.
  function resetBriefingSpeakButton() {
    const btn = document.getElementById("briefing-speak-btn");
    const icon = document.getElementById("briefing-speak-icon");
    if (btn) btn.classList.remove("briefing-speak-active");
    if (icon) {
      icon.setAttribute("data-lucide", "megaphone");
      if (window.lucide) lucide.createIcons();
    }
  }

  window.olaSpeakBriefing = function () {
    if (!window.speechSynthesis) {
      const t = window.olaI18n ? olaI18n.t : (k) => k;
      if (window.olaToast) olaToast.show(t("toast.voiceNotSupportedTitle"), t("toast.voiceNotSupportedBody"));
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      resetBriefingSpeakButton();
      return;
    }

    const textEl = document.getElementById("ai-briefing-text");
    const text = textEl ? textEl.innerText.trim() : "";
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const ttsLocaleMap = { ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" };
    utterance.lang = (window.olaI18n && ttsLocaleMap[olaI18n.getLocale()]) || "ko-KR";
    utterance.onend = resetBriefingSpeakButton;
    utterance.onerror = resetBriefingSpeakButton;

    const btn = document.getElementById("briefing-speak-btn");
    const icon = document.getElementById("briefing-speak-icon");
    if (btn) btn.classList.add("briefing-speak-active");
    if (icon) {
      icon.setAttribute("data-lucide", "pause");
      if (window.lucide) lucide.createIcons();
    }
    window.speechSynthesis.speak(utterance);
  };

  // 타이핑 치는 것처럼 한 글자씩 순차적으로 표시 (<br>은 줄바꿈 한 단위로 처리)
  function typeIntoElement(el, html, speed = 45) {
    if (!el) return;
    if (el.__typeTimer) clearInterval(el.__typeTimer);

    const units = [];
    (html || "").split(/(<br\s*\/?>)/i).forEach((part) => {
      if (/^<br\s*\/?>$/i.test(part)) units.push("<br>");
      else units.push(...part.split(""));
    });

    el.innerHTML = "";
    let i = 0;
    el.__typeTimer = setInterval(() => {
      if (i >= units.length) {
        clearInterval(el.__typeTimer);
        el.__typeTimer = null;
        return;
      }
      el.innerHTML += units[i];
      i++;
    }, speed);
  }

  // 로딩이 너무 오래 걸리거나 실패했을 때, 스피너를 내리고 기본 문구로 대체
  function finalizeBriefingFallback(message) {
    if (briefingSettled) return;
    briefingSettled = true;
    if (briefingTimeoutId) clearTimeout(briefingTimeoutId);
    const briefingEl = document.getElementById("ai-briefing-text");
    const loadingEl = document.getElementById("ai-briefing-loading");
    if (briefingEl) typeIntoElement(briefingEl, message || briefingFallbackMsg());
    if (loadingEl) loadingEl.classList.add("hidden");
  }

  // 속보 티커 - 첫 항목은 initHomeBriefingPreview에서 이미 조회한 실시간 기상특보 데이터를 그대로
  // 재사용한다(같은 API를 중복 호출하지 않음). 여러 줄처럼 보이도록 뒤에 붙는 나머지 항목은 실시간
  // 개별 API가 없어서 일반적인 안내 문구로 채운다 (특정 사건을 지어내지 않고 항상 참인 안내성 문구만 사용).
  function renderDisasterTicker({ regionLabel, weatherLabel, weatherRisk }) {
    const el = document.getElementById("disaster-ticker-text");
    if (!el) return;
    const active = weatherRisk > 0;
    const t = window.olaI18n ? olaI18n.t : (k) => k;

    const items = [
      active
        ? t("home.tickerActive", { region: regionLabel, label: weatherLabel })
        : t("home.tickerNone", { region: regionLabel }),
      t("home.tickerNational"),
      t("home.tickerMapHint"),
      t("home.tickerSosHint"),
    ];
    el.textContent = items.join("     •     ");
  }

  async function initHomeBriefingPreview() {
    briefingSettled = false;
    briefingTimeoutId = setTimeout(() => finalizeBriefingFallback(briefingFallbackMsg()), BRIEFING_TIMEOUT_MS);

    const regionKey = window.olaLocation ? olaLocation.getKey() : olaRegionKey(OLA_CONFIG.DEFAULT_REGION.sido, OLA_CONFIG.DEFAULT_REGION.gu);
    const { sido, gu } = window.olaLocation ? olaLocation.getSidoGu() : OLA_CONFIG.DEFAULT_REGION;
    const radius = olaSettings.getRadiusKm();

    const t0 = window.olaI18n ? olaI18n.t : (k) => k;
    const locEl = document.getElementById("current-location");
    if (locEl) locEl.textContent = olaRegionLabel(sido, gu);
    const locRadiusEl = document.getElementById("current-location-radius");
    if (locRadiusEl) locRadiusEl.textContent = t0("nav.radiusHint", { km: Number(radius).toFixed(1) });

    let regionData;
    try {
      regionData = await olaData.getRegion(regionKey);
    } catch (e) {
      console.warn("[OLA] 지역 데이터 로드 실패", e);
      finalizeBriefingFallback(briefingFallbackMsg());
      renderLifestyleIndex({ safetyScore: 50, forecast: null, erBeds: null, air: null });
      return;
    }
    if (!regionData) {
      finalizeBriefingFallback(briefingFallbackMsg());
      renderLifestyleIndex({ safetyScore: 50, forecast: null, erBeds: null, air: null });
      return;
    }

    // 1) 기상특보 (실시간 API 우선, 실패 시 "특보 없음"으로 표시)
    // ⚠️ weatherLabelRaw는 항상 한국어 원문(기상청 API 응답 그대로)을 유지합니다 — 폭염/한파 등
    // 종류 판별(js/briefing-text.js)은 이 원문 기준으로 하고, 화면 표시에만 번역본을 씁니다.
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    let weatherRisk = 0;
    let weatherLabelRaw = "";
    let weatherState = "none"; // "none" | "active" | "failed"
    let weatherLabel = t("home.noWarning");
    let weatherSub = t("home.safeLevel");
    try {
      const w = await olaApi.getWeatherWarningStatus(olaSidoShort(sido));
      if (w.ok && w.active && w.lines.length) {
        weatherLabelRaw = w.lines[0].split(":")[0].trim();
        weatherState = "active";
        weatherLabel = window.olaI18n ? olaI18n.translateWeatherWarning(weatherLabelRaw) : weatherLabelRaw;
        weatherSub = t("home.cautionLevel");
        weatherRisk = 60;
      } else if (w.ok) {
        weatherState = "none";
        weatherLabel = t("home.noWarning");
        weatherSub = t("home.safeLevel");
      } else {
        // 실패 원인을 그대로 표시 ("API 미연동" 대신 실제 원인)
        console.warn("[OLA] 기상특보 조회 실패:", w.reason);
        weatherState = "failed";
        weatherLabel = t("home.weatherQueryFailed");
        weatherSub = olaApi.reasonLabel(w.reason);
      }
    } catch (e) {
      /* keep default */
    }
    renderDisasterTicker({ regionLabel: olaRegionLabel(sido, gu), weatherLabel, weatherRisk });

    // 2) 안전도 계산 (로컬 범죄통계 + 기상특보 리스크)
    const safetyScore = olaData.calcSafetyScore({
      crimeRiskIndex: regionData.crime?.crime_risk_index ?? 50,
      weatherRisk,
      hospitalCount: regionData.medical?.hospital_count ?? 0,
      shelterCount: regionData.shelter_count ?? 0,
    });

    // 3) 반경 내 응급시설 (로컬 병원 데이터 + 가능하면 실시간 AED)
    let hospitalNearby = [];
    try {
      hospitalNearby = await olaData.getNearbyHospitals(
        regionData.center.lat,
        regionData.center.lng,
        radius
      );
    } catch (e) {
      /* ignore */
    }
    let aedCount = null;
    let aedReason = null;
    try {
      const aed = await olaApi.getAedList({ sido: regionData.sido, gugun: gu });
      if (aed.ok) aedCount = aed.count;
      else {
        aedReason = aed.reason;
        console.warn("[OLA] AED 조회 실패:", aed.reason);
      }
    } catch (e) {
      /* ignore */
    }

    // 4) 미세먼지 (실시간 API, 실패 시 표시 안 함/기본값)
    // 현재 위치의 구 이름(예: 강남구)을 넘겨서 해당 측정소 값을 우선 사용
    let air = null;
    let airReason = null;
    try {
      const a = await olaApi.getAirQuality(olaSidoShort(sido), gu);
      if (a.ok) air = a;
      else airReason = a.reason;
    } catch (e) {
      /* ignore */
    }

    // 5) 단기예보 (기온·강수확률) — "오늘의 생활 지수" 카드용
    let forecast = null;
    try {
      const f = await olaApi.getShortForecast({ nx: regionData.kma_grid?.nx, ny: regionData.kma_grid?.ny });
      if (f.ok) forecast = f;
    } catch (e) {
      /* ignore */
    }

    // 6) 응급실 실시간 가용병상 (혼잡도) — "오늘의 생활 지수" 카드용
    let erBeds = null;
    try {
      const b = await olaApi.getEmergencyBeds({ sido: regionData.sido, gugun: gu });
      if (b.ok) erBeds = b.items;
    } catch (e) {
      /* ignore */
    }

    renderPreview({ safetyScore, weatherLabel, weatherSub, hospitalNearby, aedCount, aedReason, air, airReason, radius, forecast, erBeds });

    // 7) 오늘의 올라 브리핑(사실 요약) / OLA Insight(해석·추천) — 실데이터 기반, 가능하면 AI가 문장으로 다듬음
    const regionLabel = olaRegionLabel(sido, gu);
    updateAiBriefingCards({
      regionLabel,
      forecast,
      weatherLabel,
      weatherLabelRaw,
      weatherState,
      air,
      safetyScore,
      aedCount,
      hospitalCount: hospitalNearby.length,
      radius,
    });
  }

  // 하늘상태(SKY) 대신 강수형태(PTY)가 있으면 그걸 우선 표시 (비/눈 예보 중엔 "맑음"보다 더 유용함)
  function skyPtyLabel(forecast) {
    if (!forecast) return "-";
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const SKY_KEY = { "1": "sky.clear", "3": "sky.partlyCloudy", "4": "sky.cloudy" };
    const pty = Number(forecast.pty);
    if (pty === 1 || pty === 4) return t("pty.rain");
    if (pty === 2) return t("pty.rainSnow");
    if (pty === 3) return t("pty.snow");
    const key = SKY_KEY[String(forecast.sky)];
    return key ? t(key) : "-";
  }

  // 실데이터만으로 만드는 결정론적 문장 (js/briefing-text.js 공유 모듈 — pages/briefing.html과 동일한 문장 스타일)
  function buildBriefingFallback(data) {
    return window.olaBuildBriefingText(data);
  }

  async function updateAiBriefingCards(data) {
    const briefingEl = document.getElementById("ai-briefing-text");
    const loadingEl = document.getElementById("ai-briefing-loading");

    // 실데이터 기반 결정론적 문장을 표시 (새로고침해도 같은 데이터면 항상 같은 문장)
    const fallbackBriefing = buildBriefingFallback(data);
    if (briefingEl) typeIntoElement(briefingEl, fallbackBriefing);
    briefingSettled = true;
    if (briefingTimeoutId) clearTimeout(briefingTimeoutId);
    if (loadingEl) loadingEl.classList.add("hidden");
  }

  // 오늘 날씨/대기 상태로 "야외 활동하기 좋은 정도"를 대략적으로 산정
  function outdoorActivityLabel(forecast, air) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const tmp = forecast ? Number(forecast.tmp) : NaN;
    const pop = forecast ? Number(forecast.pop) : NaN;
    const worstAir = air ? Math.max(Number(air.grade10) || 0, Number(air.grade25) || 0) : 0;
    if (!Number.isNaN(pop) && pop >= 60) return t("home.levelCaution");
    if (!Number.isNaN(tmp) && (tmp >= 33 || tmp <= 0)) return t("home.levelCaution");
    if (worstAir >= 3) return t("air.bad");
    if (!Number.isNaN(tmp) && tmp >= 15 && tmp <= 27 && worstAir <= 2) return t("home.levelBest");
    return t("home.levelModerate");
  }

  // 우리동네 안심 지킴이 - 숫자는 1부터 목표 점수까지 순서대로 올라가고, 게이지 링은 10%부터
  // 시작해서 목표치까지 한 방향으로만 차오르는 모션 (되돌아가지 않음, 새로고침/지역 변경마다 재생)
  const SAFETY_RING_CIRCUMFERENCE = 345.6;
  const SAFETY_RING_START_RATIO = 10;
  let safetyGaugeRaf = null;

  function animateSafetyGauge(scoreEl, ringEl, targetScore) {
    if (safetyGaugeRaf) cancelAnimationFrame(safetyGaugeRaf);
    const duration = 1200;
    const start = performance.now();
    const target = Math.max(0, Math.min(100, targetScore));
    const ringTarget = Math.max(SAFETY_RING_START_RATIO, target);

    function setFrame(t) {
      const displayScore = Math.round(1 + t * (target - 1));
      if (scoreEl) scoreEl.textContent = Math.max(1, displayScore);
      if (ringEl) {
        const ratio = (SAFETY_RING_START_RATIO + t * (ringTarget - SAFETY_RING_START_RATIO)) / 100;
        ringEl.style.strokeDashoffset = SAFETY_RING_CIRCUMFERENCE - ratio * SAFETY_RING_CIRCUMFERENCE;
      }
    }

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setFrame(t);
      if (t < 1) {
        safetyGaugeRaf = requestAnimationFrame(tick);
      } else {
        if (scoreEl) scoreEl.textContent = target;
        safetyGaugeRaf = null;
      }
    }

    safetyGaugeRaf = requestAnimationFrame(tick);
  }

  function renderLifestyleIndex({ safetyScore, forecast, erBeds, air }) {
    const grid = document.getElementById("lifestyle-index-grid");
    if (!grid) return;
    const t = window.olaI18n ? olaI18n.t : (k) => k;

    // 고정 1: 우리동네 안심 지킴이 (등급 배지 + 점수)
    const safetyScoreEl = grid.querySelector("[data-life-safety-score]");
    const safetyRingEl = grid.querySelector("[data-life-safety-ring]");
    const safetyLabelEl = grid.querySelector("[data-life-safety-label]");
    const tier = safetyScore >= 80
      ? { label: t("home.tierExcellent"), badge: "bg-emerald-400/40" }
      : safetyScore >= 50
        ? { label: t("home.levelGood"), badge: "bg-white/20" }
        : { label: t("home.levelCaution"), badge: "bg-amber-400/40" };
    if (safetyLabelEl) {
      safetyLabelEl.textContent = tier.label;
      safetyLabelEl.className = `text-xl font-extrabold px-4 py-1 rounded-full ${tier.badge}`;
    }
    animateSafetyGauge(safetyScoreEl, safetyRingEl, safetyScore);

    // 고정 2: 날씨 & 대기 (기온+날씨+강수확률+야외 활동 지수)
    const weatherEl = grid.querySelector("[data-life-weather]");
    const tempEl = grid.querySelector("[data-life-temp]");
    const outdoorEl = grid.querySelector("[data-life-outdoor]");
    if (weatherEl) weatherEl.textContent = forecast ? skyPtyLabel(forecast) : "";
    if (tempEl) tempEl.textContent = forecast ? `${forecast.tmp}°C` : "-";
    if (outdoorEl) outdoorEl.textContent = outdoorActivityLabel(forecast, air);

    renderDustCard(grid, air);
    renderFireRiskCard(grid, forecast);
    renderErCard(grid, erBeds);
  }

  // 등급별 "쾌적도" 문구 (대기질 배지용, 등급 텍스트와는 별개의 체감 표현)
  function dustComfortLabel(grade) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    return { 1: t("home.dustVeryComfortable"), 2: t("home.dustComfortable"), 3: t("home.levelCaution"), 4: t("home.dustVeryBad") }[String(grade)] || "-";
  }

  // 고정 3: 대기 미세먼지 (등급 배지 + 진행바 + PM10/PM2.5)
  function renderDustCard(grid, air) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const badgeEl = grid.querySelector("[data-life-dust-badge]");
    const valueEl = grid.querySelector("[data-life-dust]");
    const barEl = grid.querySelector("[data-life-dust-bar]");
    const subEl = grid.querySelector("[data-life-dust-sub]");
    if (!valueEl) return;

    const grade10 = air ? Number(air.grade10) || 0 : 0;
    const grade25 = air ? Number(air.grade25) || 0 : 0;
    const worst = Math.max(grade10, grade25);
    const colorMap = { 1: "text-emerald-600", 2: "text-amber-500", 3: "text-orange-500", 4: "text-red-500" };
    const badgeColorMap = { 1: "bg-emerald-100 text-emerald-600", 2: "bg-amber-100 text-amber-600", 3: "bg-orange-100 text-orange-600", 4: "bg-red-100 text-red-500" };
    const barColorMap = { 1: "bg-emerald-500", 2: "bg-amber-500", 3: "bg-orange-500", 4: "bg-red-500" };
    const color = colorMap[worst] || "text-slate-400";

    if (badgeEl) {
      badgeEl.textContent = worst ? dustComfortLabel(worst) : "-";
      badgeEl.className = `text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${worst ? badgeColorMap[worst] : "bg-slate-100 text-slate-500"}`;
    }
    if (valueEl) {
      valueEl.textContent = worst ? `${gradeLabel(worst)}${air?.pm10 ? ` (${air.pm10} ㎍)` : ""}` : "-";
      valueEl.className = `text-xl font-bold leading-tight ${color}`;
    }
    if (barEl) {
      barEl.style.width = worst ? `${Math.min(100, (worst / 4) * 100)}%` : "0%";
      barEl.className = `h-full rounded-full ${worst ? barColorMap[worst] : "bg-slate-300"}`;
    }
    if (subEl) {
      subEl.textContent = air?.pm25 !== undefined && air?.pm25 !== null
        ? t("home.pm25Sub", { value: air.pm25, comfort: dustComfortLabel(grade25) })
        : "-";
    }
  }

  // 고정 4: 화재·재난 위험도 (건조특보 조건: 습도 40% 이하 + 강수 없음)
  function renderFireRiskCard(grid, forecast) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const valueEl = grid.querySelector("[data-life-fire-value]");
    const subEl = grid.querySelector("[data-life-fire-sub]");
    if (!valueEl) return;

    const reh = forecast ? Number(forecast.reh) : NaN;
    const pty = forecast ? Number(forecast.pty) : 0;
    const isDryRisk = !Number.isNaN(reh) && reh <= 40 && pty === 0;

    if (isDryRisk) {
      valueEl.textContent = t("home.levelCaution");
      valueEl.className = "text-xl font-bold leading-tight text-red-500";
      if (subEl) subEl.textContent = t("home.dryWarningActive", { reh: forecast.reh });
    } else {
      valueEl.textContent = t("home.levelGood");
      valueEl.className = "text-xl font-bold leading-tight text-emerald-600";
      if (subEl) subEl.textContent = t("home.noSpecialIssue");
    }
  }

  // 고정 5: 응급실 혼잡도
  function renderErCard(grid, erBeds) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const valueEl = grid.querySelector("[data-life-er-value]");
    const subEl = grid.querySelector("[data-life-er-sub]");
    if (!valueEl) return;

    if (erBeds && erBeds.length) {
      const totalAvailable = erBeds.reduce((sum, it) => sum + (it.erGeneral || 0), 0);
      let status = t("home.erSmooth");
      let color = "text-emerald-600";
      if (totalAvailable <= 3) {
        status = t("home.erCongested");
        color = "text-red-500";
      } else if (totalAvailable <= 8) {
        status = t("home.levelModerate");
        color = "text-amber-500";
      }
      valueEl.textContent = status;
      valueEl.className = `text-xl font-bold leading-tight ${color}`;
      if (subEl) subEl.textContent = t("home.erAvailableBeds", { n: totalAvailable });
    } else {
      valueEl.textContent = "-";
      valueEl.className = "text-xl font-bold leading-tight text-slate-400";
      if (subEl) subEl.textContent = t("home.apiNotConnected");
    }
  }

  function renderPreview({ safetyScore, weatherLabel, weatherSub, hospitalNearby, aedCount, aedReason, air, airReason, radius, forecast, erBeds }) {
    const t = window.olaI18n ? olaI18n.t : (k) => k; // ⚠️ 기존엔 t 미정의로 API 실패 시 ReferenceError
    renderLifestyleIndex({ safetyScore, forecast, erBeds, air });
    const grid = document.getElementById("briefing-preview-grid");
    if (!grid) return;

    const radiusLabelEl = grid.querySelector("[data-radius-label]");
    if (radiusLabelEl) radiusLabelEl.textContent = radius;

    const safetyScoreEl = grid.querySelector("[data-safety-score]");
    if (safetyScoreEl) {
      safetyScoreEl.textContent = safetyScore;
      const circle = grid.querySelector("[data-safety-circle]");
      if (circle) {
        const circumference = 213.6;
        const clamped = Math.max(0, Math.min(100, safetyScore));
        circle.style.strokeDashoffset = circumference - (clamped / 100) * circumference;
        circle.style.stroke = clamped >= 80 ? "#ABD5BA" : clamped >= 50 ? "#5FA8D3" : "#FFD6A5";
      }
      const labelEl = grid.querySelector("[data-safety-label]");
      if (labelEl) labelEl.textContent = safetyScore >= 80 ? t("home.levelGood") : safetyScore >= 50 ? t("home.levelModerate") : t("home.levelCaution");
      const barEl = grid.querySelector("[data-safety-bar]");
      if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, safetyScore))}%`;
    }
    const weatherTitle = grid.querySelector("[data-weather-title]");
    if (weatherTitle) weatherTitle.textContent = weatherLabel;
    const weatherSubEl = grid.querySelector("[data-weather-sub]");
    if (weatherSubEl) weatherSubEl.textContent = weatherSub;

    const facilityMain = grid.querySelector("[data-facility-main]");
    const facilitySub = grid.querySelector("[data-facility-sub]");
    if (facilityMain) {
      const aedText = aedCount !== null ? t("home.aedCount", { n: aedCount }) : t("home.aedFailed");
      facilityMain.textContent = aedText;
      if (facilitySub) {
        facilitySub.textContent =
          aedCount !== null
            ? t("home.hospitalCount", { n: hospitalNearby.length })
            : t("home.hospitalCountWithReason", { n: hospitalNearby.length, reason: olaApi.reasonLabel(aedReason) });
      }
    }

    const airMain = grid.querySelector("[data-air-main]");
    const airSub = grid.querySelector("[data-air-sub]");
    const airBar = grid.querySelector("[data-air-bar]");
    if (airMain) {
      if (air) {
        // PM10/PM2.5 중 더 나쁜 등급을 대표 등급으로 표시
        const worst = Math.max(Number(air.grade10) || 0, Number(air.grade25) || 0);
        airMain.textContent = worst ? gradeLabel(worst) : "-";
        if (airBar) airBar.style.width = worst ? `${Math.min(100, (worst / 4) * 100)}%` : "0%";
        if (airSub) {
          const parts = [];
          if (air.pm10) parts.push(`PM10 ${air.pm10}`);
          if (air.pm25) parts.push(`PM2.5 ${air.pm25}`);
          const station = air.isFallbackStation && air.stationName ? ` (${t("home.stationSuffix", { name: air.stationName })})` : "";
          airSub.textContent = parts.length ? `${parts.join(" · ")} µg/m³${station}` : "";
        }
      } else {
        // 실패 원인을 그대로 표시 ("API 미연동" 대신 실제 원인)
        airMain.textContent = t("home.queryFailed");
        if (airSub) airSub.textContent = olaApi.reasonLabel(airReason);
      }
    }

    const timeEl = document.getElementById("briefing-time");
    if (timeEl && window.olaI18n) timeEl.textContent = olaI18n.formatAsOf(new Date());
  }

  function gradeLabel(grade) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    return { "1": t("air.good"), "2": t("air.moderate"), "3": t("air.bad"), "4": t("air.veryBad") }[String(grade)] || "-";
  }

  // 안심·비상 시설 지도 - 핀이 순서대로 하나씩 나타났다가(0.3초 간격), 다 나오면
  // 3초 멈춘 뒤 전부 사라지고 처음부터 반복.
  function startPinRevealLoop() {
    const pins = Array.from(document.querySelectorAll('.map-pin-drop[data-active="true"]'));
    if (!pins.length) return;
    let i = 0;
    function revealNext() {
      if (i >= pins.length) {
        setTimeout(() => {
          pins.forEach((p) => p.classList.remove("pin-visible"));
          i = 0;
          revealNext();
        }, 3000);
        return;
      }
      pins[i].classList.add("pin-visible");
      i++;
      setTimeout(revealNext, 300);
    }
    revealNext();
  }

  function talkEscapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // 실시간 커뮤니티 톡 - 댓글 (새로 만들어지는 글에 붙는 빈 댓글창. 기존 시드 게시글의
  // 댓글창은 index.html에 미리 예시 댓글 몇 개를 넣어뒀음)
  function talkCommentsPanelHtml() {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    return `
      <div class="talk-comments" style="display:none;">
        <div class="flex items-center gap-1.5 pt-1">
          <input type="text" class="talk-comment-input flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400 bg-white"
            placeholder="${talkEscapeHtml(t("talk.commentPlaceholder"))}" onkeydown="if(event.key==='Enter'){event.preventDefault();addTalkComment(this)}">
          <button type="button" onclick="addTalkComment(this.previousElementSibling)" class="text-emerald-600 text-xs font-bold px-2 py-1 shrink-0">${talkEscapeHtml(t("talk.register"))}</button>
        </div>
      </div>`;
  }

  // 실시간 커뮤니티 톡 - 댓글 창 열기/닫기
  window.toggleTalkComments = function (btn) {
    const post = btn.closest(".talk-post-item");
    const panel = post && post.querySelector(".talk-comments");
    if (!panel) return;
    const opening = panel.style.display !== "block";
    panel.style.display = opening ? "block" : "none";
    if (opening) {
      const input = panel.querySelector(".talk-comment-input");
      if (input) input.focus();
    }
  };

  function updateTalkCommentCount(post) {
    const countEl = post.querySelector(".comment-count");
    if (countEl) countEl.textContent = post.querySelectorAll(".talk-comment-item").length;
  }

  // 실시간 커뮤니티 톡 - 댓글 추가
  window.addTalkComment = function (input) {
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    const panel = input.closest(".talk-comments");
    const post = input.closest(".talk-post-item");
    if (!panel || !post) return;

    const item = document.createElement("div");
    item.className = "talk-comment-item flex items-start justify-between gap-2 pb-2";
    item.innerHTML = `
      <p class="text-xs text-slate-600"><span class="font-bold text-slate-800">${window.olaI18n ? olaI18n.t("talk.me") : "나"}</span> ${talkEscapeHtml(text)}</p>
      <button onclick="deleteTalkComment(this)" class="text-slate-300 hover:text-red-500 shrink-0"><i data-lucide="x" class="w-3 h-3"></i></button>
    `;
    panel.insertBefore(item, panel.lastElementChild);
    input.value = "";
    updateTalkCommentCount(post);
    if (window.lucide) lucide.createIcons();
  };

  // 실시간 커뮤니티 톡 - 댓글 삭제
  window.deleteTalkComment = function (btn) {
    const post = btn.closest(".talk-post-item");
    btn.closest(".talk-comment-item").remove();
    if (post) updateTalkCommentCount(post);
  };

  // area는 하드코딩하지 않고, 게시글이 올라가는 시점의 실제 현재 지역명을 사용함
  // (가짜 동네 이름을 지어내면 실제 위치와 안 맞아 혼란을 줄 수 있어서)
  function currentAreaLabel() {
    try {
      if (window.olaLocation && window.olaRegionLabel) {
        const { sido, gu } = olaLocation.getSidoGu();
        return olaRegionLabel(sido, gu);
      }
    } catch (e) {
      /* ignore */
    }
    return window.olaI18n ? olaI18n.t("home.myNeighborhood") : "우리 동네";
  }

  // 실시간 커뮤니티 톡 - 카테고리 필터 (전체 / 긴급·제보 / 안전·정보 / 동네소식)
  window.filterTalkCategory = function (category) {
    document.querySelectorAll(".talk-category-tab").forEach((tab) => {
      tab.classList.remove("bg-slate-900", "text-white");
      tab.classList.add("bg-slate-100", "text-slate-600");
    });
    const activeTab = document.getElementById(`talk-tab-${category}`);
    if (activeTab) {
      activeTab.classList.remove("bg-slate-100", "text-slate-600");
      activeTab.classList.add("bg-slate-900", "text-white");
    }
    document.querySelectorAll(".talk-post-item").forEach((post) => {
      const match = category === "all" || post.dataset.talkCategory === category;
      post.classList.toggle("hidden", !match);
    });
  };

  // 실시간 커뮤니티 톡 - 추천 태그 선택 (본문에 텍스트를 넣는 게 아니라, 등록될 글의
  // 태그 표시줄에 붙는다 — 여러 개 동시 선택 가능하고, 작성 중에도 입력창 아래 칩으로 바로 보임)
  const selectedTalkTags = new Set();

  function renderSelectedTalkTags() {
    const row = document.getElementById("talk-selected-tags");
    if (!row) return;
    if (!selectedTalkTags.size) {
      row.style.display = "none";
      row.innerHTML = "";
      return;
    }
    row.style.display = "flex";
    row.innerHTML = Array.from(selectedTalkTags)
      .map(
        (tag) => `
      <span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
        ${tag}
        <button type="button" onclick="toggleTalkTagByName('${tag}')" class="hover:text-emerald-800">✕</button>
      </span>`
      )
      .join("");
  }

  function setTalkTagChipActive(btn, active) {
    btn.classList.remove(...(active ? ["bg-white", "border-slate-200", "text-slate-600"] : ["bg-emerald-500", "border-emerald-500", "text-white"]));
    btn.classList.add(...(active ? ["bg-emerald-500", "border-emerald-500", "text-white"] : ["bg-white", "border-slate-200", "text-slate-600"]));
  }

  window.toggleTalkTag = function (btn, tag) {
    if (selectedTalkTags.has(tag)) {
      selectedTalkTags.delete(tag);
      setTalkTagChipActive(btn, false);
    } else {
      selectedTalkTags.add(tag);
      setTalkTagChipActive(btn, true);
    }
    renderSelectedTalkTags();
  };

  // 선택 칩(#talk-selected-tags) 쪽의 ✕ 버튼은 원래 추천 태그 버튼 엘리먼트를 안 가지고 있어서,
  // 텍스트가 일치하는 추천 태그 버튼을 찾아 같은 토글 로직을 태운다
  window.toggleTalkTagByName = function (tag) {
    const btn = Array.from(document.querySelectorAll(".talk-tag-chip")).find((el) => el.textContent.trim() === tag);
    if (btn) {
      window.toggleTalkTag(btn, tag);
    } else {
      selectedTalkTags.delete(tag);
      renderSelectedTalkTags();
    }
  };

  // 실시간 커뮤니티 톡 - 이모티콘 선택기
  const TALK_EMOJI_LIST = ["😀", "😊", "👍", "🙏", "❤️", "😢", "😡", "😱", "🔥", "⚠️", "✅", "🚨", "🌧️", "❄️", "☀️", "🚗", "🏠", "📢", "💡", "🐾", "🎉", "😅", "🤔", "👀"];

  function buildTalkEmojiPicker() {
    const picker = document.getElementById("talk-emoji-picker");
    if (!picker) return;
    picker.innerHTML = TALK_EMOJI_LIST.map(
      (e) => `<button type="button" onclick="insertTalkEmoji('${e}')" class="text-lg hover:bg-slate-100 rounded-lg p-1 transition">${e}</button>`
    ).join("");
  }

  window.toggleTalkEmojiPicker = function (event) {
    if (event) event.stopPropagation();
    const picker = document.getElementById("talk-emoji-picker");
    if (!picker) return;
    picker.style.display = picker.style.display === "grid" ? "none" : "grid";
  };

  function closeTalkEmojiPicker() {
    const picker = document.getElementById("talk-emoji-picker");
    if (picker) picker.style.display = "none";
  }

  document.addEventListener("click", closeTalkEmojiPicker);
  document.addEventListener("DOMContentLoaded", buildTalkEmojiPicker);

  window.insertTalkEmoji = function (emoji) {
    const input = document.getElementById("talk-input");
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    const pos = start + emoji.length;
    input.focus();
    input.setSelectionRange(pos, pos);
    closeTalkEmojiPicker();
  };

  // 실시간 커뮤니티 톡 - 사진 첨부 (촬영/갤러리 선택 + 미리보기)
  let selectedTalkImageDataUrl = null;

  window.triggerTalkCameraCapture = function () {
    const input = document.getElementById("talk-camera-input");
    if (input) input.click();
  };

  window.triggerTalkGalleryPick = function () {
    const input = document.getElementById("talk-gallery-input");
    if (input) input.click();
  };

  // 실시간 커뮤니티 톡 - 위치 태그 on/off. 버튼을 누르면 현재 위치가 칩으로 붙었다가(켜짐),
  // 다시 누르거나 칩의 ✕를 누르면 떨어진다(꺼짐). 기본은 꺼짐 — 눌러야 실제로 위치가 "달림".
  let talkLocationTagEnabled = false;

  window.toggleTalkLocationTag = function () {
    talkLocationTagEnabled = !talkLocationTagEnabled;
    const btn = document.getElementById("talk-location-tag-btn");
    const chip = document.getElementById("talk-location-chip");
    const chipText = document.getElementById("talk-location-chip-text");
    if (btn) {
      btn.classList.toggle("text-emerald-600", talkLocationTagEnabled);
      btn.classList.toggle("text-slate-400", !talkLocationTagEnabled);
    }
    if (chip) {
      chip.style.display = talkLocationTagEnabled ? "inline-flex" : "none";
    }
    if (chipText && talkLocationTagEnabled) {
      chipText.textContent = currentAreaLabel();
    }
  };

  window.handleTalkImageSelected = function (inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      selectedTalkImageDataUrl = reader.result;
      const preview = document.getElementById("talk-image-preview");
      const previewImg = document.getElementById("talk-image-preview-img");
      if (previewImg) previewImg.src = selectedTalkImageDataUrl;
      if (preview) preview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  };

  window.removeTalkImage = function () {
    selectedTalkImageDataUrl = null;
    const preview = document.getElementById("talk-image-preview");
    const previewImg = document.getElementById("talk-image-preview-img");
    const cameraInput = document.getElementById("talk-camera-input");
    const galleryInput = document.getElementById("talk-gallery-input");
    if (preview) preview.classList.add("hidden");
    if (previewImg) previewImg.src = "";
    if (cameraInput) cameraInput.value = "";
    if (galleryInput) galleryInput.value = "";
  };

  // 실시간 커뮤니티 톡 - 새 글 등록 시 피드 맨 위에 삽입
  window.submitCommunityTalk = function (event) {
    event.preventDefault();
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const input = document.getElementById("talk-input");
    const container = document.getElementById("talk-feed-container");
    const toast = document.getElementById("talk-empty-toast");
    const text = input ? input.value.trim() : "";
    if (!container) return;

    if (!text && !selectedTalkImageDataUrl) {
      if (toast) {
        toast.classList.remove("hidden");
        setTimeout(() => toast.classList.add("hidden"), 2000);
      }
      return;
    }

    const imageHtml = selectedTalkImageDataUrl
      ? `<img src="${selectedTalkImageDataUrl}" class="w-full max-h-56 object-cover rounded-xl" alt="${t("talk.attachedImageAlt")}">`
      : "";

    const item = document.createElement("div");
    item.className = "talk-post-item p-3.5 rounded-2xl border border-emerald-300 bg-emerald-50/30 space-y-2 animate-new-talk";
    item.dataset.talkCategory = "life";
    item.innerHTML = `
      <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">${t("talk.me")}</div>
          <div>
              <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold text-slate-800">${t("talk.me")}</span>
                  <span class="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">${t("talk.justPosted")}</span>
              </div>
              <span class="text-[10px] text-slate-400">${t("talk.justNow")}${talkLocationTagEnabled ? ` · 📍 ${talkEscapeHtml(currentAreaLabel())}` : ""}</span>
          </div>
      </div>
      ${imageHtml}
      ${text ? `<p class="text-xs text-slate-800 leading-relaxed">${talkEscapeHtml(text)}</p>` : ""}
      <div class="flex items-center justify-between pt-1 border-t border-emerald-100 text-[11px] text-slate-400">
          <span class="text-emerald-600 font-semibold">${talkEscapeHtml(selectedTalkTags.size ? Array.from(selectedTalkTags).join(" ") : t("talk.defaultTag"))}</span>
          <div class="flex items-center gap-3">
              <button onclick="toggleTalkLike(this)" class="hover:text-red-500 flex items-center gap-1 transition">
                  <i data-lucide="heart" class="w-3.5 h-3.5"></i> <span class="like-count font-bold">0</span>
              </button>
              <button onclick="toggleTalkComments(this)" class="hover:text-slate-600 flex items-center gap-1 transition">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> <span class="comment-count">0</span>
              </button>
              <button onclick="deleteTalkPost(this)" class="hover:text-red-500 flex items-center gap-1 transition" title="${t("talk.delete")}">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
          </div>
      </div>
      ${talkCommentsPanelHtml()}
    `;
    container.insertBefore(item, container.firstChild);
    if (window.lucide) lucide.createIcons();
    input.value = "";
    window.removeTalkImage();
    selectedTalkTags.clear();
    document.querySelectorAll(".talk-tag-chip").forEach((chip) => setTalkTagChipActive(chip, false));
    renderSelectedTalkTags();
  };

  // 실시간 커뮤니티 톡 - 좋아요 토글 (하트 아이콘을 채워서 "좋아요" 상태를 표시)
  window.toggleTalkLike = function (btn) {
    const countEl = btn.querySelector(".like-count");
    if (!countEl) return;
    const count = parseInt(countEl.textContent, 10) || 0;
    const liked = btn.classList.toggle("text-red-500");
    countEl.textContent = liked ? count + 1 : count - 1;
    const icon = btn.querySelector("svg");
    if (icon) icon.style.fill = liked ? "currentColor" : "none";
  };

  // 실시간 커뮤니티 톡 - 내가 쓴 글 삭제
  window.deleteTalkPost = function (btn) {
    const post = btn.closest(".talk-post-item");
    if (post) post.remove();
  };

  // 실시간 커뮤니티 톡 - 다른 사람 글 신고 (실제 신고 접수 서버가 없어 데모 시뮬레이션으로 처리)
  window.reportTalkPost = function (btn) {
    if (btn.disabled) return;
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    btn.disabled = true;
    btn.title = t("talk.reportDone");
    btn.classList.add("text-red-500");
    if (window.olaToast) {
      olaToast.show(t("toast.reportTitle"), t("toast.reportBody"));
    }
  };

  // 실시간 커뮤니티 톡 - 새로고침 버튼으로 새 톡이 올라오는 모션을 바로 확인 (데모용)
  const simTalkMessages = [
    { name: "안심 지킴이", badge: "안심 지킴이", badgeBg: "bg-blue-100 text-blue-700", text: "골목길 가로등 불빛 이상 없이 점등 중입니다! 다들 조심히 들어가세요.", tag: "#야간안심길", category: "life" },
    { name: "동네 주민", badge: "긴급 제보", badgeBg: "bg-red-100 text-red-700", text: "🔥 산책로 입구 쪽에 살짝 빙판길이 있으니 야간에 다니실 때 주의하세요!", tag: "#위험제보", category: "emergency" },
    { name: "동네 주민", badge: "주민 인증", badgeBg: "bg-slate-100 text-slate-600", text: "오늘 새로 오픈한 복합 안전센터 위치 아시는 분 계신가요?", tag: "#질문", category: "info" },
  ];
  let talkSimIndex = 0;

  window.simulateIncomingTalk = function () {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const container = document.getElementById("talk-feed-container");
    if (!container) return;
    const data = simTalkMessages[talkSimIndex % simTalkMessages.length];
    talkSimIndex++;

    const item = document.createElement("div");
    item.className = "talk-post-item p-3.5 rounded-2xl border border-emerald-300 bg-emerald-50/60 space-y-2 animate-new-talk";
    item.dataset.talkCategory = data.category;
    item.innerHTML = `
      <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0">${talkEscapeHtml(data.name[0])}</div>
              <div>
                  <div class="flex items-center gap-1.5">
                      <span class="text-xs font-bold text-slate-800">${talkEscapeHtml(data.name)}</span>
                      <span class="${data.badgeBg} text-[9px] px-1.5 py-0.5 rounded font-bold">${talkEscapeHtml(data.badge)}</span>
                  </div>
                  <span class="text-[10px] text-slate-400">${t("talk.justNow")} · 📍 ${talkEscapeHtml(currentAreaLabel())}</span>
              </div>
          </div>
          <span class="text-[9px] bg-emerald-500 text-white font-bold px-2 py-0.5 rounded-full animate-pulse">NEW</span>
      </div>
      <p class="text-xs text-slate-700 leading-relaxed">${talkEscapeHtml(data.text)}</p>
      <div class="flex items-center justify-between pt-1 border-t border-emerald-100 text-[11px] text-slate-400">
          <span class="text-emerald-600 font-semibold">${talkEscapeHtml(data.tag)}</span>
          <div class="flex items-center gap-3">
              <button onclick="toggleTalkLike(this)" class="hover:text-red-500 flex items-center gap-1 transition">
                  <i data-lucide="heart" class="w-3.5 h-3.5"></i> <span class="like-count font-bold">1</span>
              </button>
              <button onclick="toggleTalkComments(this)" class="hover:text-slate-600 flex items-center gap-1 transition">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> <span class="comment-count">0</span>
              </button>
              <button onclick="reportTalkPost(this)" class="hover:text-red-500 flex items-center gap-1 transition" title="${t("talk.reportTitle")}">
                  <i data-lucide="flag" class="w-3.5 h-3.5"></i>
              </button>
          </div>
      </div>
      ${talkCommentsPanelHtml()}
    `;
    container.insertBefore(item, container.firstChild);
    container.scrollTop = 0;
    if (window.lucide) lucide.createIcons();
  };

  // 실시간 커뮤니티 톡 - 9초마다 이웃 제보를 하나씩 자동으로 추가 (데모용)
  (function initCommunityTalkAutoFeed() {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const mockTalks = [
      { name: "동네 지킴이", text: "근처 편의점에 안심지킴이집 표지판 새로 붙었어요~ 급할 때 참고하세요.", tag: "#안심지킴이집", category: "life" },
      { name: "동네 이웃", text: "인근 출구 앞에 무인 소화기함 비치됐습니다. 위치 참고하세요!", tag: "#소방안전", category: "info" },
      { name: "동네 주민", text: "동네 비상벨 테스트 눌러봤는데 정상 작동하네요. 다들 안심하세요 🙂", tag: "#비상벨점검", category: "emergency" },
    ];
    let idx = 0;
    setInterval(() => {
      const container = document.getElementById("talk-feed-container");
      if (!container || idx >= mockTalks.length) return;
      const msg = mockTalks[idx];
      const item = document.createElement("div");
      item.className = "talk-post-item p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2 animate-new-talk";
      item.dataset.talkCategory = msg.category;
      item.innerHTML = `
        <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs">${talkEscapeHtml(msg.name[0])}</div>
            <div>
                <div class="flex items-center gap-1.5">
                    <span class="text-xs font-bold text-slate-800">${talkEscapeHtml(msg.name)}</span>
                    <span class="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">주민</span>
                </div>
                <span class="text-[10px] text-slate-400">${t("talk.justNow")} · 📍 ${talkEscapeHtml(currentAreaLabel())}</span>
            </div>
        </div>
        <p class="text-xs text-slate-700 leading-relaxed">${talkEscapeHtml(msg.text)}</p>
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-400">
            <span class="font-semibold text-slate-500">${talkEscapeHtml(msg.tag)}</span>
            <div class="flex items-center gap-3">
                <button onclick="toggleTalkLike(this)" class="hover:text-red-500 flex items-center gap-1 transition">
                    <i data-lucide="heart" class="w-3.5 h-3.5"></i> <span class="like-count font-bold">1</span>
                </button>
                <button onclick="toggleTalkComments(this)" class="hover:text-slate-600 flex items-center gap-1 transition">
                    <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> <span class="comment-count">0</span>
                </button>
                <button onclick="reportTalkPost(this)" class="hover:text-red-500 flex items-center gap-1 transition" title="${t("talk.reportTitle")}">
                    <i data-lucide="flag" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
        ${talkCommentsPanelHtml()}
      `;
      container.insertBefore(item, container.firstChild);
      if (window.lucide) lucide.createIcons();
      idx++;
    }, 9000);
  })();

  // 안심·비상 시설 지도 - 이 지도는 "내 주변 정밀 위치"가 아니라 서울 전역을 보여주는
  // 개요용 일러스트임(정밀한 내 주변 실제 위치는 브리핑 페이지의 진짜 카카오맵에서 확인).
  // 그래서 특정 시설을 실시간으로 조회해 좌표를 맞추는 대신, 지도 전역에 고르게 배치해 둔
  // 카테고리 핀을 전부 활성화하고 순차 등장 애니메이션만 재생한다.
  function initSafetyMapDecorative() {
    document.querySelectorAll(".map-pin-drop[data-category]").forEach((pin) => {
      pin.dataset.active = "true";
    });
    startPinRevealLoop();
  }

  document.addEventListener("DOMContentLoaded", initSafetyMapDecorative);

  // 관심 자치구 지수 - (1) 현재 보고 있는 지역 + (2) 마이페이지 설정에서 등록한 "자주 가는 지역"을
  // 실데이터(범죄·의료·대피소 통계 - assets/data/regions.json)로 계산한 안전 지수와 함께 보여준다.
  // CCTV 대수나 순찰 현황처럼 실제 데이터가 없는 항목은 지어내지 않고, regions.json에 있는 값만 사용한다.
  // 자주 가는 지역을 아직 하나도 등록하지 않았으면(즉 카드가 1개뿐이면), 종로구·강남구처럼
  // 통상적으로 많이 찾는 지역을 기본값으로 채워 보여준다 (실데이터 기반, 임의 선택일 뿐 조작된 수치 아님).
  const DISTRICT_FAV_TYPE = "지역";
  const DEFAULT_DISTRICT_KEYS = ["서울특별시|종로구", "서울특별시|강남구"];

  function districtTierMeta(score) {
    if (score >= 80) return { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-600" };
    if (score >= 50) return { dot: "bg-sky-500", badge: "bg-sky-50 text-sky-600" };
    return { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-600" };
  }

  function buildDistrictCard(region) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const score = olaData.calcSafetyScore({
      crimeRiskIndex: region.crime?.crime_risk_index ?? 50,
      weatherRisk: 0,
      hospitalCount: region.medical?.hospital_count ?? 0,
      shelterCount: region.shelter_count ?? 0,
    });
    const tier = districtTierMeta(score);
    const label = olaRegionLabel(region.sido, region.gu);

    const el = document.createElement("div");
    el.className = "p-3 rounded-2xl border border-slate-200/80 bg-white flex items-center justify-between gap-2";
    el.innerHTML = `
      <div class="min-w-0">
        <span class="text-xs font-extrabold text-slate-900 truncate block">${label}</span>
        <p class="text-[11px] text-slate-400 truncate mt-0.5">${t("home.districtFacilities", { hospital: region.medical?.hospital_count ?? 0, shelter: region.shelter_count ?? 0 })}</p>
      </div>
      <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${tier.badge}">
        <span class="w-1.5 h-1.5 rounded-full ${tier.dot}"></span> ${t("home.districtScore", { score })}
      </span>
    `;
    return el;
  }

  async function renderDistrictIndexCards() {
    const row = document.getElementById("district-index-row");
    if (!row || !window.olaData || !window.olaLocation) return;

    let regions;
    try {
      regions = await olaData.getRegions();
    } catch (e) {
      return;
    }

    const keys = [olaLocation.getKey()];
    if (window.olaFavorites) {
      olaFavorites
        .getAll()
        .filter((f) => f.type === DISTRICT_FAV_TYPE)
        .forEach((f) => {
          const key = f.id.replace(/^district:/, "");
          if (regions[key] && !keys.includes(key)) keys.push(key);
        });
    }
    DEFAULT_DISTRICT_KEYS.forEach((key) => {
      if (keys.length < 3 && regions[key] && !keys.includes(key)) keys.push(key);
    });

    row.innerHTML = "";
    keys.slice(0, 3).forEach((key) => row.appendChild(buildDistrictCard(regions[key])));

    if (window.lucide) lucide.createIcons();
  }

  document.addEventListener("DOMContentLoaded", renderDistrictIndexCards);

  // ⚠️ 헤더 검색창/토스트/알림벨/주간·야간 토글(olaSearchPlaceholderToggle, olaHomeSearchSubmit,
  // olaFillSearch, olaVoiceSearch, olaToast, olaNotif, olaTheme)은 상단바가 전체 페이지 공통이 되면서
  // js/ui.js로 옮겼습니다 (index.html 전용이 아니라 모든 페이지에서 로드되어야 하므로).

  document.addEventListener("DOMContentLoaded", initHomeBriefingPreview);
  window.onOlaLocationChange = function () {
    initHomeBriefingPreview();
    renderDistrictIndexCards();
  };
  document.addEventListener("DOMContentLoaded", () => {
    if (window.olaI18n) {
      olaI18n.onLocaleChange(initHomeBriefingPreview);
      olaI18n.onLocaleChange(renderDistrictIndexCards);
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      if (window.olaToast) {
        const t = window.olaI18n ? olaI18n.t : (k) => k;
        olaToast.show(t("toast.bootTitle"), t("toast.bootBody"));
      }
    }, 600);
  });
})();
