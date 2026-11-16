/**
 * js/insight.js — pages/consult.html(AI 생활 상담) 전용 로직
 * KB(지식베이스)를 벡터DB(js/embedding.js, OpenAI 임베딩 + 코사인 유사도)로
 * 검색합니다. 키워드가 정확히 일치하지 않아도 의미가 비슷하면 매칭됩니다.
 * - 임베딩을 못 쓰는 환경(키/프록시 미설정, 네트워크 오류)에서는
 *   기존 키워드 매칭 방식으로 자동 폴백합니다.
 * - 생활 안전·긴급상황 팁 (전기/폐기물/대중교통/개인정보 등)
 * - OLA 앱 자체 기능 안내 (생활안전/행동요령/민원 페이지, 반경 설정 등)
 */
(function () {
  const KB = [
    {
      id: "spark",
      urgent: true, // 민원 카테고리 체크보다 항상 우선 — 화재 위험은 지금 당장의 행동요령이 중요
      keywords: ["스파크", "누전", "전기 화재", "콘센트", "전기 불꽃", "전기불꽃", "타는 냄새"],
      answer:
        "이미 불이 붙었거나 연기·타는 냄새가 난다면 <b>즉시 119(소방서)</b>에 신고하세요.<br><br>" +
        "아직 불꽃 없이 스파크만 튀는 상태라면, 우선 해당 콘센트나 차단기를 내린 뒤 상황에 따라 연락처가 달라요.<br>" +
        "· 전신주·계량기 등 <b>집 밖 전기설비</b> 문제 → 한국전력공사 국번없이 <b>123</b><br>" +
        "· <b>집 안 배선·콘센트</b> 문제 → 전기안전공사(1588-7500) 또는 전기 기사, 공동주택이면 관리사무소<br><br>" +
        "화재로 번질 위험이 조금이라도 있다면 망설이지 말고 119가 우선입니다.",
    },
    {
      id: "bulky-waste",
      keywords: ["대형폐기물", "폐가전", "폐가구", "가구 버리", "냉장고 버리", "장롱 버리"],
      answer:
        "대형폐기물은 이렇게 배출하시면 돼요.<br><br>" +
        "1) 관할 <b>구청 홈페이지/앱</b>(대형생활폐기물 배출 예약 시스템)에서 신고<br>" +
        "2) 품목별 <b>수수료 결제</b> 후 신고필증(스티커) 발급<br>" +
        "3) 스티커를 폐기물에 <b>부착</b><br>" +
        "4) <b>배출일 전날 저녁~당일 이른 아침</b> 사이에 지정된 장소(대개 집 앞 또는 배출장)에 내놓기<br><br>" +
        "정확한 배출 장소·요일은 자치구마다 달라서 '(우리 동네) 대형폐기물 배출'로 검색하거나 구청 청소행정과에 문의하시면 확실합니다.",
    },
    {
      id: "commute-route",
      keywords: ["출근", "회사 갈 때", "경로", "길 안내", "길찾기"],
      answer:
        "죄송하지만 지금 버전에는 실시간 길찾기·경로 추천 기능은 아직 없어요.<br><br>" +
        "대신 <a href='safety.html' class='text-primary underline'>생활안전 페이지</a>에서 오늘 발효된 기상특보나 강수 예보를 확인할 수 있으니, 우산이 필요한지 정도는 참고하실 수 있어요.<br>" +
        "정확한 경로는 카카오맵, 네이버지도, 지하철 앱 등 길찾기 서비스를 이용해주세요.",
    },
    {
      id: "subway-arson",
      urgent: true,
      keywords: ["지하철", "불을 지르", "방화", "라이터 꺼내", "위협"],
      answer:
        "매우 위급한 상황입니다. 침착하게 아래 순서로 대응하세요.<br><br>" +
        "1) 가능하면 즉시 그 자리를 벗어나 <b>다른 칸이나 승강장</b>으로 이동<br>" +
        "2) 객차의 <b>비상통화장치(SOS 버튼)</b> 또는 비상 인터폰으로 기관사·관제센터에 즉시 알리기<br>" +
        "3) <b>112(경찰)</b> 또는 <b>119(소방)</b>에 신고 — 통화가 어려우면 112/119 <b>문자신고</b>도 가능<br>" +
        "4) 무리하게 제지하지 말고 주변 승객에게도 상황을 알려 함께 대피 동선 확보<br>" +
        "5) 화재로 번지면 객차 양쪽 끝 <b>비상 손잡이(코크)</b>로 문을 수동 개방 가능<br><br>" +
        "본인의 안전 확보가 최우선입니다.",
    },
    {
      id: "phone-wipe",
      keywords: ["공기계", "초기화", "핸드폰 데이터", "완전 삭제", "폰 데이터 지우"],
      answer:
        "일반 초기화만으로는 복구 프로그램으로 일부 복원될 수 있어서, 아래 순서를 권장해요.<br><br>" +
        "<b>[안드로이드]</b> 설정 → 보안(개인정보 보호) → 기기 암호화 확인 → 구글 계정 로그아웃 → 설정 → 일반관리 → 초기화 → '모든 데이터 초기화'. 암호화된 상태에서 초기화하면 암호화 키가 사라져 사실상 복구가 불가능해집니다.<br><br>" +
        "<b>[아이폰]</b> 설정 → Apple ID → 로그아웃(찾기 기능 끄기) → 설정 → 일반 → 전송 또는 iPhone 재설정 → '모든 콘텐츠 및 설정 지우기'. iOS는 기본적으로 강력 암호화가 걸려 있어 이 과정만으로도 복구가 사실상 불가능해요.<br><br>" +
        "더 확실히 하고 싶다면 통신사 대리점·제조사 서비스센터의 완전 초기화 서비스를 이용하시면 됩니다.",
    },
    {
      id: "noise",
      keywords: ["층간소음", "윗집 소음", "이웃 소음"],
      answer:
        "먼저 관리사무소나 층간소음 이웃사이센터(1661-2642)에 중재를 요청하는 방법이 있어요. 직접 항의하기보다 기록(소음 발생 시간·빈도)을 남겨두고 관리사무소를 통해 전달하는 게 갈등을 줄이는 데 도움이 됩니다. 야간에 소음이 심하고 위협적으로 느껴진다면 112에 신고하셔도 됩니다.",
    },
    {
      id: "gas-leak",
      urgent: true, // 민원 "긴급 시설 이상" 카테고리랑 키워드가 겹치지만, 즉시 행동요령이 중요해서 KB가 우선함
      keywords: ["가스 냄새", "가스누출", "가스 새는"],
      answer:
        "가스 냄새가 난다면 즉시 <b>창문을 열어 환기</b>하고, 전기 스위치나 콘센트를 만지지 마세요(스파크 위험). 밸브를 잠글 수 있으면 잠근 뒤 밖으로 나가서 도시가스사(지역별 상담전화) 또는 <b>119</b>에 신고하세요. 폭발 위험이 있으니 실내에서 지체하지 않는 게 중요합니다.",
    },
    {
      id: "phishing",
      keywords: ["보이스피싱", "사기 전화", "스미싱"],
      answer:
        "낯선 번호로 금융·수사기관을 사칭하며 송금이나 개인정보를 요구하면 대부분 사기입니다. 절대 즉석에서 송금하거나 링크를 누르지 말고 전화를 끊은 뒤, 해당 기관 대표번호로 직접 확인하세요. 이미 정보를 알려줬거나 송금했다면 <b>112</b> 또는 금융감독원 <b>1332</b>에 즉시 신고해 계좌 지급정지를 요청하세요.",
    },
    // --- OLA 앱 기능 안내 ---
    {
      id: "app-safety",
      keywords: ["생활안전이 뭐", "생활안전 페이지", "안전도 어떻게", "안전도 계산"],
      answer:
        "생활안전 페이지에서는 지역을 선택하면 <b>종합 안전도 점수</b>(범죄지수·기상리스크·의료/대피 인프라 종합), <b>자치구 범죄 유형별 통계</b>, <b>서울 25개구 위험지수 랭킹</b>, 실시간 <b>기상특보</b>, 반경 내 <b>대피시설</b> 목록을 볼 수 있어요. <a href='safety.html' class='text-primary underline'>생활안전 페이지로 이동</a>",
    },
    {
      id: "app-emergency",
      keywords: ["응급 페이지", "응급실 혼잡도", "aed 어디", "AED 어디", "응급실 어디"],
      answer:
        "응급 페이지에서는 지역/반경을 선택하면 <b>실시간 응급실 현황</b>(가용 병상, 구급차 여부), <b>실시간 AED 위치</b>, 반경 내 <b>병원 검색</b>, 그리고 CPR·기도이물질 등 <b>응급 행동요령</b>을 확인할 수 있어요. <a href='emergency.html' class='text-primary underline'>응급 페이지로 이동</a>",
    },
    {
      id: "app-guide",
      keywords: ["행동요령 페이지", "기상특보 어디", "날씨 정보", "재난 행동요령"],
      answer:
        "행동요령 페이지에서는 자연재난·사회재난·생활안전·비상대비로 나뉜 <b>재난 유형별 국민행동요령</b>(호우·태풍·지진 등)을 확인할 수 있고, 실시간 <b>단기예보·기상특보</b>는 생활안전 페이지에서, 반경 내 <b>대피시설</b>은 안전지도 페이지에서 볼 수 있어요. <a href='emergency.html' class='text-primary underline'>행동요령 페이지로 이동</a>",
    },
    {
      id: "app-complaint",
      keywords: ["민원 어떻게", "민원 페이지", "민원 넣는"],
      answer:
        "민원 페이지에서 민원 내용을 입력하면 AI가 <b>담당 기관을 추천</b>하고 <b>민원 초안</b>을 작성해주며, 국민신문고의 <b>실시간 유사 민원 사례</b>도 함께 보여줘요. <a href='complaint.html' class='text-primary underline'>민원 페이지로 이동</a>",
    },
    {
      id: "app-radius",
      keywords: ["반경 설정", "반경 어떻게 바꿔", "반경 바꾸는"],
      answer:
        "마이페이지(MY)의 '위치 기반 설정'에서 0.5~5km 중 원하는 반경을 선택하면, 홈·브리핑·응급 페이지가 전부 그 반경을 기본값으로 사용해요. <a href='mypage.html' class='text-primary underline'>마이페이지로 이동</a>",
    },
    {
      // 개별 페이지 질문(app-safety 등)보다 점수가 낮게 나오도록 뒤쪽에 배치.
      // "생활안전 페이지가 뭐야"처럼 특정 페이지를 짚은 질문은 위의 더 구체적인
      // keywords가 매칭돼서 이 항목보다 우선함.
      id: "app-intro",
      keywords: [
        "이 사이트", "이 앱", "이사이트", "이앱",
        "ola가 뭐", "올라가 뭐", "ola는 뭐",
        "여기 뭐 하는", "여기서 뭐 할 수", "무슨 기능", "뭐하는 서비스", "뭐하는 앱", "뭐하는 곳",
      ],
      answer:
        "OLA는 서울시 생활안전 통합 플랫폼이에요. 지역을 선택하면 아래 정보를 실시간으로 볼 수 있어요.<br><br>" +
        "· <a href='safety.html' class='text-primary underline'>생활안전</a> — 종합 안전도 점수, 범죄 통계, 기상특보<br>" +
        "· <a href='emergency.html' class='text-primary underline'>행동요령</a> — 자연재난·사회재난·생활안전·비상대비별 국민행동요령<br>" +
        "· <a href='complaint.html' class='text-primary underline'>민원</a> — AI 담당기관 추천 + 국민신문고 실시간 유사사례<br>" +
        "· <b>지금 이 AI 상담</b> — 생활안전 팁은 물론 민원·날씨·미세먼지·AED/병원/대피소 위치까지 실시간으로 바로 물어보실 수 있어요.<br><br>" +
        "마이페이지에서 반경(0.5~5km)도 설정할 수 있어요.",
    },
  ];

  // ⚠️ 화면에 표시할 때는 이 상수를 직접 쓰지 말고 fallbackMsg()를 호출할 것 —
  // 언어 전환 후에도 그 시점의 언어로 나오게 하려면 메시지를 보낼 때마다 t()를 새로 호출해야 한다.
  const FALLBACK =
    "죄송해요, 정확히 이해하지 못했어요. 아래처럼 물어봐 주시겠어요?<br>" +
    "· 생활 안전 팁 (전기, 가스, 대형폐기물, 대중교통 위급상황, 개인정보 삭제 등)<br>" +
    "· OLA 기능 안내 (생활안전/행동요령/민원 페이지가 뭐하는 곳인지, 반경 설정 방법 등)";

  function fallbackMsg() {
    return window.olaI18n ? olaI18n.t("consult.fallback") : FALLBACK;
  }

  // 날씨/미세먼지 질문 감지용 — 실제로는 safety.html·briefing.js와 동일한
  // olaApi.getWeatherWarningStatus / getAirQuality 실시간 API를 태워서 답한다.
  const WEATHER_KEYWORDS = ["날씨", "기온", "비 와", "비와", "우산", "기상특보", "태풍", "폭염", "한파", "황사"];
  const DUST_KEYWORDS = ["미세먼지", "초미세먼지", "대기질", "공기질", "공기 안좋", "공기 나쁘"];

  // 응급시설 질문 감지용 — emergency.html과 동일한 olaApi.getAedList /
  // olaData.getNearbyHospitals / getNearbyShelters 실시간 데이터를 재사용한다.
  const AED_KEYWORDS = ["aed", "제세동기", "심장충격기"];
  const HOSPITAL_KEYWORDS = ["병원", "응급실", "응급의료"];
  const SHELTER_KEYWORDS = ["대피소", "대피 장소", "대피위치", "대피 위치", "민방위"];

  // 공백 유무·대소문자 차이로 매칭이 실패하는 걸 줄이기 위한 정규화 (issue.js와 동일한 방식)
  function normalize(s) {
    return (s || "").replace(/\s+/g, "").toLowerCase();
  }

  function stripHtml(s) {
    return (s || "").replace(/<[^>]+>/g, "");
  }

  // ===========================================================================
  // 벡터DB(임베딩) 검색 — js/embedding.js(olaEmbedding) 사용
  // ===========================================================================
  const KB_INDEX_NAME = "consult-kb-v1";
  // 이 점수(코사인 유사도) 미만이면 "KB에 없는 질문"으로 보고 OpenAI로 넘긴다.
  // text-embedding-3-small 기준: 관련 질문은 보통 0.4~0.7, 무관한 질문은 0.1~0.3 부근.
  const KB_MIN_SCORE = 0.35;

  // KB 항목을 임베딩할 텍스트: 키워드 + 답변 앞부분(HTML 제거)을 함께 넣어
  // "질문 표현"과 "답변 내용" 양쪽 모두에 의미적으로 걸리게 한다.
  function kbIndexItems() {
    return KB.map((e) => ({
      id: e.id,
      text: e.keywords.join(", ") + " ; " + stripHtml(e.answer).slice(0, 400),
    }));
  }

  let kbIndexPromise = null;
  function ensureKbIndex() {
    if (!kbIndexPromise) {
      kbIndexPromise = olaEmbedding.buildIndex(KB_INDEX_NAME, kbIndexItems()).catch((e) => {
        kbIndexPromise = null; // 실패하면 다음에 다시 시도할 수 있게
        throw e;
      });
    }
    return kbIndexPromise;
  }

  /**
   * 벡터 검색으로 KB entry를 찾는다. 임베딩 불가/실패/점수 미달이면 null.
   * (호출부는 결과가 null이면 키워드 매칭 결과를 그대로 쓰면 된다)
   */
  async function findKbMatchVector(text) {
    if (!window.olaEmbedding || !olaEmbedding.isAvailable()) return null;
    try {
      await ensureKbIndex();
      const hits = await olaEmbedding.search(KB_INDEX_NAME, text, 1);
      if (!hits.length || hits[0].score < KB_MIN_SCORE) return null;
      return KB.find((e) => e.id === hits[0].id) || null;
    } catch (e) {
      console.warn("[insight] 벡터 검색 실패 → 키워드 매칭으로 폴백:", e);
      return null;
    }
  }

  // 로컬 지식베이스에서 가장 잘 맞는 entry 전체를 반환한다 (매칭 실패 시 null).
  // .answer뿐 아니라 .urgent 여부도 호출부에서 참고할 수 있게 entry 객체째로 돌려준다.
  // ※ 임베딩을 못 쓰는 환경을 위한 폴백 + 정확히 일치하는 표현의 빠른 매칭용으로 유지.
  function findKbMatch(text) {
    const norm = normalize(text);
    let best = null;
    let bestScore = 0;
    for (const entry of KB) {
      const score = entry.keywords.reduce((acc, k) => acc + (norm.includes(normalize(k)) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best;
  }

  const insightJS = {
    init: function () {
      const chatBody = document.getElementById("chatBody");
      const input = document.getElementById("chatInput");
      const sendBtn = document.getElementById("chatSendBtn");
      if (!chatBody || !input || !sendBtn) return;

      // 언어 전환 시 대화를 초기화할 때 복원할, 페이지 로드 직후의 원본 채팅창(인사말+예시 칩) 마크업
      const initialChatBodyHtml = chatBody.innerHTML;

      // 페이지 로드 직후 KB 벡터 인덱스를 미리 만들어둬서(1회, localStorage 캐시)
      // 첫 질문에서 기다리는 시간을 줄인다. 실패해도 키워드 매칭으로 폴백되므로 무시.
      if (window.olaEmbedding && olaEmbedding.isAvailable()) {
        ensureKbIndex().catch(() => {});
      }

      const conversationHistory = [];

      const send = async () => {
        const text = input.value.trim();
        if (!text) return;
        this.appendUserMessage(chatBody, text);
        input.value = "";
        conversationHistory.push({ role: "user", content: text });

        // 사이드바에서 선택한 언어가 한국어가 아니면, 한국어 텍스트 기반인
        // KB/민원 카테고리/날씨·미세먼지/응급시설 매칭은 전부 건너뛰고 곧장 OpenAI로 보낸다.
        // (KB 답변 템플릿이 한국어라 화면이 언어별로 뒤섞여 보이는 걸 방지)
        const locale = window.olaI18n ? olaI18n.getLocale() : "ko";

        if (locale === "ko") {
        // KB 검색: ① 키워드 정확 매칭(빠름) → ② 없으면 벡터(의미) 검색.
        // "콘센트에서 번쩍거려요"처럼 키워드가 그대로 안 들어간 문장도 ②에서 걸린다.
        let kbMatch = findKbMatch(text);
        if (!kbMatch && window.olaEmbedding && olaEmbedding.isAvailable()) {
          const vecLoadingId = this.appendLoadingMessage(chatBody);
          kbMatch = await findKbMatchVector(text);
          this.removeMessage(chatBody, vecLoadingId);
        }

        // 즉시 행동이 필요한 KB 항목(전기 스파크/지하철 방화/가스누출 등)은
        // 민원 카테고리 체크보다 항상 먼저 확인해서 바로 답한다.
        if (kbMatch && kbMatch.urgent) {
          setTimeout(() => {
            this.appendAiMessage(chatBody, kbMatch.answer, "kb");
            conversationHistory.push({ role: "assistant", content: kbMatch.answer.replace(/<[^>]+>/g, "") });
          }, 300);
          return;
        }

        // 그 외에는 실제 민원 카테고리에 매칭되는지 먼저 확인 (issue.js가 로드돼 있고,
        // 가로등/불법주정차/소음/대형폐기물 등 카테고리 키워드에 걸리는 경우)
        // → KB와 겹치는 비긴급 주제(층간소음/대형폐기물 등)는 민원 쪽이 우선한다.
        if (window.olaIssue) {
          const matched = await Promise.resolve(window.olaIssue.matchCategory(text));
          if (matched) {
            const loadingId = this.appendLoadingMessage(chatBody);
            const similar = await window.olaIssue.getSimilarCases(text, 2);
            this.removeMessage(chatBody, loadingId);

            let html =
              `이건 <b>${escapeHtml(matched.category)}</b> 관련 민원으로 보여요.<br>` +
              `담당 기관: <b>${escapeHtml(matched.agency)}</b><br>` +
              `${escapeHtml(matched.tip)}`;

            if (similar.ok && similar.cases.length) {
              html +=
                `<br><br><b>비슷한 실제 접수 사례</b> (국민신문고 실시간 연동)<br>` +
                similar.cases
                  .slice(0, 2)
                  .map((c) => `· ${escapeHtml(c.title || "(제목 없음)")}`)
                  .join("<br>");
            }

            html += `<br><br><a href="complaint.html?text=${encodeURIComponent(text)}" class="text-primary underline">민원 페이지에서 바로 접수하기</a>`;

            this.appendAiMessage(chatBody, html, "complaint");
            conversationHistory.push({ role: "assistant", content: html.replace(/<[^>]+>/g, "") });
            return;
          }
        }

        // 민원 카테고리에도 안 걸렸는데 (비긴급) KB에는 매칭된 게 있었다면 그걸로 답변
        if (kbMatch) {
          setTimeout(() => {
            this.appendAiMessage(chatBody, kbMatch.answer, "kb");
            conversationHistory.push({ role: "assistant", content: kbMatch.answer.replace(/<[^>]+>/g, "") });
          }, 300);
          return;
        }

        // 날씨/미세먼지 질문 → 실제 실시간 API로 답변 (safety.html·briefing과 동일한 데이터 소스)
        const isWeatherQ = WEATHER_KEYWORDS.some((k) => normalize(text).includes(normalize(k)));
        const isDustQ = DUST_KEYWORDS.some((k) => normalize(text).includes(normalize(k)));
        if ((isWeatherQ || isDustQ) && window.olaApi && window.olaLocation) {
          const loadingId = this.appendLoadingMessage(chatBody);
          const { sido, gu } = window.olaLocation.getSidoGu();
          const parts = [];

          if (isWeatherQ) {
            const w = await window.olaApi.getWeatherWarningStatus(olaSidoShort(sido)).catch(() => ({ ok: false }));
            if (w.ok && w.active && w.lines.length) {
              parts.push(`현재 <b>${escapeHtml(gu)}</b>에 <b>${escapeHtml(w.lines[0])}</b> 특보가 발효 중이에요. 외출 시 주의하세요.`);
            } else if (w.ok) {
              parts.push(`현재 <b>${escapeHtml(gu)}</b>에 발효된 기상특보는 없어요.`);
            } else {
              parts.push(`기상특보 API가 아직 연동돼 있지 않아요. (config.js에 키 입력 필요)`);
            }
          }

          if (isDustQ) {
            const air = await window.olaApi.getAirQuality(olaSidoShort(sido)).catch(() => ({ ok: false }));
            if (air.ok) {
              const label = { "1": "좋음", "2": "보통", "3": "나쁨", "4": "매우나쁨" }[String(air.grade10)] || "정보 없음";
              parts.push(`<b>${escapeHtml(gu)}</b> 미세먼지는 현재 <b>${label}</b>${air.pm10 ? ` (PM10 ${air.pm10}µg/m³)` : ""}이에요.`);
            } else {
              parts.push(`미세먼지 API가 아직 연동돼 있지 않아요. (config.js에 키 입력 필요)`);
            }
          }

          parts.push(`더 자세한 정보는 <a href="safety.html" class="text-primary underline">생활안전 페이지</a>에서 확인할 수 있어요.`);

          this.removeMessage(chatBody, loadingId);
          const html = parts.join("<br>");
          this.appendAiMessage(chatBody, html, "weather");
          conversationHistory.push({ role: "assistant", content: html.replace(/<[^>]+>/g, "") });
          return;
        }

        // 응급시설(AED/병원/대피소) 질문 → 실제 실시간 데이터로 답변 (emergency.html과 동일한 데이터 소스)
        const wantsAed = AED_KEYWORDS.some((k) => normalize(text).includes(normalize(k)));
        const wantsHospital = HOSPITAL_KEYWORDS.some((k) => normalize(text).includes(normalize(k)));
        const wantsShelter = SHELTER_KEYWORDS.some((k) => normalize(text).includes(normalize(k)));

        if ((wantsAed || wantsHospital || wantsShelter) && window.olaData && window.olaApi && window.olaLocation) {
          const loadingId = this.appendLoadingMessage(chatBody);
          const regionKey = window.olaLocation.getKey();
          const { sido, gu } = window.olaLocation.getSidoGu();
          const radius = window.olaSettings ? window.olaSettings.getRadiusKm() : 1;
          const regionData = await window.olaData.getRegion(regionKey).catch(() => null);

          const parts = [];

          if (!regionData) {
            parts.push("지역 정보를 불러오지 못했어요. 사이드바에서 위치를 다시 설정해보시겠어요?");
          } else {
            if (wantsHospital) {
              const hospitals = await window.olaData
                .getNearbyHospitals(regionData.center.lat, regionData.center.lng, radius)
                .catch(() => []);
              parts.push(
                hospitals.length
                  ? `<b>${escapeHtml(gu)}</b> 반경 ${radius}km 내 병원 ${hospitals.length}곳이에요.<br>` +
                    hospitals
                      .slice(0, 3)
                      .map((h) => `· ${escapeHtml(h.name)} (${h.distanceKm.toFixed(1)}km)${h.tel ? " · " + escapeHtml(h.tel) : ""}`)
                      .join("<br>")
                  : `반경 ${radius}km 내 등록된 병원 정보를 찾지 못했어요.`
              );
            }

            if (wantsAed) {
              const aed = await window.olaApi.getAedList({ sido: regionData.sido, gugun: gu }).catch(() => ({ ok: false }));
              if (aed.ok && aed.items.length) {
                parts.push(
                  `<b>${escapeHtml(gu)}</b>에 등록된 AED ${aed.count}대 중 일부예요.<br>` +
                    aed.items
                      .slice(0, 3)
                      .map((a) => `· ${escapeHtml(a.buildPlace || a.org || "설치 위치 정보 없음")}${a.buildAddress ? " (" + escapeHtml(a.buildAddress) + ")" : ""}`)
                      .join("<br>")
                );
              } else if (aed.ok) {
                parts.push(`${escapeHtml(gu)}에 등록된 AED 정보를 찾지 못했어요.`);
              } else {
                parts.push(`AED API가 아직 연동돼 있지 않아요. (config.js에 키 입력 필요)`);
              }
            }

            if (wantsShelter) {
              const shelters = await window.olaData
                .getNearbyShelters(regionData.center.lat, regionData.center.lng, radius)
                .catch(() => []);
              parts.push(
                shelters.length
                  ? `<b>${escapeHtml(gu)}</b> 반경 ${radius}km 내 대피소 ${shelters.length}곳이에요.<br>` +
                    shelters
                      .slice(0, 3)
                      .map((s) => {
                        // shelters.json의 정확한 필드명을 확인 못해서 흔한 이름들을 순서대로 시도합니다.
                        // hospitals.json 컨벤션(name/address/lat/lng)을 우선 시도하고,
                        // 혹시 원본 CSV(민방위대피시설.csv) 컬럼명 그대로 가공됐을 경우도 대비해둠
                        const name = s.name || s.시설명 || "대피소";
                        const addr = s.address || s.도로명전체주소 || s.소재지전체주소 || "";
                        const capacity = s.capacity || s.최대수용인원;
                        return `· ${escapeHtml(String(name))}${addr ? " (" + escapeHtml(String(addr)) + ")" : ""} · ${s.distanceKm.toFixed(1)}km${capacity ? ` · 수용 ${capacity}명` : ""}`;
                      })
                      .join("<br>")
                  : `반경 ${radius}km 내 등록된 대피소 정보를 찾지 못했어요.`
              );
            }
          }

          parts.push(`지도로 보려면 <a href="emergency.html" class="text-primary underline">응급 페이지</a>에서 확인하세요.`);

          this.removeMessage(chatBody, loadingId);
          const html = parts.join("<br><br>");
          this.appendAiMessage(chatBody, html, "emergency");
          conversationHistory.push({ role: "assistant", content: html.replace(/<[^>]+>/g, "") });
          return;
        }
        } // locale === "ko" 블록 끝

        // 로컬 지식베이스/민원 카테고리/날씨·미세먼지/응급시설 어디에도 안 걸린 질문
        // → (프록시가 설정돼 있거나, 브라우저에 키가 있으면) OpenAI로 답변
        const canUseOpenAi = !!window.OLA_CONFIG.OPENAI_PROXY_URL || window.OLA_CONFIG.hasOpenAiKey();
        if (!canUseOpenAi) {
          setTimeout(() => this.appendAiMessage(chatBody, fallbackMsg()), 300);
          return;
        }

        const loadingId = this.appendLoadingMessage(chatBody);
        // conversationHistory에는 방금 push한 현재 메시지가 이미 포함돼 있으므로,
        // chat() 내부에서 다시 붙이지 않도록 마지막 항목(현재 메시지)은 제외하고 넘긴다.
        const res = await window.olaOpenAI.chat(text, conversationHistory.slice(0, -1));
        this.removeMessage(chatBody, loadingId);

        if (res.ok) {
          this.appendAiMessage(chatBody, escapeHtml(res.text).replace(/\n/g, "<br>"), "ai");
          conversationHistory.push({ role: "assistant", content: res.text });
        } else {
          const t = window.olaI18n ? olaI18n.t : (k, vars) => k;
          this.appendAiMessage(
            chatBody,
            res.reason === "no-api-key"
              ? fallbackMsg()
              : t("consult.errorWithReason", { reason: res.reason })
          );
        }
      };

      sendBtn.addEventListener("click", send);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) send();
      });

      const wireChatChips = () => {
        document.querySelectorAll(".chat-chip").forEach((chip) => {
          chip.addEventListener("click", () => {
            input.value = chip.innerText;
            send();
          });
        });
      };
      wireChatChips();

      // 언어 설정을 바꾸면, 그동안 다른 언어로 나눈 대화 내용을 번역하는 대신
      // 새 대화로 초기화합니다 (KB 답변은 한국어 템플릿이라 번역하면 언어가 섞여 보이기 때문).
      if (window.olaI18n) {
        olaI18n.onLocaleChange(() => {
          conversationHistory.length = 0;
          input.value = "";
          chatBody.innerHTML = initialChatBodyHtml;
          olaI18n.apply(chatBody);
          wireChatChips();
          if (window.lucide) lucide.createIcons();
        });
      }

      // 홈 상단 "Ask OLA" 검색창에서 넘어온 질문(?q=)이 있으면 바로 전송
      const prefillQuery = new URLSearchParams(window.location.search).get("q");
      if (prefillQuery) {
        input.value = prefillQuery;
        send();
      }
    },

    appendUserMessage: function (chatBody, text) {
      const div = document.createElement("div");
      div.className = "flex gap-3 max-w-[85%] ml-auto justify-end";
      div.innerHTML = `<div class="bg-primary text-white p-4 rounded-2xl rounded-tr-none shadow-sm text-sm leading-relaxed">${escapeHtml(text)}</div>`;
      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    },

    appendLoadingMessage: function (chatBody) {
      const t = window.olaI18n ? olaI18n.t : (k) => k;
      const id = "loading-" + Date.now();
      const div = document.createElement("div");
      div.id = id;
      div.className = "flex gap-3 max-w-[85%]";
      div.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
                <i data-lucide="bot" class="w-5 h-5"></i>
            </div>
            <div class="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-border text-sm text-gray-400">${t("consult.thinking")}</div>`;
      chatBody.appendChild(div);
      if (window.lucide) lucide.createIcons();
      chatBody.scrollTop = chatBody.scrollHeight;
      return id;
    },

    removeMessage: function (chatBody, id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    },

    // 출처별 배지 스타일. source가 없거나 목록에 없으면(FALLBACK/에러 메시지 등)
    // 배지 없이 순수 안내 메시지로만 표시한다. 라벨은 i18nKey로 저장해두고
    // 렌더링 시점에 olaI18n.t()로 조회해서 현재 언어에 맞게 표시한다.
    SOURCE_BADGES: {
      kb: { i18nKey: "consult.badge.kb", cls: "bg-secondary bg-opacity-40 text-primary" },
      complaint: { i18nKey: "consult.badge.complaint", cls: "bg-point2 bg-opacity-30 text-green-700" },
      weather: { i18nKey: "consult.badge.weather", cls: "bg-point1 bg-opacity-30 text-orange-600" },
      emergency: { i18nKey: "consult.badge.emergency", cls: "bg-red-100 text-red-500" },
      ai: { i18nKey: "consult.badge.ai", cls: "bg-gray-100 text-gray-500" },
    },

    appendAiMessage: function (chatBody, html, source) {
      const badge = this.SOURCE_BADGES[source];
      const badgeLabel = badge ? (window.olaI18n ? olaI18n.t(badge.i18nKey) : badge.i18nKey) : "";
      const badgeHtml = badge
        ? `<span class="self-start text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 ${badge.cls}">${badgeLabel}</span>`
        : "";
      const div = document.createElement("div");
      div.className = "flex gap-3 max-w-[85%]";
      div.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
                <i data-lucide="bot" class="w-5 h-5"></i>
            </div>
            <div class="flex flex-col items-start">
              ${badgeHtml}
              <div class="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-border text-sm leading-relaxed">${html}</div>
            </div>`;
      chatBody.appendChild(div);
      if (window.lucide) lucide.createIcons();
      chatBody.scrollTop = chatBody.scrollHeight;
    },
  };

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  document.addEventListener("DOMContentLoaded", () => insightJS.init());
})();