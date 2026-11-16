/**
 * js/emergency.js — pages/emergency.html 전용 로직
 * - 재난 유형별 국민행동요령 탭/그리드만 담당합니다.
 */
(function () {
  // 재난 유형별 국민행동요령 - 국민재난안전포털(safekorea.go.kr) 분류 체계를 그대로 옮겨왔습니다.
  // 모든 항목의 행동요령 본문(body)은 국민재난안전포털·기상청·소방청 등 공식 자료로 확인 후 채웠습니다
  // (지어낸 내용 없음. 향후 새 항목이 추가되면 확인 전까지는 body: null로 두고 "준비 중" 안내를 띄웁니다).
  // 카드 이미지: assets/images/행동요령/<카테고리>/<제목>.gif 로 저장된 파일이 있으면 img를 채우고,
  // 없으면 카드에서 기존 lucide 아이콘(icon)으로 자동 대체됩니다.
  const GUIDE_IMG_BASE = (window.OLA_BASE || "") + "assets/images/행동요령/";

  // 다국어 표시용 - js/emergency-i18n-data.js(한국어 제목 → en/zh/ja 번역)에서 찾아옵니다.
  // 번역이 없으면(신규 항목 등) 한국어 원문으로 안전하게 대체됩니다.
  function trGuide(g) {
    const locale = window.olaI18n ? olaI18n.getLocale() : "ko";
    if (locale === "ko" || !g) return { title: g ? g.title : "", body: g ? g.body : null };
    const table = window.OLA_EMERGENCY_GUIDE_I18N || {};
    const entry = table[g.title] && table[g.title][locale];
    return {
      title: entry && entry.title ? entry.title : g.title,
      body: g.body ? (entry && entry.body ? entry.body : g.body) : null,
    };
  }
  const DISASTER_CATEGORIES = {
    natural: [
      { title: "가뭄", icon: "droplet-off", img: GUIDE_IMG_BASE + "자연재난/가뭄.gif", body: "제한급수에 대비해 미리 식수를 확보하고 급수 일정을 확인하세요. 세탁은 모아서 한 번에 하고, 설거지는 물을 받아서 쓰는 등 생활 속 물 절약을 실천합니다." },
      { title: "강풍", icon: "wind", img: GUIDE_IMG_BASE + "자연재난/강풍.gif", body: "야외활동을 자제하고 창문과 문을 꼭 닫아 흔들리지 않게 고정하세요. 간판·지붕 등 낙하물 위험이 있는 곳은 피하고, 옥외 작업이나 전기 수리는 하지 마세요." },
      { title: "낙뢰", icon: "zap", img: GUIDE_IMG_BASE + "자연재난/낙뢰.gif", body: "번개를 본 뒤 30초 안에 천둥소리가 들리면 즉시 건물이나 자동차 안 등 안전한 곳으로 대피하세요. 큰 나무 아래나 산 정상은 피하고, 우산·등산스틱 같은 긴 물건은 몸에서 멀리 두세요." },
      { title: "대설", icon: "cloud-snow", img: GUIDE_IMG_BASE + "자연재난/대설.gif", body: "빙판길 낙상에 주의하며 여유 있게 이동하고, 차량 운행 시 스노체인 등 월동장비를 미리 준비하세요. 폭설로 고립될 경우를 대비해 비상식량과 손전등을 챙겨두면 좋습니다." },
      { title: "빙판길낙상사고", icon: "footprints", img: GUIDE_IMG_BASE + "자연재난/빙판길낙상사고.gif", body: "빙판길에서는 보폭을 평소보다 10~20% 줄이고 미끄럼 방지 밑창 신발을 신으세요. 주머니에서 손을 빼고 장갑을 착용해 균형을 잡고, 넘어졌다면 무리하게 움직이지 말고 통증이 있으면 119에 신고하세요." },
      { title: "산사태", icon: "mountain", img: GUIDE_IMG_BASE + "자연재난/산사태.gif", body: "산사태 위험이 있는 산지 주변에서는 등산·캠핑 등 야외활동을 하지 마세요. 대피명령이 내려지면 산사태 진행 방향과 수직인 가장 가까운 높은 곳으로 신속히 대피하고, 상황을 목격했다면 즉시 119에 신고하세요." },
      { title: "우주전파재난", icon: "radio", img: GUIDE_IMG_BASE + "자연재난/우주전파재난.gif", body: "위성·단파 방송이 끊기면 장애가 해소될 때까지 지상파 방송으로 재난 정보를 확인하세요. GPS 신호를 사용하는 DMB·UHD 방송 등도 영향을 받을 수 있으니, 상황이 해소된 뒤 다시 수신하면 됩니다." },
      { title: "자연우주물체 추락", icon: "orbit", img: GUIDE_IMG_BASE + "자연재난/자연우주물체추락.gif", body: "우주물체 잔해가 떨어질 가능성이 있으면 창문이나 출입문을 등지고 튼튼한 벽·기둥 뒤나 책상 밑으로 대피해 머리를 보호하세요. 재난방송 안내에 따라 행동하고, 의심되는 잔해물을 발견하면 즉시 소방서나 경찰서에 신고하세요." },
      { title: "적조", icon: "fish", img: GUIDE_IMG_BASE + "자연재난/적조.gif", body: "적조가 발생한 양식장에서는 먹이 공급을 중단하거나 밀도에 따라 사료량을 조절하세요. 수심 조절이 가능한 시설은 5m 이상으로 유지해 피해를 줄일 수 있습니다." },
      { title: "조류대발생(녹조)", icon: "droplets", img: GUIDE_IMG_BASE + "자연재난/조류대발생(녹조).gif", body: "녹조가 발생한 물에서는 낚시·수상스키·수영 등 친수활동을 하지 마세요. 해당 지역에서 잡은 어패류는 어획도, 섭취도 하지 않는 것이 안전합니다." },
      { title: "조수", icon: "waves", img: GUIDE_IMG_BASE + "자연재난/조수.gif", body: "해안가 저지대·방파제·갯바위 등 조수 범람 위험지역에서는 즉시 높은 곳으로 이동하세요. 만조 시기(음력 보름·그믐 전후)에는 특히 위험하니 우리 지역이 위험지역인지 미리 확인해두세요." },
      { title: "지진", icon: "activity", img: GUIDE_IMG_BASE + "자연재난/지진.gif", body: "실내에서는 튼튼한 탁자 아래로 몸을 피하고 머리를 보호합니다. 흔들림이 멈추면 가스와 전기를 차단하고 문을 열어 출구를 확보한 뒤, 계단을 이용해 건물 밖 넓은 공간으로 대피하세요. 엘리베이터는 사용하지 않습니다." },
      { title: "침수", icon: "waves", img: GUIDE_IMG_BASE + "자연재난/침수.gif", body: "지하주차장·지하철 등 지하공간에 물이 조금이라도 차오르면 즉시 대피하세요. 차량이 침수되기 시작하면 타이어 높이의 2/3가 잠기기 전에 안전한 곳으로 이동하고, 어렵다면 시동이 꺼지기 전에 창문을 열어 탈출하세요." },
      { title: "태풍", icon: "tornado", img: GUIDE_IMG_BASE + "자연재난/태풍.gif", body: "창문에 테이프를 붙이거나 커튼을 쳐서 파손에 대비하고, 외출을 자제합니다. 간판·나무 등 낙하물이 있을 수 있는 곳은 피하고, 정전에 대비해 손전등과 비상용품을 미리 준비하세요." },
      { title: "폭염", icon: "thermometer-sun", img: GUIDE_IMG_BASE + "자연재난/폭염.gif", body: "한낮(12~17시) 야외활동을 피하고 물을 충분히 섭취합니다. 어지러움·두통·메스꺼움이 느껴지면 즉시 그늘로 이동해 몸을 식히고, 증상이 심하면 119에 신고하세요." },
      { title: "풍랑", icon: "wind", img: GUIDE_IMG_BASE + "자연재난/풍랑.gif", body: "해안가 낚시객·야영객은 안전한 곳으로 대피하고, 파도에 휩쓸릴 위험이 있는 방파제·방조제에는 가지 마세요. 수산 양식시설은 미리 고정하고, 조업 중인 선박은 인근 선박이나 관계기관에 연락 후 대피하세요." },
      { title: "한파", icon: "snowflake", img: GUIDE_IMG_BASE + "자연재난/한파.gif", body: "외출 시 여러 겹의 옷을 착용하고 노출 부위를 최소화하세요. 수도관 동파 방지를 위해 물을 조금씩 흘려두고, 어르신 등 취약계층의 안부를 확인하세요." },
      { title: "해빙기재난예방", icon: "cloud-drizzle", img: GUIDE_IMG_BASE + "자연재난/해방기재난예방.gif", body: "해빙기(2~4월)에는 얼었던 땅이 녹으면서 축대·옹벽·공사장 등이 약해질 수 있으니 주변 시설물에 균열이나 침하가 없는지 살펴보세요. 위험한 흔적이 보이면 관할 지자체나 안전신문고에 신고하세요." },
      { title: "해일", icon: "waves", img: GUIDE_IMG_BASE + "자연재난/해일.gif", body: "해일 특보가 발효되면 기상청·지자체의 대피 안내에 따라 즉시 대피하세요. 목조건물보다는 철근콘크리트 건물의 높은 층으로, 해안에서 최대한 먼 높은 지대로 이동하는 것이 안전합니다." },
      { title: "호우", icon: "cloud-rain", img: GUIDE_IMG_BASE + "자연재난/호우.gif", body: "호우특보가 예보되면 대피 장소와 이동 경로를 미리 파악해두세요. 산간·계곡·하천·방파제 등 위험지역은 피하고, 침수된 주택은 가스 누출 위험이 있으니 환기 전까지 성냥불·라이터를 사용하지 마세요." },
      { title: "홍수", icon: "cloud-rain-wind", img: GUIDE_IMG_BASE + "자연재난/홍수.gif", body: "갑작스러운 침수가 발생하면 신속히 높은 곳으로 대피하고, 급경사지나 산사태 위험지역은 피하세요. 대피 전 전기 차단기를 내리고 가스 밸브를 잠그며, 침수 도로에서는 운전하지 마세요." },
      { title: "화산폭발", icon: "mountain", img: GUIDE_IMG_BASE + "자연재난/화산폭발.gif", body: "화산재가 내릴 때는 실외라면 건물이나 차량으로 신속히 대피하고 마스크나 옷으로 코와 입을 막으세요. 문틈과 환기구는 젖은 수건으로, 창문은 테이프로 막고, 각막 손상을 막기 위해 콘택트렌즈는 빼두세요." },
      { title: "황사", icon: "cloud-fog", img: GUIDE_IMG_BASE + "자연재난/황사.gif", body: "황사가 심할 때는 외출을 자제하고, 부득이 나갈 때는 보건용 마스크와 보호안경을 착용하세요. 창문을 닫아 먼지 유입을 막고, 노약자·호흡기질환자는 실외활동을 특히 피하는 것이 좋습니다." },
    ],
    social: [
      { title: "가축질병", icon: "bug", img: GUIDE_IMG_BASE + "사회재난/가축질병.gif", body: "해외 축산농가 방문을 자제하고, 부득이 축산 발생국을 다녀왔다면 입국 후 5일간 축사 출입을 자제하세요. 가축이 갑자기 폐사하거나 이상 증상을 보이면 이동시키지 말고 즉시 가까운 가축방역기관이나 1588-9060(구제역)·1588-4060(AI)으로 신고하세요." },
      { title: "감염병예방", icon: "shield-plus", img: GUIDE_IMG_BASE + "사회재난/감염병예방.gif", body: "흐르는 물에 비누로 30초 이상 손을 씻고, 기침·재채기를 할 때는 휴지나 옷소매로 입과 코를 가리세요. 발열·기침 등 의심 증상이 있으면 다른 사람과의 접촉과 외출을 피하고 필요시 마스크를 착용하세요." },
      { title: "건축물붕괴", icon: "building-2", img: GUIDE_IMG_BASE + "사회재난/건출물붕괴.gif", body: "건물 붕괴 징조를 느끼면 즉시 밖으로 대피하고 119·112에 신고하세요. 건물 안에 갇혔다면 소리를 지르기보다 벽이나 파이프를 규칙적으로 두드려 위치를 알리고, 체력 소모를 줄이기 위해 휴대전화는 필요할 때만 잠깐씩 켜두세요." },
      { title: "경기장안전", icon: "landmark", img: GUIDE_IMG_BASE + "사회재난/경기장안전.gif", body: "혼잡한 상황에서는 안전요원의 안내와 통제에 따라 질서 있게 이동하고, 대피할 때는 앞사람을 따라 서두르지 말고 이동하세요. 경기 중 흥분해 급하게 일어서거나 한쪽으로 몰리는 행동은 안전사고로 이어질 수 있으니 자제하세요." },
      { title: "공동구재난", icon: "route", img: GUIDE_IMG_BASE + "사회재난/공동구재난.gif", body: "공동구에서 화재 등 이상 징후를 발견하면 주변에 알리고 폭발·붕괴 위험이 없는 안전한 곳으로 이동한 뒤 119와 지자체에 신고하세요. 귀가 후 전기·통신·수도에 이상이 느껴지면 한전·통신사·수도사업소에 점검을 요청하세요." },
      { title: "공연장안전", icon: "drama", img: GUIDE_IMG_BASE + "사회재난/공연장안전.gif", body: "화재나 정전 등 사고가 발생하면 공연장 안전요원과 안내방송의 지시에 따라 침착하게 대피하세요. 입장 시 비상구 위치를 미리 확인해두면 비상 상황에서 신속하게 대응할 수 있습니다." },
      { title: "교통사고", icon: "car", img: GUIDE_IMG_BASE + "사회재난/교통사고.gif", body: "사고가 나면 먼저 안전한 곳으로 대피한 뒤 신고하고, 비상등을 켜고 트렁크를 열어 삼각대 등으로 후방에 위험을 알리세요. 부상 정도를 함부로 판단해 부상자를 옮기지 말고, 구조가 시작되면 무리하게 구조에 참여하지 말고 현장에서 물러나세요." },
      { title: "다중운집사고", icon: "users", img: GUIDE_IMG_BASE + "사회재난/다중운집사고.gif", body: "인파가 몰리는 곳에서는 이동 방향을 거스르지 말고 흐름을 따라 이동하며, 넘어지지 않도록 신발 끈 등을 미리 점검하세요. 밀집도가 높아 위험하다고 느껴지면 무리해서 진입하지 말고 다른 경로를 이용하거나 안전요원의 통제를 따르세요." },
      { title: "대규모수질오염", icon: "droplets", img: GUIDE_IMG_BASE + "사회재난/대규모수질오염.gif", body: "오염사고 지역과 그 영향권에서는 낚시·수영 등 친수활동과 어로행위를 하지 마세요. 수돗물 냄새 등이 평소와 다르면 즉시 사용을 중단하고 지역 행정관서(지역번호+128)에 신고하세요." },
      { title: "댐붕괴", icon: "waves", img: GUIDE_IMG_BASE + "사회재난/댐붕괴.gif", body: "댐 관리기관과 지자체의 경고방송·재난문자를 주의 깊게 확인하고, 붕괴가 발생하면 통제에 따라 지정된 장소로 즉시 대피하세요. 대피할 시간이 없다면 주변 고지대로 대피하고, 붕괴물과 토석류가 쓸려 내려올 수 있으니 하천에는 절대 접근하지 마세요." },
      { title: "도로터널사고", icon: "road", img: GUIDE_IMG_BASE + "사회재난/도로터널사고.gif", body: "터널 안에서 사고나 고장이 발생하면 갓길이나 비상주차대에 정차한 뒤 시동을 끄고 키를 꽂아둔 채 대피하세요. 비상전화나 휴대전화로 신고한 뒤, 화재가 발생했다면 연기 반대 방향으로 유도등을 따라 대피하세요." },
      { title: "미세먼지", icon: "cloud-fog", img: GUIDE_IMG_BASE + "사회재난/미세먼지.gif", body: "외출 전 미세먼지 예보를 확인하고, 외출 시 보건용 마스크를 착용하세요. 실외 활동을 줄이고 물을 충분히 섭취하며, 실내에서는 환기 후 공기청정기를 사용하는 것이 좋습니다." },
      { title: "보건의료재난", icon: "heart-pulse", img: GUIDE_IMG_BASE + "사회재난/보건의료재난.gif", body: "의료기관 집단휴진 등 상황에서도 응급환자 진료와 중환자실 운영 등 필수진료는 계속되니 안심하세요. 외래진료나 처방이 필요하면 방문 전 지역 보건소나 보건복지상담센터(129)에 진료 가능 여부를 확인하세요." },
      { title: "보행자안전", icon: "footprints", img: GUIDE_IMG_BASE + "사회재난/보행자안전.gif", body: "도로를 건널 때는 반드시 횡단보도를 이용하고, 멈춰서서 좌우를 살핀 뒤 건너는 방어보행 습관을 들이세요. 보행 중 휴대폰이나 이어폰 사용은 위험을 인지하기 어렵게 하니 자제하고, 어두운 시간대에는 밝은색 옷을 착용하세요." },
      { title: "사업장 재난", icon: "factory", img: GUIDE_IMG_BASE + "사회재난/사업장재난.gif", body: "사업장 사고가 발생하면 즉시 119·112와 관할 고용노동관서, 지자체에 신고하세요. 화학물질 누출 시에는 방송으로 알리고 안전한 곳으로 대피하며, 노약자·장애인 등 안전취약계층은 동료의 도움을 받아 함께 대피하세요." },
      { title: "산불", icon: "flame", img: GUIDE_IMG_BASE + "사회재난/산불.gif", body: "산불을 발견하면 소방서(119)나 산림관서에 즉시 신고하고, 초기 단계라면 외투 등으로 두드려 끌 수 있습니다. 불길이 커지면 바람 방향을 살펴 산불의 진행 경로에서 벗어나 논밭이나 공터 등 낮고 열린 장소로 신속히 대피하세요." },
      { title: "식용수", icon: "glass-water", img: GUIDE_IMG_BASE + "사회재난/식용수.gif", body: "단수에 대비해 욕조나 용기에 미리 물을 받아두고, 조리 없이 보관이 쉬운 식품을 준비해두세요. 수돗물 색이나 냄새가 평소와 다르면 마시지 말고 지자체 상수도사업소에 신고하세요." },
      { title: "원유수급 위기", icon: "fuel", img: GUIDE_IMG_BASE + "사회재난/원유수급위기.gif", body: "원유 수급 위기 시에는 냉난방 절제 등 생활 속 에너지 절약을 실천하고, 정부가 안내하는 유류 구매 요령을 따르세요. 가짜석유 유통이나 사재기 등 불법 행위에 가담하지 않도록 주의하세요." },
      { title: "원전사고", icon: "radiation", img: GUIDE_IMG_BASE + "사회재난/원전사고.gif", body: "원전 사고로 방사선 비상상황이 발생하면 라디오·방송의 공식 안내에 따라 침착하게 행동하세요. 실내에서는 창문 등 환기구를 닫아 외부 공기 유입을 막고, 대피 시에는 전원·가스·수도를 차단한 뒤 상비약과 귀중품 등 최소한의 물품만 챙기세요." },
      { title: "유·도선 사고", icon: "sailboat", img: GUIDE_IMG_BASE + "사회재난/유도선사고.gif", body: "승선 시에는 뛰거나 장난치지 말고 안내방송에 따라 구명조끼 위치와 착용법을 미리 확인하세요. 침수나 화재가 발생하면 승무원의 안내에 따라 구명조끼를 착용하고 지정된 탈출로로 신속히 이동하세요." },
      { title: "인공우주물체 추락", icon: "orbit", img: GUIDE_IMG_BASE + "사회재난/인공우주물체추락.gif", body: "우주물체 추락 소식을 접하면 건물 내 지하 등 대피 장소나 튼튼한 벽·기둥 뒤로 이동하세요. 폭발과 낙하물에 대비해 재난방송을 청취하고, 잔해로 의심되는 물체를 발견하면 만지지 말고 즉시 소방서나 경찰서에 신고하세요." },
      { title: "전기·가스 사고", icon: "plug-zap", img: GUIDE_IMG_BASE + "사회재난/전기가스사고.gif", body: "쓰러진 전신주나 파손된 전기시설물에는 절대 접근하지 말고 한국전력(123)에 신고하세요. 가스 냄새가 나면 LPG는 바닥 쪽, 도시가스는 천장 쪽을 확인하고, 환기 후 전기 스위치를 켜지 말고 가스공급자에게 신고하세요." },
      { title: "정보통신사고", icon: "wifi-off", img: GUIDE_IMG_BASE + "사회재난/정보통신사고.gif", body: "인터넷·모바일 서비스 장애가 발생하면 은행이나 우체국 등 관련 기관을 직접 방문해 업무를 처리하는 것이 가장 확실합니다. 재난문자나 방송 등을 통해 복구 상황을 계속 확인하세요." },
      { title: "정전 및 전력부족", icon: "zap-off", img: GUIDE_IMG_BASE + "사회재난/정전및전력부족.gif", body: "정전에 대비해 손전등과 휴대용 라디오, 비상식량을 미리 준비해두세요. 정전이 되면 전열기 등의 플러그를 뽑아두고, 엘리베이터 안에서 정전이 되면 임의로 탈출하지 말고 인터폰으로 구조를 요청하세요." },
      { title: "지역축제장", icon: "party-popper", img: GUIDE_IMG_BASE + "사회재난/지역축제장.gif", body: "축제장에서는 통로나 비상구를 막지 말고, 안전요원의 통제와 안내방송에 따라 질서 있게 이동하세요. 인파가 몰리는 공연이나 행사장에서는 무리하게 앞으로 나가지 말고 여유 공간을 확보하며 관람하세요." },
      { title: "철도·지하철 사고", icon: "train-front", img: GUIDE_IMG_BASE + "사회재난/철도지하철사고.gif", body: "화재가 발생하면 비상버튼으로 승무원에게 알리고, 문이 열리지 않으면 비상용 망치로 유리창을 깨거나 스크린도어의 빨간 바를 밀고 대피하세요. 코와 입을 옷소매나 손수건으로 막고 유도등을 따라 이동하며, 반대편 선로로는 절대 대피하지 마세요." },
      { title: "폭발", icon: "triangle-alert", img: GUIDE_IMG_BASE + "사회재난/폭발.gif", body: "폭발음을 들으면 2차 폭발에 대비해 신속히 건물 밖 안전한 곳이나 벽·기둥 뒤로 대피하세요. 큰 소리로부터 청력을 보호하기 위해 귀를 막고, 연기와 유독가스를 피해 바람이 불어오는 방향으로 이동하세요." },
      { title: "항공기사고", icon: "plane", img: GUIDE_IMG_BASE + "사회재난/항공기사고.gif", body: "비상시에는 좌석 등받이를 세우고 안전벨트를 착용한 뒤 상체를 숙여 충격에 대비하는 자세를 취하세요. 산소마스크가 내려오면 보호자가 먼저 착용한 뒤 어린이나 노약자를 도와주고, 짐을 챙기지 말고 승무원의 안내에 따라 신속히 탈출하세요." },
      { title: "해양선박사고", icon: "ship", img: GUIDE_IMG_BASE + "사회재난/해양선박사고.gif", body: "승선 중에는 뛰거나 장난치지 말고 대피로와 구명조끼 위치를 미리 확인하세요. 침수나 화재가 발생하면 승무원의 안내에 따라 구명조끼를 착용하고, 노약자를 도와 함께 신속히 탈출하세요." },
      { title: "해양오염사고", icon: "droplets", img: GUIDE_IMG_BASE + "사회재난/해양오염사고.gif", body: "해양오염 사고를 목격하면 119에 신고하고, 위험지역에 거주한다면 마스크나 젖은 수건으로 호흡기를 보호하며 신속히 대피하세요. 대응기관이 도착하기 전에는 사고 현장에 접근하지 말고, 오염된 지역의 음식물이나 물은 섭취하지 마세요." },
      { title: "화재", icon: "flame", img: GUIDE_IMG_BASE + "사회재난/화재.gif", body: "불을 발견하면 '불이야'라고 외쳐 주변에 알리고 화재경보 비상벨을 누르세요. 엘리베이터 대신 계단을 이용해 대피하고, 연기가 많을 때는 젖은 수건으로 코와 입을 막고 낮은 자세로 이동하세요." },
      { title: "화학사고재난", icon: "flask-conical", img: GUIDE_IMG_BASE + "사회재난/화학사고재난.gif", body: "화학물질 누출이 의심되는 연기·냄새·통증이 느껴지면 즉시 119에 신고하고, 우의나 비닐로 피부 노출을 막은 뒤 입과 코를 가리고 바람이 불어오는 방향으로 멀리 대피하세요. 대피 안내가 없다면 실내에 머물며 방송과 재난문자로 상황을 계속 확인하세요." },
      { title: "GPS전파혼신 재난", icon: "satellite-dish", img: GUIDE_IMG_BASE + "사회재난/gps전파혼신재난.gif", body: "GPS 전파혼신이 발생하면 차량 내비게이션 오작동에 대비해 안전운전에 유의하세요. 소형 선박은 출항을 자제하고 항해 중인 선박은 신속히 귀항하며, 혼신 상황이 끝날 때까지 주식 거래나 현금 인출 등 금융거래는 자제하는 것이 좋습니다." },
    ],
    life: [
      { title: "가정 안전점검", icon: "house", img: GUIDE_IMG_BASE + "생활안전/가정안전점검.gif", body: "정기적으로 가스·전기시설과 소화기, 화재감지기의 작동 상태를 점검하세요. 가족과 함께 대피장소와 대피경로, 비상연락처를 미리 정해두면 실제 재난 상황에서 신속하게 대응할 수 있습니다." },
      { title: "가정폭력예방", icon: "shield-alert", img: GUIDE_IMG_BASE + "생활안전/가정폭력예방.gif", body: "가정폭력이 발생하면 여성긴급전화 1366이나 112에 즉시 신고하세요. 피신이 필요할 경우를 대비해 미리 갈 수 있는 장소를 정해두고, 신분증·통장·비상금 등 챙길 물품을 준비해두면 도움이 됩니다." },
      { title: "붉은불개미", icon: "bug", img: GUIDE_IMG_BASE + "생활안전/붉은불개미.gif", body: "개미집처럼 보이는 흙무덤이나 땅 위 물건을 맨손으로 건드리지 말고, 야외활동 시 장갑과 장화를 착용하세요. 물렸다면 세게 쓸어서 떼어내고 즉시 병원 진료를 받으며, 어지러움·호흡곤란 등 전신 증상이 나타나면 119에 신고하세요. 의심 개체를 발견하면 만지지 말고 사진을 찍어 환경부(1577-8866)에 신고하세요." },
      { title: "산행안전사고", icon: "footprints", img: GUIDE_IMG_BASE + "생활안전/산행안전사고.gif", body: "등산 전 날씨와 등산로 통제 여부를 확인하고, 본인 체력에 맞는 코스를 선택하세요. 호흡이 힘들거나 어지러우면 즉시 멈춰 휴식을 취하고, 부상이나 조난 시에는 119에 신고한 뒤 국가지점번호나 이정표를 확인해 위치를 알려주세요." },
      { title: "석유제품사고", icon: "fuel", img: GUIDE_IMG_BASE + "생활안전/석유제품사고.gif", body: "주유소나 유류저장시설 근처에서 기름 냄새가 나거나 유출이 의심되면 화기 사용을 금하고 즉시 119와 관리업체에 신고하세요. 유출된 기름에 직접 닿지 않도록 하고, 담배나 라이터 등 불씨를 가까이하지 마세요." },
      { title: "승강기 안전사고", icon: "square-arrow-up", img: GUIDE_IMG_BASE + "생활안전/승강기안전사고.gif", body: "엘리베이터 탑승 정원과 하중을 지키고, 운행 중 뛰거나 문에 기대는 행동은 하지 마세요. 갑자기 멈추면 임의로 탈출하지 말고 인터폰으로 구조를 요청하고, 화재 시에는 엘리베이터 대신 반드시 계단을 이용하세요." },
      { title: "식중독", icon: "utensils", img: GUIDE_IMG_BASE + "생활안전/식중독.gif", body: "손 씻기, 익혀 먹기, 끓여 먹기, 조리도구 구분 사용, 세척·소독, 보관온도 지키기의 식중독 예방 6대 수칙을 지키세요. 복통·구토·설사 등 의심 증상이 나타나면 가까운 의료기관을 방문해 진료를 받으세요." },
      { title: "실종유괴예방", icon: "user-search", img: GUIDE_IMG_BASE + "생활안전/실종유괴예방.gif", body: "자녀와 외출 시 항상 함께 다니고, 옷차림과 특징을 기억해두며 정기적으로 사진을 찍어두세요. 아이에게는 길을 잃으면 그 자리에 멈춰 서서 주변 어른이나 경찰관에게 도움을 요청하고, 낯선 사람이 주는 음식을 먹거나 따라가지 않도록 미리 알려주세요." },
      { title: "심폐소생술", icon: "heart-pulse", img: GUIDE_IMG_BASE + "생활안전/심폐소생술.gif", body: "반응이 없으면 119에 신고하고 AED를 요청한 뒤, 호흡이 없거나 비정상이면 분당 100~120회 속도로 5cm 깊이의 가슴압박을 30회 시행하세요. 인공호흡이 어렵다면 가슴압박만이라도 구급대원이 도착할 때까지 계속하는 것이 중요합니다." },
      { title: "어린이 놀이시설 안전사고", icon: "baby", img: GUIDE_IMG_BASE + "생활안전/어린이놀이시설안전사고.gif", body: "놀이기구는 이용 연령에 맞게 선택하고 보호자가 동반해 지켜보세요. 끈 달린 옷이나 슬리퍼 착용, 가방을 멘 채 이용하는 것은 위험하니 피하고, 사고가 발생하면 즉시 놀이를 중단하고 응급처치와 함께 도움을 요청하세요." },
      { title: "여름철물놀이", icon: "waves", img: GUIDE_IMG_BASE + "생활안전/여름철물놀이.gif", body: "안전요원이 있는 곳에서만 물놀이를 하고, 물에 들어가기 전 다리→팔→얼굴→가슴 순서로 물을 적신 뒤 천천히 입수하세요. 구명조끼를 반드시 착용하고 음주 후에는 물에 들어가지 말며, 익수자를 발견하면 직접 뛰어들기보다 119에 신고하고 주변 구조장비를 활용하세요." },
      { title: "응급처치", icon: "syringe", img: GUIDE_IMG_BASE + "생활안전/응급처치.gif", body: "현장이 안전한지 확인한 뒤 119에 신고하고, 척추 손상이 의심되면 환자를 함부로 옮기지 마세요. 의식이 없다면 기도를 확보하고 호흡을 확인하며, 필요시 심폐소생술을 시행해 구급대가 도착할 때까지 처치를 이어가세요." },
      { title: "학교폭력예방", icon: "graduation-cap", body: "학교폭력을 목격하거나 당했다면 담임교사나 학교전담경찰관에게 즉시 알리고, 117(학교폭력신고센터)로 신고하세요. 피해 사실은 기록해두고 혼자 해결하려 하지 말고 보호자와 학교의 도움을 함께 받으세요." },
      { title: "해파리피해", icon: "circle-alert", img: GUIDE_IMG_BASE + "생활안전/해파리피해.gif", body: "쏘였다면 즉시 물 밖으로 나와 바닷물로 씻어내고, 민물이나 알코올로 씻거나 문지르지 마세요. 통증이 심하거나 호흡곤란 등 전신 증상이 나타나면 즉시 119에 신고해 구급차를 요청하세요." },
    ],
    prepare: [
      { title: "비상대비", icon: "bell-ring", img: GUIDE_IMG_BASE + "비상대비/guide-cate74on.gif", body: "대피장소와 비상연락처를 미리 파악해두고, 생활필수품과 비상약품을 담은 비상생존배낭을 준비해두세요. 공습경보나 민방공 경보가 발령되면 가까운 민방위 대피시설이나 지하철역, 지하상가 등 지하 공간으로 신속히 이동하세요." },
      { title: "테러", icon: "shield-alert", img: GUIDE_IMG_BASE + "비상대비/테러.gif", body: "폭발음이 들리면 즉시 몸을 낮추고, 폭발 지점의 반대 방향 계단으로 대피하되 엘리베이터는 이용하지 마세요. 의심스러운 물건이나 사람을 발견하면 가까이 가지 말고 경찰청(112)이나 국가정보원(111)에 즉시 신고하세요." },
    ],
  };

  // 지금 화면에 그려진 재난 유형 목록 - 아이콘 클릭 시 몇 번째 항목인지로 찾기 위해 기억해둠
  let currentGuideList = [];

  function renderDisasterGuideGrid(tab) {
    const grid = document.getElementById("disaster-guide-grid");
    const detailEl = document.getElementById("disaster-guide-detail");
    if (!grid) return;
    if (detailEl) detailEl.style.display = "none";

    currentGuideList = tab === "all" ? Object.values(DISASTER_CATEGORIES).flat() : DISASTER_CATEGORIES[tab] || [];

    grid.innerHTML = currentGuideList
      .map((g, i) => {
        const tr = trGuide(g);
        return `
      <div class="flex flex-col items-center gap-2">
        <button type="button" onclick="showDisasterGuideDetail(${i})" title="${tr.title}" class="group w-28 h-28 mx-auto rounded-xl border border-slate-300 shadow-sm bg-white flex items-center justify-center overflow-hidden hover:shadow-lg hover:-translate-y-1 hover:scale-105 transition-all">
          ${g.img
            ? `<img src="${g.img}" alt="${tr.title}" class="w-full h-full object-contain p-3">`
            : `<i data-lucide="${g.icon}" stroke-width="2" class="w-12 h-12 text-gray-400 group-hover:text-gray-700 transition-colors"></i>`}
        </button>
        <span class="text-xs font-bold text-dark text-center leading-tight">${tr.title}</span>
      </div>`;
      })
      .join("");
    if (window.lucide) lucide.createIcons();
  }

  function updateTabIndicator(tab) {
    const row = document.getElementById("disaster-tab-row");
    const indicator = document.getElementById("disaster-tab-indicator");
    const activeBtn = row && row.querySelector(`.disaster-tab-btn[data-guide-tab="${tab}"]`);
    if (!row || !indicator || !activeBtn) return;
    indicator.style.left = activeBtn.offsetLeft + "px";
    indicator.style.width = activeBtn.offsetWidth + "px";
  }

  window.filterDisasterGuideTab = function (tab) {
    document.querySelectorAll(".disaster-tab-btn").forEach((btn) => {
      const active = btn.dataset.guideTab === tab;
      btn.className = active
        ? "disaster-tab-btn px-1 pb-3 shrink-0 transition text-base font-bold text-primary"
        : "disaster-tab-btn px-1 pb-3 shrink-0 transition text-base font-medium text-gray-400 hover:text-gray-600";
    });
    updateTabIndicator(tab);
    renderDisasterGuideGrid(tab);
  };

  // 상세 카드를 다시 그릴 때 필요한 마지막 index (언어 전환 시 재사용)
  let currentDetailIndex = -1;

  window.showDisasterGuideDetail = function (index) {
    const g = currentGuideList[index];
    if (!g) return;
    currentDetailIndex = index;
    const tr = trGuide(g);
    const detail = document.getElementById("disaster-guide-detail");
    const titleEl = document.getElementById("disaster-guide-detail-title");
    const bodyEl = document.getElementById("disaster-guide-detail-body");
    if (titleEl) titleEl.textContent = tr.title;
    if (bodyEl) {
      const t = window.olaI18n ? olaI18n.t : (k) => k;
      bodyEl.textContent = tr.body || t("emergency.guideComingSoon");
      bodyEl.className = tr.body ? "text-xs text-gray-500 leading-snug" : "text-xs text-gray-400 leading-snug italic";
    }
    if (detail) detail.style.display = "flex";
    if (window.lucide) lucide.createIcons();
  };

  // 언어를 바꾸면 현재 화면(그리드/상세)을 새 언어로 다시 그림
  function reRenderForLocale() {
    // renderDisasterGuideGrid()가 상세 패널을 항상 display:none으로 되돌리므로,
    // "상세가 열려 있었는지"는 그리드를 다시 그리기 전에 먼저 확인해둬야 합니다.
    const detail = document.getElementById("disaster-guide-detail");
    const wasOpen = currentDetailIndex >= 0 && detail && detail.style.display !== "none";

    const row = document.getElementById("disaster-tab-row");
    const activeBtn = row && row.querySelector(".disaster-tab-btn.text-primary");
    const tab = (activeBtn && activeBtn.dataset.guideTab) || "all";
    renderDisasterGuideGrid(tab);

    if (wasOpen) window.showDisasterGuideDetail(currentDetailIndex);
  }

  function init() {
    renderDisasterGuideGrid("all");
    updateTabIndicator("all");
    if (window.olaI18n) olaI18n.onLocaleChange(reRenderForLocale);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
