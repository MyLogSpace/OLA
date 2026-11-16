/**
 * js/issue.js — pages/complaint.html(AI 민원 도우미) 전용 로직
 * 1) 입력한 민원 문구를 카테고리/담당기관 추천 + 민원 초안 생성
 *    - ① 키워드 규칙(빠름) → ② 벡터DB(js/embedding.js) 의미 검색 순으로 매칭.
 *      "골목이 너무 어두워요"처럼 키워드("가로등")가 그대로 없어도
 *      의미가 비슷하면 카테고리를 찾아냅니다.
 *    - 임베딩을 못 쓰는 환경에서는 기존 키워드 방식으로 자동 폴백.
 * 2) 국민신문고 민원분석정보(minSimilarInfo5) 실시간 API로 유사 민원 사례 조회
 * 3) 오늘의 민원 이슈(minTodayTopicInfo5) 전국 트렌드 표시
 *
 * ⚠️ matchCategory / classify 는 이번 업데이트로 async(Promise 반환)가 됐습니다.
 *    consult.html(insight.js) 쪽 호출부는 이미 await 처리돼 있습니다.
 */
(function () {
  // 카테고리 규칙: 키워드가 하나라도 포함되면 매칭 (우선순위 = 배열 순서)
  // examples: 벡터 검색용 예시 문장 — 키워드에 안 걸리는 자연스러운 표현을
  //           함께 임베딩해서 의미 매칭 정확도를 높입니다. (자유롭게 추가하세요)
  // url/urlLabel: 카테고리별로 바로 접수할 수 있는 외부 신고 사이트/앱 (있는 경우만)
  const CATEGORY_RULES = [
    {
      keywords: ["가로등", "신호등", "표지판", "포트홀", "도로 파손", "도로파손", "맨홀"],
      examples: ["골목이 너무 어두워요", "밤에 길이 캄캄해서 무서워요", "도로에 구멍이 파여 있어요", "길바닥이 움푹 꺼졌어요"],
      category: "도로·시설물",
      agency: "구청 시설관리과(도로/가로등 담당)",
      tip: "정확한 위치(도로명주소·인근 건물명)를 함께 적으면 처리가 빨라져요.",
      url: "https://www.safetyreport.go.kr/",
      urlLabel: "안전신문고 바로가기",
    },
    {
      keywords: ["불법주차", "불법 주정차", "불법주정차", "이중주차"],
      examples: ["인도에 차가 세워져 있어서 지나갈 수가 없어요", "횡단보도 앞에 차가 서 있어요", "소화전 앞에 차를 대놨어요"],
      category: "불법 주정차",
      agency: "구청 교통지도과 / 안전신문고 앱",
      tip: "안전신문고 앱에서 같은 위치·각도로 1분 이상 간격 사진 2장(차량번호 식별 가능하게)을 찍어 신고하면 현장 단속 없이 과태료가 부과돼요.",
      url: "https://www.safetyreport.go.kr/",
      urlLabel: "안전신문고 바로가기",
    },
    {
      keywords: ["층간소음", "공사 소음", "공사소음", "소음"],
      examples: ["윗집에서 쿵쿵거리는 소리가 나요", "밤마다 시끄러워서 잠을 못 자요", "옆 건물 공사 때문에 너무 시끄러워요"],
      category: "생활 소음",
      agency: "구청 환경과(생활소음) / 경찰 112(심야 소란)",
      tip: "소음 발생 시간대와 빈도를 기록해두면 중재 요청 시 도움이 됩니다.",
    },
    {
      keywords: ["쓰레기", "무단투기", "불법투기", "분리수거"],
      examples: ["골목에 누가 자꾸 봉투를 버리고 가요", "전봇대 밑에 쓰레기가 쌓여 있어요"],
      category: "쓰레기 무단투기",
      agency: "구청 청소행정과",
      tip: "무단투기 현장 사진이 있으면 과태료 부과 처리가 수월해집니다.",
      url: "https://www.safetyreport.go.kr/",
      urlLabel: "안전신문고 바로가기",
    },
    {
      keywords: ["대형폐기물", "폐가전", "폐가구"],
      examples: ["장롱을 버리고 싶은데 어떻게 해야 하나요", "이사하면서 침대를 버려야 해요"],
      category: "대형폐기물 배출",
      agency: "구청 청소행정과(배출 스티커 발급)",
      tip: "구청 홈페이지/앱에서 품목별 수수료를 확인하고 스티커를 발급받아 부착 후 배출하세요.",
      url: "https://www.gov.kr/",
      urlLabel: "정부24 바로가기",
    },
    {
      keywords: ["유기동물", "들개", "반려동물", "동물"],
      examples: ["길에 다친 강아지가 돌아다녀요", "고양이가 차에 치인 것 같아요"],
      category: "동물 관련",
      agency: "구청 동물보호팀",
      tip: "발견 위치와 사진이 있으면 포획·구조 대응이 빨라집니다.",
      url: "https://www.epeople.go.kr/",
      urlLabel: "국민신문고 바로가기",
    },
    {
      keywords: ["누수", "수도", "정전", "가스 냄새", "가스누출"],
      examples: ["집에 물이 안 나와요", "천장에서 물이 새요", "전기가 갑자기 나갔어요"],
      category: "긴급 시설 이상",
      agency: "가스 냄새는 즉시 지역 도시가스사(또는 119), 수도는 상수도사업본부, 정전은 한국전력공사(국번없이 123)",
      tip: "가스 냄새나 감전 위험이 있는 상황은 민원 접수보다 즉시 신고가 우선입니다.",
    },
    {
      keywords: ["벤치", "놀이터", "안전펜스", "파손"],
      examples: ["놀이터 그네가 부서져 있어요", "공원 의자가 망가졌어요", "난간이 흔들려서 위험해요"],
      category: "공공시설물 파손",
      agency: "구청 시설관리과 / 공원녹지과",
      tip: "파손 정도가 심해 안전사고 위험이 있다면 사진과 함께 위급 상황임을 명시하세요.",
      url: "https://www.safetyreport.go.kr/",
      urlLabel: "안전신문고 바로가기",
    },
  ];

  const DEFAULT_RULE = {
    category: "일반 민원",
    agency: "구청 종합민원실 (또는 국민신문고 www.epeople.go.kr)",
    tip: "구체적인 위치·시간·상황을 적을수록 담당 부서 배정이 정확해집니다.",
    url: "https://www.epeople.go.kr/",
    urlLabel: "국민신문고 바로가기",
  };

  // 공백 유무·대소문자 차이로 매칭이 실패하는 걸 줄이기 위한 정규화
  // 예: "가스냄새나요"(공백 없음)와 키워드 "가스 냄새"(공백 있음)를 같은 것으로 인식
  function normalize(s) {
    return (s || "").replace(/\s+/g, "").toLowerCase();
  }

  // ===========================================================================
  // 벡터DB(임베딩) 카테고리 매칭 — js/embedding.js(olaEmbedding) 사용
  // ===========================================================================
  const CAT_INDEX_NAME = "complaint-cats-v1";
  // 이 점수(코사인 유사도) 미만이면 "카테고리에 없는 민원"으로 판단.
  // 카테고리 텍스트가 짧아서 KB보다 살짝 낮게 잡음. 오탐이 보이면 올리세요.
  const CAT_MIN_SCORE = 0.32;

  function catIndexItems() {
    return CATEGORY_RULES.map((r) => ({
      id: r.category,
      text:
        r.category +
        " ; " +
        r.keywords.join(", ") +
        (r.examples && r.examples.length ? " ; " + r.examples.join(" / ") : ""),
    }));
  }

  let catIndexPromise = null;
  function ensureCatIndex() {
    if (!catIndexPromise) {
      catIndexPromise = olaEmbedding.buildIndex(CAT_INDEX_NAME, catIndexItems()).catch((e) => {
        catIndexPromise = null; // 실패하면 다음에 다시 시도
        throw e;
      });
    }
    return catIndexPromise;
  }

  // (구) 키워드 매칭 — 빠른 선매칭 + 임베딩 불가 환경 폴백용으로 유지
  function matchCategorySync(text) {
    const norm = normalize(text);
    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.some((k) => norm.includes(normalize(k)))) return rule;
    }
    return null;
  }

  // 카테고리 규칙에 실제로 매칭된 경우에만 rule을 반환 (매칭 안되면 null)
  // consult.html 쪽에서 "이게 민원성 질문이 맞는지" 판단할 때 씀
  // ① 키워드 정확 매칭 → ② 벡터(의미) 검색 순. async가 됐으니 await로 호출하세요.
  async function matchCategory(text) {
    const hit = matchCategorySync(text);
    if (hit) return hit;

    if (!(window.olaEmbedding && olaEmbedding.isAvailable())) return null;
    try {
      await ensureCatIndex();
      const hits = await olaEmbedding.search(CAT_INDEX_NAME, text, 1);
      if (!hits.length || hits[0].score < CAT_MIN_SCORE) return null;
      return CATEGORY_RULES.find((r) => r.category === hits[0].id) || null;
    } catch (e) {
      console.warn("[issue] 벡터 카테고리 매칭 실패 → 키워드 결과만 사용:", e);
      return null;
    }
  }

  // complaint.html의 "AI로 민원 자동 작성하기"는 뭘 입력하든 결과를 보여줘야 하므로
  // 매칭 안되면 DEFAULT_RULE로 폴백
  async function classify(text) {
    return (await matchCategory(text)) || DEFAULT_RULE;
  }

  function buildDraft(text, rule) {
    return `[민원 초안 - ${rule.category}]\n안녕하세요. 아래와 같은 사항의 확인 및 조치를 요청드립니다.\n\n▶ 민원 내용\n${text}\n\n▶ 추천 담당 기관\n${rule.agency}\n\n빠른 확인과 조치를 부탁드립니다. 감사합니다.`;
  }

  async function getSimilarCases(text, count = 3) {
    return window.olaApi.getComplaintSimilarCases(text, count).catch(() => ({ ok: false }));
  }

  // 유사 민원 사례를 지정한 컨테이너에 렌더링. runAnalysis(텍스트 분석)와
  // js/complaint-image.js(사진 제보 분석)가 동일한 렌더링 로직을 공유해서,
  // 사진으로 신고할 때도 이전 텍스트 분석 결과가 그대로 남아있는 문제 없이
  // 이번 신고 내용 기준으로 유사 사례가 새로 채워지도록 함.
  async function loadSimilarInto(container, text, count = 3) {
    if (!container) return;
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    container.innerHTML = `<p class="text-xs text-gray-400">${t("complaint.similarSearching")}</p>`;
    const res = await getSimilarCases(text, count);

    if (!res.ok) {
      container.innerHTML = `<p class="text-xs text-gray-400">${
        res.reason === "no-api-key" ? t("complaint.similarNoApiKey") : t("complaint.similarLoadFailed")
      }</p>`;
      return;
    }
    if (!res.cases.length) {
      container.innerHTML = `<p class="text-xs text-gray-400">${t("complaint.similarNotFound")}</p>`;
      return;
    }
    container.innerHTML = res.cases
      .map(
        (c) => `
      <div class="bg-white p-3 rounded-lg border border-border text-xs">
        <p class="font-medium text-dark">${c.title || t("complaint.noTitle")}</p>
        <p class="text-gray-500 mt-1 line-clamp-2">${(c.content || "").slice(0, 80)}${(c.content || "").length > 80 ? "…" : ""}</p>
        <p class="text-gray-400 mt-1">${c.agency || ""} ${c.dept ? "· " + c.dept : ""}</p>
      </div>`
      )
      .join("");
  }

  // 카테고리에 연결된 외부 신고 기관 링크(resultAgencyLink)를 갱신/숨김.
  // runAnalysis와 js/complaint-image.js의 사진 제보 적용이 공유해서, 이전에
  // 분석하던 다른 카테고리의 링크가 그대로 남아 엉뚱한 곳으로 연결되는 문제 없이
  // 이번 카테고리 기준으로 항상 최신 상태로 갱신됨.
  function updateAgencyLink(agencyLinkEl, rule) {
    if (!agencyLinkEl) return;
    if (rule && rule.url) {
      agencyLinkEl.href = rule.url;
      const span = agencyLinkEl.querySelector("span");
      if (span) span.innerText = rule.urlLabel || (window.olaI18n ? olaI18n.t("complaint.goTo") : "바로가기");
      agencyLinkEl.classList.remove("hidden");
      agencyLinkEl.classList.add("flex");
    } else {
      agencyLinkEl.removeAttribute("href");
      agencyLinkEl.classList.add("hidden");
      agencyLinkEl.classList.remove("flex");
    }
  }

  async function runAnalysis() {
    const textarea = document.getElementById("complaintInput");
    const resultBox = document.getElementById("analysisResult");
    const agencyEl = document.getElementById("resultAgency");
    const draftEl = document.getElementById("resultDraft");
    const similarEl = document.getElementById("resultSimilar");
    const agencyLinkEl = document.getElementById("resultAgencyLink");
    if (!resultBox) return;

    const text = (textarea && textarea.value.trim()) || "";
    if (!text) return;

    // 벡터 매칭은 API 호출이 껴서 잠깐 걸릴 수 있으니 분석 중 표시
    agencyEl.innerText = window.olaI18n ? olaI18n.t("complaint.analyzing") : "분석 중…";
    if (agencyLinkEl) agencyLinkEl.classList.add("hidden");
    resultBox.querySelector("#analysisResultInner").classList.remove("opacity-50");

    const rule = await classify(text);
    agencyEl.innerText = `${rule.category} · ${rule.agency}`;
    draftEl.innerText = buildDraft(text, rule);

    // ▼ 카테고리에 연결된 외부 신고 기관 링크가 있으면 노출 (없으면 숨김/초기화)
    updateAgencyLink(agencyLinkEl, rule);

    await loadSimilarInto(similarEl, text, 3);
  }

  async function loadTodayIssues() {
    const container = document.getElementById("today-issues");
    if (!container) return; // complaint.html 전용 섹션이 없는 페이지(예: consult.html)에서는 스킵
    const statusEl = document.getElementById("complaint-api-status");
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    if (!window.OLA_CONFIG.hasApiKey()) {
      if (statusEl) statusEl.textContent = t("complaint.apiKeyNotice");
    }
    const res = await window.olaApi.getComplaintTodayIssues(6).catch(() => ({ ok: false }));
    if (!res.ok) {
      container.innerHTML = `<p class="text-sm text-gray-400">${
        res.reason === "no-api-key" ? t("complaint.todayIssuesApiKeyNeeded") : t("complaint.todayIssuesLoadFailed")
      }</p>`;
      return;
    }
    if (!res.topics.length) {
      container.innerHTML = `<p class="text-sm text-gray-400">${t("complaint.todayIssuesEmpty")}</p>`;
      return;
    }
    container.innerHTML = res.topics
      .map(
        (t) => `<span class="text-sm px-3 py-1.5 bg-secondary bg-opacity-30 text-primary rounded-full font-medium">#${t.rank} ${t.topic} (${t.count}건)</span>`
      )
      .join("");
  }

  // "텍스트 복사" 버튼 클릭 시 민원 초안을 클립보드에 복사
  async function copyDraft() {
    const draftEl = document.getElementById("resultDraft");
    const btn = document.getElementById("copyDraftBtn");
    const text = (draftEl && draftEl.innerText.trim()) || "";
    if (!text || text === "-") return;

    const showCopied = () => {
      if (!btn) return;
      const label = btn.querySelector("span");
      const original = label ? label.innerText : null;
      if (label) label.innerText = window.olaI18n ? olaI18n.t("complaint.copied") : "복사됨";
      btn.disabled = true;
      setTimeout(() => {
        if (label && original) label.innerText = original;
        btn.disabled = false;
      }, 1500);
    };

    try {
      await navigator.clipboard.writeText(text);
      showCopied();
    } catch (e) {
      // 클립보드 API를 못 쓰는 환경(구형 브라우저·비보안 컨텍스트) 대비 폴백
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand("copy");
        showCopied();
      } catch (e2) {
        console.warn("[issue] 복사 실패:", e2);
      }
      document.body.removeChild(temp);
    }
  }

  function init() {
    const btn = document.getElementById("analyzeBtn");
    if (btn) btn.addEventListener("click", runAnalysis);

    const copyBtn = document.getElementById("copyDraftBtn");
    if (copyBtn) copyBtn.addEventListener("click", copyDraft);

    // 페이지 로드 직후 카테고리 벡터 인덱스를 미리 만들어둠 (1회, localStorage 캐시)
    // 실패해도 키워드 매칭으로 폴백되므로 무시
    if (window.olaEmbedding && olaEmbedding.isAvailable()) {
      ensureCatIndex().catch(() => {});
    }

    document.querySelectorAll(".complaint-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.getElementById("complaintInput").value = chip.innerText;
        runAnalysis();
      });
    });

    // AI 상담(consult.html)의 "민원 페이지에서 바로 접수하기" 링크로 넘어온 경우
    // ?text=... 값을 입력창에 채우고 바로 분석을 실행한다.
    const textarea = document.getElementById("complaintInput");
    const prefill = new URLSearchParams(location.search).get("text");
    if (textarea && prefill) {
      textarea.value = prefill;
      runAnalysis();
    }

    loadTodayIssues();
  }

  document.addEventListener("DOMContentLoaded", init);

  // consult.html(js/insight.js) 및 js/complaint-image.js(사진 제보)에서 재사용할 수 있도록 공개
  // ⚠️ matchCategory / classify 는 이제 async(Promise 반환)입니다.
  window.olaIssue = {
    matchCategory,
    matchCategorySync,
    classify,
    buildDraft,
    getSimilarCases,
    copyDraft,
    loadSimilarInto,
    updateAgencyLink,
  };
})();
