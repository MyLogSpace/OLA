/**
 * js/briefing-text.js — index.html("오늘의 올라 브리핑")과 pages/briefing.html
 * (AI 행동 가이드 히어로 카드)이 똑같은 문장 스타일을 쓰도록 공유하는 모듈.
 * 실데이터만으로 만드는 결정론적 문장이라 새로고침해도 데이터가 같으면 항상 같은 문장이 나옵니다.
 */
(function () {
  const SKY_KEY = { "1": "sky.clear", "3": "sky.partlyCloudy", "4": "sky.cloudy" };
  const AIR_KEY = { "1": "air.good", "2": "air.moderate", "3": "air.bad", "4": "air.veryBad" };

  function tr(key, vars) {
    return window.olaI18n ? olaI18n.t(key, vars) : key;
  }

  function airGradeText(grade) {
    const key = AIR_KEY[String(grade)];
    return key ? tr(key) : null;
  }

  // "전날 대비" 비교 — 별도 과거 관측 API 없이, 우리가 직접 확인했던 최고기온을
  // 브라우저(localStorage)에 지역별로 기록해뒀다가 다음 확인 때 비교합니다.
  // 그래서 이 브라우저로 처음 켜보는 날이거나 기록이 없으면 비교 문장은 안 나옵니다(추측 금지).
  const HISTORY_KEY = "ola-weather-history";

  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function writeHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      /* 저장 실패(용량 등)는 무시 — 비교 문구가 안 나올 뿐 나머지 브리핑엔 영향 없음 */
    }
  }

  function daysBetween(fromDateStr, toDateStr) {
    const toDate = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00`);
    return Math.round((toDate(toDateStr) - toDate(fromDateStr)) / (1000 * 60 * 60 * 24));
  }

  function buildCompareLine(regionLabel, forecast) {
    if (!forecast || !forecast.fcstDate || forecast.tmx === undefined) return "";
    const todayDate = forecast.fcstDate;
    const todayTmx = Number(forecast.tmx);
    if (Number.isNaN(todayTmx)) return "";

    const history = readHistory();
    const entry = history[regionLabel] || {};

    // 오늘 처음 확인하는 거라면, 그동안 기록해둔 "오늘 값"을 이제 비교 기준(lastDate/lastTmx)으로 승격
    if (entry.recordedDate && entry.recordedDate !== todayDate) {
      entry.lastDate = entry.recordedDate;
      entry.lastTmx = entry.recordedTmx;
    }

    let compareLine = "";
    if (entry.lastDate && entry.lastDate !== todayDate && entry.lastTmx !== undefined) {
      const diff = Math.round((todayTmx - Number(entry.lastTmx)) * 10) / 10;
      const gapDays = daysBetween(entry.lastDate, todayDate);
      const refLabel = gapDays === 1
        ? tr("common.yesterday")
        : tr("briefing.lastCheck", { md: `${entry.lastDate.slice(4, 6)}.${entry.lastDate.slice(6, 8)}` });
      if (diff > 0) compareLine = tr("briefing.compareHigher", { ref: refLabel, diff });
      else if (diff < 0) compareLine = tr("briefing.compareLower", { ref: refLabel, diff: Math.abs(diff) });
      else compareLine = tr("briefing.compareSame", { ref: refLabel });
    }

    entry.recordedDate = todayDate;
    entry.recordedTmx = todayTmx;
    history[regionLabel] = entry;
    writeHistory(history);

    return compareLine;
  }

  // weatherLabelRaw: 기상청 API 원문(항상 한국어) — 폭염/한파/대설 등 종류 판별은 이 값으로 합니다.
  // weatherLabel(번역본)은 문장에 그대로 넣을 표시용 텍스트입니다.
  // weatherState: "active" | "none" | "failed" (미지정 시 weatherLabel 문자열로 하위호환 추정)
  function buildBriefingText({ regionLabel, forecast, weatherLabel, weatherLabelRaw, weatherState, air }) {
    const parts = [];
    if (forecast) {
      const skyKey = SKY_KEY[String(forecast.sky)];
      if (skyKey) parts.push(tr(skyKey));
      if (forecast.tmp !== undefined) parts.push(tr("briefing.tempPart", { tmp: forecast.tmp }));
    }
    const airText = air ? airGradeText(air.grade10) : null;
    if (airText) parts.push(tr("briefing.dustPart", { grade: airText }));

    const factLine = parts.length
      ? tr("briefing.factLine", { region: regionLabel, parts: parts.join(", ") })
      : tr("briefing.factLineLoading", { region: regionLabel });

    // 오늘의 최저/최고기온 (기상청 단기예보 TMN/TMX 기준)
    let tempRangeLine = "";
    if (forecast && (forecast.tmn !== undefined || forecast.tmx !== undefined)) {
      const rangeParts = [];
      if (forecast.tmn !== undefined) rangeParts.push(tr("briefing.tempMinPart", { tmn: forecast.tmn }));
      if (forecast.tmx !== undefined) rangeParts.push(tr("briefing.tempMaxPart", { tmx: forecast.tmx }));
      tempRangeLine = tr("briefing.tempRangeLine", { range: rangeParts.join(", ") });
    }

    // 전날 대비 최고기온 비교 (우리가 직접 기록해둔 값과만 비교 — 새 API 없이도 동작)
    const compareLine = buildCompareLine(regionLabel, forecast);

    // 특보 조회 자체가 실패한 경우엔 "특보 없음"이라고 단정하지 않고 조용히 넘어감 (모르는 걸 안다고 하지 않기 위함)
    // weatherState가 없으면(하위호환) 번역 전 텍스트가 없어 판별이 어려우므로 "active"로 간주해 표시는 하되,
    // 종류 판별용 weatherLabelRaw도 없으면 폭염/한파 감지는 건너뜁니다.
    const state = weatherState || (weatherLabel ? "active" : "none");
    let warnLine = "";
    if (state === "active" && weatherLabel) {
      warnLine = tr("briefing.warnActive", { label: weatherLabel });
    } else if (state === "none") {
      warnLine = tr("briefing.warnNone");
    }
    // state === "failed" 인 경우엔 warnLine을 비워둠 (모르는 걸 안다고 하지 않기 위함)

    // 습도가 높으면 실제 기온보다 체감온도가 높게 느껴질 수 있음을 안내
    const reh = forecast ? Number(forecast.reh) : NaN;
    const feelsLikeLine = !Number.isNaN(reh) && reh >= 70 ? tr("briefing.feelsLike", { reh: forecast.reh }) : "";

    // 실시간 예보/특보 기반 행동 추천 — 해당하는 조건마다 각각 한 줄씩 추가(서로 안 겹치는 항목이면 동시에 표시)
    // forecast 자체가 없을 때도(단기예보 API 실패 등) 문장이 너무 짧아지지 않도록 실패 사실을 알리는
    // 문구로 대체함 (숫자를 지어내지 않음)
    const adviceLines = [];
    if (forecast) {
      const pty = Number(forecast.pty);
      const pop = Number(forecast.pop);
      const tmp = Number(forecast.tmp);
      const rawLabel = weatherLabelRaw || "";
      const isHeatWarning = rawLabel.includes("폭염");
      const isColdWarning = rawLabel.includes("한파") || rawLabel.includes("대설");

      // 폭염(특보 활성 또는 고온) — 수분 섭취·야외활동 자제 안내
      if (isHeatWarning || (!Number.isNaN(tmp) && tmp >= 33)) {
        adviceLines.push(tr("briefing.adviceHeat"));
      }
      // 한파/대설 — 방한 안내
      if (isColdWarning || (!Number.isNaN(tmp) && tmp <= 0)) {
        adviceLines.push(tr("briefing.adviceCold"));
      }

      // 비/눈 — 지금 내리는 중인지, 오늘 중 시작 예정인지, 확률만 높은지 구분해서 안내
      if (pty === 1 || pty === 4) {
        adviceLines.push(tr("briefing.adviceRainNow"));
      } else if (pty === 2 || pty === 3) {
        adviceLines.push(tr("briefing.adviceSnowNow"));
      } else if (forecast.rainStartTime) {
        const hh = Number(forecast.rainStartTime.slice(0, 2));
        adviceLines.push(tr("briefing.adviceRainStart", { hh }));
      } else if (!Number.isNaN(pop) && pop >= 60) {
        adviceLines.push(tr("briefing.advicePopHigh", { pop: forecast.pop }));
      }
    }

    // 미세먼지가 나쁨 이상이면 마스크 착용 안내 (forecast 성공 여부와 무관하게, air 데이터만 있으면 표시)
    const airGrade = air ? Number(air.grade10) : NaN;
    if (!Number.isNaN(airGrade) && airGrade >= 3) {
      adviceLines.push(tr("briefing.adviceDustMask", { grade: airGradeText(air.grade10) }));
    }

    if (!adviceLines.length) {
      if (forecast) adviceLines.push(tr("briefing.adviceFallbackOk"));
      else adviceLines.push(tr("briefing.adviceFallbackFail"));
    }

    // 문장이 끝날 때마다 줄바꿈되도록 <br>로 이어붙임 (표시하는 쪽에서 innerHTML로 넣어야 함)
    return [factLine, tempRangeLine, compareLine, warnLine, feelsLikeLine, ...adviceLines]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("<br>");
  }

  window.olaBuildBriefingText = buildBriefingText;
  window.olaBuildCompareLine = buildCompareLine;
})();
