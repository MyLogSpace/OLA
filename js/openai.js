/**
 * ============================================================================
 *  js/openai.js — AI 생활상담(consult.html)에서 로컬 지식베이스(js/insight.js의
 *  KB)에 답이 없을 때만 호출하는 OpenAI Chat Completions 래퍼입니다.
 * ============================================================================
 *  기본(OPENAI_PROXY_URL 미설정): 브라우저에서 직접 OpenAI API를 호출하므로
 *  js/config.js의 OPENAI_API_KEY가 사용자 브라우저에 그대로 노출됩니다.
 *  개인 테스트/데모 용도로는 괜찮지만 실제 서비스에는 적합하지 않습니다.
 *
 *  ✅ 권장: js/config.js에 OPENAI_PROXY_URL을 설정하면(예:
 *  "http://localhost:5000/api/chat") server/app.py가 .env의 키를 서버에서만
 *  사용하고, 브라우저는 프록시 주소만 호출하므로 키가 전혀 노출되지 않습니다.
 *  자세한 설정은 README_API.md의 "3-1. 백엔드 프록시로 API 키 숨기기" 참고.
 * ============================================================================
 */

const olaOpenAI = (() => {
  const BASE_SYSTEM_PROMPT =
    "당신은 'OLA'라는 서울시 생활안전 앱의 AI 생활상담 도우미입니다. " +
    "당신이 답변할 수 있는 범위는 다음으로 한정됩니다: " +
    "① 생활 안전(전기·가스·수도 등 시설 이상, 대중교통 위급상황, 개인정보 보호), " +
    "② 응급상황 대처(응급실/AED/구급 관련 행동요령), " +
    "③ 재난 대응(기상특보, 호우·태풍·지진·폭염·한파 등 행동요령, 대피), " +
    "④ 생활 민원(쓰레기·폐기물 배출, 소음, 불법주정차 등 생활불편 신고), " +
    "⑤ 공공서비스 이용 방법 일반, ⑥ OLA 앱 자체의 사용법 안내. " +
    "이 범위를 벗어난 요청(코딩/프로그래밍 질문, 숙제 풀이, 오락성 추천, 잡담, " +
    "이 앱과 무관한 일반 지식 질문 등)에는 답을 만들어내지 말고, " +
    "'그 부분은 제가 도와드리는 범위 밖이에요. 생활안전·응급·재난·민원 관련 질문을 해주시면 도와드릴게요.' " +
    "라는 취지로 정중히 거절하세요. " +
    "범위 안의 질문이라도 확실하지 않은 사실(법 조항, 정확한 수치, 특정 기관의 최신 정책 등)은 " +
    "단정하지 말고 관련 기관에 확인하라고 안내하세요. 답변은 3~6문장 내외로 간결하게 작성하세요.";

  // 사이드바 언어 설정(olaI18n)에 맞춰 매 요청마다 답변 언어 지시를 덧붙인다.
  // 한국어(ko)일 땐 원래 프롬프트 그대로, 그 외엔 "반드시 이 언어로 답하라"를 추가.
  const LOCALE_NAMES = { ko: "한국어(Korean)", en: "영어(English)", zh: "중국어(简体中文)", ja: "일본어(日本語)" };
  function buildSystemPrompt() {
    const locale = window.olaI18n ? olaI18n.getLocale() : "ko";
    if (locale === "ko") return BASE_SYSTEM_PROMPT;
    const langName = LOCALE_NAMES[locale] || LOCALE_NAMES.ko;
    return (
      BASE_SYSTEM_PROMPT +
      ` [IMPORTANT] Regardless of the language used in the user's message or the conversation history, you must always respond in ${langName}.`
    );
  }

  async function chat(userMessage, history = []) {
    const proxyUrl = window.OLA_CONFIG.OPENAI_PROXY_URL;
    const useProxy = !!proxyUrl;

    if (!useProxy && !window.OLA_CONFIG.hasOpenAiKey()) return { ok: false, reason: "no-api-key" };

    try {
      const messages = [
        { role: "system", content: buildSystemPrompt() },
        ...history.slice(-6), // 최근 대화 몇 턴만 맥락으로 사용
        { role: "user", content: userMessage },
      ];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      let res;
      if (useProxy) {
        // ✅ 권장 방식: 백엔드 프록시(server/app.py)가 .env의 키를 서버에서만 사용하고,
        // 브라우저는 프록시 주소로만 요청을 보내므로 키가 노출되지 않습니다.
        res = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, model: window.OLA_CONFIG.OPENAI_MODEL || "gpt-4o-mini" }),
          signal: controller.signal,
        });
      } else {
        // ⚠️ 프록시가 없을 때의 대체 방식: 브라우저에서 OpenAI를 직접 호출하므로
        // OPENAI_API_KEY가 그대로 노출됩니다. 데모/개인 테스트 용도로만 사용하세요.
        res = await fetch(window.OLA_CONFIG.ENDPOINTS.OPENAI_CHAT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${window.OLA_CONFIG.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: window.OLA_CONFIG.OPENAI_MODEL || "gpt-4o-mini",
            messages,
            temperature: 0.5,
            max_tokens: 500,
          }),
          signal: controller.signal,
        });
      }
      clearTimeout(timer);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { ok: false, reason: errBody?.error?.message || errBody?.error || `HTTP ${res.status}` };
      }
      const json = await res.json();
      const text = useProxy ? json?.text : json?.choices?.[0]?.message?.content?.trim();
      if (!text) return { ok: false, reason: "empty-response" };
      return { ok: true, text };
    } catch (e) {
      return { ok: false, reason: e.name === "AbortError" ? "timeout" : e.message };
    }
  }

  return { chat };
})();

window.olaOpenAI = olaOpenAI;
