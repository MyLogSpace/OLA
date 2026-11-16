/**
 * ============================================================================
 *  js/i18n.js — 다국어(한국어/영어/중국어/일본어) 지원
 * ============================================================================
 *  범위: 사이드바·헤더·버튼·폼·카드 제목 등 "UI 뼈대" 텍스트 + 자주 나오는
 *  짧은 동적 라벨(날씨/요일/단위 등)까지 다국어 처리합니다.
 *
 *  ⚠️ 범위 밖: AI 안전 리포트, 재난/응급 행동요령 본문, 민원 카테고리 설명,
 *  AI 생활상담 지식베이스(js/insight.js의 KB) 같은 문단 단위 콘텐츠는
 *  이번 1차 작업에 포함되지 않았고 한국어로만 표시됩니다. (내용이 방대하고
 *  기관명·법령 등 정확한 번역이 더 중요해서 별도 작업으로 분리했습니다.)
 *
 *  사용법
 *  - 정적 텍스트: <span data-i18n="nav.home">홈</span>
 *  - placeholder: <input data-i18n-placeholder="auth.emailPh">
 *  - title/aria-label: <button data-i18n-title="common.refresh">
 *  - JS 안에서: olaI18n.t('common.loading') → 현재 언어의 문자열 반환
 *  - 언어 전환: olaI18n.setLocale('en')  (localStorage에 저장, 즉시 DOM 갱신)
 * ============================================================================
 */
const olaI18n = (() => {
  const KEY = "ola_locale";
  const SUPPORTED = ["ko", "en", "zh", "ja"];
  const LABELS = { ko: "한국어", en: "English", zh: "中文", ja: "日本語" };

  const DICT = {
    // ---- 내비게이션 / 사이드바 ----
    "nav.home": { ko: "홈", en: "Home", zh: "首页", ja: "ホーム" },
    "nav.map": { ko: "안전지도", en: "Safety Map", zh: "安全地图", ja: "安全マップ" },
    "nav.safety": { ko: "생활안전", en: "Safety", zh: "生活安全", ja: "生活安全" },
    "nav.emergency": { ko: "행동요령", en: "Action Guide", zh: "行动指南", ja: "行動要領" },
    "nav.complaint": { ko: "민원", en: "Complaints", zh: "民愿举报", ja: "苦情" },
    "nav.consult": { ko: "AI 상담", en: "AI Chat", zh: "AI咨询", ja: "AI相談" },
    "nav.notification": { ko: "알림", en: "Notifications", zh: "通知", ja: "通知" },
    "nav.favorites": { ko: "즐겨찾기", en: "Favorites", zh: "收藏", ja: "お気に入り" },
    "nav.settings": { ko: "설정", en: "Settings", zh: "设置", ja: "設定" },
    "nav.my": { ko: "MY", en: "MY", zh: "我的", ja: "MY" },
    "nav.login": { ko: "로그인", en: "Log in", zh: "登录", ja: "ログイン" },
    "nav.logout": { ko: "로그아웃", en: "Log out", zh: "登出", ja: "ログアウト" },
    "nav.community": { ko: "커뮤니티 톡", en: "Community Talk", zh: "社区聊天", ja: "コミュニティトーク" },

    // ---- 상단 헤더 (모든 페이지 공통) ----
    "header.dayMode": { ko: "주간 모드", en: "Day mode", zh: "白天模式", ja: "昼間モード" },
    "header.nightMode": { ko: "야간 안심", en: "Night safe", zh: "夜间安心", ja: "夜間安心" },
    "header.sos": { ko: "긴급 SOS", en: "Emergency SOS", zh: "紧急SOS", ja: "緊急SOS" },
    "header.voiceSearch": { ko: "음성으로 검색", en: "Search by voice", zh: "语音搜索", ja: "音声で検索" },
    "header.search": { ko: "검색", en: "Search", zh: "搜索", ja: "検索" },
    "header.notifTitle": { ko: "OLA 안심 브리핑 알림", en: "OLA Safety Briefing Alert", zh: "OLA安心简报通知", ja: "OLA安心ブリーフィング通知" },
    "header.notifSample": {
      ko: "오늘 저녁 퇴근길 폭우 주의보가 예정되어 있습니다. 우산을 챙기시고 하천 주변 도로로 우회해 주세요.",
      en: "A heavy rain advisory is expected during this evening's commute. Bring an umbrella and avoid roads near streams.",
      zh: "今晚下班高峰期预计有暴雨预警。请携带雨伞，并绕行河边道路。",
      ja: "今夜の帰宅時間帯に大雨注意報が予想されています。傘をお持ちいただき、河川周辺の道路は迂回してください。",
    },
    "header.viewShelterGuide": { ko: "대피 가이드 보기", en: "View shelter guide", zh: "查看避难指南", ja: "避難ガイドを見る" },

    // ---- 검색창 로테이팅 예시 문구 ----
    "search.rotator1": { ko: "오늘의 안심 길 추천해줘", en: "Recommend today's safe route", zh: "推荐今天的安心路线", ja: "今日の安心ルートを教えて" },
    "search.rotator2": { ko: "골목 안전도 확인해줘", en: "Check the alley's safety level", zh: "查看小巷的安全度", ja: "路地の安全度を確認して" },
    "search.rotator3": { ko: "가까운 대피소 찾아줘", en: "Find the nearest shelter", zh: "查找附近的避难所", ja: "近くの避難所を探して" },
    "search.rotator4": { ko: "우리 동네 위험지역 알려줘", en: "Tell me risky spots in my neighborhood", zh: "告诉我附近的危险区域", ja: "私の地域の危険地域を教えて" },

    // ---- 공통 ----
    "common.loading": { ko: "불러오는 중…", en: "Loading…", zh: "加载中…", ja: "読み込み中…" },
    "common.refresh": { ko: "새로고침", en: "Refresh", zh: "刷新", ja: "更新" },
    "common.radius": { ko: "반경", en: "Radius", zh: "半径", ja: "半径" },
    "common.language": { ko: "언어", en: "Language", zh: "语言", ja: "言語" },
    "common.close": { ko: "닫기", en: "Close", zh: "关闭", ja: "閉じる" },
    "common.back": { ko: "뒤로", en: "Back", zh: "返回", ja: "戻る" },
    "common.delete": { ko: "삭제", en: "Delete", zh: "删除", ja: "削除" },
    "common.prevPage": { ko: "이전 페이지", en: "Previous page", zh: "上一页", ja: "前のページ" },
    "common.nextPage": { ko: "다음 페이지", en: "Next page", zh: "下一页", ja: "次のページ" },
    "common.noApiKey": {
      ko: "config.js에 공공데이터포털 키를 넣으면 실시간 정보가 표시됩니다",
      en: "Add a data.go.kr key in config.js to enable live data",
      zh: "在 config.js 中添加公共数据门户密钥即可显示实时信息",
      ja: "config.js に公共データポータルキーを入力すると、リアルタイム情報が表示されます",
    },

    // ---- 홈(index.html) ----
    "home.heroTitle": { ko: "무엇이든 물어보세요", en: "Ask OLA anything", zh: "有什么都可以问", ja: "何でも聞いてください" },
    "home.heroSlogan1": { ko: "오늘도, OLA.", en: "Every day, OLA.", zh: "今天也，OLA。", ja: "今日も、OLA。" },
    "home.heroSlogan2": { ko: "당신의 일상을 이해하는 AI Partner", en: "The AI partner that understands your daily life", zh: "理解您日常生活的AI伙伴", ja: "あなたの日常を理解するAIパートナー" },
    "home.searchPh": { ko: "궁금한 것을 검색해보세요 (예: 주변 응급실 찾아줘)", en: "Search anything (e.g. find nearby ER)", zh: "搜索您想了解的内容（例：查找附近急诊室）", ja: "気になることを検索してみましょう（例：近くの救急室を探して）" },
    "home.card.safety": { ko: "위험도 확인<br>안전 가이드", en: "Check risk level<br>Safety guide", zh: "查询危险度<br>安全指南", ja: "危険度確認<br>安全ガイド" },
    "home.card.emergency": { ko: "병원·AED 찾기<br>응급 정보", en: "Find hospitals/AEDs<br>Emergency info", zh: "查找医院·AED<br>紧急信息", ja: "病院・AED検索<br>緊急情報" },
    "home.card.disaster": { ko: "기상·재난 알림<br>행동요령", en: "Weather/disaster alerts<br>Response guides", zh: "气象·灾害通知<br>行动指南", ja: "気象・災害通知<br>行動要領" },
    "home.card.complaint": { ko: "민원 안내·신고<br>대행 작성", en: "Complaint guide/report<br>Draft assist", zh: "民愿指南·举报<br>代写协助", ja: "苦情案内・申告<br>代行作成" },
    "home.card.consult": { ko: "무엇이든<br>물어보세요", en: "Ask us<br>anything", zh: "有什么<br>都可以问", ja: "何でも<br>聞いてください" },
    "briefing.viewMore": { ko: "자세히 보기", en: "View details", zh: "查看详情", ja: "詳しく見る" },
    "home.facilityRadius": { ko: "응급시설 ({{km}}km 내)", en: "Emergency facilities (within {{km}}km)", zh: "急救设施（{{km}}km内）", ja: "救急施設（{{km}}km以内）" },
    "home.quickSafety": { ko: "생활안전", en: "Safety", zh: "生活安全", ja: "生活安全" },
    "home.quickEmergency": { ko: "응급", en: "Emergency", zh: "紧急", ja: "緊急" },
    "home.quickDisaster": { ko: "재난", en: "Disaster", zh: "灾害", ja: "災害" },
    "home.quickComplaint": { ko: "민원", en: "Complaints", zh: "民愿举报", ja: "苦情" },
    "home.quickConsult": { ko: "AI 상담", en: "AI Chat", zh: "AI咨询", ja: "AI相談" },
    "home.briefingTitle": { ko: "오늘의 AI 브리핑", en: "Today's AI Briefing", zh: "今日AI简报", ja: "今日のAIブリーフィング" },
    "home.safetyScore": { ko: "안전도", en: "Safety score", zh: "安全指数", ja: "安全度" },
    "home.weather": { ko: "기상 특보", en: "Weather warning", zh: "气象特报", ja: "気象特報" },
    "home.facility": { ko: "응급시설", en: "Emergency facilities", zh: "急救设施", ja: "救急施設" },
    "home.air": { ko: "미세먼지", en: "Air quality", zh: "空气质量", ja: "大気質" },
    "home.viewMore": { ko: "자세히 보기", en: "View details", zh: "查看详情", ja: "詳しく見る" },
    "home.noWarning": { ko: "특보 없음", en: "No warning", zh: "无特报", ja: "特報なし" },
    "home.safeLevel": { ko: "안전 단계", en: "Safe level", zh: "安全级别", ja: "安全レベル" },
    "home.cautionLevel": { ko: "주의 단계", en: "Caution level", zh: "注意级别", ja: "注意レベル" },
    "briefing.cautionOutdoor": { ko: "주의 단계 · 야외활동 주의", en: "Caution · Be careful outdoors", zh: "注意级别 · 户外活动请注意", ja: "注意レベル・屋外活動注意" },
    "briefing.needProxyKey": { ko: "js/config.js에 공공데이터포털 키를 입력하세요", en: "Add a data.go.kr key in js/config.js", zh: "请在 js/config.js 中输入公共数据门户密钥", ja: "js/config.js に公共データポータルキーを入力してください" },
    "briefing.regionMap": { ko: "{{gu}} 안전 지도", en: "{{gu}} Safety Map", zh: "{{gu}} 安全地图", ja: "{{gu}} 安全マップ" },
    "briefing.fallbackMsg": {
      ko: "오늘의 안전 정보를 불러올 수 없습니다.<br>잠시 후 다시 시도해주세요.",
      en: "We couldn't load today's safety information.<br>Please try again in a moment.",
      zh: "无法加载今日安全信息。<br>请稍后重试。",
      ja: "本日の安全情報を読み込めませんでした。<br>しばらくしてから再度お試しください。",
    },
    "home.districtFacilities": { ko: "병원 {{hospital}}곳 · 대피소 {{shelter}}곳", en: "{{hospital}} hospitals · {{shelter}} shelters", zh: "医院{{hospital}}家 · 避难所{{shelter}}处", ja: "病院{{hospital}}か所・避難所{{shelter}}か所" },
    "home.districtScore": { ko: "{{score}}점", en: "{{score}} pts", zh: "{{score}}分", ja: "{{score}}点" },
    "sky.clear": { ko: "맑음", en: "Clear", zh: "晴", ja: "晴れ" },
    "sky.partlyCloudy": { ko: "구름많음", en: "Partly cloudy", zh: "多云", ja: "曇り時々晴れ" },
    "sky.cloudy": { ko: "흐림", en: "Cloudy", zh: "阴", ja: "曇り" },
    "pty.none": { ko: "없음", en: "None", zh: "无", ja: "なし" },
    "pty.rain": { ko: "비", en: "Rain", zh: "雨", ja: "雨" },
    "pty.rainSnow": { ko: "비/눈", en: "Rain/Snow", zh: "雨/雪", ja: "雨/雪" },
    "pty.snow": { ko: "눈", en: "Snow", zh: "雪", ja: "雪" },
    "pty.shower": { ko: "소나기", en: "Shower", zh: "阵雨", ja: "にわか雨" },
    "home.apiNotConnected": { ko: "API 미연동", en: "API not connected", zh: "API未连接", ja: "API未連携" },
    "home.needKey": { ko: "config.js에 키 입력 필요", en: "Add a key in config.js", zh: "需在 config.js 中填写密钥", ja: "config.jsにキーの入力が必要" },
    "home.apiNotApplied": { ko: "API 미신청", en: "API not applied", zh: "API未申请", ja: "API未申請" },
    "home.aircoreaNeeded": { ko: "에어코리아 API 별도 활용신청 필요", en: "Requires separate AirKorea API application", zh: "需另行申请AirKorea API", ja: "AirKorea APIの別途利用申請が必要" },
    "air.good": { ko: "좋음", en: "Good", zh: "良好", ja: "良い" },
    "air.moderate": { ko: "보통", en: "Moderate", zh: "一般", ja: "普通" },
    "air.bad": { ko: "나쁨", en: "Bad", zh: "较差", ja: "悪い" },
    "air.veryBad": { ko: "매우나쁨", en: "Very bad", zh: "很差", ja: "非常に悪い" },

    // ---- 홈 · 우리동네 안심 지킴이 / 오늘의 생활 지수 카드 ----
    "home.levelGood": { ko: "양호", en: "Good", zh: "良好", ja: "良好" },
    "home.levelModerate": { ko: "보통", en: "Moderate", zh: "一般", ja: "普通" },
    "home.levelCaution": { ko: "주의", en: "Caution", zh: "注意", ja: "注意" },
    "home.levelBest": { ko: "최상", en: "Great", zh: "最佳", ja: "最高" },
    "home.tierExcellent": { ko: "우수", en: "Excellent", zh: "优秀", ja: "優秀" },
    "home.dustVeryComfortable": { ko: "매우 쾌적", en: "Very fresh", zh: "非常清新", ja: "非常に快適" },
    "home.dustComfortable": { ko: "쾌적", en: "Fresh", zh: "清新", ja: "快適" },
    "home.dustVeryBad": { ko: "매우 나쁨", en: "Very bad", zh: "很差", ja: "非常に悪い" },
    "home.dryWarningActive": { ko: "건조주의보 발효 중 (습도 {{reh}}%)", en: "Dry weather advisory in effect (humidity {{reh}}%)", zh: "干燥注意警报生效中（湿度 {{reh}}%）", ja: "乾燥注意報発令中（湿度{{reh}}%）" },
    "home.noSpecialIssue": { ko: "특이사항 없음", en: "Nothing unusual", zh: "无异常情况", ja: "特記事項なし" },
    "home.erSmooth": { ko: "원활", en: "Available", zh: "顺畅", ja: "余裕あり" },
    "home.erCongested": { ko: "혼잡", en: "Congested", zh: "拥挤", ja: "混雑" },
    "home.erAvailableBeds": { ko: "관내 가용 병상 {{n}}개", en: "{{n}} beds available nearby", zh: "辖区内可用床位 {{n}} 张", ja: "管内利用可能病床 {{n}}床" },
    "home.aedCount": { ko: "AED {{n}}곳", en: "{{n}} AEDs", zh: "AED {{n}}处", ja: "AED {{n}}か所" },
    "home.aedFailed": { ko: "AED 조회 실패", en: "AED lookup failed", zh: "AED查询失败", ja: "AED照会に失敗" },
    "home.hospitalCount": { ko: "병원 {{n}}곳", en: "{{n}} hospitals", zh: "医院 {{n}}处", ja: "病院 {{n}}か所" },
    "home.hospitalCountWithReason": { ko: "병원 {{n}}곳 · {{reason}}", en: "{{n}} hospitals · {{reason}}", zh: "医院 {{n}}处 · {{reason}}", ja: "病院 {{n}}か所・{{reason}}" },
    "home.queryFailed": { ko: "조회 실패", en: "Lookup failed", zh: "查询失败", ja: "照会に失敗" },
    "home.weatherQueryFailed": { ko: "특보 조회 실패", en: "Warning lookup failed", zh: "特报查询失败", ja: "特報照会に失敗" },
    "home.stationSuffix": { ko: "{{name}} 측정소", en: "{{name}} station", zh: "{{name}}监测站", ja: "{{name}}測定所" },
    "home.pm25Sub": { ko: "초미세먼지 {{value}} ㎍/㎥ ({{comfort}})", en: "PM2.5 {{value}} µg/m³ ({{comfort}})", zh: "PM2.5 {{value}} µg/m³（{{comfort}}）", ja: "PM2.5 {{value}} µg/m³（{{comfort}}）" },
    "home.tickerActive": { ko: "[{{region}}] {{label}} 발효 중 · 외출 시 주변 안전에 유의하세요.", en: "[{{region}}] {{label}} in effect · Stay alert to your surroundings when going out.", zh: "[{{region}}] {{label}}生效中 · 外出时请注意周边安全。", ja: "[{{region}}] {{label}}発令中・外出時は周囲の安全にご注意ください。" },
    "home.tickerNone": { ko: "[{{region}}] 현재 발효 중인 재난 특보가 없습니다. 평소와 같이 안전에 유의하세요.", en: "[{{region}}] No active disaster warnings right now. Stay safe as usual.", zh: "[{{region}}] 目前没有生效中的灾害特报。请一如既往地注意安全。", ja: "[{{region}}] 現在発効中の災害特報はありません。いつも通り安全にご注意ください。" },
    "home.tickerNational": { ko: "전국 폭염·한파 특보는 기상청 발표에 따라 수시로 변경될 수 있습니다.", en: "Nationwide heat/cold warnings may change at any time per KMA announcements.", zh: "全国高温·寒潮特报可能根据气象厅发布随时变更。", ja: "全国の猛暑・寒波特報は気象庁の発表により随時変更されることがあります。" },
    "home.tickerMapHint": { ko: "외출 전 우리 동네 안심 지도에서 가까운 대피시설을 미리 확인해보세요.", en: "Before heading out, check nearby shelters on the neighborhood safety map.", zh: "外出前请在附近安心地图上提前确认最近的避难设施。", ja: "外出前に、お住まいの地域の安心マップで近くの避難施設を確認しておきましょう。" },
    "home.tickerSosHint": { ko: "긴급 상황 시 상단의 긴급 SOS 버튼으로 112·119에 바로 연결할 수 있습니다.", en: "In an emergency, use the Emergency SOS button above to reach 112/119 directly.", zh: "紧急情况下，可通过上方的紧急SOS按钮直接连接112·119。", ja: "緊急時は上部の緊急SOSボタンから112・119に直接つながります。" },

    // ---- API 오류 사유 (js/api.js reasonLabel 공통 사용) ----
    "api.reason.unknown": { ko: "알 수 없는 오류", en: "Unknown error", zh: "未知错误", ja: "不明なエラー" },
    "api.reason.noApiKey": { ko: "인증키 미설정 (config.js)", en: "API key not set (config.js)", zh: "未设置认证密钥（config.js）", ja: "認証キー未設定（config.js）" },
    "api.reason.notApplied": { ko: "이 API 활용신청(승인) 필요", en: "This API requires application/approval", zh: "该API需申请（审批）后使用", ja: "このAPIの利用申請（承認）が必要です" },
    "api.reason.quotaExceeded": { ko: "일일 트래픽 초과 — 자정에 초기화돼요", en: "Daily quota exceeded — resets at midnight", zh: "已超出每日流量限额——午夜重置", ja: "1日のトラフィック上限超過 — 深夜0時にリセットされます" },
    "api.reason.noData": { ko: "데이터 없음", en: "No data", zh: "无数据", ja: "データなし" },
    "api.reason.invalidResponse": { ko: "비정상 응답 — 활용신청 승인 상태 확인", en: "Invalid response — check application approval status", zh: "响应异常——请确认申请审批状态", ja: "異常な応答 — 利用申請の承認状況をご確認ください" },
    "api.reason.forbidden": { ko: "접근 거부(403) — 트래픽 초과 또는 승인 반영 대기", en: "Access denied (403) — quota exceeded or approval pending", zh: "访问被拒（403）——流量超限或审批处理中", ja: "アクセス拒否（403）— トラフィック超過または承認反映待ち" },
    "api.reason.tooMany": { ko: "요청 과다(429) — 잠시 후 재시도", en: "Too many requests (429) — try again shortly", zh: "请求过多（429）——请稍后重试", ja: "リクエスト過多（429）— しばらくしてから再試行してください" },
    "api.reason.serverError": { ko: "제공기관 서버 오류 — 잠시 후 재시도", en: "Provider server error — try again shortly", zh: "提供机构服务器错误——请稍后重试", ja: "提供機関のサーバーエラー — しばらくしてから再試行してください" },
    "api.reason.timeout": { ko: "응답 지연(시간 초과) — 잠시 후 재시도", en: "Response timed out — try again shortly", zh: "响应超时——请稍后重试", ja: "応答遅延（タイムアウト）— しばらくしてから再試行してください" },
    "api.reason.networkError": { ko: "서버 연결 실패 — Flask 프록시(localhost:5000) 확인", en: "Connection failed — check the Flask proxy (localhost:5000)", zh: "服务器连接失败——请检查Flask代理（localhost:5000）", ja: "サーバー接続失敗 — Flaskプロキシ（localhost:5000）をご確認ください" },

    // ---- 오늘의 AI 브리핑 문장 템플릿 (js/briefing-text.js) ----
    "briefing.factLine": { ko: "오늘 {{region}}는 {{parts}} 상태입니다.", en: "Today in {{region}}, conditions are: {{parts}}.", zh: "今天{{region}}的状况是：{{parts}}。", ja: "本日{{region}}は{{parts}}の状態です。" },
    "briefing.factLineLoading": { ko: "오늘 {{region}}의 실시간 정보를 확인하고 있습니다.", en: "Checking real-time info for {{region}} today.", zh: "正在查看{{region}}的今日实时信息。", ja: "本日の{{region}}のリアルタイム情報を確認しています。" },
    "briefing.tempPart": { ko: "기온 {{tmp}}°C", en: "{{tmp}}°C", zh: "气温 {{tmp}}°C", ja: "気温{{tmp}}°C" },
    "briefing.dustPart": { ko: "미세먼지 {{grade}}", en: "fine dust {{grade}}", zh: "微尘{{grade}}", ja: "微細粉じん{{grade}}" },
    "briefing.tempMinPart": { ko: "최저 {{tmn}}°C", en: "low {{tmn}}°C", zh: "最低 {{tmn}}°C", ja: "最低{{tmn}}°C" },
    "briefing.tempMaxPart": { ko: "최고 {{tmx}}°C", en: "high {{tmx}}°C", zh: "最高 {{tmx}}°C", ja: "最高{{tmx}}°C" },
    "briefing.tempRangeLine": { ko: " 오늘 기온은 {{range}}로 예보되었습니다.", en: " Today's forecast temperature is {{range}}.", zh: " 今日气温预报为{{range}}。", ja: " 本日の気温は{{range}}と予報されています。" },
    "common.yesterday": { ko: "어제", en: "yesterday", zh: "昨天", ja: "昨日" },
    "briefing.lastCheck": { ko: "지난 확인({{md}})", en: "last check ({{md}})", zh: "上次查询（{{md}}）", ja: "前回確認（{{md}}）" },
    "briefing.compareHigher": { ko: " {{ref}}보다 최고기온이 {{diff}}°C 높아요.", en: " The high is {{diff}}°C higher than {{ref}}.", zh: " 最高气温比{{ref}}高{{diff}}°C。", ja: " {{ref}}より最高気温が{{diff}}°C高いです。" },
    "briefing.compareLower": { ko: " {{ref}}보다 최고기온이 {{diff}}°C 낮아요.", en: " The high is {{diff}}°C lower than {{ref}}.", zh: " 最高气温比{{ref}}低{{diff}}°C。", ja: " {{ref}}より最高気温が{{diff}}°C低いです。" },
    "briefing.compareSame": { ko: " {{ref}}와 최고기온이 비슷해요.", en: " The high is about the same as {{ref}}.", zh: " 最高气温与{{ref}}相近。", ja: " {{ref}}と最高気温がほぼ同じです。" },
    "briefing.warnActive": { ko: " {{label}} 특보가 발효 중이니 참고하세요.", en: " A {{label}} advisory is in effect — please take note.", zh: " {{label}}特报生效中，请留意。", ja: " {{label}}特報が発令中ですのでご注意ください。" },
    "briefing.warnNone": { ko: " 현재 발효 중인 기상특보는 없습니다.", en: " No weather advisories are currently in effect.", zh: " 目前没有生效中的气象特报。", ja: " 現在発効中の気象特報はありません。" },
    "briefing.feelsLike": { ko: " 습도가 {{reh}}%로 높아 체감온도는 더 높게 느껴질 수 있습니다.", en: " Humidity is high at {{reh}}%, so it may feel warmer than the actual temperature.", zh: " 湿度高达{{reh}}%，体感温度可能更高。", ja: " 湿度が{{reh}}%と高く、体感温度はより高く感じられることがあります。" },
    "briefing.adviceHeat": { ko: " 더위가 심하니 물을 충분히 마시고, 한낮에는 가급적 야외활동을 피하세요.", en: " It's very hot — drink plenty of water and avoid outdoor activity during midday if possible.", zh: " 天气炎热，请多补充水分，白天尽量避免户外活动。", ja: " 猛暑のため、水分を十分に摂り、日中の屋外活動はできるだけ避けてください。" },
    "briefing.adviceCold": { ko: " 기온이 많이 낮으니 외출 시 따뜻하게 챙겨 입으세요.", en: " Temperatures are very low — dress warmly when going out.", zh: " 气温很低，外出时请注意保暖。", ja: " 気温がかなり低いので、外出時は暖かい服装を心がけてください。" },
    "briefing.adviceRainNow": { ko: " 지금 비가 내리고 있으니 우산을 챙기세요.", en: " It's raining right now — bring an umbrella.", zh: " 现在正在下雨，请携带雨伞。", ja: " 現在雨が降っていますので、傘をお持ちください。" },
    "briefing.adviceSnowNow": { ko: " 지금 눈이 내리고 있으니 우산과 방한 준비를 함께 하세요.", en: " It's snowing right now — bring an umbrella and dress warmly.", zh: " 现在正在下雪，请携带雨伞并注意保暖。", ja: " 現在雪が降っていますので、傘と防寒対策をお願いします。" },
    "briefing.adviceRainStart": { ko: " 오늘 {{hh}}시경부터 비/눈이 예상되니 우산을 챙기세요.", en: " Rain/snow is expected from around {{hh}}:00 today — bring an umbrella.", zh: " 预计今天{{hh}}点左右开始下雨/雪，请携带雨伞。", ja: " 本日{{hh}}時頃から雨・雪が予想されますので、傘をお持ちください。" },
    "briefing.advicePopHigh": { ko: " 강수확률이 {{pop}}%로 높으니 우산을 챙기는 걸 추천드립니다.", en: " There's a {{pop}}% chance of rain — an umbrella is recommended.", zh: " 降水概率高达{{pop}}%，建议携带雨伞。", ja: " 降水確率が{{pop}}%と高いため、傘の携帯をおすすめします。" },
    "briefing.adviceDustMask": { ko: " 미세먼지가 {{grade}} 수준이니 외출 시 마스크를 착용하세요.", en: " Fine dust levels are {{grade}} — wear a mask when going out.", zh: " 微尘水平为{{grade}}，外出时请佩戴口罩。", ja: " 微細粉じんが{{grade}}レベルのため、外出時はマスクを着用してください。" },
    "briefing.adviceFallbackOk": { ko: " 오늘 하루도 무리하지 않는 선에서 안전하게 보내세요.", en: " Take it easy and stay safe today.", zh: " 今天也请量力而行，注意安全。", ja: " 今日も無理のない範囲で安全にお過ごしください。" },
    "briefing.adviceFallbackFail": { ko: " 실시간 기온·강수 예보를 잠시 불러오지 못했어요. 곧 다시 확인해 드릴게요.", en: " We couldn't load the live temperature/rain forecast just now. We'll check again shortly.", zh: " 暂时无法获取实时气温·降水预报，稍后将再次为您确认。", ja: " リアルタイムの気温・降水予報を一時的に取得できませんでした。まもなく再確認します。" },

    // ---- 토스트 알림 (홈) ----
    "toast.voiceNotSupportedTitle": { ko: "음성 지원 안 됨", en: "Voice not supported", zh: "不支持语音", ja: "音声非対応" },
    "toast.voiceNotSupportedBody": { ko: "이 브라우저는 음성 읽기 기능을 지원하지 않습니다.", en: "This browser doesn't support text-to-speech.", zh: "此浏览器不支持语音朗读功能。", ja: "このブラウザは音声読み上げ機能に対応していません。" },
    "toast.bootTitle": { ko: "OLA AI 파트너 탑재", en: "OLA AI Partner online", zh: "OLA AI伙伴已搭载", ja: "OLA AIパートナー搭載" },
    "toast.bootBody": { ko: "성공적으로 시스템이 가동되었습니다. 실시간 밀착형 대시보드 상태입니다.", en: "System started successfully. Your real-time dashboard is now active.", zh: "系统已成功启动。当前为实时贴身仪表板状态。", ja: "システムが正常に起動しました。リアルタイム密着型ダッシュボード状態です。" },
    "toast.reportTitle": { ko: "신고가 접수되었습니다", en: "Report submitted", zh: "举报已提交", ja: "通報を受け付けました" },
    "toast.reportBody": { ko: "검토 후 조치할게요. (데모용 시뮬레이션입니다)", en: "We'll review and take action. (This is a demo simulation.)", zh: "审核后将采取处理措施。（此为演示模拟）", ja: "確認の上、対応いたします。（デモ用シミュレーションです）" },

    // ---- 실시간 커뮤니티 톡 (UI 문구) ----
    "talk.commentPlaceholder": { ko: "댓글을 입력하세요...", en: "Write a comment...", zh: "请输入评论...", ja: "コメントを入力してください..." },
    "talk.register": { ko: "등록", en: "Post", zh: "发布", ja: "登録" },
    "talk.composerPlaceholder": { ko: "주변 안전 정보나 생활 이야기를 나눠보세요... (#안전제보)", en: "Share safety info or everyday news nearby... (#SafetyReport)", zh: "分享附近的安全信息或生活趣事...（#安全举报）", ja: "周辺の安全情報や暮らしの話を共有しましょう...（#安全通報）" },
    "talk.submit": { ko: "톡 등록", en: "Post", zh: "发布", ja: "投稿" },
    "talk.emptyWarning": { ko: "⚠️ 내용을 입력하거나 사진을 첨부해주세요!", en: "⚠️ Please enter text or attach a photo!", zh: "⚠️ 请输入内容或添加照片！", ja: "⚠️ 内容を入力するか、写真を添付してください！" },
    "talk.catAll": { ko: "전체", en: "All", zh: "全部", ja: "すべて" },
    "talk.catUrgent": { ko: "🔥 긴급·제보", en: "🔥 Urgent", zh: "🔥 紧急·举报", ja: "🔥 緊急・通報" },
    "talk.catSafety": { ko: "📢 안전·정보", en: "📢 Safety info", zh: "📢 安全·信息", ja: "📢 安全・情報" },
    "talk.catNews": { ko: "💬 동네소식", en: "💬 Neighborhood news", zh: "💬 社区消息", ja: "💬 地域ニュース" },
    "talk.suggestedTags": { ko: "추천 태그:", en: "Suggested tags:", zh: "推荐标签：", ja: "おすすめタグ：" },
    "talk.titlePhoto": { ko: "사진 촬영", en: "Take a photo", zh: "拍照", ja: "写真撮影" },
    "talk.titleImage": { ko: "이미지 첨부", en: "Attach an image", zh: "添加图片", ja: "画像添付" },
    "talk.titleLocation": { ko: "내 위치 태그하기", en: "Tag my location", zh: "标记我的位置", ja: "位置情報をタグ付け" },
    "talk.titleEmoji": { ko: "이모티콘", en: "Emoji", zh: "表情符号", ja: "絵文字" },
    "talk.attachedImageAlt": { ko: "첨부 이미지", en: "Attached image", zh: "附加图片", ja: "添付画像" },
    "talk.reportTitle": { ko: "신고하기", en: "Report", zh: "举报", ja: "通報する" },
    "talk.reportDone": { ko: "신고 완료", en: "Reported", zh: "举报完成", ja: "通報完了" },
    "talk.me": { ko: "나", en: "Me", zh: "我", ja: "自分" },
    "talk.justPosted": { ko: "방금 작성", en: "Just posted", zh: "刚刚发布", ja: "たった今投稿" },
    "talk.justNow": { ko: "방금 전", en: "Just now", zh: "刚刚", ja: "たった今" },
    "talk.delete": { ko: "삭제", en: "Delete", zh: "删除", ja: "削除" },
    "talk.defaultTag": { ko: "#실시간정보", en: "#LiveUpdate", zh: "#实时信息", ja: "#リアルタイム情報" },
    "home.myNeighborhood": { ko: "우리 동네", en: "My neighborhood", zh: "我的社区", ja: "私の地域" },
    "home.briefingHeading": { ko: "오늘의 올라 브리핑", en: "Today's OLA Briefing", zh: "今日OLA简报", ja: "今日のOLAブリーフィング" },
    "home.briefingVoiceTitle": { ko: "음성으로 듣기", en: "Listen by voice", zh: "语音收听", ja: "音声で聞く" },
    "home.briefingLoadingText": { ko: "오늘의 브리핑을 불러오는 중입니다.", en: "Loading today's briefing.", zh: "正在加载今日简报。", ja: "本日のブリーフィングを読み込んでいます。" },
    "home.lifeIndexHeading": { ko: "오늘의 생활 지수", en: "Today's Living Index", zh: "今日生活指数", ja: "今日の生活指数" },
    "home.liveSyncDone": { ko: "실시간 동기화 완료", en: "Live sync complete", zh: "实时同步完成", ja: "リアルタイム同期完了" },
    "home.safetyGuardianLabel": { ko: "우리동네 안심 지킴이", en: "Neighborhood Safety Guardian", zh: "我们社区安心守护者", ja: "地域安心見守り" },
    "home.weatherAirLabel": { ko: "날씨 & 대기", en: "Weather & Air", zh: "天气与空气", ja: "天気・大気" },
    "home.dustLabel": { ko: "대기 미세먼지", en: "Fine dust", zh: "空气微尘", ja: "大気微細粉じん" },
    "home.fireRiskLabel": { ko: "화재·재난 위험도", en: "Fire/disaster risk", zh: "火灾·灾害风险", ja: "火災・災害リスク" },
    "home.erCongestionLabel": { ko: "응급실 혼잡도", en: "ER congestion", zh: "急诊室拥挤度", ja: "救急室混雑度" },
    "home.outdoorIndexLabel": { ko: "야외 활동 지수", en: "Outdoor activity index", zh: "户外活动指数", ja: "屋外活動指数" },
    "common.checking": { ko: "확인 중…", en: "Checking…", zh: "确认中…", ja: "確認中…" },
    "home.safetyMapHeading": { ko: "안심 · 비상 시설 지도", en: "Safety & Emergency Facility Map", zh: "安心·应急设施地图", ja: "安心・緊急施設マップ" },
    "home.safetyMapSubtitle": { ko: "내 주변 비상 시설 위치 및 최단거리 실시간 매핑", en: "Live mapping of nearby emergency facilities and shortest routes", zh: "实时映射附近应急设施位置及最短距离", ja: "周辺の緊急施設位置と最短距離のリアルタイムマッピング" },
    "home.centerOnMe": { ko: "내 위치 중심 보기", en: "Center on my location", zh: "以我的位置为中心", ja: "自分の位置を中心に表示" },
    "home.legendHospital": { ko: "병원", en: "Hospital", zh: "医院", ja: "病院" },
    "home.legendPharmacy": { ko: "약국", en: "Pharmacy", zh: "药店", ja: "薬局" },
    "home.legendWomenSafeRoute": { ko: "여성안심길", en: "Women's safe route", zh: "女性安心路", ja: "女性安心ロード" },
    "home.legendPoliceBox": { ko: "지구대·파출소", en: "Police box", zh: "派出所", ja: "交番" },
    "home.breakingNews": { ko: "🚨 속보", en: "🚨 Breaking", zh: "🚨 速报", ja: "🚨 速報" },
    "home.talkHeading": { ko: "실시간 커뮤니티 톡", en: "Live Community Talk", zh: "实时社区聊天", ja: "リアルタイムコミュニティトーク" },
    "home.talkSubtitle": { ko: "우리 동네 이웃들의 실시간 안전·생활 이야기", en: "Real-time safety & daily-life talk from your neighbors", zh: "邻里的实时安全·生活分享", ja: "ご近所さんのリアルタイム安全・暮らしの話" },

    // ---- 브리핑 상세 ----
    "briefing.title": { ko: "오늘의 AI 브리핑", en: "Today's AI Briefing", zh: "今日AI简报", ja: "今日のAIブリーフィング" },
    "briefing.aiGuide": { ko: "AI 추천 가이드", en: "AI Recommended Guide", zh: "AI推荐指南", ja: "AIおすすめガイド" },
    "briefing.recentInfo": { ko: "최근 주요 정보", en: "Recent updates", zh: "最新重要信息", ja: "最近の主要情報" },
    "briefing.safetyMap": { ko: "안전 지도", en: "Safety map", zh: "安全地图", ja: "安全マップ" },
    "briefing.legendSafe": { ko: "안전 (80-100)", en: "Safe (80-100)", zh: "安全 (80-100)", ja: "安全 (80-100)" },
    "briefing.legendNormal": { ko: "보통 (50-79)", en: "Moderate (50-79)", zh: "一般 (50-79)", ja: "普通 (50-79)" },
    "briefing.legendCaution": { ko: "주의 (20-49)", en: "Caution (20-49)", zh: "注意 (20-49)", ja: "注意 (20-49)" },
    "briefing.legendDanger": { ko: "위험 (0-19)", en: "Danger (0-19)", zh: "危险 (0-19)", ja: "危険 (0-19)" },

    // ---- 생활안전 ----
    "safety.title": { ko: "생활안전 심층 데이터 대시보드", en: "Safety Deep Data Dashboard", zh: "生活安全深度数据仪表板", ja: "生活安全 深層データダッシュボード" },
    "safety.subtitle": { ko: "분석을 원하는 자치구를 선택하면 실시간 지수, 범죄 추이, 대피 시설이 동기화됩니다.", en: "Select a district to sync real-time index, crime trends, and shelter data.", zh: "选择要分析的自治区后，将同步实时指数、犯罪趋势及避难设施信息。", ja: "分析したい自治区を選択すると、リアルタイム指数・犯罪推移・避難施設が同期されます。" },
    "safety.overallScore": { ko: "종합 안전지수", en: "Overall safety index", zh: "综合安全指数", ja: "総合安全指数" },
    "safety.aiReport": { ko: "AI 안전 분석 리포트", en: "AI Safety Report", zh: "AI安全分析报告", ja: "AI安全分析レポート" },
    "safety.crimeByType": { ko: "범죄 유형별 발생 건수", en: "Crime cases by type", zh: "各类犯罪发生件数", ja: "犯罪類型別発生件数" },
    "safety.ranking": { ko: "위험지수 비교", en: "Risk index comparison", zh: "风险指数比较", ja: "危険指数比較" },
    "safety.weatherStatus": { ko: "기상특보 현황", en: "Weather warnings", zh: "气象特报现况", ja: "気象特報現況" },
    "safety.shelters": { ko: "반경 내 대피시설", en: "Shelters nearby", zh: "半径内避难设施", ja: "半径内避難施設" },
    "safety.liveWeatherSafetyIndicators": { ko: "실시간 기상 및 안전 지표", en: "Live weather & safety indicators", zh: "实时气象及安全指标", ja: "リアルタイム気象・安全指標" },
    "safety.warningPopoverDesc": { ko: "기상청 기상특보 조회서비스 실시간 연동 · 전국", en: "Live from KMA weather warning service · Nationwide", zh: "气象厅气象特报查询服务实时联动 · 全国", ja: "気象庁 気象特報照会サービス リアルタイム連携・全国" },
    "safety.forecastServiceDesc": { ko: "기상청 단기예보 조회서비스 실시간 연동", en: "Live from KMA short-term forecast service", zh: "气象厅短期预报查询服务实时联动", ja: "気象庁 短期予報照会サービス リアルタイム連携" },
    "safety.refreshLocationWeather": { ko: "위치·날씨 새로고침", en: "Refresh location & weather", zh: "刷新位置和天气", ja: "位置・天気を更新" },
    "safety.liveWeatherCoordTitle": { ko: "실시간 기상좌표", en: "Live weather coordinates", zh: "实时气象坐标", ja: "リアルタイム気象座標" },
    "safety.currentLocationLabel": { ko: "현재 위치", en: "Current location", zh: "当前位置", ja: "現在地" },
    "safety.latLabel": { ko: "위도", en: "Latitude", zh: "纬度", ja: "緯度" },
    "safety.lngLabel": { ko: "경도", en: "Longitude", zh: "经度", ja: "経度" },
    "safety.gridLabel": { ko: "기상 격자", en: "Weather grid", zh: "气象网格", ja: "気象グリッド" },
    "safety.basisTimeLabel": { ko: "기준 시각", en: "Reference time", zh: "基准时间", ja: "基準時刻" },
    "safety.currentTempLabel": { ko: "현재 기온", en: "Current temp", zh: "当前气温", ja: "現在気温" },
    "safety.todayLowLabel": { ko: "오늘 최저", en: "Today's low", zh: "今日最低", ja: "本日最低" },
    "safety.todayHighLabel": { ko: "오늘 최고", en: "Today's high", zh: "今日最高", ja: "本日最高" },
    "safety.dataUpdatedLabel": { ko: "데이터 갱신", en: "Data updated", zh: "数据更新", ja: "データ更新" },
    "safety.checkingValue": { ko: "확인 중", en: "Checking", zh: "确认中", ja: "確認中" },
    "safety.prevDate": { ko: "이전 날짜", en: "Previous day", zh: "上一天", ja: "前の日" },
    "safety.nextDate": { ko: "다음 날짜", en: "Next day", zh: "下一天", ja: "次の日" },
    "safety.lowLabel": { ko: "최저", en: "Low", zh: "最低", ja: "最低" },
    "safety.highLabel": { ko: "최고", en: "High", zh: "最高", ja: "最高" },
    "safety.popLabel": { ko: "강수확률", en: "Precip. chance", zh: "降水概率", ja: "降水確率" },
    "safety.hourlyWeatherHeading": { ko: "시간별 날씨 (1시간 간격)", en: "Hourly weather (1-hour interval)", zh: "逐时天气（每小时）", ja: "時間別天気（1時間間隔）" },
    "safety.hourlyToggleAriaLabel": { ko: "시간별 날씨 접기/펼치기", en: "Expand/collapse hourly weather", zh: "展开/收起逐时天气", ja: "時間別天気の折りたたみ/展開" },
    "safety.crimeTrendHeading": { ko: "범죄 유형별 발생 추이", en: "Crime trends by type", zh: "各类犯罪发生趋势", ja: "犯罪類型別発生推移" },
    "safety.crimeTrendDisclaimer": { ko: "예시 데이터 · 경찰청 통계(2024.12.31 기준) 기반 참고용 그래프", en: "Sample data · Reference chart based on police statistics (as of 2024.12.31)", zh: "示例数据 · 基于警察厅统计（截至2024.12.31）的参考图表", ja: "サンプルデータ・警察庁統計（2024.12.31基準）に基づく参考グラフ" },
    "safety.riskTop5Heading": { ko: "위험지수 TOP5", en: "Top 5 risk index", zh: "风险指数 TOP5", ja: "危険指数 TOP5" },
    "safety.rankingDescPrefix": { ko: "범죄 발생건수 기준 같은 시도 내 상대 지수", en: "Relative index within the same province, based on crime counts", zh: "以犯罪发生数为基准的同省相对指数", ja: "犯罪発生件数基準の同一広域自治体内相対指数" },

    // ---- 생활안전(safety.js 동적 콘텐츠) ----
    "safety.tierSafe": { ko: "안전", en: "Safe", zh: "安全", ja: "安全" },
    "safety.tierModerate": { ko: "보통", en: "Moderate", zh: "一般", ja: "普通" },
    "safety.tierCaution": { ko: "주의", en: "Caution", zh: "注意", ja: "注意" },
    "safety.riskHigh": { ko: "높은 위험", en: "High risk", zh: "高风险", ja: "高リスク" },
    "safety.riskModerate": { ko: "보통 위험", en: "Moderate risk", zh: "中风险", ja: "中リスク" },
    "safety.riskLow": { ko: "낮은 위험", en: "Low risk", zh: "低风险", ja: "低リスク" },
    "safety.scoreTrendStart": { ko: "오늘부터 안전지수 변화를 기록해요", en: "We'll start tracking your safety index from today", zh: "从今天开始记录安全指数变化", ja: "本日から安全指数の変化を記録します" },
    "safety.scoreTrendYesterday": { ko: "어제", en: "Yesterday", zh: "昨天", ja: "昨日" },
    "safety.scoreTrendDaysAgo": { ko: "지난 {{n}}일", en: "{{n}} days ago", zh: "{{n}}天前", ja: "{{n}}日前" },
    "safety.scoreTrendUp": { ko: "{{day}} 대비 ▲{{diff}}점 상승", en: "▲{{diff}} pts vs {{day}}", zh: "较{{day}} ▲{{diff}}分 上升", ja: "{{day}}比 ▲{{diff}}点 上昇" },
    "safety.scoreTrendDown": { ko: "{{day}} 대비 ▼{{diff}}점 하락", en: "▼{{diff}} pts vs {{day}}", zh: "较{{day}} ▼{{diff}}分 下降", ja: "{{day}}比 ▼{{diff}}点 下降" },
    "safety.scoreTrendFlat": { ko: "{{day}} 대비 변동 없음", en: "No change vs {{day}}", zh: "较{{day}}无变化", ja: "{{day}}比 変動なし" },
    "safety.crimeCatViolent": { ko: "강력", en: "Violent", zh: "暴力", ja: "凶悪" },
    "safety.crimeCatTheft": { ko: "절도", en: "Theft", zh: "盗窃", ja: "窃盗" },
    "safety.crimeCatAssault": { ko: "폭력", en: "Assault", zh: "伤害", ja: "暴力" },
    "safety.crimeCatFraud": { ko: "지능", en: "Fraud", zh: "智能型", ja: "知能" },
    "safety.crimeCatTraffic": { ko: "교통", en: "Traffic", zh: "交通", ja: "交通" },
    "safety.crimeCatOther": { ko: "기타", en: "Other", zh: "其他", ja: "その他" },
    "safety.monthShort": { ko: "{{month}}월", en: "{{month}}", zh: "{{month}}月", ja: "{{month}}月" },
    "safety.unitCases": { ko: "(건)", en: "(cases)", zh: "(件)", ja: "(件)" },
    "safety.trendDecrease": { ko: "감소", en: "decreasing", zh: "减少", ja: "減少" },
    "safety.trendIncrease": { ko: "증가", en: "increasing", zh: "增加", ja: "増加" },
    "safety.trendFlat": { ko: "보합", en: "flat", zh: "持平", ja: "横ばい" },
    "safety.crimeInsightLabel": { ko: "데이터 해석", en: "Data insight", zh: "数据解读", ja: "データ解釈" },
    "safety.crimeInsightSentence": {
      ko: "{{cat}} 발생이 가장 많으며, 그래프 기간 동안 전체 범죄 발생은 {{trend}} 추세입니다.",
      en: "{{cat}} incidents are the most common, and overall crime has been {{trend}} over this period.",
      zh: "{{cat}}发生数量最多，图表期间整体犯罪呈{{trend}}趋势。",
      ja: "{{cat}}の発生が最も多く、グラフ期間中の全体犯罪は{{trend}}傾向です。",
    },
    "safety.rankingScopeLabel": { ko: "{{region}} {{count}}개 지역", en: "{{count}} regions in {{region}}", zh: "{{region}} {{count}}个地区", ja: "{{region}} {{count}}地域" },
    "safety.myRankBadge": { ko: "내 지역 {{rank}}위/{{total}}", en: "My region: #{{rank}}/{{total}}", zh: "我的地区 第{{rank}}名/共{{total}}", ja: "自分の地域 {{rank}}位/{{total}}" },
    "safety.basisTimePending": { ko: "기준 시각 확인 중", en: "Checking reference time", zh: "正在确认基准时间", ja: "基準時刻確認中" },
    "safety.updatedTimePending": { ko: "갱신 시각 확인 중", en: "Checking update time", zh: "正在确认更新时间", ja: "更新時刻確認中" },
    "safety.locationUnavailable": { ko: "위치 정보를 확인할 수 없습니다", en: "Location unavailable", zh: "无法确认位置信息", ja: "位置情報を確認できません" },
    "safety.latUnavailable": { ko: "위도 정보 없음", en: "No latitude data", zh: "无纬度信息", ja: "緯度情報なし" },
    "safety.lngUnavailable": { ko: "경도 정보 없음", en: "No longitude data", zh: "无经度信息", ja: "経度情報なし" },
    "safety.gridUnavailable": { ko: "기상 격자 정보 없음", en: "No weather grid data", zh: "无气象网格信息", ja: "気象グリッド情報なし" },
    "safety.weatherLoadingStatus": { ko: "기상 데이터를 불러오는 중입니다", en: "Loading weather data", zh: "正在加载气象数据", ja: "気象データを読み込み中です" },
    "safety.currentTempUnavailable": { ko: "현재 기온 자료 없음", en: "No current temperature data", zh: "无当前气温数据", ja: "現在気温データなし" },
    "safety.tmnUnavailable": { ko: "최저기온 자료 없음", en: "No low temperature data", zh: "无最低气温数据", ja: "最低気温データなし" },
    "safety.tmxUnavailable": { ko: "최고기온 자료 없음", en: "No high temperature data", zh: "无最高气温数据", ja: "最高気温データなし" },
    "safety.usingSelectedRegionCenter": { ko: "선택한 지역의 중심 좌표 기준으로 표시 중입니다", en: "Showing based on the selected region's center coordinates", zh: "正在按所选地区中心坐标显示", ja: "選択した地域の中心座標を基準に表示中です" },
    "safety.usingDefaultLocation": { ko: "기본 위치 기준으로 표시 중입니다", en: "Showing based on the default location", zh: "正在按默认位置显示", ja: "デフォルト位置を基準に表示中です" },
    "safety.forecastLoadFailed": { ko: "실시간 예보를 불러오지 못했습니다", en: "Failed to load the latest forecast", zh: "未能加载实时天气预报", ja: "リアルタイム予報を読み込めませんでした" },
    "safety.tmnFromHourly": { ko: "현재 발표 자료에 최저기온이 없어 시간별 예보로 계산했습니다", en: "The latest release had no low temperature, so it was calculated from the hourly forecast", zh: "当前发布资料中没有最低气温数据，已根据逐时预报计算", ja: "現在の発表資料に最低気温がないため、時間別予報から計算しました" },
    "safety.tmnFromPreviousRelease": {
      ko: "현재 발표 자료에 최저기온이 없어 같은 날 {{release}} 발표 자료를 사용했습니다",
      en: "The latest release had no low temperature, so the {{release}} release from the same day was used",
      zh: "当前发布资料中没有最低气温数据，已使用当日{{release}}发布的资料",
      ja: "現在の発表資料に最低気温がないため、同日{{release}}発表の資料を使用しました",
    },
    "safety.previousReleaseFallback": { ko: "이전", en: "an earlier", zh: "此前", ja: "以前" },
    "safety.tmxFromHourly": { ko: "최고기온은 시간별 예보로 계산했습니다", en: "High temperature was calculated from the hourly forecast", zh: "最高气温已根据逐时预报计算", ja: "最高気温は時間別予報から計算しました" },
    "safety.tmxFromPreviousRelease": { ko: "최고기온은 같은 날 이전 발표 자료를 사용했습니다", en: "High temperature used an earlier release from the same day", zh: "最高气温使用了当日此前发布的资料", ja: "最高気温は同日の以前の発表資料を使用しました" },
    "safety.obsTimeBasis": { ko: "{{hh}}:00 실시간 관측 기준 (하늘상태·강수확률은 예보)", en: "As of {{hh}}:00 live observation (sky/precip. chance are forecast)", zh: "{{hh}}:00 实时观测基准（天空状态・降水概率为预报）", ja: "{{hh}}:00 リアルタイム観測基準（空模様・降水確率は予報）" },
    "safety.forecastTimeBasis": { ko: "{{mm}}.{{dd}} {{hh}}:00 예보 기준", en: "As of {{mm}}.{{dd}} {{hh}}:00 forecast", zh: "{{mm}}.{{dd}} {{hh}}:00 预报基准", ja: "{{mm}}.{{dd}} {{hh}}:00 予報基準" },
    "safety.todayBadge": { ko: "오늘 {{date}}", en: "Today {{date}}", zh: "今天 {{date}}", ja: "今日 {{date}}" },
    "safety.todayShort": { ko: "오늘", en: "Today", zh: "今天", ja: "今日" },
    "safety.warningActiveBadge": { ko: "{{warning}} 발효 중", en: "{{warning}} in effect", zh: "{{warning}}生效中", ja: "{{warning}}発令中" },
    "safety.tomorrow": { ko: "내일", en: "Tomorrow", zh: "明天", ja: "明日" },
    "safety.dayAfterTomorrow": { ko: "모레", en: "Day after tomorrow", zh: "后天", ja: "明後日" },
    "safety.plusDays": { ko: "+{{n}}일", en: "+{{n}} days", zh: "+{{n}}天", ja: "+{{n}}日" },
    "safety.hourlyForecastLoadFailed": { ko: "시간별 예보를 불러오지 못했습니다.", en: "Failed to load the hourly forecast.", zh: "未能加载逐时天气预报。", ja: "時間別予報を読み込めませんでした。" },
    "safety.precipAmountLabel": { ko: "강수량", en: "Precipitation", zh: "降水量", ja: "降水量" },
    "safety.humidityLabel": { ko: "습도", en: "Humidity", zh: "湿度", ja: "湿度" },
    "safety.windLabel": { ko: "바람", en: "Wind", zh: "风", ja: "風" },
    "safety.tomorrowHour": { ko: "내일 {{hh}}시", en: "Tomorrow {{hh}}:00", zh: "明天{{hh}}点", ja: "明日{{hh}}時" },
    "safety.hourLabel": { ko: "{{hh}}시", en: "{{hh}}:00", zh: "{{hh}}点", ja: "{{hh}}時" },
    "safety.now": { ko: "지금", en: "Now", zh: "现在", ja: "今" },
    "safety.noActiveWarnings": { ko: "현재 전국에 발효된 기상특보가 없습니다.", en: "There are no active weather warnings nationwide right now.", zh: "目前全国没有生效的气象特报。", ja: "現在、全国で発令中の気象特報はありません。" },
    "safety.warningBadgeLabel": { ko: "기상특보", en: "Weather warning", zh: "气象特报", ja: "気象特報" },
    "safety.issuedAt": { ko: "발표 {{time}}", en: "Issued {{time}}", zh: "发布 {{time}}", ja: "発表 {{time}}" },
    "safety.effectiveAt": { ko: "발효 {{time}}", en: "Effective {{time}}", zh: "生效 {{time}}", ja: "発効 {{time}}" },
    "safety.tipViolentCrime": { ko: "늦은 밤 인적 드문 골목길 이용 자제하기", en: "Avoid deserted alleys late at night", zh: "深夜避免走人迹稀少的小巷", ja: "深夜は人通りの少ない路地を避ける" },
    "safety.tipTheftCrime": { ko: "차량·자전거 등 귀중품 잠금 관리 철저히 하기", en: "Lock up vehicles, bicycles, and valuables carefully", zh: "妥善锁好车辆、自行车等贵重物品", ja: "車両・自転車など貴重品の施錠管理を徹底する" },
    "safety.tipAssaultCrime": { ko: "심야 시간 유흥가 주변 혼자 다니지 않기", en: "Avoid walking alone near entertainment districts late at night", zh: "深夜避免独自在娱乐街区周边活动", ja: "深夜は繁華街周辺を一人で歩かない" },
    "safety.tipFraudCrime": { ko: "출처 불명 문자·전화의 금융사기 주의하기", en: "Watch out for financial scams via unknown texts or calls", zh: "谨防来历不明短信、电话的金融诈骗", ja: "身に覚えのないSMS・電話による金融詐欺に注意する" },
    "safety.tipTrafficCrime": { ko: "무단횡단·과속 등 교통법규 준수하기", en: "Follow traffic laws — no jaywalking or speeding", zh: "遵守交通规则，不闯红灯、不超速", ja: "無断横断・スピード違反などの交通ルールを守る" },
    "safety.tipOtherCrime": { ko: "우리 동네 순찰 강화 지역 미리 확인해두기", en: "Check which areas near you have increased patrols", zh: "提前了解本社区的重点巡逻区域", ja: "自分の地域の巡回強化エリアを事前に確認しておく" },
    "safety.actionLowScore": { ko: "종합 안전도가 낮은 지역이니 외출 시 주변 상황 살피기", en: "This area's overall safety score is low — stay alert to your surroundings when out", zh: "该地区综合安全度较低，外出时请留意周边情况", ja: "総合安全度が低い地域です。外出時は周囲の状況に注意しましょう" },
    "safety.actionGoodScore": { ko: "종합 안전도가 양호해요, 평소 안전수칙만 유지하기", en: "Overall safety score is good — just keep up your usual safety habits", zh: "综合安全度良好，请保持日常安全习惯即可", ja: "総合安全度は良好です。普段の安全習慣を維持しましょう" },
    "safety.actionAvoidDarkStreets": { ko: "야간 외출 시 인적 드문 길 피하기", en: "Avoid deserted streets when out at night", zh: "夜间外出时避开人迹稀少的道路", ja: "夜間の外出時は人通りの少ない道を避ける" },
    "safety.actionDrinkWater": { ko: "물 자주 마시기", en: "Drink water frequently", zh: "多喝水", ja: "こまめに水分補給する" },
    "safety.actionAvoidMidday": { ko: "한낮 외출 자제하기", en: "Avoid going out at midday", zh: "尽量避免正午外出", ja: "日中の外出は控える" },
    "safety.actionDressWarm": { ko: "외출 시 따뜻하게 착용하기", en: "Dress warmly when going out", zh: "外出时注意保暖", ja: "外出時は暖かい服装をする" },
    "safety.actionBringUmbrella": { ko: "우산 챙기기", en: "Bring an umbrella", zh: "记得带伞", ja: "傘を持って出かける" },
    "safety.actionWearMask": { ko: "마스크 착용하기", en: "Wear a mask", zh: "佩戴口罩", ja: "マスクを着用する" },
    "safety.actionCheckShelter": { ko: "가까운 대피소 위치 확인하기", en: "Check the location of the nearest shelter", zh: "提前确认附近避难所位置", ja: "近くの避難所の位置を確認する" },
    "safety.actionSaveEmergencyContacts": { ko: "비상연락처 미리 저장해두기", en: "Save emergency contacts in advance", zh: "提前保存紧急联络方式", ja: "緊急連絡先を事前に保存しておく" },
    "safety.actionCheckEmergencySupplies": { ko: "상비약·손전등 등 비상용품 점검하기", en: "Check emergency supplies like medicine and a flashlight", zh: "检查常备药、手电筒等应急物品", ja: "常備薬・懐中電灯など非常用品を点検する" },
    "safety.actionCheckRiskAreas": { ko: "우리 동네 위험지역 미리 확인해두기", en: "Check risk areas in your neighborhood in advance", zh: "提前了解本社区的危险区域", ja: "自分の地域の危険地域を事前に確認しておく" },
    "safety.actionKnowSosButton": { ko: "긴급 SOS 버튼 위치 알아두기", en: "Know the location of the emergency SOS button", zh: "提前了解紧急SOS按钮位置", ja: "緊急SOSボタンの位置を知っておく" },
    "safety.aiRecommendedActions": { ko: "AI 추천 행동", en: "AI Recommended Actions", zh: "AI推荐行动", ja: "AIおすすめ行動" },
    "safety.walkMinutes": { ko: "도보 {{n}}분", en: "{{n}} min walk", zh: "步行{{n}}分钟", ja: "徒歩{{n}}分" },
    "safety.nearbyInfraLoadFailed": { ko: "주변 안심 인프라 정보를 불러오지 못했습니다.", en: "Failed to load nearby safety facilities.", zh: "未能加载周边安心设施信息。", ja: "周辺の安心インフラ情報を読み込めませんでした。" },
    "safety.nearbyInfraLoading": { ko: "주변 안심 인프라를 찾는 중...", en: "Finding nearby safety facilities...", zh: "正在查找周边安心设施...", ja: "周辺の安心インフラを検索中..." },
    "safety.rowShelter": { ko: "대피소 · {{name}}", en: "Shelter · {{name}}", zh: "避难所 · {{name}}", ja: "避難所 · {{name}}" },
    "safety.rowHospital": { ko: "병원 · {{name}}", en: "Hospital · {{name}}", zh: "医院 · {{name}}", ja: "病院 · {{name}}" },
    "safety.rowAed": { ko: "AED · {{name}}", en: "AED · {{name}}", zh: "AED · {{name}}", ja: "AED · {{name}}" },
    "safety.rowPolice": { ko: "경찰 · {{name}}", en: "Police · {{name}}", zh: "警察 · {{name}}", ja: "警察 · {{name}}" },
    "safety.rowPharmacy": { ko: "약국 · {{name}}", en: "Pharmacy · {{name}}", zh: "药店 · {{name}}", ja: "薬局 · {{name}}" },
    "safety.aedFallbackName": { ko: "설치 위치", en: "Installed location", zh: "安装位置", ja: "設置場所" },
    "safety.nearestInfraHeading": { ko: "내 주변 최단거리 안심 인프라", en: "Nearest safety facilities", zh: "我周边最近的安心设施", ja: "自分の近くの最短安心インフラ" },
    "safety.favTitle": { ko: "{{region}} 안전 정보", en: "{{region}} Safety Info", zh: "{{region}} 安全信息", ja: "{{region}} 安全情報" },
    "safety.favSubtitle": { ko: "생활안전 · 즐겨찾는 지역", en: "Safety · Favorite region", zh: "生活安全 · 收藏地区", ja: "生活安全・お気に入り地域" },
    "safety.weatherLabelNone": { ko: "특보 없음", en: "No warnings", zh: "无特报", ja: "特報なし" },
    "safety.weatherLabelFailed": { ko: "조회 실패", en: "Lookup failed", zh: "查询失败", ja: "取得失敗" },

    // ---- 긴급 SOS 모달(js/ui.js에서 동적 생성) ----
    "sos.desc": { ko: "위급 상황이면 아래에서 바로 전화하거나 보호자에게 알릴 수 있어요.", en: "In an emergency, call directly or notify a guardian below.", zh: "如遇紧急情况，可在下方直接拨打电话或通知监护人。", ja: "緊急時は下記からすぐに電話するか、保護者に知らせることができます。" },
    "sos.policeTitle": { ko: "112 경찰 신고", en: "112 Police report", zh: "112 报警", ja: "112 警察通報" },
    "sos.fireTitle": { ko: "119 소방·구급 신고", en: "119 Fire & ambulance", zh: "119 消防·急救", ja: "119 消防・救急" },
    "sos.tapToCall": { ko: "탭하면 바로 전화 연결", en: "Tap to call", zh: "点击即可拨打电话", ja: "タップで電話がつながります" },
    "sos.notifyGuardianTitle": { ko: "보호자에게 알림 보내기", en: "Notify a guardian", zh: "向监护人发送通知", ja: "保護者に通知を送る" },
    "sos.notifyGuardianDesc": { ko: "데모 시뮬레이션 (실제 발송 안 됨)", en: "Demo simulation (not actually sent)", zh: "演示模拟（实际不会发送）", ja: "デモシミュレーション（実際には送信されません）" },
    "sos.toastTitle": { ko: "보호자에게 긴급 알림 전송", en: "Emergency alert sent to guardian", zh: "已向监护人发送紧急通知", ja: "保護者に緊急通知を送信しました" },
    "sos.toastDesc": { ko: "등록된 보호자에게 현재 위치와 함께 긴급 상황을 알렸습니다. (데모)", en: "Your registered guardian has been notified of the emergency along with your current location. (Demo)", zh: "已将紧急情况及当前位置通知给已登记的监护人。（演示）", ja: "登録済みの保護者に現在地とともに緊急事態を知らせました。（デモ）" },



    // ---- 재난 ----
    "disaster.title": { ko: "재난", en: "Disaster", zh: "灾害", ja: "災害" },
    "disaster.subtitle": { ko: "기상정보 · 특보 현황 · 행동요령", en: "Weather · Warnings · Guidelines", zh: "气象信息 · 特报现况 · 行动指南", ja: "気象情報・特報現況・行動要領" },
    "disaster.todayWeather": { ko: "오늘의 날씨", en: "Today's weather", zh: "今日天气", ja: "今日の天気" },
    "disaster.warningStatus": { ko: "기상특보 현황", en: "Weather warnings", zh: "气象特报现况", ja: "気象特報現況" },
    "disaster.guides": { ko: "재난 상황 행동요령", en: "Disaster response guides", zh: "灾害应对行动指南", ja: "災害時行動要領" },
    "disaster.shelters": { ko: "반경 내 대피시설", en: "Shelters nearby", zh: "半径内避难设施", ja: "半径内避難施設" },
    "disaster.temp": { ko: "기온", en: "Temp", zh: "气温", ja: "気温" },
    "disaster.sky": { ko: "하늘상태", en: "Sky", zh: "天空状态", ja: "空模様" },
    "disaster.pty": { ko: "강수형태", en: "Precipitation", zh: "降水形态", ja: "降水形態" },
    "disaster.pop": { ko: "강수확률", en: "Chance of rain", zh: "降水概率", ja: "降水確率" },
    "disaster.humidWind": { ko: "습도 · 풍속", en: "Humidity · Wind", zh: "湿度 · 风速", ja: "湿度・風速" },
    "disaster.noWarning": { ko: "현재 발효된 기상특보가 없습니다.", en: "No active weather warnings right now.", zh: "目前没有生效的气象特报。", ja: "現在発効中の気象特報はありません。" },

    // ---- 응급 ----
    "emergency.title": { ko: "행동요령", en: "Action Guide", zh: "行动指南", ja: "行動要領" },
    "emergency.subtitle": { ko: "병원·AED 검색 및 실시간 응급실 정보", en: "Hospital & AED search, live ER status", zh: "医院·AED搜索及实时急诊室信息", ja: "病院・AED検索およびリアルタイム救急室情報" },
    "emergency.erStatus": { ko: "실시간 응급실 현황", en: "Live ER status", zh: "实时急诊室现况", ja: "リアルタイム救急室現況" },
    "emergency.aedNearby": { ko: "내 주변 AED (자동심장충격기)", en: "Nearby AEDs", zh: "附近AED (自动体外除颤器)", ja: "近くのAED（自動体外式除細動器）" },
    "emergency.hospitalSearch": { ko: "병원 검색", en: "Hospital search", zh: "医院搜索", ja: "病院検索" },
    "emergency.hospitalFilterPh": { ko: "병원 이름으로 검색…", en: "Search by hospital name…", zh: "按医院名称搜索…", ja: "病院名で検索…" },
    "emergency.guides": { ko: "응급 상황 행동요령", en: "Emergency response guides", zh: "紧急情况应对指南", ja: "緊急時行動要領" },
    "emergency.tabAll": { ko: "전체", en: "All", zh: "全部", ja: "全て" },
    "emergency.tabNatural": { ko: "자연재난", en: "Natural Disasters", zh: "自然灾害", ja: "自然災害" },
    "emergency.tabSocial": { ko: "사회재난", en: "Social Disasters", zh: "社会灾害", ja: "社会災害" },
    "emergency.tabLife": { ko: "생활안전", en: "Daily Safety", zh: "生活安全", ja: "生活安全" },
    "emergency.tabPrepare": { ko: "비상대비", en: "Emergency Preparedness", zh: "应急准备", ja: "非常時への備え" },
    "emergency.guideComingSoon": { ko: "아직 행동요령 본문을 준비 중이에요. 곧 채워둘게요.", en: "This action guide is still being prepared. We'll add it soon.", zh: "该行动指南内容尚在准备中,敬请期待。", ja: "この行動要領はまだ準備中です。近日中に追加します。" },

    // ---- 안전지도(pages/map.html + js/map.js) ----
    // ⚠️ 병원/약국/AED 등의 실제 이름·주소, 카카오 장소검색 결과는 실데이터라 번역 대상이 아니고,
    // 아래는 우리가 직접 붙이는 UI 라벨/상태 문구만 번역한다.
    "map.loadingMap": { ko: "지도를 불러오는 중…", en: "Loading map…", zh: "地图加载中…", ja: "地図を読み込み中…" },
    "map.searchTypeAddress": { ko: "도로명검색", en: "Address search", zh: "道路名搜索", ja: "住所検索" },
    "map.searchTypeKeyword": { ko: "장소검색", en: "Place search", zh: "场所搜索", ja: "場所検索" },
    "map.searchPlaceholder": { ko: "검색어, 주소 검색", en: "Search by keyword or address", zh: "搜索关键词或地址", ja: "キーワードや住所で検索" },
    "map.nearbyInfraTitle": { ko: "주변 안전 인프라", en: "Nearby safety infrastructure", zh: "周边安全设施", ja: "周辺の安全インフラ" },
    "map.back": { ko: "뒤로", en: "Back", zh: "返回", ja: "戻る" },
    "map.closeResultsTitle": { ko: "검색결과 닫기", en: "Close search results", zh: "关闭搜索结果", ja: "検索結果を閉じる" },
    "map.routeStart": { ko: "출발", en: "Start", zh: "起点", ja: "出発" },
    "map.routeEnd": { ko: "도착", en: "End", zh: "终点", ja: "到着" },
    "map.clearRoute": { ko: "경로 지우기", en: "Clear route", zh: "清除路线", ja: "経路を消去" },
    "map.togglePanelTitle": { ko: "패널 접기/펼치기", en: "Collapse/expand panel", zh: "折叠/展开面板", ja: "パネルの折りたたみ/展開" },
    "map.myLocationTooltip": { ko: "접속위치 - 내 정확한 현재 위치로 이동", en: "My location — move to my exact current position", zh: "当前定位 - 移动到我的精确当前位置", ja: "現在地 - 正確な現在位置へ移動" },
    "map.searchRadiusLabel": { ko: "검색 반경", en: "Search radius", zh: "搜索半径", ja: "検索半径" },
    "map.themeLabel": { ko: "테마", en: "Filters", zh: "主题", ja: "テーマ" },
    "map.filterAll": { ko: "전체", en: "All", zh: "全部", ja: "すべて" },
    "map.filterPolice": { ko: "경찰", en: "Police", zh: "警察", ja: "警察" },
    "map.filterHospital": { ko: "병원", en: "Hospital", zh: "医院", ja: "病院" },
    "map.filterAed": { ko: "AED", en: "AED", zh: "AED", ja: "AED" },
    "map.filterCctv": { ko: "CCTV", en: "CCTV", zh: "CCTV", ja: "CCTV" },
    "map.filterShelter": { ko: "대피소", en: "Shelter", zh: "避难所", ja: "避難所" },
    "map.filterPharmacy": { ko: "약국", en: "Pharmacy", zh: "药店", ja: "薬局" },
    "map.filterFire": { ko: "소방서", en: "Fire station", zh: "消防署", ja: "消防署" },
    "map.searchHereBtn": { ko: "현 지도에서 검색", en: "Search this area", zh: "在当前地图搜索", ja: "この地図範囲で検索" },
    "map.js.mapLoadFailed": { ko: "지도를 불러오지 못했습니다.", en: "Couldn't load the map.", zh: "无法加载地图。", ja: "地図を読み込めませんでした。" },
    "map.js.noMapData": { ko: "지도 데이터가 없습니다.", en: "No map data available.", zh: "没有地图数据。", ja: "地図データがありません。" },
    "map.js.safetyScoreTooltip": { ko: "{{gu}} · 안전도 {{score}}", en: "{{gu}} · Safety score {{score}}", zh: "{{gu}} · 安全指数 {{score}}", ja: "{{gu}}・安全度 {{score}}" },
    "map.js.cctvPending": { ko: "CCTV는 아직 실시간 연동 전입니다.", en: "CCTV isn't connected to live data yet.", zh: "CCTV 尚未接入实时数据。", ja: "CCTVはまだリアルタイム連携前です。" },
    "map.js.geoUnsupported": { ko: "이 브라우저는 위치 확인 기능을 지원하지 않아요.", en: "This browser doesn't support location detection.", zh: "此浏览器不支持定位功能。", ja: "このブラウザは位置情報の取得に対応していません。" },
    "map.js.geoFailed": { ko: "위치를 가져오지 못했어요.", en: "Couldn't get your location.", zh: "无法获取您的位置。", ja: "位置情報を取得できませんでした。" },
    "map.js.straightDistance": { ko: "직선거리 약 {{km}}km", en: "Straight-line distance ≈ {{km}}km", zh: "直线距离约{{km}}公里", ja: "直線距離 約{{km}}km" },
    "map.js.routePreviewNote": { ko: "(실제 도로 경로 아님, 미리보기)", en: "(Not an actual road route — preview only)", zh: "（非实际道路路线，仅预览）", ja: "（実際の道路経路ではありません、プレビュー）" },
    "map.js.mapNotReady": { ko: "지도가 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.", en: "The map isn't ready yet. Please try again in a moment.", zh: "地图尚未准备好，请稍后重试。", ja: "地図がまだ準備できていません。しばらくしてから再度お試しください。" },
    "map.js.noSearchResults": { ko: "검색 결과가 없습니다.", en: "No search results.", zh: "没有搜索结果。", ja: "検索結果がありません。" },
    "map.js.noInfraInRadius": { ko: "반경 내 안전 인프라 정보가 없습니다.", en: "No safety infrastructure info within this radius.", zh: "该半径内没有安全设施信息。", ja: "この半径内に安全インフラ情報がありません。" },
    "map.js.erOperating": { ko: "응급실 운영 중", en: "ER operating", zh: "急诊运营中", ja: "救急対応中" },
    "map.js.hospitalDefault": { ko: "병원", en: "Hospital", zh: "医院", ja: "病院" },
    "map.js.aedLocationDefault": { ko: "AED 설치 위치", en: "AED location", zh: "AED 安装位置", ja: "AED設置場所" },
    "map.js.capacityLabel": { ko: "수용인원 {{n}}명", en: "Capacity {{n}}", zh: "容纳人数 {{n}}人", ja: "収容人数 {{n}}人" },
    "map.js.withinRadiusCount": { ko: "반경 내 {{n}}개", en: "{{n}} within radius", zh: "半径内{{n}}个", ja: "半径内 {{n}}件" },
    "map.js.shortestDistBadge": { ko: "최단거리표기", en: "Sorted by distance", zh: "按最短距离排列", ja: "最短距離順" },
    "map.js.police24h": { ko: "24시간 운영", en: "Open 24 hours", zh: "24小时运营", ja: "24時間運営" },

    // ---- 민원 ----
    "complaint.title": { ko: "민원", en: "Complaints", zh: "民愿举报", ja: "苦情" },
    "complaint.subtitle": { ko: "AI 민원·신고 도우미", en: "AI complaint & report assistant", zh: "AI民愿·举报助手", ja: "AI苦情・申告アシスタント" },
    "complaint.formTitle": { ko: "어떤 민원을 접수할까요?", en: "What would you like to report?", zh: "您想提交什么民愿？", ja: "どんな苦情を提出しますか？" },
    "complaint.placeholder": {
      ko: "예: 저희 동네 골목에 가로등이 고장나서 너무 어두워요. 처리해주세요.",
      en: "e.g. The streetlight on my street is broken and it's too dark. Please fix it.",
      zh: "例：我家附近巷子里的路灯坏了，太暗了。请处理。",
      ja: "例：家の近くの路地の街灯が故障してとても暗いです。対処してください。",
    },
    "complaint.analyzeBtn": { ko: "AI로 민원 자동 작성하기", en: "Auto-draft with AI", zh: "用AI自动撰写民愿", ja: "AIで自動作成する" },
    "complaint.aiResult": { ko: "AI 분석 결과", en: "AI analysis result", zh: "AI分析结果", ja: "AI分析結果" },
    "complaint.recommendedAgency": { ko: "추천 카테고리 · 담당 기관", en: "Suggested category · Agency", zh: "推荐类别 · 主管机关", ja: "推奨カテゴリー・担当機関" },
    "complaint.draft": { ko: "민원 초안", en: "Draft", zh: "民愿初稿", ja: "苦情草案" },
    "complaint.similarCases": { ko: "유사 민원 사례 (국민신문고 실시간 연동)", en: "Similar cases (live from National Petition Center)", zh: "类似民愿案例（国民申闻鼓实时联动）", ja: "類似苦情事例（国民申聞鼓リアルタイム連携）" },
    "complaint.todayIssues": { ko: "오늘의 민원 이슈 (전국)", en: "Today's trending issues (nationwide)", zh: "今日民愿热点（全国）", ja: "本日の苦情トレンド（全国）" },
    "complaint.reportByPhoto": { ko: "사진으로 신고하기", en: "Report with a photo", zh: "拍照举报", ja: "写真で申告する" },
    "complaint.copyText": { ko: "텍스트 복사", en: "Copy text", zh: "复制文本", ja: "テキストをコピー" },
    "complaint.goTo": { ko: "바로가기", en: "Go to site", zh: "前往", ja: "移動する" },
    "complaint.chip1": { ko: "골목 가로등이 고장났어요", en: "The streetlight on my street is broken", zh: "巷子里的路灯坏了", ja: "路地の街灯が故障しています" },
    "complaint.chip2": { ko: "인도에 불법 주정차 차량이 있어요", en: "There's an illegally parked car on the sidewalk", zh: "人行道上有违规停放的车辆", ja: "歩道に違法駐車車両があります" },
    "complaint.chip3": { ko: "윗집 층간소음이 너무 심해요", en: "The noise from the apartment upstairs is too loud", zh: "楼上邻居的噪音太严重了", ja: "上の階の騒音がひどいです" },
    "complaint.chip4": { ko: "도로에 포트홀이 있어요", en: "There's a pothole in the road", zh: "道路上有坑洞", ja: "道路に穴があります" },
    "complaint.imageModalTitle": { ko: "사진으로 민원 신고", en: "Report with a photo", zh: "拍照举报", ja: "写真で苦情を申告" },
    "complaint.imageModalDesc": {
      ko: "AI가 인식 가능한 카테고리는 <span class=\"font-medium text-gray-600\">불법주정차 · 보행방해물 · 현수막</span> 3가지뿐이에요. 이 외의 사진은 정확히 분류되지 않을 수 있어요.",
      en: "The AI can currently recognize only <span class=\"font-medium text-gray-600\">3 categories: illegal parking · pedestrian obstructions · banners</span>. Other kinds of photos may not be classified accurately.",
      zh: "AI 目前只能识别<span class=\"font-medium text-gray-600\">违规停车、行人障碍物、横幅</span>这3种类别。其他照片可能无法准确分类。",
      ja: "AIが認識できるカテゴリーは<span class=\"font-medium text-gray-600\">違法駐車・歩行妨害物・横断幕</span>の3種類のみです。それ以外の写真は正確に分類されない場合があります。",
    },
    "complaint.imageDropHint": { ko: "클릭하거나 사진을 끌어다 놓으세요", en: "Click or drag a photo here", zh: "点击或拖放照片", ja: "クリックするか写真をドラッグしてください" },
    "complaint.imageAiResult": { ko: "AI 인식 결과", en: "AI recognition result", zh: "AI识别结果", ja: "AI認識結果" },
    "complaint.imageApplyBtn": { ko: "이 결과로 민원 작성하기", en: "Draft complaint with this result", zh: "以此结果撰写民愿", ja: "この結果で苦情を作成する" },

    // ---- 민원 사진 분류(js/complaint-image.js) UI 문구 ----
    // ⚠️ LEGAL_INFO의 법령·과태료·팁 본문, DRAFT_TEMPLATE, DEPT_MAP은 KB와 같은 성격의
    // 문단 단위 콘텐츠라 이번 작업 범위 밖입니다(한국어 고정). 아래는 그 주변 UI 라벨만.
    "complaint.img.modelLabelTransfer": { ko: "전이학습 ResNet18", en: "Transfer-learned ResNet18", zh: "迁移学习 ResNet18", ja: "転移学習 ResNet18" },
    "complaint.img.modelDescTransfer": { ko: "검증 정확도 93.1%", en: "93.1% validation accuracy", zh: "验证准确率 93.1%", ja: "検証精度 93.1%" },
    "complaint.img.modelLabelScratch": { ko: "직접 설계 CNN", en: "Custom-built CNN", zh: "自研CNN模型", ja: "独自設計CNN" },
    "complaint.img.modelDescScratch": { ko: "검증 정확도 86.3%", en: "86.3% validation accuracy", zh: "验证准确率 86.3%", ja: "検証精度 86.3%" },
    "complaint.img.classPedestrian": { ko: "보행방해물", en: "Pedestrian obstruction", zh: "行人障碍物", ja: "歩行妨害物" },
    "complaint.img.classIllegalParking": { ko: "불법주정차", en: "Illegal parking", zh: "违规停车", ja: "違法駐車" },
    "complaint.img.classBanner": { ko: "현수막", en: "Banner", zh: "横幅", ja: "横断幕" },
    "complaint.img.analyzing": { ko: "AI가 사진을 분석하고 있어요...", en: "AI is analyzing the photo...", zh: "AI正在分析照片...", ja: "AIが写真を分析しています..." },
    "complaint.img.loadingModel": {
      ko: "{{model}} 모델을 불러오는 중이에요... (최초 1회만 다운로드해요)",
      en: "Loading the {{model}} model... (this only downloads once)",
      zh: "正在加载{{model}}模型...（仅首次下载）",
      ja: "{{model}}モデルを読み込んでいます...（初回のみダウンロードします）",
    },
    "complaint.img.confidence": { ko: "확신도 {{pct}}% · {{model}}", en: "{{pct}}% confidence · {{model}}", zh: "置信度 {{pct}}% · {{model}}", ja: "確信度 {{pct}}%・{{model}}" },
    "complaint.img.analyzeError": {
      ko: "분석 중 오류가 발생했어요. 모델 파일({{url}}) 경로를 확인해주세요.",
      en: "An error occurred during analysis. Please check the model file path ({{url}}).",
      zh: "分析过程中出现错误。请检查模型文件路径（{{url}}）。",
      ja: "分析中にエラーが発生しました。モデルファイルのパス（{{url}}）をご確認ください。",
    },
    "complaint.img.cropHint": { ko: "번호판 부분만 드래그로 선택하세요", en: "Drag to select just the license plate", zh: "请拖动选择车牌部分", ja: "ナンバープレート部分だけをドラッグして選択してください" },
    "complaint.img.cropRecognizing": { ko: "선택한 영역을 회전 보정하고 다시 인식하는 중이에요…", en: "Rotating and re-scanning the selected area…", zh: "正在旋转校正所选区域并重新识别…", ja: "選択した領域を回転補正して再認識しています…" },
    "complaint.img.cropResult": {
      ko: "잘라낸 영역 인식 결과: {{plate}} — 실제 번호와 다르면 직접 수정해주세요.",
      en: "Cropped-area result: {{plate}} — please correct it if it doesn't match the actual plate.",
      zh: "裁剪区域识别结果：{{plate}} — 如与实际号码不符请手动修改。",
      ja: "切り取った領域の認識結果：{{plate}} — 実際の番号と異なる場合は直接修正してください。",
    },
    "complaint.img.cropNotFound": { ko: "이 영역에서도 번호를 읽지 못했어요. 번호를 직접 입력해주세요.", en: "Couldn't read a plate number from this area either. Please enter it manually.", zh: "在该区域也未能识别出号码。请手动输入。", ja: "この領域からも番号を読み取れませんでした。番号を直接入力してください。" },
    "complaint.img.cropFailed": { ko: "다시 인식하지 못했어요. 번호를 직접 입력해주세요.", en: "Recognition failed again. Please enter the number manually.", zh: "再次识别失败。请手动输入号码。", ja: "再認識に失敗しました。番号を直接入力してください。" },
    "complaint.img.plateRecrop": { ko: "번호판 잘라서 재인식", en: "Crop plate & re-scan", zh: "裁剪车牌重新识别", ja: "ナンバープレートを切り取って再認識" },
    "complaint.img.platePlaceholder": { ko: "인식 중이거나 직접 입력 (예: 12가3456)", en: "Recognizing, or enter manually (e.g. 12가3456)", zh: "识别中或手动输入（例：12가3456）", ja: "認識中、または直接入力（例：12가3456）" },
    "complaint.img.plateRecognizing": { ko: "사진에서 번호판을 인식하는 중이에요…", en: "Reading the license plate from the photo…", zh: "正在从照片中识别车牌…", ja: "写真からナンバープレートを認識しています…" },
    "complaint.img.plateResult": {
      ko: "인식 결과: {{plate}} — 실제 번호와 다르면 직접 수정해주세요.",
      en: "Result: {{plate}} — please correct it if it doesn't match the actual plate.",
      zh: "识别结果：{{plate}} — 如与实际号码不符请手动修改。",
      ja: "認識結果：{{plate}} — 実際の番号と異なる場合は直接修正してください。",
    },
    "complaint.img.plateNotFound": {
      ko: "번호판을 인식하지 못했어요. 번호를 직접 입력해주세요. (가까이서 정면으로 찍으면 인식이 잘 돼요)",
      en: "Couldn't recognize the plate. Please enter it manually. (A close, front-facing shot works best.)",
      zh: "未能识别车牌。请手动输入。（靠近正面拍摄识别率更高）",
      ja: "ナンバープレートを認識できませんでした。番号を直接入力してください。（近くから正面で撮ると認識しやすくなります）",
    },
    "complaint.img.plateLoadFailed": { ko: "번호 인식 기능을 불러오지 못했어요. 번호를 직접 입력해주세요.", en: "Couldn't load the plate-recognition feature. Please enter the number manually.", zh: "无法加载号码识别功能。请手动输入号码。", ja: "番号認識機能を読み込めませんでした。番号を直接入力してください。" },
    "complaint.img.vehicleLabel": { ko: "차량번호", en: "License plate", zh: "车牌号", ja: "車両番号" },
    "complaint.img.fineLabel": { ko: "과태료", en: "Fine", zh: "罚款", ja: "過料" },
    "complaint.img.reportMethodLabel": { ko: "신고 방법", en: "How to report", zh: "举报方法", ja: "通報方法" },
    "complaint.img.zoneCol": { ko: "구역", en: "Zone", zh: "区域", ja: "区域" },
    "complaint.img.carCol": { ko: "승용차", en: "Car", zh: "小客车", ja: "乗用車" },
    "complaint.img.vanCol": { ko: "승합차", en: "Van", zh: "厢式车", ja: "乗合車" },
    "complaint.img.tipsLabel": { ko: "💡 알아두면 좋은 점", en: "💡 Good to know", zh: "💡 温馨提示", ja: "💡 知っておくと良い点" },
    "complaint.img.lawBasisLabel": { ko: "근거", en: "Legal basis", zh: "依据", ja: "根拠" },
    "complaint.img.contactLabel": { ko: "문의", en: "Contact", zh: "咨询", ja: "問い合わせ" },
    "complaint.img.recognizedPlate": { ko: "🚗 인식된 차량번호", en: "🚗 Recognized plate", zh: "🚗 识别到的车牌号", ja: "🚗 認識された車両番号" },
    "complaint.img.fineReportLabel": { ko: "과태료 · 신고 방법 안내", en: "Fine & reporting guide", zh: "罚款·举报方法说明", ja: "過料・通報方法案内" },
    "complaint.img.defaultAgency": { ko: "관할 지자체", en: "the local authority", zh: "所辖地方政府", ja: "管轄自治体" },

    // ---- 민원 텍스트 분석(js/issue.js) UI 문구 ----
    // ⚠️ rule.category/rule.agency/rule.tip, buildDraft()의 민원 초안 템플릿은
    // KB와 같은 문단 단위 콘텐츠라 이번 작업 범위 밖(한국어 고정)이고, 아래는 그
    // 주변 상태/안내 라벨만 번역한다.
    "complaint.analyzing": { ko: "분석 중…", en: "Analyzing…", zh: "分析中…", ja: "分析中…" },
    "complaint.similarSearching": { ko: "유사 사례를 찾는 중…", en: "Searching for similar cases…", zh: "正在查找类似案例…", ja: "類似事例を検索中…" },
    "complaint.similarNoApiKey": {
      ko: "config.js에 공공데이터포털 키를 입력하면 실시간 유사 민원 사례를 볼 수 있어요.",
      en: "Add a Public Data Portal key in config.js to see live similar cases.",
      zh: "在config.js中输入公共数据门户密钥即可查看实时类似民愿案例。",
      ja: "config.jsに公共データポータルキーを入力すると、リアルタイムの類似苦情事例を確認できます。",
    },
    "complaint.similarLoadFailed": { ko: "유사 사례를 불러오지 못했습니다.", en: "Couldn't load similar cases.", zh: "无法加载类似案例。", ja: "類似事例を読み込めませんでした。" },
    "complaint.similarNotFound": { ko: "유사한 과거 사례를 찾지 못했습니다.", en: "No similar past cases found.", zh: "未找到类似的以往案例。", ja: "類似する過去の事例が見つかりませんでした。" },
    "complaint.noTitle": { ko: "(제목 없음)", en: "(No title)", zh: "（无标题）", ja: "（タイトルなし）" },
    "complaint.apiKeyNotice": {
      ko: "⚠ config.js에 공공데이터포털 키를 넣으면 유사 민원 사례·오늘의 이슈가 실시간으로 표시됩니다",
      en: "⚠ Add a Public Data Portal key in config.js to see live similar cases and today's trending issues",
      zh: "⚠ 在config.js中添加公共数据门户密钥后，即可实时显示类似民愿案例和今日热点",
      ja: "⚠ config.jsに公共データポータルキーを追加すると、類似苦情事例と本日のトレンドがリアルタイムで表示されます",
    },
    "complaint.todayIssuesApiKeyNeeded": { ko: "API 키 설정 후 확인 가능합니다.", en: "Available once an API key is set.", zh: "设置API密钥后即可查看。", ja: "APIキーを設定すると確認できます。" },
    "complaint.todayIssuesLoadFailed": { ko: "오늘의 민원 이슈를 불러오지 못했습니다.", en: "Couldn't load today's trending issues.", zh: "无法加载今日民愿热点。", ja: "本日の苦情トレンドを読み込めませんでした。" },
    "complaint.todayIssuesEmpty": { ko: "오늘 집계된 이슈가 아직 없습니다.", en: "No issues tallied yet today.", zh: "今日尚无统计的热点。", ja: "本日集計されたトレンドはまだありません。" },
    "complaint.copied": { ko: "복사됨", en: "Copied", zh: "已复制", ja: "コピー済み" },

    // ---- AI 상담 ----
    "consult.title": { ko: "AI 생활 상담", en: "AI Life Consultation", zh: "AI生活咨询", ja: "AI生活相談" },
    "consult.inputPh": { ko: "메시지를 입력하세요...", en: "Type a message...", zh: "请输入消息...", ja: "メッセージを入力してください..." },
    "consult.introHtml": {
      ko: "안녕하세요! 오늘도 OLA가 도와드릴게요.<br>생활 안전, 응급 시설, 재난 정보, 민원 작성 등 무엇이든 물어보세요.<br><br><span class=\"text-xs text-gray-400\">※ OLA에 이미 정리된 생활안전·기능 안내는 즉시 답변하고, 그 외 질문은 (설정된 경우) OpenAI로 답변해요.</span>",
      en: "Hello! OLA is here to help today, too.<br>Ask me anything about safety, emergency facilities, disaster info, filing complaints, and more.<br><br><span class=\"text-xs text-gray-400\">※ Questions already covered by OLA's built-in guide are answered instantly; anything else is answered by OpenAI (if configured).</span>",
      zh: "您好！今天OLA也会为您提供帮助。<br>生活安全、应急设施、灾害信息、民愿举报等，任何问题都可以问我。<br><br><span class=\"text-xs text-gray-400\">※ OLA已整理好的生活安全·功能指南会立即回答，其余问题将（如已设置）由OpenAI回答。</span>",
      ja: "こんにちは！今日もOLAがお手伝いします。<br>生活安全、救急施設、災害情報、苦情作成など、何でもお尋ねください。<br><br><span class=\"text-xs text-gray-400\">※ OLAにすでに整理されている生活安全・機能案内は即座に回答し、それ以外の質問は(設定されている場合)OpenAIが回答します。</span>",
    },
    "consult.chip1": {
      ko: "전기에서 스파크가 튀는데 소방서에 연락해야돼? 한전에 연락해야돼?",
      en: "Sparks are coming from an outlet — should I call the fire department or the power company?",
      zh: "插座冒火花了，应该联系消防还是电力公司？",
      ja: "コンセントから火花が出ています。消防に連絡すべきですか、電力会社に連絡すべきですか？",
    },
    "consult.chip2": {
      ko: "대형폐기물은 어디서 어떻게 신청해서 어디에다 내려놔?",
      en: "Where and how do I apply to dispose of large waste, and where do I leave it?",
      zh: "大件垃圾要去哪里、如何申请，放在哪里？",
      ja: "大型廃棄物はどこでどうやって申請して、どこに出せばいいですか？",
    },
    "consult.chip3": {
      ko: "오늘은 회사 갈 때 경로를 어떻게 가면 돼?",
      en: "What route should I take to work today?",
      zh: "今天上班该走什么路线？",
      ja: "今日会社に行くにはどの経路がいいですか？",
    },
    "consult.chip4": {
      ko: "지하철에서 누가 불을 지르려고 해 어떻게 해?",
      en: "Someone on the subway is trying to start a fire — what should I do?",
      zh: "地铁上有人想纵火，该怎么办？",
      ja: "地下鉄で誰かが放火しようとしています。どうすればいいですか？",
    },
    "consult.chip5": {
      ko: "핸드폰 공기계 데이터 완전히 지울 수 있어?",
      en: "Can I completely wipe the data on a used phone?",
      zh: "能把旧手机的数据彻底清除吗？",
      ja: "使わなくなった携帯のデータを完全に消せますか？",
    },
    "consult.chip6": {
      ko: "생활안전 페이지에서 뭘 할 수 있어?",
      en: "What can I do on the Safety page?",
      zh: "在生活安全页面能做什么？",
      ja: "生活安全ページで何ができますか？",
    },
    "consult.badge.kb": { ko: "생활안전 정보", en: "Safety info", zh: "生活安全信息", ja: "生活安全情報" },
    "consult.badge.complaint": { ko: "민원 정보 · 국민신문고 실시간", en: "Complaint info · Live from National Petition Center", zh: "民愿信息·国民申闻鼓实时", ja: "苦情情報・国民申聞鼓リアルタイム" },
    "consult.badge.weather": { ko: "날씨·미세먼지 실시간", en: "Live weather/air quality", zh: "天气·空气质量实时", ja: "天気・大気質リアルタイム" },
    "consult.badge.emergency": { ko: "응급시설 실시간", en: "Live emergency facilities", zh: "应急设施实时", ja: "救急施設リアルタイム" },
    "consult.badge.ai": { ko: "AI 생성 답변", en: "AI-generated answer", zh: "AI生成回答", ja: "AI生成回答" },
    "consult.thinking": { ko: "생각하는 중…", en: "Thinking…", zh: "思考中…", ja: "考え中…" },
    "consult.fallback": {
      ko: "죄송해요, 정확히 이해하지 못했어요. 아래처럼 물어봐 주시겠어요?<br>· 생활 안전 팁 (전기, 가스, 대형폐기물, 대중교통 위급상황, 개인정보 삭제 등)<br>· OLA 기능 안내 (생활안전/행동요령/민원 페이지가 뭐하는 곳인지, 반경 설정 방법 등)",
      en: "Sorry, I didn't quite understand. Could you try asking something like this?<br>· Everyday safety tips (electrical issues, gas, bulky waste, public transit emergencies, deleting personal data, etc.)<br>· Guide to OLA's features (what the Safety, Action Guide, and Complaints pages do, how to set your radius, etc.)",
      zh: "抱歉,没能完全理解您的问题。可以换个方式问问看吗?<br>· 生活安全小贴士(电气、燃气、大件垃圾、公共交通紧急情况、删除个人信息等)<br>· OLA 功能介绍(生活安全/行动指南/投诉页面是做什么的、如何设置半径等)",
      ja: "すみません、正確に理解できませんでした。次のように質問していただけますか?<br>・生活安全のヒント(電気、ガス、大型廃棄物、公共交通機関の緊急事態、個人情報の削除など)<br>・OLA機能案内(生活安全/行動要領/苦情ページが何をするところか、半径の設定方法など)",
    },
    "consult.errorWithReason": {
      ko: "죄송해요, 지금은 답변을 가져오지 못했어요. ({{reason}})",
      en: "Sorry, I couldn't get a response right now. ({{reason}})",
      zh: "抱歉,现在无法获取回复。({{reason}})",
      ja: "申し訳ありません、現在回答を取得できませんでした。({{reason}})",
    },

    // ---- MY ----
    "mypage.title": { ko: "MY", en: "MY", zh: "我的", ja: "MY" },
    "mypage.subtitle": { ko: "즐겨찾기 · 알림 설정", en: "Favorites · Notification settings", zh: "收藏 · 通知设置", ja: "お気に入り・通知設定" },
    "mypage.guestName": { ko: "OLA 회원님", en: "OLA Member", zh: "OLA会员", ja: "OLA会員様" },
    "mypage.guestSub": { ko: "로그인하면 즐겨찾기와 알림을 저장할 수 있어요.", en: "Log in to save favorites and notifications.", zh: "登录后可保存收藏和通知。", ja: "ログインするとお気に入りと通知を保存できます。" },
    "mypage.locationSettings": { ko: "위치 기반 설정", en: "Location settings", zh: "位置相关设置", ja: "位置ベース設定" },
    "mypage.locationDesc": { ko: "홈 · 오늘의 AI 브리핑 · 응급 화면에서 내 주변 정보를 조회할 기본 반경입니다.", en: "Default radius used on Home, Briefing, and Emergency screens.", zh: "首页·今日AI简报·紧急页面中查询周边信息的默认半径。", ja: "ホーム・今日のAIブリーフィング・緊急画面で周辺情報を照会するデフォルト半径です。" },
    "mypage.favorites": { ko: "즐겨찾기", en: "Favorites", zh: "收藏", ja: "お気に入り" },
    "mypage.notifSettings": { ko: "알림 설정", en: "Notification settings", zh: "通知设置", ja: "通知設定" },
    "mypage.notifDisaster": { ko: "재난 문자 알림", en: "Disaster alert messages", zh: "灾害短信通知", ja: "災害情報メール通知" },
    "mypage.notifDisasterSub": { ko: "기상특보 · 재난 경보 발생 시 알림", en: "Notified on weather/disaster warnings", zh: "气象特报·灾害警报发生时通知", ja: "気象特報・災害警報発生時に通知" },
    "mypage.notifEr": { ko: "응급실 혼잡도 알림", en: "ER congestion alerts", zh: "急诊室拥挤度通知", ja: "救急室混雑度通知" },
    "mypage.notifErSub": { ko: "즐겨찾는 병원의 혼잡도 변화 알림", en: "Notified when a favorited hospital's congestion changes", zh: "收藏医院拥挤度变化时通知", ja: "お気に入り病院の混雑度変化を通知" },
    "mypage.notifComplaint": { ko: "민원 처리 알림", en: "Complaint status alerts", zh: "民愿处理通知", ja: "苦情処理通知" },
    "mypage.notifComplaintSub": { ko: "접수한 민원의 처리 상태 변경 시 알림", en: "Notified when a submitted complaint's status changes", zh: "已提交民愿处理状态变更时通知", ja: "提出した苦情の処理状況変更時に通知" },
    "mypage.radiusCurrent": { ko: "현재 설정: 반경 {{km}}km", en: "Current: {{km}}km radius", zh: "当前设置：半径 {{km}}km", ja: "現在の設定：半径{{km}}km" },
    "mypage.frequentDistrict": { ko: "자주 가는 지역", en: "Frequent regions", zh: "常去地区", ja: "よく行く地域" },
    "mypage.frequentDistrictDesc": {
      ko: '홈 화면의 "관심 자치구 지수" 카드에 표시할 지역을 등록하세요.',
      en: 'Add regions to show on the Home screen\'s "Watched district index" card.',
      zh: '请添加要在首页"关注自治区指数"卡片中显示的地区。',
      ja: "ホーム画面の「関心自治区指数」カードに表示する地域を登録してください。",
    },
    "mypage.addBtn": { ko: "추가", en: "Add", zh: "添加", ja: "追加" },
    "mypage.frequentDistrictEmpty": {
      ko: '아직 등록한 지역이 없어요. 위에서 지역을 고르고 "{{add}}"를 눌러보세요.',
      en: 'No regions added yet. Pick a region above and tap "{{add}}".',
      zh: '还没有添加地区。请在上方选择地区后点击"{{add}}"。',
      ja: "まだ地域が登録されていません。上で地域を選んで「{{add}}」を押してください。",
    },
    "mypage.favEmpty": {
      ko: "아직 즐겨찾기가 없어요. 생활안전·재난 페이지 상단이나 응급 페이지 병원 카드의 별표를 눌러보세요.",
      en: "No favorites yet. Tap the star at the top of the Safety/Disaster pages, or on a hospital card on the Emergency page.",
      zh: "还没有收藏。请点击生活安全·灾害页面顶部或紧急页面医院卡片上的星标。",
      ja: "まだお気に入りがありません。生活安全・災害ページ上部や緊急ページの病院カードの星印を押してみてください。",
    },
    "mypage.favoritesDesc": {
      ko: '생활안전 · 재난 페이지 상단, 응급 페이지 병원 카드의 <i data-lucide="star" class="w-3.5 h-3.5 inline"></i> 별표를 누르면 여기에 모여요.',
      en: 'Tap the <i data-lucide="star" class="w-3.5 h-3.5 inline"></i> star at the top of the Safety/Disaster pages, or on a hospital card on the Emergency page, to collect them here.',
      zh: '点击生活安全·灾害页面顶部或紧急页面医院卡片上的 <i data-lucide="star" class="w-3.5 h-3.5 inline"></i> 星标即可收藏于此。',
      ja: '生活安全・災害ページ上部や緊急ページの病院カードの <i data-lucide="star" class="w-3.5 h-3.5 inline"></i> 星印を押すとここに集まります。',
    },
    "mypage.typeSafety": { ko: "생활안전", en: "Safety", zh: "生活安全", ja: "生活安全" },
    "mypage.typeDisaster": { ko: "재난", en: "Disaster", zh: "灾害", ja: "災害" },
    "mypage.typeEmergency": { ko: "응급", en: "Emergency", zh: "紧急", ja: "緊急" },
    "mypage.typeDistrict": { ko: "지역", en: "Region", zh: "地区", ja: "地域" },

    // ---- 로그인 모달 ----
    "auth.login": { ko: "로그인", en: "Log in", zh: "登录", ja: "ログイン" },
    "auth.signup": { ko: "회원가입", en: "Sign up", zh: "注册", ja: "会員登録" },
    "auth.email": { ko: "이메일", en: "Email", zh: "邮箱", ja: "メールアドレス" },
    "auth.password": { ko: "비밀번호", en: "Password", zh: "密码", ja: "パスワード" },
    "auth.name": { ko: "이름", en: "Name", zh: "姓名", ja: "お名前" },
    "auth.namePlaceholder": { ko: "홍길동", en: "e.g. John Doe", zh: "例如：张三", ja: "例：山田太郎" },
    "auth.passwordPlaceholder": { ko: "6자 이상", en: "6+ characters", zh: "6位以上", ja: "6文字以上" },
    "auth.findId": { ko: "아이디 찾기", en: "Find email", zh: "查找账号", ja: "IDを探す" },
    "auth.resetPw": { ko: "비밀번호 찾기", en: "Reset password", zh: "找回密码", ja: "パスワードを探す" },
    "auth.backToLogin": { ko: "로그인으로 돌아가기", en: "Back to log in", zh: "返回登录", ja: "ログインに戻る" },
    "auth.findIdDesc": { ko: "가입 시 입력한 이름을 입력하면 등록된 이메일(아이디)을 알려드려요.", en: "Enter the name you signed up with to find your registered email.", zh: "输入注册时填写的姓名，即可查询已注册的邮箱（账号）。", ja: "登録時のお名前を入力すると、登録済みのメールアドレス（ID）をお知らせします。" },
    "auth.resetPwDesc": { ko: "이름과 아이디(이메일)가 모두 일치하면 새 비밀번호로 바꿀 수 있어요.", en: "If your name and email both match, you can set a new password.", zh: "若姓名与账号（邮箱）均一致，即可更改新密码。", ja: "お名前とID（メールアドレス）が一致すると、新しいパスワードに変更できます。" },
    "auth.newPassword": { ko: "새 비밀번호", en: "New password", zh: "新密码", ja: "新しいパスワード" },
    "auth.confirmPassword": { ko: "새 비밀번호 확인", en: "Confirm new password", zh: "确认新密码", ja: "新しいパスワード確認" },
    "auth.changePw": { ko: "비밀번호 변경", en: "Change password", zh: "更改密码", ja: "パスワード変更" },
    "auth.demoNotice": {
      ko: "이 계정 정보는 서버가 아닌 이 브라우저(localStorage)에만 저장되는 데모용 로그인입니다.<br>아이디/비밀번호 찾기도 이메일 발송 없이 본인 확인만으로 동작하는 데모 기능이에요.",
      en: "This account is a demo login stored only in this browser (localStorage), not on a server.<br>Find-email/reset-password are also demo features that work by identity check only, without sending an email.",
      zh: "此账户信息为演示登录，仅保存在此浏览器（localStorage）中，不会保存到服务器。<br>查找账号/密码功能同样是演示功能，仅通过身份核对完成，不会实际发送邮件。",
      ja: "このアカウント情報はサーバーではなく、このブラウザ（localStorage）にのみ保存されるデモ用ログインです。<br>ID・パスワードを探す機能もメール送信なしに本人確認のみで動作するデモ機能です。",
    },
    "common.asOf": { ko: "{{date}} 기준", en: "As of {{date}}", zh: "{{date}} 更新", ja: "{{date}} 基準" },

    // ---- 랜딩 페이지(landing.html) ----
    "landing.locationNotFound": { ko: "위치정보를 찾지 못했습니다.", en: "We couldn't find your location.", zh: "未能获取您的位置信息。", ja: "位置情報を取得できませんでした。" },
    "landing.locationApprox": { ko: "위치 정보는 대략적으로 표시됩니다.", en: "Location is shown approximately.", zh: "位置信息为大致显示。", ja: "位置情報はおおよその表示です。" },
    "landing.locationSetTo": { ko: "{{label}}으로 설정됩니다.", en: "Set to {{label}}.", zh: "将设置为{{label}}。", ja: "{{label}}に設定されます。" },
    "landing.caption": { ko: "생활 밀착형 안전 · 민원 AI 플랫폼", en: "AI platform for everyday safety & civil complaints", zh: "贴近生活的安全·民愿AI平台", ja: "生活密着型安全・苦情AIプラットフォーム" },
    "landing.loginStart": { ko: "로그인하고 시작하기", en: "Log in to get started", zh: "登录并开始使用", ja: "ログインして始める" },
    "landing.guestBrowse": { ko: "게스트로 둘러보기 →", en: "Browse as guest →", zh: "以访客身份浏览 →", ja: "ゲストとして見る →" },
    "landing.consentNotice": {
      ko: "가입 시 공공데이터 기반 안전 정보 제공에 동의합니다.",
      en: "By signing up, you agree to receive safety info based on public data.",
      zh: "注册即表示您同意接收基于公共数据的安全信息。",
      ja: "会員登録により、公共データに基づく安全情報の提供に同意したものとみなされます。",
    },
    "landing.relatedSiteDefault": { ko: "관련사이트 선택", en: "Related sites", zh: "选择相关网站", ja: "関連サイトを選択" },
    "landing.site.safekorea": { ko: "국민재난안전포털", en: "National Disaster & Safety Portal", zh: "国民灾害安全门户", ja: "国民災害安全ポータル" },
    "landing.site.safepatrol": { ko: "안전신문고", en: "Safety Report (안전신문고)", zh: "安全申报中心", ja: "安全申告センター" },
    "landing.site.gov24": { ko: "정부24", en: "Gov24", zh: "政府24", ja: "政府24" },
    "landing.site.egen": { ko: "응급의료포털 e-gen", en: "Emergency Medical Portal (e-Gen)", zh: "急救医疗门户 e-gen", ja: "救急医療ポータル e-gen" },
    "landing.site.weather": { ko: "기상청 날씨누리", en: "Korea Meteorological Administration", zh: "气象厅天气预报", ja: "気象庁 天気ヌリ" },
    "landing.site.police": { ko: "경찰청", en: "National Police Agency", zh: "警察厅", ja: "警察庁" },
    "landing.site.fire": { ko: "소방청", en: "National Fire Agency", zh: "消防厅", ja: "消防庁" },

    // ---- 위치 배지 / 위치 권한 (js/location-ui.js, js/location.js — 모든 페이지 공통) ----
    "nav.currentAreaLabel": { ko: "현재 정밀 분석 지역", en: "Current monitored area", zh: "当前精确分析区域", ja: "現在の精密分析地域" },
    "nav.radiusHint": { ko: "반경 {{km}}km 범위 밀착 감시", en: "Close monitoring within {{km}}km", zh: "半径{{km}}km范围密切监控", ja: "半径{{km}}km範囲の密着監視" },
    "talk.autoFilledLocation": { ko: "📍 {{label}} 자동입력", en: "📍 {{label}} auto-filled", zh: "📍 {{label}} 自动填写", ja: "📍 {{label}} 自動入力" },
    "location.tooFarAlert": {
      ko: "가장 가까운 지역은 {{sido}} {{gu}}인데, 실제 거리가 약 {{km}}km 떨어져 있어요. 지금은 서울·경기·인천(수도권)만 지원돼서 가장 가까운 곳으로 표시할게요.",
      en: "The nearest supported area is {{sido}} {{gu}}, about {{km}}km away. We currently only support the Seoul/Gyeonggi/Incheon area, so we'll show the closest match.",
      zh: "最近的支持区域是{{sido}} {{gu}}，实际距离约{{km}}km。目前仅支持首尔·京畿·仁川（首都圈），将为您显示最近的地区。",
      ja: "最も近い地域は{{sido}} {{gu}}ですが、実際の距離は約{{km}}km離れています。現在はソウル・京畿・仁川（首都圏）のみ対応のため、最も近い地域を表示します。",
    },
    "location.unsupported": { ko: "이 브라우저는 위치 확인 기능을 지원하지 않아요.", en: "This browser doesn't support location detection.", zh: "此浏览器不支持定位功能。", ja: "このブラウザは位置情報機能に対応していません。" },
    "location.permissionDenied": { ko: "위치 권한이 거부됐어요. 브라우저 주소창의 자물쇠 아이콘에서 위치 권한을 허용해주세요.", en: "Location permission was denied. Please allow location access from the lock icon in your browser's address bar.", zh: "位置权限被拒绝。请在浏览器地址栏的锁形图标中允许位置权限。", ja: "位置情報の権限が拒否されました。ブラウザのアドレスバーの鍵アイコンから位置情報を許可してください。" },
    "location.unavailable": { ko: "위치 정보를 가져올 수 없어요. 잠시 후 다시 시도해주세요.", en: "Couldn't get your location. Please try again shortly.", zh: "无法获取位置信息。请稍后重试。", ja: "位置情報を取得できませんでした。しばらくしてから再試行してください。" },
    "location.timeout": { ko: "위치를 가져오는 데 시간이 너무 오래 걸렸어요. 다시 시도해주세요.", en: "It took too long to get your location. Please try again.", zh: "获取位置信息耗时过长。请重试。", ja: "位置情報の取得に時間がかかりすぎました。再試行してください。" },
    "location.genericError": { ko: "위치를 가져오지 못했어요.", en: "Couldn't get your location.", zh: "无法获取位置信息。", ja: "位置情報を取得できませんでした。" },
  };

  const INTL_LOCALE = { ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" };

  // "2026.07.08 (수) 14:30" 형태를 현재 언어의 요일 표기로 만들어 common.asOf에 끼워넣는 헬퍼
  function formatAsOf(date, withTime = true) {
    const loc = getLocale();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const weekday = new Intl.DateTimeFormat(INTL_LOCALE[loc] || "ko-KR", { weekday: "short" }).format(date);
    let str = `${y}.${m}.${d} (${weekday})`;
    if (withTime) {
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      str += ` ${hh}:${mm}`;
    }
    return t("common.asOf", { date: str });
  }

  function getLocale() {
    const saved = localStorage.getItem(KEY);
    return SUPPORTED.includes(saved) ? saved : "ko";
  }

  const localeChangeListeners = [];
  function onLocaleChange(fn) {
    if (typeof fn === "function") localeChangeListeners.push(fn);
  }

  function setLocale(locale) {
    if (!SUPPORTED.includes(locale)) return;
    localStorage.setItem(KEY, locale);
    apply();
    document.documentElement.lang = locale;
    localeChangeListeners.forEach((fn) => fn(locale));
    if (typeof window.onOlaLocaleChange === "function") window.onOlaLocaleChange(locale);
    window.dispatchEvent(new CustomEvent("app:locale-change", {
      detail: { locale },
    }));
  }

  /**
   * 문자열 조회. 해당 언어에 값이 없으면 한국어로 폴백합니다.
   * vars를 넘기면 {{key}} 형태의 자리표시자를 치환합니다.
   */
  function t(key, vars) {
    const entry = DICT[key];
    if (!entry) return key;
    let text = entry[getLocale()] || entry.ko || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        text = text.replace(new RegExp(`{{${k}}}`, "g"), vars[k]);
      });
    }
    return text;
  }

  // 기상청 기상특보 원문(항상 한국어로 옴, 예: "폭염주의보", "호우경보")을 현재 언어로 근사 번역합니다.
  // 정부 API가 한국어로만 응답하기 때문에, 특보 종류/등급 단어를 치환하는 방식으로 처리합니다.
  // 매핑에 없는 단어가 섞여 있으면 그 부분은 원문(한국어) 그대로 남습니다.
  const WEATHER_HAZARD_MAP = {
    폭염: { en: "Heat wave", zh: "高温", ja: "猛暑" },
    한파: { en: "Cold wave", zh: "寒潮", ja: "寒波" },
    호우: { en: "Heavy rain", zh: "暴雨", ja: "大雨" },
    대설: { en: "Heavy snow", zh: "大雪", ja: "大雪" },
    강풍: { en: "Strong wind", zh: "大风", ja: "強風" },
    풍랑: { en: "High waves", zh: "巨浪", ja: "波浪" },
    태풍: { en: "Typhoon", zh: "台风", ja: "台風" },
    건조: { en: "Dry weather", zh: "干燥", ja: "乾燥" },
    황사: { en: "Yellow dust", zh: "沙尘", ja: "黄砂" },
    안개: { en: "Fog", zh: "大雾", ja: "霧" },
    지진해일: { en: "Tsunami", zh: "海啸", ja: "津波" },
    폭풍해일: { en: "Storm surge", zh: "风暴潮", ja: "高潮" },
    서리: { en: "Frost", zh: "霜冻", ja: "霜" },
    저온: { en: "Low temperature", zh: "低温", ja: "低温" },
  };
  const WEATHER_LEVEL_MAP = {
    주의보: { en: "advisory", zh: "注意警报", ja: "注意報" },
    경보: { en: "warning", zh: "警报", ja: "警報" },
  };

  function translateWeatherWarning(text) {
    const loc = getLocale();
    if (loc === "ko" || !text) return text;
    let out = String(text);
    const joiner = loc === "en" ? " " : ""; // 영어만 "Heat wave advisory"처럼 단어 사이 공백이 필요
    Object.keys(WEATHER_HAZARD_MAP)
      .sort((a, b) => b.length - a.length)
      .forEach((word) => {
        if (out.indexOf(word) === -1) return;
        out = out.split(word).join(`${WEATHER_HAZARD_MAP[word][loc] || word}${joiner}`);
      });
    Object.keys(WEATHER_LEVEL_MAP).forEach((word) => {
      if (out.indexOf(word) === -1) return;
      out = out.split(word).join(WEATHER_LEVEL_MAP[word][loc] || word);
    });
    return out.replace(/\s+/g, " ").trim();
  }

  // 페이지 안의 모든 data-i18n* 요소에 현재 언어를 적용합니다.
  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
  }

  // 헤더/사이드바에 넣는 언어 선택 "드롭다운 버튼"을 렌더링합니다.
  // containerEl 안에 [data-lang-btn] 버튼 + [data-lang-menu] 메뉴 껍데기가 있어야 합니다.
  function renderSwitcher(containerEl) {
    if (!containerEl) return;
    const btn = containerEl.querySelector("[data-lang-btn]");
    const menu = containerEl.querySelector("[data-lang-menu]");
    if (!btn || !menu) return;

    function renderMenu() {
      const current = getLocale();
      menu.innerHTML = SUPPORTED.map(
        (loc) => `
        <button type="button" data-lang-option="${loc}"
          class="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-bg transition-colors ${
            loc === current ? "text-primary font-bold" : "text-dark"
          }">
          <span>${LABELS[loc]}</span>
          ${loc === current ? '<i data-lucide="check" class="w-4 h-4"></i>' : ""}
        </button>`
      ).join("");
      if (window.lucide) lucide.createIcons();
    }

    function closeMenu() {
      menu.classList.add("hidden");
    }
    function openMenu() {
      renderMenu();
      menu.classList.remove("hidden");
    }

    renderMenu();

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.contains("hidden") ? openMenu() : closeMenu();
    });
    menu.addEventListener("click", (e) => {
      const optBtn = e.target.closest("[data-lang-option]");
      if (!optBtn) return;
      setLocale(optBtn.getAttribute("data-lang-option"));
      closeMenu();
    });
    document.addEventListener("click", (e) => {
      if (!containerEl.contains(e.target)) closeMenu();
    });
    onLocaleChange(() => {
      if (!menu.classList.contains("hidden")) renderMenu();
    });
  }

  return { getLocale, setLocale, t, apply, renderSwitcher, onLocaleChange, formatAsOf, translateWeatherWarning, SUPPORTED, LABELS };
})();

window.olaI18n = olaI18n;
document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.lang = olaI18n.getLocale();
  olaI18n.apply();
  document.querySelectorAll("[data-i18n-switcher]").forEach((el) => olaI18n.renderSwitcher(el));
});
