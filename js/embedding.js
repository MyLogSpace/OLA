/**
 * ============================================================================
 *  js/embedding.js — 벡터 검색(벡터DB) 모듈 (ChromaDB 백엔드)
 * ============================================================================
 *  이전에는 이 모듈이 브라우저에서 직접 OpenAI 임베딩을 받아 localStorage에
 *  캐시해두고, 코사인 유사도 계산까지 브라우저에서 직접 했습니다.
 *  이제는 인덱싱·검색을 모두 서버(server/app.py)의 ChromaDB가 담당합니다 —
 *  브라우저는 컬렉션 이름과 문서/질의만 넘기고, 임베딩 계산과 유사도 검색
 *  결과를 서버에서 받아옵니다.
 *
 *  동작 방식:
 *   1) buildIndex(name, items) → POST {서버}/api/vector/upsert
 *      서버가 items를 OpenAI 임베딩으로 변환해 ChromaDB의 `name` 컬렉션에 저장.
 *      (같은 내용이면 이번 세션 안에서는 재전송하지 않도록 해시로 캐시)
 *   2) search(name, query, topK) → POST {서버}/api/vector/search
 *      서버가 query를 임베딩해 ChromaDB에서 최근접 문서를 찾아 반환.
 *
 *  ⚠️ ChromaDB는 브라우저에서 직접 실행할 수 없으므로, 이 모듈은 반드시
 *  server/app.py가 켜져 있어야 동작합니다 (server/README 참고).
 *  꺼져 있으면 isAvailable()이 false를 반환하고, 호출부(js/issue.js,
 *  js/insight.js)는 자동으로 키워드 매칭으로 폴백합니다.
 *
 *  설정 (js/config.js — 없어도 기본값으로 동작):
 *   - OLA_CONFIG.VECTOR_DB_UPSERT_URL / VECTOR_DB_SEARCH_URL : 직접 지정(선택)
 *   - 직접 안 적으면 OLA_CONFIG.OPENAI_EMBEDDING_PROXY_URL(".../api/embeddings")
 *     또는 OPENAI_PROXY_URL(".../api/chat")로부터 같은 서버의
 *     ".../api/vector/upsert", ".../api/vector/search"를 자동으로 유추합니다.
 *   - OLA_CONFIG.OPENAI_EMBEDDING_MODEL : 서버에 전달할 임베딩 모델(선택, 기본값은 서버가 결정)
 * ============================================================================
 */

const olaEmbedding = (() => {
  const builtHashes = {}; // name → 이번 세션에서 마지막으로 서버에 upsert한 items의 해시 (중복 전송 방지)

  function cfg() {
    return window.OLA_CONFIG || {};
  }
  function getModel() {
    return cfg().OPENAI_EMBEDDING_MODEL || "";
  }

  // 벡터 엔드포인트의 공통 base(prefix)를 다른 설정값들로부터 유추.
  function deriveBase() {
    const c = cfg();
    const emb = (c.OPENAI_EMBEDDING_PROXY_URL || "").trim();
    if (emb && /\/api\/embeddings\/?$/.test(emb)) return emb.replace(/\/api\/embeddings\/?$/, "");
    const chat = (c.OPENAI_PROXY_URL || "").trim();
    if (chat && /\/api\/chat\/?$/.test(chat)) return chat.replace(/\/api\/chat\/?$/, "");
    return "";
  }
  function getUpsertUrl() {
    const c = cfg();
    if (c.VECTOR_DB_UPSERT_URL && c.VECTOR_DB_UPSERT_URL.trim()) return c.VECTOR_DB_UPSERT_URL.trim();
    const base = deriveBase();
    return base ? `${base}/api/vector/upsert` : "";
  }
  function getSearchUrl() {
    const c = cfg();
    if (c.VECTOR_DB_SEARCH_URL && c.VECTOR_DB_SEARCH_URL.trim()) return c.VECTOR_DB_SEARCH_URL.trim();
    const base = deriveBase();
    return base ? `${base}/api/vector/search` : "";
  }

  // 연속 실패 시 이번 세션에서는 벡터 검색을 포기하고 키워드 매칭으로만 동작
  // (서버가 꺼져 있거나 ChromaDB 쪽 오류가 계속될 때, 매 질문마다 실패하는
  //  네트워크 요청으로 응답이 느려지는 걸 방지)
  const MAX_FAILURES = 2;
  let failCount = 0;

  /**
   * ChromaDB 기반 벡터 검색을 쓸 수 있는 환경인지.
   * (브라우저에서 직접 계산하는 방식과 달리, 이제는 서버 프록시가
   *  반드시 켜져 있어야 합니다 — ChromaDB는 서버에서만 실행되므로.)
   */
  function isAvailable() {
    if (failCount >= MAX_FAILURES) return false;
    return !!getUpsertUrl() && !!getSearchUrl();
  }

  async function postJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `HTTP ${res.status}`);
      }
      failCount = 0; // 성공하면 실패 카운터 리셋
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      failCount++;
      if (failCount >= MAX_FAILURES) {
        console.warn(`[embedding] ${MAX_FAILURES}회 연속 실패 → 이번 세션은 키워드 매칭으로만 동작합니다.`, e);
      }
      throw e;
    }
  }

  /**
   * (하위 호환용) 순수 임베딩 벡터가 필요한 다른 용도를 위해 남겨둔 함수.
   * buildIndex/search는 이제 이 함수를 쓰지 않고 서버의 ChromaDB 엔드포인트를
   * 직접 호출합니다 — 서버가 임베딩+인덱싱+검색을 모두 처리하기 때문입니다.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async function embed(texts) {
    const base = deriveBase();
    if (!base) throw new Error("no-vector-proxy-configured");
    const json = await postJson(`${base}/api/embeddings`, { texts, model: getModel() || undefined });
    if (!Array.isArray(json.embeddings) || json.embeddings.length !== texts.length) {
      throw new Error("empty-embedding-response");
    }
    return json.embeddings;
  }

  // 문서 목록이 바뀌었는지 확인하기 위한 간단한 해시(djb2). 같은 내용이면
  // 이번 세션 안에서는 서버로 다시 upsert하지 않아 API 호출을 아낍니다.
  // (ChromaDB 자체는 서버 재시작 후에도 저장돼 있으므로, 세션이 바뀌어도 매번
  //  전체 재인덱싱이 필요한 건 아니지만, 브라우저가 이걸 알 수 없어서
  //  세션 최초 1회는 upsert를 시도합니다.)
  function hashOf(items) {
    const str = (getModel() || "default") + "|" + JSON.stringify(items);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h);
  }

  /**
   * ChromaDB 컬렉션(인덱스) 생성/갱신. 같은 내용이면 이번 세션 안에서는
   * 중복 호출을 건너뜁니다.
   * @param {string} name  컬렉션 이름 (예: "consult-kb-v1")
   * @param {{id: string, text: string}[]} items
   */
  async function buildIndex(name, items) {
    const h = hashOf(items);
    if (builtHashes[name] === h) return; // 이번 세션에 이미 올려둔 내용과 동일

    const url = getUpsertUrl();
    if (!url) throw new Error("no-vector-proxy-configured");

    await postJson(url, {
      collection: name,
      items: items.map((i) => ({ id: i.id, text: i.text })),
      model: getModel() || undefined,
    });
    builtHashes[name] = h;
  }

  /**
   * ChromaDB 컬렉션에서 의미가 가장 가까운 문서 검색.
   * @param {string} name   buildIndex로 만든 컬렉션 이름
   * @param {string} query  사용자 질문
   * @param {number} topK
   * @returns {Promise<{id: string, score: number}[]>} 유사도(코사인) 내림차순
   */
  async function search(name, query, topK = 3) {
    const url = getSearchUrl();
    if (!url) throw new Error("no-vector-proxy-configured");

    const json = await postJson(url, { collection: name, query, top_k: topK, model: getModel() || undefined });
    return Array.isArray(json.results) ? json.results : [];
  }

  return { isAvailable, embed, buildIndex, search };
})();

window.olaEmbedding = olaEmbedding;
