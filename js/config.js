/**
 * ============================================================================
 *  OLA API 설정 파일 (config.js)
 * ============================================================================
 *  공공데이터포털(data.go.kr)에서 발급받은 "일반 인증키(Encoding)" 를
 *  아래 PUBLIC_DATA_API_KEY 한 곳에만 입력하면 됩니다.
 *
 *  공공데이터포털은 계정당 인증키(Encoding 값) 자체는 하나이고, 그 키를
 *  여러 API에 공통으로 씁니다. 하지만 ⚠️ 키가 같다고 모든 API가 자동으로
 *  열리는 건 아니고, API마다 "활용신청" 버튼을 각각 눌러 승인받아야
 *  실제로 데이터가 나옵니다 (대부분 자동승인, 짧으면 몇 분~길면 1~2시간).
 *  아래 목록에 있는 API를 하나라도 신청 안 했다면, 그 API만 계속 실패합니다
 *  (예: 기상특보는 신청했는데 미세먼지는 안 했다면 미세먼지만 안 나옴).
 *
 *  발급/신청 방법
 *  1) https://www.data.go.kr 회원가입 후 로그인
 *  2) 아래 각 API를 검색해서 "활용신청" 각각 클릭 (대부분 자동승인)
 *     - 기상청_기상특보 조회서비스 (WthrWrnInfoService)
 *     - 기상청_단기예보 조회서비스 (VilageFcstInfoService)
 *     - 국립중앙의료원_전국 응급의료기관 정보 조회 서비스 (ErmctInfoInqireService)
 *     - 국립중앙의료원_전국 자동심장충격기(AED) 정보 조회 서비스 (AEDInfoInqireService)
 *     - 한국환경공단_에어코리아 대기오염정보 (ArpltnInforInqireSvc) — 미세먼지 (별도 신청 필요!)
 *     - 국민권익위원회_민원분석정보 (minAnalsInfoView5) — AI 민원 도우미 유사사례용
 *  3) 마이페이지 > 개발계정 상세보기 > "일반 인증키(Encoding)" 복사
 *  4) 아래 PUBLIC_DATA_API_KEY = "..." 부분에 붙여넣기
 *  5) 신청 직후엔 승인 대기 중이라 잠시(수 분~수 시간) 실패할 수 있어요.
 *     마이페이지 > 활용현황에서 "승인" 상태인지 확인해보세요.
 *
 *  ⚠️ 주의: 이 파일은 프론트엔드(JS)에 그대로 노출되는 파일입니다.
 *  실 서비스로 배포할 때는 키를 그대로 두지 말고, 백엔드(Flask 등) 프록시
 *  서버를 통해 API를 호출하도록 바꿔야 합니다. (README_API.md 참고)
 * ============================================================================
 */

// 이 파일이 로드된 브라우저가 실제로 접속한 주소를 기준으로 로컬 서버(Flask) 주소를 만듭니다.
// PC에서 열면 "localhost"가 되고, 휴대폰 등 다른 기기에서 PC의 LAN IP(예: 192.168.0.5)로
// 접속하면 그 IP가 자동으로 쓰여서, 코드를 안 고쳐도 휴대폰에서 테스트할 수 있습니다.
const OLA_LOCAL_SERVER_ORIGIN = `http://${location.hostname || "localhost"}:5000`;

const OLA_CONFIG = {
  // 1) 공공데이터포털 공통 서비스키 (Encoding 된 키를 그대로 붙여넣으세요)
  PUBLIC_DATA_API_KEY: "",

  // 2) OpenAI API 키 (AI 생활상담 / AI 민원 도우미용, 선택 — 있으면 실제 응답, 없으면 데모 응답)
  // ⚠️ 아래 OPENAI_PROXY_URL을 설정하면 이 키는 브라우저에서 쓰이지 않고
  // server/app.py(.env)에 넣은 키만 사용됩니다 — 그 경우 이 값은 비워두세요.
  OPENAI_API_KEY: "",
  // AI 생활상담(consult.html)에서 쓸 모델. 필요하면 gpt-4o 등으로 바꿔도 됩니다.
  OPENAI_MODEL: "gpt-4o-mini",
  // ✅ 권장: 백엔드 프록시 주소 (server/app.py를 실행하면 보통
  // "http://localhost:5000/api/chat"). 설정하면 OpenAI 키가 브라우저에
  // 노출되지 않고 서버(.env)에서만 사용됩니다. 비워두면(기존 방식) 브라우저가
  // OpenAI를 직접 호출해서 OPENAI_API_KEY가 노출됩니다.
  OPENAI_PROXY_URL: `${OLA_LOCAL_SERVER_ORIGIN}/api/chat`,

  // ✅ 벡터DB(임베딩) 검색 설정 — AI상담(consult.html) KB 의미 검색과
  // 민원(complaint.html) 카테고리 의미 매칭에 사용됩니다. (js/embedding.js)
  // 임베딩 모델: 저렴하고 빠른 text-embedding-3-small 권장
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  // 임베딩용 백엔드 프록시 주소 (server/app.py에 /api/embeddings 엔드포인트 추가 필요
  // — README-업데이트.md 참고). 비워두면 OPENAI_PROXY_URL이 ".../api/chat"일 때
  // 같은 서버의 ".../api/embeddings"를 자동으로 사용해봅니다.
  OPENAI_EMBEDDING_PROXY_URL: `${OLA_LOCAL_SERVER_ORIGIN}/api/embeddings`,
  // ChromaDB 인덱스 생성/갱신 (js/embedding.js의 buildIndex가 호출)
  VECTOR_DB_UPSERT_URL: `${OLA_LOCAL_SERVER_ORIGIN}/api/vector/upsert`,
  // ChromaDB 의미 검색 (js/embedding.js의 search가 호출)
  VECTOR_DB_SEARCH_URL: `${OLA_LOCAL_SERVER_ORIGIN}/api/vector/search`,

  // 3) 기본 위치 (로그인/GPS 연동 전까지, 또는 위치 확인에 실패했을 때 쓰는 기본값 — 서울시청)
  DEFAULT_REGION: {
    sido: "서울특별시",
    gu: "중구",
  },
  DEFAULT_RADIUS_KM: 1,

  // ✅ 공공데이터 API용 백엔드 프록시 주소 (server/app.py 실행 시 보통
  // "http://localhost:5000/api/public-data"). 설정하면 PUBLIC_DATA_API_KEY를
  // 비워둬도 되고(서버 .env 값 사용), CORS 문제도 함께 해결됩니다.
  PROXY_BASE_URL: `${OLA_LOCAL_SERVER_ORIGIN}/api/public-data`,
  // ✅ 카카오맵 JavaScript 키를 Flask 서버에서 받아오는 주소
  KAKAO_MAP_KEY_URL: `${OLA_LOCAL_SERVER_ORIGIN}/api/kakao-map-key`,

  // ✅ 카카오맵 SDK 기본 주소
  KAKAO_MAP_SDK_URL: "https://dapi.kakao.com/v2/maps/sdk.js",
  // 4) 각 API 엔드포인트 (data.go.kr 활용가이드 문서 기준, 변경 시 이 곳만 수정)
  ENDPOINTS: {
    // 기상청 기상특보 조회서비스 (WthrWrnInfoService)
    WEATHER_WARNING_LIST: "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList",
    WEATHER_WARNING_STATUS: "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus",
    // 기상청 단기예보 조회서비스 (VilageFcstInfoService)
    WEATHER_SHORT_FORECAST: "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
    // 기상청 초단기실황 조회서비스 - 단기예보와 같은 서비스(VilageFcstInfoService_2.0)라 별도 신청 불필요.
    // 예보(미래 예측)가 아니라 실제 관측소에서 매시 측정한 "지금 이 순간" 값을 제공.
    WEATHER_ULTRA_SRT_NCST: "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst",
    // 국립중앙의료원 E-Gen 응급의료기관 실시간 가용병상 조회
    EMERGENCY_BEDS: "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire",
    // 국립중앙의료원 E-Gen 응급의료기관 목록정보 조회 (분류/응급실 전화 포함)
    EMERGENCY_ORG_LIST: "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire",
    // 국립중앙의료원 AED 조회
    AED_INFO: "https://apis.data.go.kr/B552657/AEDInfoInqireService/getEgytAedManageInfoInqire",
    // 한국환경공단 에어코리아 시도별 실시간 대기 측정정보 (미세먼지)
    AIR_QUALITY: "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty",
    // 국민권익위원회 민원분석정보(국민신문고) — 유사사례 조회 / 오늘의 민원 이슈
    COMPLAINT_SIMILAR_CASES: "https://apis.data.go.kr/1140100/minAnalsInfoView5/minSimilarInfo5",
    COMPLAINT_TODAY_ISSUES: "https://apis.data.go.kr/1140100/minAnalsInfoView5/minTodayTopicInfo5",
    // OpenAI Chat Completions (AI 생활상담 — 로컬 지식베이스에 없는 질문일 때만 사용)
    OPENAI_CHAT: "https://api.openai.com/v1/chat/completions",
    // OpenAI Embeddings (벡터DB 검색 — 프록시 미설정 시 직접 호출용)
    OPENAI_EMBEDDINGS: "https://api.openai.com/v1/embeddings",
  },

  // 기상특보 조회에 쓰는 지점코드 (109 = 서울/인천/경기), 특보구역코드(서울)
  KMA_STN_ID_SEOUL: "109",
  KMA_WARNING_AREA_CODE_SEOUL: "L1100000",
};

// 키가 아직 입력되지 않았는지 확인하는 헬퍼
// (PROXY_BASE_URL이 설정되어 있으면 서버 .env의 키를 쓰므로 여기서도 true)
OLA_CONFIG.hasApiKey = function () {
  if (OLA_CONFIG.PROXY_BASE_URL && OLA_CONFIG.PROXY_BASE_URL.trim()) return true;
  return (
    !!OLA_CONFIG.PUBLIC_DATA_API_KEY &&
    OLA_CONFIG.PUBLIC_DATA_API_KEY.indexOf("여기에") === -1
  );
};

OLA_CONFIG.hasOpenAiKey = function () {
  if (OLA_CONFIG.OPENAI_PROXY_URL && OLA_CONFIG.OPENAI_PROXY_URL.trim()) return true;
  return !!OLA_CONFIG.OPENAI_API_KEY && OLA_CONFIG.OPENAI_API_KEY.trim().length > 0;
};

// 브라우저 전역에서 접근 가능하도록 노출
window.OLA_CONFIG = OLA_CONFIG;