/**
 * ============================================================================
 *  OLA 공공데이터 API 연동 모듈 (api.js)
 * ============================================================================
 *  - 실제 공공데이터포털 Open API를 호출하는 함수 모음입니다.
 *  - 인증키는 js/config.js 의 OLA_CONFIG.PUBLIC_DATA_API_KEY 하나를 공통으로
 *    사용합니다. (index.html, briefing.html, emergency.html 등 어디서든 이
 *    파일 하나만 불러오면 동일하게 사용 가능)
 *  - 모든 함수는 실패해도 에러를 던지지 않고 { ok:false, ... } 형태로
 *    반환합니다. 호출부(js/home.js, js/briefing.js 등)는 ok가 false일 때
 *    js/data.js 의 로컬 데이터(강남구 등 서울 25개구 기초데이터)로
 *    자연스럽게 대체(fallback) 표시합니다.
 *
 *  ⚠️ CORS 안내
 *  apis.data.go.kr 은 브라우저 CORS(Access-Control-Allow-Origin)를 별도로
 *  허용하지 않는 API가 많습니다. 그래서 정적 HTML(파일 더블클릭 또는
 *  Live Server)에서 바로 fetch 하면 브라우저 콘솔에 CORS 에러가 뜰 수
 *  있습니다. 기획안(시스템 구성도)대로 Flask API 서버를 프록시로 두면
 *  깨끗하게 해결됩니다 — 그 전까지는 OLA_CONFIG.PROXY_BASE_URL 에 자체
 *  프록시 주소를 넣으면 모든 요청이 그 프록시를 거쳐 나갑니다.
 * ============================================================================
 */

const olaApi = (() => {
  const CFG = () => window.OLA_CONFIG;

  // 프록시(server/app.py)를 쓰는 경우, 실제 공공데이터 요청을
  // "/api/public-data?endpoint=<원본URL>&기타파라미터..." 형태로 감싸서 보냄
  function buildUrl(base, params) {
    const proxyBase = CFG().PROXY_BASE_URL || "";
    if (proxyBase) {
      const proxyUrl = new URL(proxyBase);
      proxyUrl.searchParams.set("endpoint", base);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") proxyUrl.searchParams.set(k, v);
      });
      return proxyUrl.toString();
    }
    const url = new URL(base);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
    return url.toString();
  }

  async function fetchWithTimeout(url, ms = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /**
   * 간단한 API 응답 캐시 (localStorage, TTL 기반)
   * 개발 중 새로고침을 반복해도 공공데이터포털 일일 트래픽을 태우지 않도록
   * 성공한 응답을 잠깐 재사용합니다. (특보 10분 / 미세먼지 15분 / AED 1시간)
   */
  const CACHE_PREFIX = "ola-api-cache:";
  function cacheGet(key, maxAgeMs) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (!t || Date.now() - t > maxAgeMs) return null;
      return v;
    } catch (_) {
      return null;
    }
  }
  function cacheSet(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (_) {
      /* 저장 실패(용량 등)는 무시 — 캐시는 없어도 동작함 */
    }
  }

  /**
   * 실패 사유(reason) 코드를 사용자가 이해할 수 있는 한국어 문구로 변환.
   * 카드 UI에서 "API 미연동" 같은 뭉뚱그린 표현 대신 실제 원인을 보여줄 때 사용.
   */
  function reasonLabel(reason) {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    if (!reason) return t("api.reason.unknown");
    const r = String(reason);
    if (r === "no-api-key") return t("api.reason.noApiKey");
    if (r === "not-applied") return t("api.reason.notApplied");
    if (r === "quota-exceeded") return t("api.reason.quotaExceeded");
    if (r === "empty-response" || r === "no-items") return t("api.reason.noData");
    if (r === "invalid-response") return t("api.reason.invalidResponse");
    if (/^HTTP 403/.test(r)) return t("api.reason.forbidden");
    if (/^HTTP 429/.test(r)) return t("api.reason.tooMany");
    if (/^HTTP 5/.test(r)) return t("api.reason.serverError");
    if (/abort/i.test(r)) return t("api.reason.timeout");
    if (/Failed to fetch|NetworkError|Load failed/i.test(r)) return t("api.reason.networkError");
    return r; // 그 외에는 원문 그대로 (resultMsg 등)
  }

  function parseXml(text) {
    return new DOMParser().parseFromString(text, "application/xml");
  }

  function xmlText(doc, tag) {
    const el = doc.getElementsByTagName(tag)[0];
    return el ? el.textContent.trim() : "";
  }

  function xmlItems(doc) {
    return Array.from(doc.getElementsByTagName("item"));
  }

  function itemToObj(item) {
    const obj = {};
    Array.from(item.children).forEach((c) => (obj[c.tagName] = c.textContent.trim()));
    return obj;
  }

  /**
   * 공공데이터포털 공통 게이트웨이 에러(OpenAPI_ServiceResponse) 감지 — XML 응답용.
   * 활용신청 미승인(30/20), 일일 트래픽 초과(22) 등은 각 API 응답이 아니라
   * 이 공통 형식으로 내려오므로 원인을 구분해서 돌려줍니다.
   */
  function openApiGatewayError(doc) {
    const code = xmlText(doc, "returnReasonCode");
    const msg = xmlText(doc, "returnAuthMsg") || xmlText(doc, "errMsg");
    if (!code && !msg) return null;
    if (code === "22") return "quota-exceeded"; // LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR
    if (code === "30" || code === "20" || code === "31") return "not-applied"; // 미등록/거부/기간만료 키
    return msg || "openapi-error-" + code;
  }

  /**
   * 기상청 기상특보 현황 조회 (WthrWrnInfoService/getPwnStatus)
   * 최근 7일 이내 발효중인 특보 현황 텍스트(t6)를 돌려줍니다.
   * areaKeyword 로 원하는 지역명이 포함된 줄만 뽑아서 반환합니다.
   */
  async function getWeatherWarningStatus(areaKeyword = "서울") {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    const cacheKey = "pwnStatus:" + areaKeyword;
    const cached = cacheGet(cacheKey, 10 * 60 * 1000); // 10분
    if (cached) return cached;
    try {
      const url = buildUrl(CFG().ENDPOINTS.WEATHER_WARNING_STATUS, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        numOfRows: 10,
        pageNo: 1,
      });
      const res = await fetchWithTimeout(url);
      const doc = parseXml(await res.text());
      const gwErr = openApiGatewayError(doc);
      if (gwErr) return { ok: false, reason: gwErr };
      const resultCode = xmlText(doc, "resultCode");
      const resultMsg = xmlText(doc, "resultMsg");
      // ⚠️ 03(NO_DATA)은 "발효 중인 특보가 없음"이라는 정상 응답이다.
      // 이걸 에러로 처리하면 특보 없는 날마다 "API 미연동"으로 잘못 표시된다.
      if (resultCode === "03" || /NO_?DATA/i.test(resultMsg)) {
        const out = { ok: true, active: false, lines: [], allWarnings: [] };
        cacheSet(cacheKey, out);
        return out;
      }
      if (resultCode !== "00" && resultCode !== "0") {
        return { ok: false, reason: resultMsg || "api-error" };
      }
      const items = xmlItems(doc).map(itemToObj);
      if (!items.length) {
        const out = { ok: true, active: false, lines: [], allWarnings: [] };
        cacheSet(cacheKey, out);
        return out;
      }

      const latest = items[0];
      const raw = (latest.t6 || "").trim();
      if (!raw || raw.includes("없음")) {
        const out = { ok: true, active: false, lines: [], allWarnings: [], tmFc: latest.tmFc };
        cacheSet(cacheKey, out);
        return out;
      }
      const lines = raw
        .split(/\r?\n|(?=o\s)/)
        .map((s) => s.replace(/^o\s*/, "").trim())
        .filter(Boolean);

      // 특보 한 줄은 "폭염주의보 : 서울특별시, 인천광역시(강화군 제외), 경기도, ..." 처럼
      // 발효 중인 전국 지역이 통째로 나열됨. 현재 위치(areaKeyword)가 포함된 줄만 고르고,
      // 지역 목록도 해당 지역만 남긴다. (매칭되는 특보가 없으면 "특보 없음" 처리 —
      // 예전처럼 전국 특보 전체를 돌려주지 않음)
      const localLines = [];
      // 전국 특보 슬라이드용 - 필터링 전 원본 줄을 {level, regionsText}로만 나눠서 그대로 보관
      // (지역을 걸러내지 않은 전국 단위 원문이라 areaKeyword 매칭과 무관하게 항상 채워짐)
      const allWarnings = [];
      for (const line of lines) {
        const sep = line.indexOf(":");
        if (sep === -1) {
          if (line.includes(areaKeyword)) localLines.push(line);
          continue;
        }
        const name = line.slice(0, sep).trim(); // 예: 폭염주의보
        const regionsText = line.slice(sep + 1).trim();
        allWarnings.push({ level: name, regionsText, regionsSimple: simplifyRegionsText(regionsText) });

        const regions = splitTopLevelCommas(regionsText);
        const matchedRegions = regions.filter((r) => r.includes(areaKeyword));
        if (matchedRegions.length) {
          localLines.push(`${name} : ${matchedRegions.join(", ")}`);
        }
      }

      const out = {
        ok: true,
        active: localLines.length > 0,
        lines: localLines,
        allWarnings, // 전국 특보 원문 목록 [{level, regionsText, regionsSimple}, ...] - 슬라이드 카드용
        tmFc: latest.tmFc, // 발표시각(YYYYMMDDHHmm)
        tmEf: latest.tmEf, // 발효시각(YYYYMMDDHHmm) - 실제 응답 필드(처음엔 놓쳤다가 재확인해서 찾음)
      };
      cacheSet(cacheKey, out);
      return out;
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // "서울특별시, 인천광역시(옹진군, 강화군), 경기도" 같은 문자열을
  // 괄호 안 쉼표는 무시하고 최상위 쉼표로만 분리하는 헬퍼
  function splitTopLevelCommas(str) {
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of str) {
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        if (cur.trim()) parts.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  // "전라남도(보성, 여수, ...), 서울, 인천(강화, 옹진, 인천북부)" 같은 원문에서 시/군/구
  // 단위 세부 목록(괄호 안 내용)은 빼고 시/도 이름만 남긴다. 원문에 이미 세부 지역이 없으면
  // (예: "서울"만 있는 경우) 그대로 둔다 — 정부 데이터에 없는 세부 권역을 지어내지 않음.
  function simplifyRegionsText(regionsText) {
    const seen = new Set();
    const names = [];
    for (const entry of splitTopLevelCommas(regionsText)) {
      const base = entry.replace(/\(.*$/, "").trim();
      if (base && !seen.has(base)) {
        seen.add(base);
        names.push(base);
      }
    }
    return names.join(", ");
  }

  /**
   * 기상청 기상특보 목록 조회 (WthrWrnInfoService/getWthrWrnList)
   * stnId 109 = 서울/인천/경기
   */
  async function getWeatherWarningList({ stnId, fromTmFc, toTmFc } = {}) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    try {
      const url = buildUrl(CFG().ENDPOINTS.WEATHER_WARNING_LIST, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        numOfRows: 10,
        pageNo: 1,
        dataType: "JSON",
        stnId: stnId || CFG().KMA_STN_ID_SEOUL,
        fromTmFc,
        toTmFc,
      });
      const res = await fetchWithTimeout(url);
      const json = await res.json();
      const body = json?.response?.body;
      if (!body) return { ok: false, reason: "empty-response" };
      const items = body.items?.item || [];
      return { ok: true, items: Array.isArray(items) ? items : [items] };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * E-Gen 응급의료기관 실시간 가용병상 조회
   * (ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire)
   * STAGE1(시도) / STAGE2(시군구) 필수
   */
  async function getEmergencyBeds({ sido = "서울특별시", gugun = "강남구", numOfRows = 10 } = {}) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    try {
      const url = buildUrl(CFG().ENDPOINTS.EMERGENCY_BEDS, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        STAGE1: sido,
        STAGE2: gugun,
        pageNo: 1,
        numOfRows,
      });
      const res = await fetchWithTimeout(url);
      const doc = parseXml(await res.text());
      const gwErr = openApiGatewayError(doc);
      if (gwErr) return { ok: false, reason: gwErr };
      const resultCode = xmlText(doc, "resultCode");
      if (resultCode && resultCode !== "00" && resultCode !== "0") {
        return { ok: false, reason: xmlText(doc, "resultMsg") || "api-error" };
      }
      // 필드명은 NIA 응급의료정보조회서비스 OpenAPI 활용가이드(V4/V5) 기준
      const items = xmlItems(doc).map(itemToObj).map((it) => ({
        name: it.dutyName,
        hpid: it.hpid,
        erGeneral: Number(it.hvec) || 0, // 응급실 일반병상
        operatingRoom: Number(it.hvoc) || 0, // 수술실
        icuGeneral: Number(it.hvicc) || 0, // 중환자실(일반)
        inpatientGeneral: Number(it.hvgc) || 0, // 입원실(일반)
        ambulanceAvailable: it.hvamyn === "Y",
        ctAvailable: it.hvctayn === "Y",
        mriAvailable: it.hvmriayn === "Y",
        ventilatorAvailable: it.hvventiayn === "Y",
        tel: it.dutyTel3,
        updatedAt: it.hvidate,
      }));
      return { ok: true, items };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * AED(자동심장충격기) 정보 조회 (AEDInfoInqireService/getEgytAedManageInfoInqire)
   * NIA 자동심장충격기(AED) 정보조회서비스 OpenAPI 활용가이드 기준
   * Q0(시도) / Q1(시군구) 필수
   */
  async function getAedList({ sido = "서울특별시", gugun = "강남구", numOfRows = 50 } = {}) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    const cacheKey = `aed:${sido}:${gugun}:${numOfRows}`;
    const cached = cacheGet(cacheKey, 60 * 60 * 1000); // 1시간 (설치 정보라 자주 안 바뀜)
    if (cached) return cached;
    try {
      const url = buildUrl(CFG().ENDPOINTS.AED_INFO, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        Q0: sido,
        Q1: gugun,
        pageNo: 1,
        numOfRows,
      });
      const res = await fetchWithTimeout(url);
      const doc = parseXml(await res.text());
      const gwErr = openApiGatewayError(doc);
      if (gwErr) return { ok: false, reason: gwErr };
      const resultCode = xmlText(doc, "resultCode");
      if (resultCode && resultCode !== "00" && resultCode !== "0") {
        return { ok: false, reason: xmlText(doc, "resultMsg") || "api-error" };
      }
      const items = xmlItems(doc).map(itemToObj).map((it) => ({
        org: it.org, // 설치기관명
        buildPlace: it.buildPlace, // 설치위치(상세)
        buildAddress: it.buildAddress, // 설치기관주소
        lat: Number(it.wgs84Lat) || null,
        lng: Number(it.wgs84Lon) || null,
        manager: it.manager,
        managerTel: it.managerTel,
        clerkTel: it.clerkTel,
        model: it.model,
      }));
      const out = { ok: true, items, count: items.length };
      cacheSet(cacheKey, out);
      return out;
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * E-Gen 응급의료기관 목록정보 조회 (ErmctInfoInqireService/getEgytListInfoInqire)
   * Q0(시도)/Q1(시군구)/QZ(기관분류 A~H,J~O,Q) 등은 선택값. 응급실 분류명·전화번호가 필요할 때 사용.
   */
  async function getEmergencyOrgList({ sido = "서울특별시", gugun = "강남구", numOfRows = 30 } = {}) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    try {
      const url = buildUrl(CFG().ENDPOINTS.EMERGENCY_ORG_LIST, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        Q0: sido,
        Q1: gugun,
        ORD: "ADDR",
        pageNo: 1,
        numOfRows,
      });
      const res = await fetchWithTimeout(url);
      const doc = parseXml(await res.text());
      const gwErr = openApiGatewayError(doc);
      if (gwErr) return { ok: false, reason: gwErr };
      const resultCode = xmlText(doc, "resultCode");
      if (resultCode && resultCode !== "00" && resultCode !== "0") {
        return { ok: false, reason: xmlText(doc, "resultMsg") || "api-error" };
      }
      const items = xmlItems(doc).map(itemToObj).map((it) => ({
        hpid: it.hpid,
        name: it.dutyName,
        classification: it.dutyEmclsName, // 예: 권역응급의료센터, 지역응급의료센터 등
        address: it.dutyAddr,
        tel: it.dutyTel1,
        erTel: it.dutyTel3,
        lat: Number(it.wgs84Lat) || null,
        lng: Number(it.wgs84Lon) || null,
      }));
      return { ok: true, items };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * 기상청 단기예보 조회 (VilageFcstInfoService_2.0/getVilageFcst)
   * nx, ny 격자좌표(assets/data/seoul_regions.json 의 kma_grid)를 넣으면
   * 가장 가까운 미래 예보 시각의 기온/하늘상태/강수형태/강수확률/습도/풍속을 돌려줍니다.
   */
  async function fetchShortForecastRelease({ nx, ny, baseDate, baseTime }) {
    const url = buildUrl(CFG().ENDPOINTS.WEATHER_SHORT_FORECAST, {
      serviceKey: CFG().PUBLIC_DATA_API_KEY,
      numOfRows: 1000,
      pageNo: 1,
      dataType: "JSON",
      base_date: baseDate,
      base_time: baseTime,
      nx,
      ny,
    });
    const res = await fetchWithTimeout(url);
    const json = await res.json();
    const body = json?.response?.body;
    if (!body || !body.items) throw new Error("empty-response");
    const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
    if (!items.length) throw new Error("no-items");
    return items;
  }

  function previousShortForecastBaseTimes(baseTime) {
    const releaseTimes = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];
    return releaseTimes.filter((time) => time < baseTime).reverse();
  }

  async function getShortForecast({ nx, ny } = {}) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    if (!nx || !ny) return { ok: false, reason: "no-grid" };
    // ⚠️ 다른 실시간 API(특보/미세먼지)와 달리 캐시가 없어서 새로고침할 때마다 매번 실제
    // API를 호출했고, 그만큼 일시적 타임아웃/트래픽 이슈에 더 자주 걸렸음. 단기예보는
    // 3시간 단위(base_time)로만 갱신되니 10분 캐시를 둬도 최신성엔 문제가 없음.
    // v6: 당일 TMN/TMX가 현재 발표에 없을 때 이전 발표와 시간별 TMP를 순서대로 확인한다.
    // 이전 캐시의 누락된 최저기온이 10분간 남지 않도록 캐시 버전도 함께 올린다.
    const cacheKey = `shortForecast:v6:${nx}:${ny}`;
    const cached = cacheGet(cacheKey, 10 * 60 * 1000); // 10분
    if (cached) return cached;
    try {
      const { baseDate, baseTime } = latestBaseTime();
      const items = await fetchShortForecastRelease({ nx, ny, baseDate, baseTime });

      // fcstDate+fcstTime 기준으로 "가장 이른 미래 슬롯"을 찾는다
      const forecastSlotKey = (item) => String(item.fcstDate) + String(item.fcstTime).padStart(4, "0");
      const slots = [...new Set(items.map(forecastSlotKey))].sort();
      const now = new Date();
      const nowDate =
        String(now.getFullYear()) +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0");
      const nowStr = nowDate + String(now.getHours()).padStart(2, "0") + "00";

      // SKY(하늘상태)·PTY(강수형태)는 기상청 API에서 3시간 단위(0,3,6,9,12,15,18,21시)로만
      // 내려오므로, 정시(1시간) 슬롯을 그대로 대표값으로 쓰면 하늘상태가 비어있는 시각이 생김.
      // 그래서 "현재 시각 이하 가장 가까운 3시간 버킷"을 대표 슬롯으로 고정한다.
      const THREE_HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21];
      const nowHour = new Date().getHours();
      const currentMark = [...THREE_HOUR_MARKS].reverse().find((m) => m <= nowHour) ?? THREE_HOUR_MARKS[0];
      const preferredSlot = nowStr.slice(0, 8) + String(currentMark).padStart(2, "0") + "00";
      const targetSlot = slots.includes(preferredSlot) ? preferredSlot : slots.find((s) => s >= nowStr) || slots[0];

      const slotItems = items.filter((it) => forecastSlotKey(it) === targetSlot);
      const byCategory = {};
      slotItems.forEach((it) => (byCategory[it.category] = it.fcstValue));

      // TMN(최저기온)/TMX(최고기온)은 하루 중 특정 시간대(0300/1500)에만 내려오므로
      // 오늘 날짜 전체 items에서 별도로 찾는다 (targetSlot 시간대에는 없을 수 있음)
      const todayDate = targetSlot.slice(0, 8);
      let tmnItem = items.find((it) => it.category === "TMN" && String(it.fcstDate) === todayDate);
      let tmxItem = items.find((it) => it.category === "TMX" && String(it.fcstDate) === todayDate);
      let tmnSource = tmnItem ? "current-release" : undefined;
      let tmxSource = tmxItem ? "current-release" : undefined;
      let tmnBaseTime = tmnItem ? baseTime : undefined;
      let tmxBaseTime = tmxItem ? baseTime : undefined;

      // 당일 최저/최고는 일부 발표 시각에서 이미 지난 예보 항목이 빠진다. 같은 날짜의 더 이른
      // 발표를 최신순으로 확인하고, 값이 있는 가장 가까운 발표를 사용한다.
      if (!tmnItem || !tmxItem) {
        for (const previousBaseTime of previousShortForecastBaseTimes(baseTime)) {
          try {
            const previousItems = await fetchShortForecastRelease({ nx, ny, baseDate, baseTime: previousBaseTime });
            if (!tmnItem) {
              tmnItem = previousItems.find((it) => it.category === "TMN" && String(it.fcstDate) === todayDate);
              if (tmnItem) {
                tmnSource = "previous-release";
                tmnBaseTime = previousBaseTime;
              }
            }
            if (!tmxItem) {
              tmxItem = previousItems.find((it) => it.category === "TMX" && String(it.fcstDate) === todayDate);
              if (tmxItem) {
                tmxSource = "previous-release";
                tmxBaseTime = previousBaseTime;
              }
            }
            if (tmnItem && tmxItem) break;
          } catch (_) {
            // 한 발표 자료가 일시적으로 없으면 그보다 이전의 같은 날 발표를 계속 확인한다.
          }
        }
      }

      const todayTmpValues = items
        .filter((it) => it.category === "TMP" && String(it.fcstDate) === todayDate)
        .map((it) => Number(it.fcstValue))
        .filter(Number.isFinite);
      let tmn = tmnItem?.fcstValue;
      let tmx = tmxItem?.fcstValue;
      if (tmn === undefined && todayTmpValues.length) {
        tmn = String(Math.min(...todayTmpValues));
        tmnSource = "hourly-fallback";
      }
      if (tmx === undefined && todayTmpValues.length) {
        tmx = String(Math.max(...todayTmpValues));
        tmxSource = "hourly-fallback";
      }

      // 강수 시작 시각: 지금(targetSlot)은 강수가 없어도, 오늘 남은 시간대 중 PTY(강수형태)가
      // 처음으로 "0"이 아니게 되는 슬롯을 찾아 "몇 시부터 비/눈"인지 안내할 수 있게 함
      let rainStartTime; // "HHmm" — 오늘 중 강수가 없으면 undefined
      const todaySlots = slots.filter((s) => s.slice(0, 8) === todayDate && s >= targetSlot);
      for (const slot of todaySlots) {
        const ptyItem = items.find((it) => forecastSlotKey(it) === slot && it.category === "PTY");
        if (ptyItem && ptyItem.fcstValue && ptyItem.fcstValue !== "0") {
          rainStartTime = slot.slice(8, 12);
          break;
        }
      }

      // 내일·모레 예보 - 단기예보 API는 오늘 포함 최대 약 2.9일치를 내려주므로 모레(+2일)까지
      // 시도해보고, 그날 데이터가 실제로 없으면(발표 시각에 따라 모레 데이터가 아직 없을 수 있음)
      // 지어내지 않고 배열에서 제외한다.
      // ⚠️ new Date(y, m, d) + toISOString()는 로컬 자정을 "UTC 기준"으로 다시 읽기 때문에,
      // 한국(UTC+9)처럼 UTC보다 앞선 시간대에서는 하루 전 날짜로 밀려버림(예: 7/31 자정 KST → 7/30 15:00 UTC).
      // Date.UTC로 만들고 toISOString으로 읽으면 양쪽 다 UTC라 밀리지 않음.
      function addDaysToDateStr(dateStr, days) {
        return new Date(
          Date.UTC(
            Number(dateStr.slice(0, 4)),
            Number(dateStr.slice(4, 6)) - 1,
            Number(dateStr.slice(6, 8)) + days
          )
        )
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "");
      }

      // 그날 정오(12시)에 가장 가까운 슬롯에서 하늘상태/강수확률을, 그날 전체 items에서
      // 최저/최고기온을 뽑는다. 그날 데이터가 아예 없으면 null을 반환한다.
      function extractDayForecast(dateStr) {
        const daySlots = slots.filter((s) => s.slice(0, 8) === dateStr);
        if (!daySlots.length) return null;
        const daySlot = daySlots.find((s) => s.slice(8, 12) === "1200") || daySlots[Math.floor(daySlots.length / 2)];
        const byCat = {};
        items.filter((it) => forecastSlotKey(it) === daySlot).forEach((it) => (byCat[it.category] = it.fcstValue));
        const tmnItem = items.find((it) => it.category === "TMN" && String(it.fcstDate) === dateStr);
        const tmxItem = items.find((it) => it.category === "TMX" && String(it.fcstDate) === dateStr);
        if (byCat.SKY === undefined && !tmnItem && !tmxItem) return null;
        return { fcstDate: dateStr, sky: byCat.SKY, pop: byCat.POP, tmn: tmnItem?.fcstValue, tmx: tmxItem?.fcstValue };
      }

      const tomorrowDate = addDaysToDateStr(todayDate, 1);
      const dayAfterTomorrowDate = addDaysToDateStr(todayDate, 2);
      const tomorrow = extractDayForecast(tomorrowDate);
      const dayAfterTomorrow = extractDayForecast(dayAfterTomorrowDate);
      const futureDays = [tomorrow, dayAfterTomorrow].filter(Boolean);

      // 오늘 남은 시간 + 내일 시간별 예보(시간별 날씨 스트립용) - 이미 받아온 items에서 뽑아 쓰므로
      // 별도 API 호출이 필요 없다. TMP(기온)·POP(강수확률)은 매시간 내려오지만 SKY·PTY는
      // 3시간 단위로만 내려오므로, 그 사이 시간대는 가장 최근 3시간 값을 그대로 이어서 쓴다
      // (하늘상태가 실제로 바뀌었는지 알 수 없는 시간대를 지어내지 않기 위함).
      // 23시에서 뚝 끊기지 않도록, 오늘 남은 시간뿐 아니라 단기예보가 제공하는 내일 시간대까지 이어붙인다.
      let lastSky, lastPty;
      const hourly = slots
        .filter((s) => (s.slice(0, 8) === todayDate && s >= nowStr) || s.slice(0, 8) === tomorrowDate)
        .map((slot) => {
          const byCat = {};
          items.filter((it) => forecastSlotKey(it) === slot).forEach((it) => (byCat[it.category] = it.fcstValue));
          if (byCat.SKY !== undefined) lastSky = byCat.SKY;
          if (byCat.PTY !== undefined) lastPty = byCat.PTY;
          if (byCat.TMP === undefined) return null;
          return {
            date: slot.slice(0, 8),
            time: slot.slice(8, 12),
            tmp: byCat.TMP,
            sky: lastSky,
            pty: lastPty,
            pop: byCat.POP,
            pcp: byCat.PCP, // 1시간 강수량(범주형 텍스트, 예: "강수없음", "1.0mm 미만", "5.0~10.0mm")
            reh: byCat.REH,
            wsd: byCat.WSD,
          };
        })
        .filter(Boolean);

      const out = {
        ok: true,
        nx,
        ny,
        baseDate,
        baseTime,
        updatedAt: new Date().toISOString(),
        fcstDate: targetSlot.slice(0, 8),
        fcstTime: targetSlot.slice(8, 12),
        tmp: byCategory.TMP, // 기온(℃)
        tmn, // 오늘의 최저기온(℃)
        tmx, // 오늘의 최고기온(℃)
        tmnSource,
        tmxSource,
        tmnBaseDate: tmnItem ? baseDate : undefined,
        tmnBaseTime,
        tmxBaseDate: tmxItem ? baseDate : undefined,
        tmxBaseTime,
        sky: byCategory.SKY, // 1:맑음 3:구름많음 4:흐림
        pty: byCategory.PTY, // 0:없음 1:비 2:비/눈 3:눈 4:소나기
        pop: byCategory.POP, // 강수확률(%)
        reh: byCategory.REH, // 습도(%)
        wsd: byCategory.WSD, // 풍속(m/s)
        rainStartTime, // 오늘 중 강수 시작 예상 시각(HHmm), 이미 오고 있거나 예보가 없으면 undefined
        tomorrow, // 내일 대표 예보(정오 기준 하늘상태/강수확률) + 최저·최고기온, 데이터 없으면 null
        futureDays, // [내일, 모레] 중 실제 데이터가 있는 날만 담은 배열(슬라이드용), 최소 0~2개
        hourly, // 오늘 남은 시간 + 내일 시간별 예보 배열 [{date:"YYYYMMDD", time:"HHmm", tmp, sky, pty, pop, pcp, reh, wsd}, ...]
      };
      cacheSet(cacheKey, out);
      return out;
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // 단기예보 base_time은 매시 02,05,08,11,14,17,20,23시(10분 이후)에 갱신됨
  function latestBaseTime() {
    const now = new Date();
    const slots = [2, 5, 8, 11, 14, 17, 20, 23];
    let h = now.getHours();
    const m = now.getMinutes();
    let candidate = [...slots].reverse().find((s) => h > s || (h === s && m >= 10));
    // ⚠️ new Date(now)에 setDate만 적용하고 toISOString으로 날짜만 잘라 쓰면, KST 00~08시대에는
    // "지금"의 UTC 날짜가 이미 하루 전이라 baseDate가 하루 밀려버림(getShortForecast의 내일/모레
    // 계산과 같은 종류의 버그). Date.UTC로 로컬 연/월/일만 넘겨 다시 만들면 밀리지 않는다.
    let dayOffset = 0;
    if (candidate === undefined) {
      candidate = 23;
      dayOffset = -1;
    }
    const baseDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset))
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const baseTime = String(candidate).padStart(2, "0") + "00";
    return { baseDate, baseTime };
  }

  // 초단기실황 base_time은 매시 정시(00~23시) 발표, 관측 자료 취합에 시간이 걸려 약 40분부터 제공됨
  // (40분 이전이면 그 직전 시(hour)의 값을 씀). latestBaseTime과 같은 이유로 Date.UTC로 날짜를 만든다.
  function latestUltraBaseTime() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes();
    let dayOffset = 0;
    if (m < 40) {
      h -= 1;
      if (h < 0) {
        h = 23;
        dayOffset = -1;
      }
    }
    const baseDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset))
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const baseTime = String(h).padStart(2, "0") + "00";
    return { baseDate, baseTime };
  }

  // 초단기실황 조회서비스 - 단기예보(getShortForecast)와 달리 "예측"이 아니라 관측소에서 매시
  // 실제로 측정한 현재 기온·습도·강수·풍속을 준다. 단, 하늘상태(SKY)·강수확률(POP)·최저최고기온은
  // 이 API에 없으므로 그 부분은 계속 getShortForecast 값을 함께 써야 한다.
  async function getUltraSrtNcst({ nx, ny } = {}) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    if (!nx || !ny) return { ok: false, reason: "no-grid" };
    const cacheKey = `ultraSrtNcst:v1:${nx}:${ny}`;
    const cached = cacheGet(cacheKey, 10 * 60 * 1000); // 10분 (관측치는 매시 정각 1번만 갱신됨)
    if (cached) return cached;
    try {
      const { baseDate, baseTime } = latestUltraBaseTime();
      const url = buildUrl(CFG().ENDPOINTS.WEATHER_ULTRA_SRT_NCST, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        numOfRows: 20,
        pageNo: 1,
        dataType: "JSON",
        base_date: baseDate,
        base_time: baseTime,
        nx,
        ny,
      });
      const res = await fetchWithTimeout(url);
      const json = await res.json();
      const body = json?.response?.body;
      if (!body || !body.items) return { ok: false, reason: "empty-response" };
      const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      if (!items.length) return { ok: false, reason: "no-items" };

      const byCategory = {};
      items.forEach((it) => (byCategory[it.category] = it.fcstValue ?? it.obsrValue));

      const out = {
        ok: true,
        nx,
        ny,
        updatedAt: new Date().toISOString(),
        obsDate: items[0]?.baseDate,
        obsTime: items[0]?.baseTime,
        tmp: byCategory.T1H, // 기온(℃) - 실제 관측값
        reh: byCategory.REH, // 습도(%) - 실제 관측값
        wsd: byCategory.WSD, // 풍속(m/s) - 실제 관측값
        pty: byCategory.PTY, // 강수형태(0:없음 1:비 2:비/눈 3:눈 5:빗방울 6:빗방울눈날림 7:눈날림)
        rn1: byCategory.RN1, // 1시간 강수량(mm, 관측치가 없으면 "강수없음" 문자열로 옴)
      };
      cacheSet(cacheKey, out);
      return out;
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * 국민신문고 민원분석정보 - 유사사례 정보 조회 (minSimilarInfo5)
   * 사용자가 입력한 민원 문구와 비슷한 과거 정책Q&A/공개민원 사례를 찾아줍니다.
   */
  async function getComplaintSimilarCases(searchword, retCount = 5) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    if (!searchword || !searchword.trim()) return { ok: false, reason: "empty-query" };
    try {
      const url = buildUrl(CFG().ENDPOINTS.COMPLAINT_SIMILAR_CASES, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        dataType: "json",
        searchword,
        target: "qna,qna_origin",
        retCount,
        startPos: 1,
        minScore: 2,
      });
      const res = await fetchWithTimeout(url);
      const json = await res.json();
      const items = json?.body?.items ?? json?.response?.body?.items?.item ?? json;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      const cases = list.map((it) => ({
        title: it.title,
        content: it.content,
        agency: it.main_sub_name,
        dept: it.dep_name,
        date: it.create_date,
      }));
      return { ok: true, cases };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * 국민신문고 민원분석정보 - 오늘의 민원 이슈 (minTodayTopicInfo5)
   */
  async function getComplaintTodayIssues(topN = 5) {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    try {
      const today = new Date();
      const searchDate =
        today.getFullYear() +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");
      const url = buildUrl(CFG().ENDPOINTS.COMPLAINT_TODAY_ISSUES, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        dataType: "json",
        searchDate,
        todayTopicTopN: topN,
        target: "pttn,dfpt,saeol",
      });
      const res = await fetchWithTimeout(url);
      const json = await res.json();
      const items = json?.body?.items ?? json?.response?.body?.items?.item ?? [];
      const list = Array.isArray(items) ? items : items ? [items] : [];
      return { ok: true, topics: list.map((it) => ({ topic: it.topic, rank: it.rank, count: it.count })) };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * 에어코리아 시도별 실시간 대기 측정정보 (미세먼지/초미세먼지)
   * (ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty)
   *
   * @param {string} sidoName         시도 짧은 이름 (예: "서울")
   * @param {string} preferredStation 우선으로 찾을 측정소명 — 보통 구 이름 (예: "강남구").
   *                                  해당 측정소가 점검중/결측이면 같은 시도의 다른
   *                                  측정소(유효값이 있는 첫 항목)로 자동 대체합니다.
   */
  async function getAirQuality(sidoName = "서울", preferredStation = "") {
    if (!CFG().hasApiKey()) return { ok: false, reason: "no-api-key" };
    const cacheKey = `air:${sidoName}:${preferredStation}`;
    const cached = cacheGet(cacheKey, 15 * 60 * 1000); // 15분 (측정값 자체가 매시 갱신)
    if (cached) return cached;
    try {
      const url = buildUrl(CFG().ENDPOINTS.AIR_QUALITY, {
        serviceKey: CFG().PUBLIC_DATA_API_KEY,
        returnType: "json",
        numOfRows: 200, // 시도 내 전체 측정소 (서울 40여 곳, 경기 100여 곳)
        pageNo: 1,
        sidoName,
        ver: "1.3", // 1.3 이상이어야 pm10Grade1h/pm25Grade1h(1시간 등급)가 내려옴
      });
      const res = await fetchWithTimeout(url);
      const rawText = await res.text();

      let json;
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        // 이 API에 별도로 활용신청하지 않았거나 승인 대기 중이면 JSON이 아니라
        // XML 에러(OpenAPI_ServiceResponse/SERVICE_KEY_IS_NOT_REGISTERED_ERROR 등)가 옵니다.
        if (rawText.includes("SERVICE_KEY_IS_NOT_REGISTERED_ERROR")) {
          return { ok: false, reason: "not-applied" };
        }
        return { ok: false, reason: "invalid-response" };
      }

      const header = json?.response?.header;
      if (header && header.resultCode && header.resultCode !== "00") {
        return { ok: false, reason: header.resultMsg || "api-error" };
      }

      const items = json?.response?.body?.items || [];
      if (!items.length) return { ok: false, reason: "empty-response" };

      // 측정값이 "-"(결측)이거나 비어 있으면 무효 처리 (점검/장애 시 이렇게 옴)
      const valid = (v) => v !== undefined && v !== null && v !== "" && v !== "-";
      const hasData = (it) => valid(it.pm10Value) || valid(it.pm25Value);

      // 1순위: 현재 위치의 구 이름과 일치하는 측정소 (예: "강남구")
      // 2순위: 유효한 측정값이 있는 첫 측정소  3순위: 첫 항목
      let rep = null;
      if (preferredStation) {
        rep = items.find((it) => it.stationName === preferredStation && hasData(it));
      }
      const fallback = !rep; // 다른 측정소로 대체됐는지 표시용
      if (!rep) rep = items.find(hasData) || items[0];

      const out = {
        ok: true,
        stationName: rep.stationName,
        isFallbackStation: !!(preferredStation && fallback),
        pm10: valid(rep.pm10Value) ? rep.pm10Value : null,
        pm25: valid(rep.pm25Value) ? rep.pm25Value : null,
        grade10: valid(rep.pm10Grade1h) ? rep.pm10Grade1h : (valid(rep.pm10Grade) ? rep.pm10Grade : null),
        grade25: valid(rep.pm25Grade1h) ? rep.pm25Grade1h : (valid(rep.pm25Grade) ? rep.pm25Grade : null),
        dataTime: rep.dataTime,
      };
      cacheSet(cacheKey, out);
      return out;
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  return {
    reasonLabel,
    getWeatherWarningStatus,
    getWeatherWarningList,
    getShortForecast,
    getUltraSrtNcst,
    getEmergencyBeds,
    getEmergencyOrgList,
    getAedList,
    getAirQuality,
    getComplaintSimilarCases,
    getComplaintTodayIssues,
  };
})();

window.olaApi = olaApi;
