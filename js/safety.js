/**
 * js/safety.js — pages/safety.html(생활안전) 전용 로직
 * - 오늘의 날씨, 종합 안전도 + 근거 분해, 실시간 상황 요약, AI 추천 행동
 * - AI 안전 분석 리포트(규칙 기반), 우리동네 안전지도(카카오맵, 시설 필터)
 * - 범죄 통계 시각화(구별 유형별 막대그래프, 위험지수 TOP5)
 * - 기상특보 현황, 반경 내 대피시설 목록, 주변 안전 인프라
 */
(function () {
  let regions;

  // 내일/모레 날씨 슬라이드 상태
  let futureDaysData = [];
  let futureDayIndex = 0;

  // 전국 기상특보 현황(팝업)에 쓰는 상태 — renderWeather가 채워둠
  let warningSlideData = [];
  let warningTmFc = null;
  let warningTmEf = null;

  // "오늘" 배지 - 특보 발효 중일 때 날짜/특보명을 번갈아 보여주는 타이머
  let weatherBadgeCycleTimer = null;
  let loadSequence = 0;

  // 이 페이지 전용 지역/반경 선택 UI는 없앴습니다 — 좌측 사이드바의 위치 배지(전역 olaLocation)와
  // 마이페이지에서 설정한 기본 반경(olaSettings)을 그대로 따릅니다. 사이드바에서 위치를 바꾸면
  // onOlaLocationChange가 자동으로 이 페이지를 새로고침합니다.
  async function init() {
    regions = await olaData.getRegions();
    wireFutureDaySwipe();
    await loadAll();
    applyStaticAriaLabels();
    // 언어 전환 시 이 페이지의 모든 동적 콘텐츠(날씨/안전도/범죄통계/AI 추천 행동/주변 인프라 등)를
    // 새 언어로 다시 그려야 하므로, 위치 변경 때와 동일하게 loadAll을 다시 돌린다.
    if (window.olaI18n) {
      olaI18n.onLocaleChange(() => loadAll());
      olaI18n.onLocaleChange(applyStaticAriaLabels);
    }
  }

  // data-i18n-title은 title 속성만 바꿔주므로, aria-label만 있는 정적 버튼(내일/모레 좌우 화살표,
  // 시간별 날씨 접기/펼치기)은 여기서 직접 언어별로 다시 설정해준다.
  function applyStaticAriaLabels() {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const prevBtn = document.getElementById("future-day-prev");
    const nextBtn = document.getElementById("future-day-next");
    const hourlyToggleBtn = document.getElementById("hourly-weather-toggle-btn");
    if (prevBtn) prevBtn.setAttribute("aria-label", t("safety.prevDate"));
    if (nextBtn) nextBtn.setAttribute("aria-label", t("safety.nextDate"));
    if (hourlyToggleBtn) hourlyToggleBtn.setAttribute("aria-label", t("safety.hourlyToggleAriaLabel"));
  }

  // 내일/모레 타일을 마우스 드래그·터치 스와이프로도 넘길 수 있게 함(화살표 클릭과 동일한 동작 호출)
  function wireFutureDaySwipe() {
    const el = document.getElementById("future-day-content");
    if (!el) return;
    let startX = null;
    let dragging = false;

    el.style.touchAction = "pan-y"; // 세로 스크롤은 막지 않고 가로 스와이프만 가로챔
    el.style.cursor = "grab";

    el.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      dragging = true;
      el.style.cursor = "grabbing";
    });
    window.addEventListener("pointerup", (e) => {
      if (!dragging || startX === null) return;
      const dx = e.clientX - startX;
      dragging = false;
      startX = null;
      el.style.cursor = "grab";
      const THRESHOLD = 40;
      if (dx <= -THRESHOLD) window.olaFutureDaySlide(1); // 왼쪽으로 밀면 다음 날짜
      else if (dx >= THRESHOLD) window.olaFutureDaySlide(-1); // 오른쪽으로 밀면 이전 날짜
    });
    window.addEventListener("pointercancel", () => {
      dragging = false;
      startX = null;
      el.style.cursor = "grab";
    });
  }

  function currentKey() {
    return window.olaLocation ? olaLocation.getKey() : olaRegionKey(OLA_CONFIG.DEFAULT_REGION.sido, OLA_CONFIG.DEFAULT_REGION.gu);
  }

  async function loadAll() {
    const loadId = ++loadSequence;
    const key = currentKey();
    const [sido, gu] = key.split("|");
    renderFavButton(key);

    const regionData = regions[key];
    if (!regionData) return;
    const baseRegionLabel = olaRegionLabel(sido, gu);
    const preciseRegionPromise = resolvePreciseRegionLabel(baseRegionLabel, regionData);
    renderWeatherCoordinateBox({ regionLabel: baseRegionLabel, regionData, loading: true });

    // 기상특보 (실시간)
    const w = await olaApi.getWeatherWarningStatus(olaSidoShort(sido)).catch(() => ({ ok: false }));
    if (loadId !== loadSequence) return;
    const weatherRisk = w.ok && w.active ? 60 : 0;
    const t0 = window.olaI18n ? olaI18n.t : (k) => k;
    const weatherLabel =
      w.ok && w.active && w.lines.length ? w.lines[0].split(":")[0].trim() : w.ok ? t0("safety.weatherLabelNone") : t0("safety.weatherLabelFailed");

    // 안전도 계산
    const safetyScore = olaData.calcSafetyScore({
      crimeRiskIndex: regionData.crime?.crime_risk_index ?? 50,
      weatherRisk,
      hospitalCount: regionData.medical?.hospital_count ?? 0,
      shelterCount: regionData.shelter_count ?? 0,
    });

    renderScore(safetyScore, key);
    renderCrimeTrend6mo(regionData);
    renderRanking(key, sido);
    renderWeather(baseRegionLabel, w);

    // 단기예보(기온·강수·습도·풍속·내일예보) — "오늘/내일 날씨" 카드 + AI 추천 행동에 사용
    let forecast = null;
    try {
      const f = await olaApi.getShortForecast({ nx: regionData.kma_grid?.nx, ny: regionData.kma_grid?.ny });
      if (f.ok) forecast = f;
    } catch (e) {
      /* ignore */
    }
    if (loadId !== loadSequence) return;

    // 초단기실황(진짜 실시간 관측값) — 기온·습도·풍속·강수형태만 있고 하늘상태·강수확률·최저최고는
    // 없어서, 그 부분은 계속 위 단기예보(forecast) 값을 씀. 실패하면 조용히 단기예보 값으로 대체.
    let ncst = null;
    try {
      const n = await olaApi.getUltraSrtNcst({ nx: regionData.kma_grid?.nx, ny: regionData.kma_grid?.ny });
      if (n.ok) ncst = n;
    } catch (e) {
      /* ignore */
    }
    if (loadId !== loadSequence) return;

    // 미세먼지
    let air = null;
    try {
      const a = await olaApi.getAirQuality(olaSidoShort(sido), gu);
      if (a.ok) air = a;
    } catch (e) {
      /* ignore */
    }
    if (loadId !== loadSequence) return;

    renderWeatherTiles(forecast, air, baseRegionLabel, ncst, w);
    renderWeatherCoordinateBox({ regionLabel: baseRegionLabel, regionData, forecast, ncst });
    renderSituationSummary({ weatherLabel, weatherActive: weatherRisk > 0 });
    const actionItems = computeActionChecklist({ forecast, air, weatherActive: weatherRisk > 0, weatherLabel, safetyScore, regionData });
    renderKeySafetyMetrics(regionData, actionItems);
    const preciseRegionLabel = await preciseRegionPromise;
    if (loadId !== loadSequence) return;
    const regionEl = document.getElementById("weather-region-label");
    if (regionEl) regionEl.textContent = preciseRegionLabel;
    renderWeatherCoordinateBox({ regionLabel: preciseRegionLabel, regionData, forecast, ncst });
  }

  window.olaRefreshRegionLabel = function () {
    const btn = document.getElementById("region-label-refresh-btn");
    const icon = btn?.querySelector("i");
    if (icon) icon.classList.add("animate-spin");
    loadAll().finally(() => {
      if (icon) icon.classList.remove("animate-spin");
    });
  };

  // 카카오맵 SDK를 지도 페이지(map.js)와 같은 방식으로 필요할 때만 불러온다
  // (safety.html은 기본적으로 카카오맵을 쓰지 않지만, "동" 이름을 알아내려면
  // 좌표→행정동 역지오코딩이 필요해서 Geocoder만 가져온다)
  let kakaoSdkLoadPromise = null;
  function ensureKakaoSdk() {
    if (window.kakao && window.kakao.maps && window.kakao.maps.services) return Promise.resolve(true);
    if (kakaoSdkLoadPromise) return kakaoSdkLoadPromise;
    kakaoSdkLoadPromise = fetch(OLA_CONFIG.KAKAO_MAP_KEY_URL)
      .then((res) => res.json())
      .then((keyData) => {
        if (!keyData.javascriptKey) return false;
        return new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = `${OLA_CONFIG.KAKAO_MAP_SDK_URL}?appkey=${keyData.javascriptKey}&autoload=false&libraries=services`;
          script.async = true;
          script.onload = () => kakao.maps.load(() => resolve(true));
          script.onerror = () => resolve(false);
          document.head.appendChild(script);
        });
      })
      .catch(() => false);
    return kakaoSdkLoadPromise;
  }

  function reverseGeocodeDong(lat, lng) {
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
        resolve(region.region_3depth_name || null);
      });
    });
  }

  // 단기예보 요청에 쓰는 nx/ny는 선택 지역의 대표 격자이므로 지역명도 같은 지역 중심 좌표를
  // 역지오코딩한다. 브라우저 GPS는 헤더의 위치 버튼에서 가장 가까운 지역을 선택하는 데만 쓰며,
  // GPS 좌표와 다른 지역의 격자를 한 박스에 섞지 않는다.
  async function resolvePreciseRegionLabel(baseLabel, regionData) {
    const ok = await ensureKakaoSdk();
    if (!ok || !regionData?.center) return baseLabel;

    const dong = await reverseGeocodeDong(regionData.center.lat, regionData.center.lng);
    return dong ? `${baseLabel} ${dong}` : baseLabel;
  }

  // 종합 안전도 등급 (점수 → 배지 라벨/색/아이콘) — renderScore·renderNearbyInfra 등 여러 곳에서 공용으로 씀
  function safetyScoreTier(score) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    if (score >= 80) return { key: "safe", label: t("safety.tierSafe"), cls: "bg-emerald-50 text-emerald-600", icon: "check-circle-2" };
    if (score >= 50) return { key: "moderate", label: t("safety.tierModerate"), cls: "bg-teal-50 text-teal-600", icon: "info" };
    return { key: "caution", label: t("safety.tierCaution"), cls: "bg-red-50 text-red-600", icon: "alert-triangle" };
  }

  // 종합 안전도 - 숫자는 1부터 목표 점수까지 순서대로 올라가고, 원형 게이지도 같은 타이밍으로
  // 차례대로 채워짐 (되돌아가지 않음)
  const SCORE_RING_CIRCUMFERENCE = 326.7;
  let scoreGaugeRaf = null;

  function animateScoreGauge(score) {
    const scoreMainEl = document.getElementById("score-main");
    const ringEl = document.getElementById("score-ring");
    if (!ringEl) {
      if (scoreMainEl) scoreMainEl.textContent = score;
      return;
    }
    if (scoreGaugeRaf) cancelAnimationFrame(scoreGaugeRaf);

    const target = Math.max(0, Math.min(100, score));
    const ringColor = target >= 80 ? "#10b981" : target >= 50 ? "#2dd4bf" : "#ef4444";
    ringEl.setAttribute("stroke", ringColor);

    const duration = 1000;
    const start = performance.now();

    function setFrame(t) {
      const displayScore = Math.round(1 + t * (target - 1));
      if (scoreMainEl) scoreMainEl.textContent = Math.max(1, displayScore);
      const ratio = (t * target) / 100;
      ringEl.style.strokeDashoffset = SCORE_RING_CIRCUMFERENCE - ratio * SCORE_RING_CIRCUMFERENCE;
    }

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setFrame(t);
      if (t < 1) {
        scoreGaugeRaf = requestAnimationFrame(tick);
      } else {
        if (scoreMainEl) scoreMainEl.textContent = target;
        scoreGaugeRaf = null;
      }
    }

    scoreGaugeRaf = requestAnimationFrame(tick);
  }

  function renderScore(score, regionKey) {
    animateScoreGauge(score);

    const tier = safetyScoreTier(score);
    const badgeEl = document.getElementById("score-tier-badge");
    if (badgeEl) {
      badgeEl.innerHTML = `<i data-lucide="${tier.icon}" class="w-3.5 h-3.5"></i> ${tier.label}`;
      badgeEl.className = `text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ml-1 ${tier.cls}`;
      if (window.lucide) lucide.createIcons();
    }
    renderScoreTrend(regionKey, score);
  }

  // 종합 안전지수 추이 기록 - 별도 이력 API가 없어서, 브라우저(localStorage)에 지역별로
  // "그날의 점수"를 하루 1번씩 기록해뒀다가 스파크라인/증감 문구에 씁니다. 그래서 이 브라우저로
  // 처음 켜는 지역이거나 기록이 얼마 없으면, 실제로 쌓인 날짜만큼만 보여줍니다(지어내지 않음).
  const SCORE_HISTORY_KEY = "ola-score-history";
  const SCORE_HISTORY_MAX_DAYS = 14;

  function readScoreHistoryStore() {
    try {
      return JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function writeScoreHistoryStore(all) {
    try {
      localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(all));
    } catch (e) {
      /* 저장 실패(용량 등)는 무시 - 추이 그래프만 안 나올 뿐 나머지엔 영향 없음 */
    }
  }

  function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  function daysBetweenDateStr(fromStr, toStr) {
    const toDate = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00`);
    return Math.round((toDate(toStr) - toDate(fromStr)) / (1000 * 60 * 60 * 24));
  }

  // ⚠️ 임시 테스트용(사용자 요청으로 추가) - 실제 7일치 기록이 브라우저에 쌓이기 전까지는
  // 그래프가 안 뜨므로, 미리보기용으로 가짜 지난 기록을 딱 한 번만 채워 넣습니다.
  // 오늘 실제 점수를 기준으로 살짝 흔들리는 가짜 값이며, 실제 안전지수 변화가 아닙니다.
  // 실제 기록이 쌓이기 시작하면(또는 필요 없어지면) 이 함수와 호출부를 지워야 합니다.
  function seedFakeHistoryIfEmpty(entries, score) {
    if (entries.length >= 2) return entries;
    const offsets = [-6, -3, -5, -1, -3, -1]; // 6일 전 ~ 1일 전
    const toDateStr = (daysAgo) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    };
    const seeded = offsets.map((off, i) => ({
      date: toDateStr(offsets.length - i),
      score: Math.max(0, Math.min(100, Math.round(score + off))),
    }));
    const today = todayDateStr();
    return [...seeded, ...entries.filter((e) => e.date !== today)];
  }

  // 오늘 점수를 기록하고, 이 지역에 쌓여있는 기록(오래된 순, 최대 14일치)을 돌려준다
  function recordAndGetScoreHistory(regionKey, score) {
    if (!regionKey) return [];
    const all = readScoreHistoryStore();
    let entries = all[regionKey] || [];
    entries = seedFakeHistoryIfEmpty(entries, score);
    const today = todayDateStr();
    const todayIdx = entries.findIndex((e) => e.date === today);
    if (todayIdx >= 0) entries[todayIdx].score = score;
    else entries.push({ date: today, score });
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    while (entries.length > SCORE_HISTORY_MAX_DAYS) entries.shift();
    all[regionKey] = entries;
    writeScoreHistoryStore(all);
    return entries;
  }

  // Catmull-Rom → Bezier 변환으로 각진 꺾은선 대신 부드러운 곡선을 그린다.
  function smoothPathD(points) {
    if (points.length < 3) {
      return points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    }
    let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function renderScoreTrend(regionKey, score) {
    const svgEl = document.getElementById("score-trend-svg");
    const textEl = document.getElementById("score-trend-text");
    const history = recordAndGetScoreHistory(regionKey, score);

    if (svgEl) {
      if (history.length < 2) {
        svgEl.innerHTML = "";
      } else {
        const scores = history.map((e) => e.score);
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const range = max - min || 1;
        const w = 100;
        const h = 36;
        const pad = 4;
        const points = history.map((e, i) => [
          pad + (i / (history.length - 1)) * (w - pad * 2),
          h - pad - ((e.score - min) / range) * (h - pad * 2),
        ]);
        const pathD = smoothPathD(points);
        svgEl.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="w-full h-9" preserveAspectRatio="none">
          <path id="score-trend-path" d="${pathD}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>`;
        const pathEl = document.getElementById("score-trend-path");
        if (pathEl && pathEl.getTotalLength) {
          const len = pathEl.getTotalLength();
          pathEl.style.strokeDasharray = String(len);
          pathEl.style.strokeDashoffset = String(len);
          // 강제 리플로우 한 번 거쳐야 transition이 처음부터 제대로 걸림
          pathEl.getBoundingClientRect();
          pathEl.style.transition = "stroke-dashoffset 900ms ease-out";
          requestAnimationFrame(() => {
            pathEl.style.strokeDashoffset = "0";
          });
        }
      }
    }

    if (textEl) {
      const t = window.olaI18n ? olaI18n.t : (k) => k;
      const priorEntries = history.slice(0, -1); // 오늘 제외
      if (!priorEntries.length) {
        textEl.textContent = history.length ? t("safety.scoreTrendStart") : "";
      } else {
        const todayDate = history[history.length - 1].date;
        // 7일 전에 가장 가까운 기록을 비교 기준으로 삼는다 (7일치가 없으면 있는 것 중 가장 가까운 걸로)
        let ref = priorEntries[0];
        let bestDiff = Infinity;
        for (const e of priorEntries) {
          const diff = Math.abs(daysBetweenDateStr(e.date, todayDate) - 7);
          if (diff < bestDiff) {
            bestDiff = diff;
            ref = e;
          }
        }
        const gapDays = daysBetweenDateStr(ref.date, todayDate);
        const diff = Math.round((score - ref.score) * 10) / 10;
        const dayLabel = gapDays === 1 ? t("safety.scoreTrendYesterday") : t("safety.scoreTrendDaysAgo", { n: gapDays });
        if (diff > 0) textEl.textContent = t("safety.scoreTrendUp", { day: dayLabel, diff });
        else if (diff < 0) textEl.textContent = t("safety.scoreTrendDown", { day: dayLabel, diff: Math.abs(diff) });
        else textEl.textContent = t("safety.scoreTrendFlat", { day: dayLabel });
      }
    }
  }


  // 범죄 유형별 비중 막대그래프 — 경찰청 통계(2024.12.31 기준 연간 누적)의 실제 값만 사용한다.
  // (이전에는 월별 추이 선그래프였지만, 경찰청 통계에는 월별 시계열이 없어서 감소 추세를 가정한
  //  "예시" 값을 그렸다. 근거 없는 추세 해석이 되므로 실제 유형별 비중 표시로 교체했다.)
  // regionData.crime.breakdown 의 값 단위(건수/비율)와 상관없이 "전체 합 대비 %"로 계산하므로 항상 올바른 비중이 나온다.
  const CRIME_TREND_CAT_DEFS = [
    { key: "강력범죄", labelKey: "safety.crimeCatViolent", color: "#dc2626", dash: false },
    { key: "절도범죄", labelKey: "safety.crimeCatTheft", color: "#6366f1", dash: false },
    { key: "폭력범죄", labelKey: "safety.crimeCatAssault", color: "#f59e0b", dash: false },
    { key: "지능범죄", labelKey: "safety.crimeCatFraud", color: "#10b981", dash: false },
    { key: "교통범죄", labelKey: "safety.crimeCatTraffic", color: "#0ea5e9", dash: false },
    { key: "기타", labelKey: "safety.crimeCatOther", color: "#94a3b8", dash: true },
  ];

  // CRIME_TREND_CAT_DEFS.key는 regionData.crime.breakdown 조회용 키라 번역하면 안 되고,
  // label만 현재 언어로 계산해서 돌려준다.
  function crimeTrendCats() {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    return CRIME_TREND_CAT_DEFS.map((c) => ({ ...c, label: t(c.labelKey) }));
  }

  // 함수 이름(renderCrimeTrend6mo)은 호출부 호환을 위해 그대로 둔다. 이제 6개월 추이가 아니라 유형별 비중을 그린다.
  function renderCrimeTrend6mo(regionData) {
    const chartEl = document.getElementById("crime-trend-chart");
    const insightEl = document.getElementById("crime-trend-insight");
    if (!chartEl) return;

    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const breakdown = (regionData && regionData.crime && regionData.crime.breakdown) || {};
    const rows = crimeTrendCats().map((c) => ({ ...c, value: Number(breakdown[c.key]) || 0 }));
    const total = rows.reduce((sum, r) => sum + r.value, 0);

    // 통계가 없으면 값을 지어내지 않고 안내만 보여준다.
    if (!total) {
      chartEl.innerHTML = `<p class="text-sm text-gray-400 py-10 text-center">${t("safety.crimeNoData")}</p>`;
      if (insightEl) insightEl.innerHTML = "";
      return;
    }

    rows.forEach((r) => {
      r.pct = (r.value / total) * 100;
    });
    rows.sort((a, b) => b.pct - a.pct);
    const maxPct = rows[0].pct || 1;

    chartEl.innerHTML = `
      <div class="space-y-3 mt-3 mb-4">
        ${rows
          .map(
            (r) => `
          <div class="flex items-center gap-3">
            <span class="w-16 flex-shrink-0 text-xs text-gray-600">${r.label}</span>
            <div class="flex-1 h-3 bg-bg rounded-full overflow-hidden">
              <div class="h-full rounded-full" style="width:${((r.pct / maxPct) * 100).toFixed(1)}%;background:${r.color}"></div>
            </div>
            <span class="w-14 flex-shrink-0 text-right text-xs font-bold text-dark">${r.pct.toFixed(1)}%</span>
          </div>`
          )
          .join("")}
      </div>`;

    if (insightEl) {
      const top = rows[0];
      insightEl.innerHTML = `<i data-lucide="info" class="w-4 h-4 text-primary flex-shrink-0 mt-0.5"></i>
        <span><b class="text-dark">${t("safety.crimeInsightLabel")}</b> &nbsp; ${t("safety.crimeInsightTop", { cat: top.label, pct: top.pct.toFixed(1) })}</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }

  // 위험지수 TOP5 - 선택된 "시도" 안에서만 비교합니다 (서울 25개구끼리, 경기 31개 시군구끼리, 인천 10개 구·군끼리).
  // 66개 전체를 한 리스트에 섞으면 광역시/도가 다른 지역끼리 비교하는 게 되어 의미가 없습니다.
  const RISK_RANKING_PAGE_SIZE = 5;
  let riskRankingPage = 0;
  let lastRankingData = null;

  function riskTierBadge(idx) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    if (idx >= 70) return { label: t("safety.riskHigh"), cls: "bg-red-50 text-red-600", bar: "bg-red-400" };
    if (idx >= 40) return { label: t("safety.riskModerate"), cls: "bg-amber-50 text-amber-600", bar: "bg-amber-400" };
    return { label: t("safety.riskLow"), cls: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-400" };
  }

  function renderRanking(selectedKey, sido) {
    const ranked = Object.entries(regions)
      .filter(([, r]) => r.sido === sido)
      .map(([key, r]) => ({ key, sido: r.sido, gu: r.gu, idx: r.crime?.crime_risk_index ?? 0 }))
      .sort((a, b) => b.idx - a.idx); // 위험도가 높은 지역부터 (TOP5는 가장 위험한 순)

    lastRankingData = { ranked, selectedKey };

    const t = window.olaI18n ? olaI18n.t : (k) => k;
    // 화면 표시용이라 olaSidoShort(API 조회용, 항상 한국어) 대신 olaSidoDisplay(언어별 표시)를 쓴다.
    const listLabel = window.olaSidoDisplay ? olaSidoDisplay(sido) : olaSidoShort(sido);
    const titleEl = document.getElementById("ranking-scope-label");
    if (titleEl) titleEl.textContent = t("safety.rankingScopeLabel", { region: listLabel, count: ranked.length });

    const myRankBadgeEl = document.getElementById("ranking-my-rank-badge");
    if (myRankBadgeEl) {
      const myIdx = ranked.findIndex((r) => r.key === selectedKey);
      myRankBadgeEl.textContent = myIdx >= 0 ? t("safety.myRankBadge", { rank: myIdx + 1, total: ranked.length }) : "";
    }

    riskRankingPage = 0;
    renderRiskRankingList();
  }

  function renderRiskRankingList() {
    if (!lastRankingData) return;
    const { ranked, selectedKey } = lastRankingData;
    const totalPages = Math.max(1, Math.ceil(ranked.length / RISK_RANKING_PAGE_SIZE));
    riskRankingPage = Math.min(riskRankingPage, totalPages - 1);
    const start = riskRankingPage * RISK_RANKING_PAGE_SIZE;
    const visible = ranked.slice(start, start + RISK_RANKING_PAGE_SIZE);

    document.getElementById("gu-ranking").innerHTML = visible
      .map((r, i) => {
        const active = r.key === selectedKey;
        const tier = riskTierBadge(r.idx);
        return `
        <div class="text-xs p-2.5 rounded-lg ${active ? "bg-secondary bg-opacity-30" : "bg-bg"}">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-5 h-5 rounded-full bg-white text-gray-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">${start + i + 1}</span>
              <span class="font-bold truncate">${window.olaGuDisplay ? olaGuDisplay(r.sido, r.gu) : r.gu}</span>
            </div>
            <span class="font-extrabold text-dark flex-shrink-0">${r.idx.toFixed(1)}</span>
          </div>
          <div class="w-full bg-gray-200 h-1.5 rounded-full"><div class="${tier.bar} h-1.5 rounded-full" style="width:${Math.min(100, r.idx)}%"></div></div>
        </div>`;
      })
      .join("");

    const pagEl = document.getElementById("risk-ranking-pagination");
    if (pagEl) {
      if (totalPages <= 1) {
        pagEl.innerHTML = "";
      } else {
        const t = window.olaI18n ? olaI18n.t : (k) => k;
        const pageBtns = Array.from({ length: totalPages })
          .map(
            (_, i) => `
          <button type="button" onclick="olaRiskRankingGoToPage(${i})"
            class="w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
              i === riskRankingPage ? "border-2 border-primary text-primary" : "text-gray-400 hover:bg-bg"
            }">${i + 1}</button>`
          )
          .join("");
        pagEl.innerHTML = `
          <button type="button" onclick="olaRiskRankingGoToPage(${riskRankingPage - 1})" aria-label="${t("common.prevPage")}"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-bg disabled:opacity-30 disabled:pointer-events-none" ${riskRankingPage <= 0 ? "disabled" : ""}>
            <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
          </button>
          ${pageBtns}
          <button type="button" onclick="olaRiskRankingGoToPage(${riskRankingPage + 1})" aria-label="${t("common.nextPage")}"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-bg disabled:opacity-30 disabled:pointer-events-none" ${riskRankingPage >= totalPages - 1 ? "disabled" : ""}>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>`;
      }
      if (window.lucide) lucide.createIcons();
    }
  }

  window.olaRiskRankingGoToPage = function (page) {
    if (!lastRankingData) return;
    const totalPages = Math.max(1, Math.ceil(lastRankingData.ranked.length / RISK_RANKING_PAGE_SIZE));
    if (page < 0 || page >= totalPages) return;
    riskRankingPage = page;
    renderRiskRankingList();
  };

  // tmFc/tmEf는 둘 다 "YYYYMMDDHHmm" 형태 숫자(발표시각/발효시각) - 공공데이터포털
  // 응답에 실제로 둘 다 있는 필드라 지어내지 않고 그대로 표시한다.
  function formatTmFc(tmFc) {
    const s = String(tmFc || "");
    if (s.length < 12) return "-";
    return `${s.slice(2, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}. ${s.slice(8, 10)}:${s.slice(10, 12)}`;
  }

  // 카드에는 더 이상 기상특보를 직접 그리지 않고, "기상특보 현황" 팝업(olaToggleWeatherWarningPopover)에서
  // 쓸 상태(warningSlideData/warningTmFc/warningTmEf)만 채워둔다.
  function renderWeather(locationLabel, w) {
    warningTmFc = null;
    warningTmEf = null;
    warningSlideData = [];
    if (!w.ok) return;
    warningTmFc = w.tmFc;
    warningTmEf = w.tmEf;
    warningSlideData = w.allWarnings || [];
  }

  // 오늘/내일 날씨 - 기상청 단기예보(기온/하늘상태/강수확률/습도·풍속/최저·최고)
  const SKY_TILE_LABEL_KEY = { "1": "sky.clear", "3": "sky.partlyCloudy", "4": "sky.cloudy" };
  function skyTileLabel(sky) {
    const key = SKY_TILE_LABEL_KEY[String(sky)];
    if (!key) return "-";
    return window.olaI18n ? olaI18n.t(key) : "-";
  }

  function formatMonthDay(fcstDate) {
    if (!fcstDate) return "-";
    return `${fcstDate.slice(4, 6)}.${fcstDate.slice(6, 8)}`;
  }

  function setWeatherCoordinateText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatWeatherBasis(dateValue, timeValue) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const date = String(dateValue || "");
    const time = String(timeValue || "").padStart(4, "0");
    if (date.length !== 8 || time.length !== 4) return t("safety.basisTimePending");
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}`;
  }

  function formatWeatherUpdatedAt(value) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return t("safety.updatedTimePending");
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderWeatherCoordinateBox({ regionLabel, regionData, forecast, ncst, loading = false }) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const box = document.getElementById("weather-coordinate-box");
    const valueIds = [
      "weather-coordinate-status",
      "weather-coordinate-region",
      "weather-coordinate-lat",
      "weather-coordinate-lng",
      "weather-coordinate-grid",
      "weather-coordinate-basis",
      "weather-coordinate-temp",
      "weather-coordinate-tmn",
      "weather-coordinate-tmx",
      "weather-coordinate-updated",
    ];
    if (!box) {
      console.error("[WeatherCoordinateBox] #weather-coordinate-box DOM을 찾을 수 없습니다.");
      return false;
    }
    const missingIds = valueIds.filter((id) => !document.getElementById(id));
    if (missingIds.length) {
      console.error(`[WeatherCoordinateBox] 필수 DOM 누락: ${missingIds.join(", ")}`);
      return false;
    }

    box.hidden = false;
    box.removeAttribute("hidden");
    box.setAttribute("aria-busy", loading ? "true" : "false");
    box.dataset.weatherState = loading ? "loading" : "ready";
    box.dataset.renderCount = String((Number(box.dataset.renderCount) || 0) + 1);

    const center = regionData?.center;
    const grid = regionData?.kma_grid;
    const hasSavedRegion = (() => {
      try {
        return !!localStorage.getItem("ola_selected_region");
      } catch (_) {
        return false;
      }
    })();

    setWeatherCoordinateText("weather-coordinate-region", regionLabel || t("safety.locationUnavailable"));
    setWeatherCoordinateText("weather-coordinate-lat", Number.isFinite(Number(center?.lat)) ? Number(center.lat).toFixed(6) : t("safety.latUnavailable"));
    setWeatherCoordinateText("weather-coordinate-lng", Number.isFinite(Number(center?.lng)) ? Number(center.lng).toFixed(6) : t("safety.lngUnavailable"));
    setWeatherCoordinateText(
      "weather-coordinate-grid",
      grid?.nx !== undefined && grid?.ny !== undefined ? `nx ${grid.nx} / ny ${grid.ny}` : t("safety.gridUnavailable")
    );

    if (loading) {
      setWeatherCoordinateText("weather-coordinate-status", t("safety.weatherLoadingStatus"));
      setWeatherCoordinateText("weather-coordinate-basis", t("common.loading"));
      setWeatherCoordinateText("weather-coordinate-temp", t("common.loading"));
      setWeatherCoordinateText("weather-coordinate-tmn", t("common.loading"));
      setWeatherCoordinateText("weather-coordinate-tmx", t("common.loading"));
      setWeatherCoordinateText("weather-coordinate-updated", t("common.loading"));
      return true;
    }

    const currentTemp = ncst?.tmp !== undefined ? ncst.tmp : forecast?.tmp;
    const basisDate = ncst?.obsDate || forecast?.fcstDate || forecast?.baseDate;
    const basisTime = ncst?.obsTime || forecast?.fcstTime || forecast?.baseTime;
    setWeatherCoordinateText("weather-coordinate-basis", formatWeatherBasis(basisDate, basisTime));
    setWeatherCoordinateText("weather-coordinate-temp", currentTemp !== undefined ? `${currentTemp}°C` : t("safety.currentTempUnavailable"));
    setWeatherCoordinateText("weather-coordinate-tmn", forecast?.tmn !== undefined ? `${forecast.tmn}°C` : t("safety.tmnUnavailable"));
    setWeatherCoordinateText("weather-coordinate-tmx", forecast?.tmx !== undefined ? `${forecast.tmx}°C` : t("safety.tmxUnavailable"));
    setWeatherCoordinateText("weather-coordinate-updated", formatWeatherUpdatedAt(ncst?.updatedAt || forecast?.updatedAt));

    const messages = [hasSavedRegion ? t("safety.usingSelectedRegionCenter") : t("safety.usingDefaultLocation")];
    if (!forecast) {
      messages.push(t("safety.forecastLoadFailed"));
    } else if (forecast.tmnSource === "hourly-fallback") {
      messages.push(t("safety.tmnFromHourly"));
    } else if (forecast.tmnSource === "previous-release") {
      const release = forecast.tmnBaseTime ? `${forecast.tmnBaseTime.slice(0, 2)}:${forecast.tmnBaseTime.slice(2, 4)}` : t("safety.previousReleaseFallback");
      messages.push(t("safety.tmnFromPreviousRelease", { release }));
    }
    if (forecast?.tmxSource === "hourly-fallback") {
      messages.push(t("safety.tmxFromHourly"));
    } else if (forecast?.tmxSource === "previous-release") {
      messages.push(t("safety.tmxFromPreviousRelease"));
    }
    setWeatherCoordinateText("weather-coordinate-status", messages.join(" · "));
    return true;
  }

  function renderWeatherTiles(forecast, air, regionLabel, ncst, w) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const regionEl = document.getElementById("weather-region-label");
    if (regionEl) regionEl.textContent = regionLabel || "-";

    const timeEl = document.getElementById("weather-tile-time");
    const tempEl = document.getElementById("tile-temp");
    if (!tempEl) return;

    const todayBadgeEl = document.getElementById("weather-today-badge");
    const skyEl = document.getElementById("tile-sky");
    const skyIconEl = document.getElementById("tile-sky-icon");

    if (!forecast) {
      [tempEl, skyEl].forEach((el) => el && (el.textContent = "-"));
      if (timeEl) timeEl.textContent = t("safety.forecastLoadFailed");
    } else {
      // 기온은 초단기실황(진짜 관측값)이 있으면 그걸 우선 쓰고, 실패했을 때만 단기예보 값으로 대체한다.
      const tmp = ncst?.tmp !== undefined ? ncst.tmp : forecast.tmp;

      if (timeEl) {
        if (ncst) {
          const hh = ncst.obsTime ? ncst.obsTime.slice(0, 2) : "";
          timeEl.textContent = t("safety.obsTimeBasis", { hh });
        } else {
          const mm = forecast.fcstDate.slice(4, 6);
          const dd = forecast.fcstDate.slice(6, 8);
          const hh = forecast.fcstTime ? forecast.fcstTime.slice(0, 2) : "";
          timeEl.textContent = t("safety.forecastTimeBasis", { mm, dd, hh });
        }
      }
      if (tempEl) tempEl.textContent = tmp !== undefined ? `${tmp}°C` : "-";
      if (skyEl) skyEl.textContent = skyTileLabel(forecast.sky);
      // 하늘상태 아이콘: 맑음이면 해, 그 외(구름많음/흐림)면 구름
      if (skyIconEl) skyIconEl.setAttribute("data-lucide", String(forecast.sky) === "1" ? "sun" : "cloud");
    }

    // 오늘 최저/최고 + 어제 대비 최고기온 비교 - briefing-text.js가 지역별로 기록해둔 값과 비교하므로
    // 이 브라우저로 그 지역을 처음 보거나 오늘 처음 확인하는 거라면 비교 문구는 안 뜬다(추측 금지).
    const tmnEl = document.getElementById("tile-today-tmn");
    const tmxEl = document.getElementById("tile-today-tmx");
    if (tmnEl) tmnEl.textContent = forecast?.tmn !== undefined ? `${forecast.tmn}°C` : "-";
    if (tmxEl) tmxEl.textContent = forecast?.tmx !== undefined ? `${forecast.tmx}°C` : "-";

    const compareEl = document.getElementById("tile-yesterday-compare");
    if (compareEl) {
      const compareLine = forecast && window.olaBuildCompareLine ? olaBuildCompareLine(regionLabel, forecast).trim() : "";
      if (compareLine) {
        compareEl.textContent = compareLine;
        compareEl.classList.remove("hidden");
        compareEl.classList.add("flex");
      } else {
        compareEl.classList.add("hidden");
        compareEl.classList.remove("flex");
      }
    }

    // 현재 위치 기상특보 발효 여부 - 아래 "오늘" 배지가 날짜/특보명을 교차 표시하는 데 사용
    const warningActive = !!(w?.ok && w.active && w.lines?.length);

    // "오늘 MM.DD" 배지 - 특보가 발효 중이면 날짜와 특보명을 번갈아(교차) 보여준다
    if (weatherBadgeCycleTimer) {
      clearInterval(weatherBadgeCycleTimer);
      weatherBadgeCycleTimer = null;
    }
    if (todayBadgeEl) {
      const dateLabel = forecast ? t("safety.todayBadge", { date: formatMonthDay(forecast.fcstDate) }) : t("safety.todayShort");
      const warningLabel = warningActive ? t("safety.warningActiveBadge", { warning: w.lines[0].split(":")[0].trim() }) : null;
      const dateCls = "absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-sky-50 text-sky-600 transition-opacity duration-300";
      const warningCls = "absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-500 transition-opacity duration-300";
      const showDate = () => {
        todayBadgeEl.className = dateCls;
        todayBadgeEl.textContent = dateLabel;
      };
      const showWarning = () => {
        todayBadgeEl.className = warningCls;
        todayBadgeEl.textContent = warningLabel;
      };
      if (warningLabel) {
        let showingDate = true;
        showDate();
        weatherBadgeCycleTimer = setInterval(() => {
          todayBadgeEl.style.opacity = "0";
          setTimeout(() => {
            showingDate = !showingDate;
            (showingDate ? showDate : showWarning)();
            todayBadgeEl.style.opacity = "1";
          }, 300);
        }, 2600);
      } else {
        showDate();
      }
    }

    // 내일/모레 슬라이드 (단기예보 API가 모레 데이터를 못 주면 futureDays가 1개뿐일 수 있음 → 그만큼만 표시)
    futureDaysData = forecast?.futureDays || [];
    futureDayIndex = 0;
    renderFutureDay();

    renderHourlyWeatherStrip(forecast?.hourly);

    if (window.lucide) lucide.createIcons();
  }

  function futureDayLabel(index) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    return index === 0 ? t("safety.tomorrow") : index === 1 ? t("safety.dayAfterTomorrow") : t("safety.plusDays", { n: index + 1 });
  }

  function renderFutureDay() {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const badgeEl = document.getElementById("weather-tomorrow-badge");
    const skyEl = document.getElementById("tile-tomorrow-sky");
    const popEl = document.getElementById("tile-tomorrow-pop");
    const tmnEl = document.getElementById("tile-tomorrow-tmn");
    const tmxEl = document.getElementById("tile-tomorrow-tmx");
    const iconEl = document.getElementById("tile-tomorrow-sky-icon");
    const prevBtn = document.getElementById("future-day-prev");
    const nextBtn = document.getElementById("future-day-next");
    const dotsEl = document.getElementById("future-day-dots");

    const day = futureDaysData[futureDayIndex];
    if (day) {
      if (badgeEl) badgeEl.textContent = `${futureDayLabel(futureDayIndex)} ${formatMonthDay(day.fcstDate)}`;
      if (skyEl) skyEl.textContent = skyTileLabel(day.sky);
      if (popEl) popEl.textContent = day.pop !== undefined ? `${day.pop}%` : "-";
      if (tmnEl) tmnEl.textContent = day.tmn !== undefined ? `${day.tmn}°C` : "-";
      if (tmxEl) tmxEl.textContent = day.tmx !== undefined ? `${day.tmx}°C` : "-";
      if (iconEl) iconEl.setAttribute("data-lucide", String(day.sky) === "1" ? "sun" : "cloud");
    } else {
      [skyEl, popEl, tmnEl, tmxEl].forEach((el) => el && (el.textContent = "-"));
      if (badgeEl) badgeEl.textContent = `${t("safety.tomorrow")} -`;
    }

    if (prevBtn) prevBtn.disabled = futureDayIndex <= 0;
    if (nextBtn) nextBtn.disabled = futureDayIndex >= futureDaysData.length - 1;
    if (dotsEl) {
      dotsEl.innerHTML =
        futureDaysData.length > 1
          ? futureDaysData
              .map((_, i) => `<span class="w-1.5 h-1.5 rounded-full ${i === futureDayIndex ? "bg-primary" : "bg-slate-300"}"></span>`)
              .join("")
          : "";
    }
    if (window.lucide) lucide.createIcons();
  }

  window.olaFutureDaySlide = function (direction) {
    const next = futureDayIndex + direction;
    if (next < 0 || next >= futureDaysData.length) return;
    futureDayIndex = next;
    renderFutureDay();
  };

  // 시간별 날씨 접기/펼치기 - 화살표 아이콘만 위/아래로 바꾸고, 내용물은 렌더링해둔 걸 그대로 두고
  // 숨김만 토글한다(다시 펼칠 때 다시 그릴 필요 없음)
  window.olaToggleHourlyWeather = function () {
    const btn = document.getElementById("hourly-weather-toggle-btn");
    const body = document.getElementById("hourly-weather-strip");
    // lucide.createIcons()가 첫 렌더 때 <i data-lucide>를 <svg>로 통째로 바꿔치기해서
    // 그 이후엔 "i"가 아니라 "svg"로 찾아야 한다 (home.js의 같은 패턴 참고)
    const icon = btn?.querySelector("svg, i");
    if (!btn || !body) return;
    const collapsed = body.style.display === "none";
    body.style.display = collapsed ? "" : "none";
    btn.setAttribute("aria-expanded", collapsed ? "true" : "false");
    if (icon) icon.setAttribute("data-lucide", collapsed ? "chevron-up" : "chevron-down");
    if (window.lucide) lucide.createIcons();
  };

  // 시간별(3시간 간격) 날씨 스트립 - forecast.hourly는 이미 받아온 단기예보 응답에서 뽑아온
  // 실제 데이터라 별도 API 호출 없음. PTY(강수형태)가 있으면 비/눈 아이콘을, 없으면 SKY로 판단.
  function hourlyIconName(sky, pty) {
    const p = String(pty);
    if (p === "3") return "cloud-snow";
    if (p === "2") return "cloud-snow";
    if (p === "1" || p === "4" || p === "5") return "cloud-rain";
    return String(sky) === "1" ? "sun" : "cloud";
  }

  // 시간별 날씨를 시간/아이콘/기온/강수확률/습도/바람 6개 행으로 나열합니다.
  // #hourly-weather-strip이 grid-auto-flow:column + grid-template-rows:repeat(6,auto)로
  // 설정돼 있어서, 아래처럼 "한 시간의 6칸"을 순서대로 이어 붙이기만 하면 시간별로
  // 한 열씩 자동으로 배치됩니다.
  function renderHourlyWeatherStrip(hourly) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const el = document.getElementById("hourly-weather-strip");
    if (!el) return;
    if (!hourly || !hourly.length) {
      el.innerHTML = `<p class="text-xs text-gray-400 py-2">${t("safety.hourlyForecastLoadFailed")}</p>`;
      return;
    }
    // 첫 열은 가로 스크롤에도 항상 보이는 라벨 열(sticky) — 시간 행에는 지금 스크롤 중인 열이
    // 오늘인지 내일인지 보여주는 표시를 넣는다(가로로 넘기면 자동으로 바뀜).
    const labelCol = `
        <span id="hourly-day-indicator" class="text-[11px] font-bold text-gray-500 text-center">${t("safety.todayShort")}</span>
        <span>&nbsp;</span>
        <span class="text-[10px] text-gray-400">${t("disaster.temp")}</span>
        <span class="text-[10px] text-gray-400">${t("safety.precipAmountLabel")}</span>
        <span class="text-[10px] text-gray-400">${t("safety.humidityLabel")}</span>
        <span class="text-[10px] text-gray-400">${t("safety.windLabel")}</span>`;
    const labelColWrap = `<div class="grid gap-y-2 sticky left-0 bg-white pr-3" style="grid-row: span 6; grid-template-rows: subgrid;">${labelCol}</div>`;

    // 오늘/내일 경계에 세로 구분선을 넣기 위해, 한 시간의 6칸을 각각 subgrid 컬럼으로 감싼다
    // (라벨 열과 같은 방식). 날짜가 바뀌는 첫 열에만 왼쪽 테두리를 준다.
    const hourCols = hourly
      .map((h, i) => {
        const hh = Number(h.time.slice(0, 2));
        const crossedMidnight = i > 0 && h.date && hourly[i - 1].date && h.date !== hourly[i - 1].date;
        const label = i === 0 ? t("safety.now") : crossedMidnight ? t("safety.tomorrowHour", { hh }) : t("safety.hourLabel", { hh });
        const cells = `
        <span class="text-[11px] font-bold text-gray-500 text-center">${label}</span>
        <i data-lucide="${hourlyIconName(h.sky, h.pty)}" class="w-5 h-5 text-orange-400 mx-auto"></i>
        <span class="text-sm font-bold text-dark text-center">${h.tmp !== undefined ? h.tmp + "°" : "-"}</span>
        <span class="text-[10px] text-sky-500 text-center">${h.pcp === undefined || h.pcp === "강수없음" ? "-" : h.pcp}</span>
        <span class="text-[10px] text-gray-400 text-center">${h.reh !== undefined ? h.reh + "%" : "-"}</span>
        <span class="text-[10px] text-gray-400 text-center">${h.wsd !== undefined ? h.wsd + "m/s" : "-"}</span>`;
        return `<div class="grid gap-y-2${crossedMidnight ? " border-l-2 border-slate-200 pl-3" : ""}" data-date="${h.date || ""}" style="grid-row: span 6; grid-template-rows: subgrid;">${cells}</div>`;
      })
      .join("");
    el.innerHTML = labelColWrap + hourCols;
    if (window.lucide) lucide.createIcons();

    // 스크롤 위치에 따라 "오늘"/"내일" 표시를 갱신 - 현재 화면 왼쪽에 걸쳐있는 열의 날짜를 기준으로 판단
    const dayIndicatorEl = document.getElementById("hourly-day-indicator");
    if (dayIndicatorEl) {
      const todayDate = hourly[0]?.date;
      const cols = Array.from(el.querySelectorAll("[data-date]"));
      const updateDayIndicator = () => {
        const scrollLeft = el.scrollLeft;
        const current = cols.find((c) => c.offsetLeft + c.offsetWidth > scrollLeft + 4) || cols[cols.length - 1];
        const date = current?.getAttribute("data-date");
        dayIndicatorEl.textContent = date && todayDate && date !== todayDate ? t("safety.tomorrow") : t("safety.todayShort");
      };
      updateDayIndicator();
      el.removeEventListener("scroll", el._olaHourlyDayHandler || (() => {}));
      el._olaHourlyDayHandler = updateDayIndicator;
      el.addEventListener("scroll", updateDayIndicator);
    }

    // 스크롤바를 숨겨둬서(scrollbar-none) 옆으로 더 넘길 수 있다는 게 안 보일 수 있어,
    // 더 넘길 내용이 남아있을 때만 오른쪽에 옅은 그라데이션 힌트를 보여준다.
    const fadeEl = document.getElementById("hourly-weather-fade");
    if (fadeEl) {
      const updateFade = () => {
        const hasMore = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
        fadeEl.classList.toggle("hidden", !hasMore);
      };
      updateFade();
      el.removeEventListener("scroll", el._olaHourlyFadeHandler || (() => {}));
      el._olaHourlyFadeHandler = updateFade;
      el.addEventListener("scroll", updateFade);
    }
  }

  // 실시간 상황 요약 - 기상특보 발효 시 날씨 카드 제목 옆에 배지로만 표시 (타일과 중복 방지)
  // 배지를 클릭하면 전국 기상특보 현황을 팝업으로 보여준다 (renderWeather가 채워둔 warningSlideData 재사용)
  function renderSituationSummary({ weatherLabel, weatherActive }) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const badgeEl = document.getElementById("weather-warning-badge");
    if (badgeEl) {
      if (weatherActive) {
        badgeEl.innerHTML = `<i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> ${t("safety.weatherStatus")}`;
        badgeEl.style.display = "inline-flex";
      } else {
        badgeEl.style.display = "none";
      }
    }
    if (window.lucide) lucide.createIcons();
  }

  function renderWeatherWarningPopoverList() {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const listEl = document.getElementById("weather-warning-modal-list");
    if (!listEl) return;
    if (!warningSlideData.length) {
      listEl.innerHTML = `<div class="flex items-center gap-3 p-3 bg-bg rounded-xl"><i data-lucide="check-circle-2" class="text-point2 w-5 h-5"></i><p class="text-sm">${t("safety.noActiveWarnings")}</p></div>`;
    } else {
      listEl.innerHTML = warningSlideData
        .map(
          (item) => `
        <div class="rounded-xl border border-red-100 overflow-hidden">
          <div class="bg-red-50 px-3 py-2 flex items-center gap-2">
            <span class="text-[10px] font-bold text-red-500 bg-white border border-red-200 rounded px-1.5 py-0.5 flex-shrink-0">${t("safety.warningBadgeLabel")}</span>
            <p class="text-sm font-bold text-red-600 truncate">${t("safety.warningActiveBadge", { warning: item.level })}</p>
          </div>
          <div class="px-3 py-2.5">
            <p class="text-xs text-gray-400 mb-0.5">${t("safety.issuedAt", { time: formatTmFc(warningTmFc) })}</p>
            <p class="text-xs text-gray-400 mb-2">${t("safety.effectiveAt", { time: formatTmFc(warningTmEf) })}</p>
            <p class="text-xs text-gray-600 leading-relaxed">${item.regionsSimple || item.regionsText}</p>
          </div>
        </div>`
        )
        .join("");
    }
    if (window.lucide) lucide.createIcons();
  }

  function isWeatherWarningPopoverOpen() {
    const popover = document.getElementById("weatherWarningPopover");
    return !!popover && !popover.classList.contains("hidden");
  }

  window.olaCloseWeatherWarningPopover = function () {
    const popover = document.getElementById("weatherWarningPopover");
    if (!popover) return;
    popover.classList.add("opacity-0", "scale-95");
    setTimeout(() => popover.classList.add("hidden"), 200);
    document.removeEventListener("click", handleWeatherWarningOutsideClick, true);
  };

  function handleWeatherWarningOutsideClick(e) {
    const popover = document.getElementById("weatherWarningPopover");
    const badge = document.getElementById("weather-warning-badge");
    if (!popover) return;
    if (popover.contains(e.target) || (badge && badge.contains(e.target))) return;
    window.olaCloseWeatherWarningPopover();
  }

  window.olaToggleWeatherWarningPopover = function (e) {
    if (e) e.stopPropagation();
    if (isWeatherWarningPopoverOpen()) {
      window.olaCloseWeatherWarningPopover();
      return;
    }
    renderWeatherWarningPopoverList();
    const popover = document.getElementById("weatherWarningPopover");
    if (!popover) return;
    popover.classList.remove("hidden");
    requestAnimationFrame(() => {
      popover.classList.remove("opacity-0", "scale-95");
    });
    document.addEventListener("click", handleWeatherWarningOutsideClick, true);
  };

  // 범죄 세부유형별 맞춤 행동 팁 - regionData.crime.breakdown의 카테고리 키와 동일한 기준
  // (키는 breakdown 조회용이라 번역하면 안 되고, 팁 문구만 언어별로 계산해서 돌려준다)
  const CRIME_CAT_TIP_KEYS = {
    강력범죄: "safety.tipViolentCrime",
    절도범죄: "safety.tipTheftCrime",
    폭력범죄: "safety.tipAssaultCrime",
    지능범죄: "safety.tipFraudCrime",
    교통범죄: "safety.tipTrafficCrime",
    기타: "safety.tipOtherCrime",
  };
  function crimeCatTip(cat) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const key = CRIME_CAT_TIP_KEYS[cat];
    return t(key || "safety.actionAvoidDarkStreets");
  }

  // AI 추천 행동 - 종합 안전도 / 날씨 / 범죄지수 등 실제 조회된 데이터에 근거해서만 항목을 추가합니다
  // (조건에 해당하지 않으면 지어내지 않고, 부족하면 상시 유효한 일반 안전 수칙으로 채웁니다)
  // AI 추천 행동 목록을 계산만 해서 돌려준다 (렌더링은 renderKeySafetyMetrics의 요약 타일이 담당)
  function computeActionChecklist({ forecast, air, weatherActive, weatherLabel, safetyScore, regionData }) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const items = [];

    // 1) 종합 안전도 등급 기반 (label은 언어별로 바뀌므로 key로 비교)
    if (typeof safetyScore === "number") {
      const tier = safetyScoreTier(safetyScore);
      if (tier.key === "caution") {
        items.push(t("safety.actionLowScore"));
      } else if (tier.key === "safe") {
        items.push(t("safety.actionGoodScore"));
      }
    }

    // 2) 범죄지수 기반 (가장 비중이 큰 범죄 유형에 맞춘 팁)
    const crimeIdx = regionData?.crime?.crime_risk_index;
    const breakdown = regionData?.crime?.breakdown;
    if (typeof crimeIdx === "number" && crimeIdx >= 60 && breakdown) {
      const topCat = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0];
      items.push(crimeCatTip(topCat));
    }

    // 3) 날씨/대기질 기반 - weatherLabel은 기상특보 API 원문(한국어)이라 언어와 무관하게 그대로 매칭한다
    if (forecast) {
      const tmp = Number(forecast.tmp);
      const pty = Number(forecast.pty);
      const pop = Number(forecast.pop);
      const isHeat = weatherActive && weatherLabel.includes("폭염");
      const isCold = weatherActive && (weatherLabel.includes("한파") || weatherLabel.includes("대설"));

      if (isHeat || (!Number.isNaN(tmp) && tmp >= 33)) {
        items.push(t("safety.actionDrinkWater"));
        items.push(t("safety.actionAvoidMidday"));
      }
      if (isCold || (!Number.isNaN(tmp) && tmp <= 0)) {
        items.push(t("safety.actionDressWarm"));
      }
      if (pty > 0 || (!Number.isNaN(pop) && pop >= 60)) {
        items.push(t("safety.actionBringUmbrella"));
      }
    }
    if (air && Number(air.grade10) >= 3) {
      items.push(t("safety.actionWearMask"));
    }
    items.push(t("safety.actionCheckShelter"));

    // 실시간 조건에 해당하는 항목이 적을 때를 대비한 일반 안전 수칙(상시 유효, 특정 조건을 지어내지 않음)
    const fallbackTips = [
      t("safety.actionSaveEmergencyContacts"),
      t("safety.actionCheckEmergencySupplies"),
      t("safety.actionCheckRiskAreas"),
      t("safety.actionKnowSosButton"),
    ];
    for (const tip of fallbackTips) {
      if (items.length >= 5) break;
      if (!items.includes(tip)) items.push(tip);
    }

    return items;
  }

  // 주요 안전 지표: AI 추천 행동 + 내 주변 최단거리 안심 인프라(비동기로 채워짐)
  function renderKeySafetyMetrics(regionData, actionItems) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const el = document.getElementById("key-safety-metrics");
    if (!el) return;

    const actionTile = `
      <div class="col-span-2 flex flex-col justify-start gap-2.5 p-3 rounded-xl bg-bg">
        <div class="flex items-center gap-1.5 mb-1">
          <div class="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i></div>
          <span class="text-base font-bold text-dark">${t("safety.aiRecommendedActions")}</span>
        </div>
        ${actionItems
          .slice(0, 5)
          .map((text) => `<div class="flex items-start gap-1.5 text-xs text-dark"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5"></i><span>${text}</span></div>`)
          .join("")}
      </div>
      <div class="col-span-2" id="nearby-infra-mini"></div>`;

    el.innerHTML = actionTile;
    if (window.lucide) lucide.createIcons();
    renderNearbyInfraMini(regionData);
  }

  // 내 주변 최단거리 안심 인프라 - 대피소·AED(실데이터) + 파출소·약국(카카오 장소검색, 실시간)
  // 중 지역 중심좌표에서 가장 가까운 곳 1개씩만 뽑아 거리순으로 최대 4개 보여준다.
  // 클릭하면 안전지도 페이지로 이동. 비상벨은 우리 쪽에 실제 위치 데이터가 없어 넣지 않는다.
  const WALK_METERS_PER_MIN = 80;
  function walkMinutesLabel(distanceKm) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    return t("safety.walkMinutes", { n: Math.max(1, Math.ceil((distanceKm * 1000) / WALK_METERS_PER_MIN)) });
  }

  function nearbyInfraRowHtml(rows) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    if (!rows.length) return `<p class="text-xs text-gray-400">${t("safety.nearbyInfraLoadFailed")}</p>`;
    return rows
      .slice(0, 5)
      .map(
        (r) => `
      <div class="flex items-center gap-1.5 text-xs text-dark">
        <i data-lucide="${r.icon}" class="w-3.5 h-3.5 ${r.iconColor} flex-shrink-0"></i>
        <span class="truncate flex-1 min-w-0">${r.title}</span>
        <span class="text-[10px] text-gray-400 flex-shrink-0">${Math.round(r.distanceKm * 1000)}m · ${walkMinutesLabel(r.distanceKm)}</span>
      </div>`
      )
      .join("");
  }

  function kakaoNearestKeyword(center, keyword) {
    return new Promise((resolve) => {
      if (!window.kakao?.maps?.services) {
        resolve(null);
        return;
      }
      const places = new kakao.maps.services.Places();
      places.keywordSearch(
        keyword,
        (results, status) => {
          if (status !== kakao.maps.services.Status.OK || !results.length) {
            resolve(null);
            return;
          }
          const nearest = results
            .map((p) => ({ name: p.place_name, lat: Number(p.y), lng: Number(p.x) }))
            .map((p) => ({ ...p, distanceKm: olaData.distanceKm(center.lat, center.lng, p.lat, p.lng) }))
            .sort((a, b) => a.distanceKm - b.distanceKm)[0];
          resolve(nearest || null);
        },
        { location: new kakao.maps.LatLng(center.lat, center.lng), radius: 3000, sort: kakao.maps.services.SortBy.DISTANCE }
      );
    });
  }

  async function renderNearbyInfraMini(regionData) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const el = document.getElementById("nearby-infra-mini");
    if (!el || !regionData?.center) return;
    el.innerHTML = `<div class="h-full flex flex-col justify-start gap-1.5 p-3 rounded-xl bg-bg"><p class="text-xs text-gray-400">${t("safety.nearbyInfraLoading")}</p></div>`;

    const center = regionData.center;
    const rows = [];

    try {
      const shelters = await olaData.getNearbyShelters(center.lat, center.lng, 5, { sido: regionData.sido, gu: regionData.gu });
      if (shelters.length) {
        const s = shelters[0];
        rows.push({ icon: "house", iconColor: "text-emerald-500", title: t("safety.rowShelter", { name: s.name }), distanceKm: s.distanceKm });
      }
    } catch (e) {
      /* ignore */
    }

    try {
      const hospitals = await olaData.getNearbyHospitals(center.lat, center.lng, 5, { sido: regionData.sido, gu: regionData.gu });
      if (hospitals.length) {
        const h = hospitals[0];
        rows.push({ icon: "heart-pulse", iconColor: "text-rose-500", title: t("safety.rowHospital", { name: h.name }), distanceKm: h.distanceKm });
      }
    } catch (e) {
      /* ignore */
    }

    try {
      const aed = await olaApi.getAedList({ sido: regionData.sido, gugun: regionData.gu });
      if (aed.ok && aed.items.length) {
        const nearest = aed.items
          .filter((it) => it.lat && it.lng)
          .map((it) => ({ ...it, distanceKm: olaData.distanceKm(center.lat, center.lng, it.lat, it.lng) }))
          .sort((a, b) => a.distanceKm - b.distanceKm)[0];
        if (nearest) rows.push({ icon: "zap", iconColor: "text-amber-500", title: t("safety.rowAed", { name: nearest.org || t("safety.aedFallbackName") }), distanceKm: nearest.distanceKm });
      }
    } catch (e) {
      /* ignore */
    }

    // ⚠️ kakaoNearestKeyword에 넘기는 "지구대"/"약국"은 카카오 장소검색 API로 보내는 실제 검색어라
    // 번역하면 안 된다 (표시용 문자열이 아님).
    const kakaoOk = await ensureKakaoSdk();
    if (kakaoOk) {
      const [police, pharmacy] = await Promise.all([kakaoNearestKeyword(center, "지구대"), kakaoNearestKeyword(center, "약국")]);
      if (police) rows.push({ icon: "shield-check", iconColor: "text-blue-500", title: t("safety.rowPolice", { name: police.name }), distanceKm: police.distanceKm });
      if (pharmacy) rows.push({ icon: "pill", iconColor: "text-teal-500", title: t("safety.rowPharmacy", { name: pharmacy.name }), distanceKm: pharmacy.distanceKm });
    }

    rows.sort((a, b) => a.distanceKm - b.distanceKm);
    el.innerHTML = `
      <a href="map.html" class="h-full flex flex-col justify-start gap-2.5 p-3 rounded-xl bg-bg">
        <div class="flex items-center gap-1.5 mb-1">
          <div class="w-6 h-6 rounded-full bg-sky-50 text-primary flex items-center justify-center flex-shrink-0"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i></div>
          <span class="text-base font-bold text-dark">${t("safety.nearestInfraHeading")}</span>
        </div>
        ${nearbyInfraRowHtml(rows)}
      </a>`;
    if (window.lucide) lucide.createIcons();
  }

  function favId(key) {
    return `safety:${key}`;
  }

  function renderFavButton(key) {
    const icon = document.getElementById("fav-btn-icon");
    if (!icon || !window.olaFavorites) return;
    const active = olaFavorites.isFavorited(favId(key));
    icon.setAttribute("data-lucide", "star");
    icon.setAttribute("fill", active ? "#FFD6A5" : "none");
    icon.parentElement.classList.toggle("text-point1", active);
    icon.parentElement.classList.toggle("text-gray-300", !active);
    if (window.lucide) lucide.createIcons();
  }

  window.toggleRegionFavorite = function () {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    const key = currentKey();
    const [sido, gu] = key.split("|");
    olaFavorites.toggle({
      id: favId(key),
      // ⚠️ type은 마이페이지(js/mypage.js)의 TYPE_ICON 매핑·필터 키로 쓰이므로 번역하면 안 됨
      type: "생활안전",
      title: t("safety.favTitle", { region: olaRegionLabel(sido, gu) }),
      subtitle: t("safety.favSubtitle"),
      url: "safety.html",
    });
    renderFavButton(key);
  };

  document.addEventListener("DOMContentLoaded", init);
  // 사이드바 위치 배지(GPS)로 지역이 바뀌면 이 페이지도 그 지역 기준으로 다시 불러옵니다.
  window.onOlaLocationChange = function () {
    return loadAll();
  };
})();
