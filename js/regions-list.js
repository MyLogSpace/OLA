/**
 * js/regions-list.js — 수도권(서울/경기/인천) 66개 시군구 목록.
 * 각 페이지의 지역 선택 드롭다운(<select>)에서 공통으로 사용합니다.
 * value 형식은 "시도|시군구" (예: "서울특별시|강남구") 이고, 이 값이 그대로
 * assets/data/regions.json의 키와 일치합니다.
 */
const OLA_REGION_GROUPS = [
  {
    sido: "서울특별시",
    label: "서울",
    enLabel: "Seoul",
    list: [
      "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구",
      "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구",
      "관악구", "서초구", "강남구", "송파구", "강동구",
    ],
    // list와 같은 순서 · 1:1 대응 (표시 전용 로마자 표기 — assets/data/regions.json 키(한글)와는 무관)
    enList: [
      "Jongno-gu", "Jung-gu", "Yongsan-gu", "Seongdong-gu", "Gwangjin-gu", "Dongdaemun-gu", "Jungnang-gu", "Seongbuk-gu", "Gangbuk-gu", "Dobong-gu",
      "Nowon-gu", "Eunpyeong-gu", "Seodaemun-gu", "Mapo-gu", "Yangcheon-gu", "Gangseo-gu", "Guro-gu", "Geumcheon-gu", "Yeongdeungpo-gu", "Dongjak-gu",
      "Gwanak-gu", "Seocho-gu", "Gangnam-gu", "Songpa-gu", "Gangdong-gu",
    ],
  },
  {
    sido: "경기도",
    label: "경기",
    enLabel: "Gyeonggi",
    list: [
      "고양시", "과천시", "광명시", "광주시", "구리시", "군포시", "김포시", "남양주시", "동두천시", "부천시",
      "성남시", "수원시", "시흥시", "안산시", "안성시", "안양시", "양주시", "여주시", "오산시", "용인시",
      "의왕시", "의정부시", "이천시", "파주시", "평택시", "포천시", "하남시", "화성시", "연천군", "가평군", "양평군",
    ],
    enList: [
      "Goyang-si", "Gwacheon-si", "Gwangmyeong-si", "Gwangju-si", "Guri-si", "Gunpo-si", "Gimpo-si", "Namyangju-si", "Dongducheon-si", "Bucheon-si",
      "Seongnam-si", "Suwon-si", "Siheung-si", "Ansan-si", "Anseong-si", "Anyang-si", "Yangju-si", "Yeoju-si", "Osan-si", "Yongin-si",
      "Uiwang-si", "Uijeongbu-si", "Icheon-si", "Paju-si", "Pyeongtaek-si", "Pocheon-si", "Hanam-si", "Hwaseong-si", "Yeoncheon-gun", "Gapyeong-gun", "Yangpyeong-gun",
    ],
  },
  {
    sido: "인천광역시",
    label: "인천",
    enLabel: "Incheon",
    list: ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"],
    enList: ["Jung-gu", "Dong-gu", "Michuhol-gu", "Yeonsu-gu", "Namdong-gu", "Bupyeong-gu", "Gyeyang-gu", "Seo-gu", "Ganghwa-gun", "Ongjin-gun"],
  },
];

function olaRegionKey(sido, gu) {
  return `${sido}|${gu}`;
}

// 표시용 언어(한국어가 아니면 영어) — 화면에 보여주는 지역명에만 쓰고, API 조회·데이터 매칭에는 쓰지 않는다.
function olaRegionDisplayLocale() {
  return window.olaI18n ? olaI18n.getLocale() : "ko";
}

function olaRegionLabel(sido, gu) {
  const isKo = olaRegionDisplayLocale() === "ko";
  // 위치를 못 잡았을 때의 기본값(서울특별시|중구)은 "서울시청"/"Seoul City Hall"로 표시
  if (sido === "서울특별시" && gu === "중구") return isKo ? "서울시청" : "Seoul City Hall";
  const group = OLA_REGION_GROUPS.find((g) => g.sido === sido);
  if (!group) return `${sido} ${gu}`;
  if (isKo) return `${group.label} ${gu}`;
  const idx = group.list.indexOf(gu);
  const guEn = idx >= 0 ? group.enList[idx] : gu;
  return `${group.enLabel} ${guEn}`;
}

// "서울특별시" → "서울" 처럼 기상특보 검색어·미세먼지 sidoName 등에 쓰는 짧은 이름
// ⚠️ 실제 공공데이터 API(기상특보/미세먼지) 조회에 그대로 들어가는 값이라 항상 한국어를 반환해야 한다.
// 언어와 무관하게 고정. 화면에 짧은 시/도 이름을 "표시"할 때는 대신 olaSidoDisplay를 쓸 것.
function olaSidoShort(sido) {
  const group = OLA_REGION_GROUPS.find((g) => g.sido === sido);
  return group ? group.label : sido;
}

// olaSidoShort의 표시 전용 버전 — 현재 언어가 한국어가 아니면 영어 시/도 이름을 돌려준다.
function olaSidoDisplay(sido) {
  const group = OLA_REGION_GROUPS.find((g) => g.sido === sido);
  if (!group) return sido;
  return olaRegionDisplayLocale() === "ko" ? group.label : group.enLabel;
}

// 시군구(구/시/군) 한 글자만 있을 때 표시용으로 바꿔주는 헬퍼 — 소속 시도(sido)를 알아야 정확히
// 찾을 수 있다 (서울/인천 둘 다 "중구"가 있는 등 이름이 겹치는 경우가 있어서).
function olaGuDisplay(sido, gu) {
  if (olaRegionDisplayLocale() === "ko") return gu;
  const group = OLA_REGION_GROUPS.find((g) => g.sido === sido);
  if (!group) return gu;
  const idx = group.list.indexOf(gu);
  return idx >= 0 ? group.enList[idx] : gu;
}

// <select id="gu-select"> 에 시도별 <optgroup>으로 채워 넣는 공통 헬퍼
// (구 버전 호환용으로 남겨둠 — 새 화면은 아래 2단 캐스케이딩 헬퍼를 사용하세요)
function olaPopulateRegionSelect(selectEl, selectedKey) {
  const isKo = olaRegionDisplayLocale() === "ko";
  selectEl.innerHTML = OLA_REGION_GROUPS.map(
    (group) => `
    <optgroup label="${isKo ? group.label : group.enLabel}">
      ${group.list
        .map((gu) => {
          const key = olaRegionKey(group.sido, gu);
          return `<option value="${key}">${olaRegionLabel(group.sido, gu)}</option>`;
        })
        .join("")}
    </optgroup>`
  ).join("");
  if (selectedKey) selectEl.value = selectedKey;
}

/**
 * 시도 <select> 채우기 (서울/경기/인천 3개). value = 시도 전체명 (예: "서울특별시")
 */
function olaPopulateSidoSelect(selectEl, selectedSido) {
  const isKo = olaRegionDisplayLocale() === "ko";
  selectEl.innerHTML = OLA_REGION_GROUPS.map(
    (group) => `<option value="${group.sido}">${isKo ? group.label : group.enLabel}</option>`
  ).join("");
  if (selectedSido) selectEl.value = selectedSido;
}

/**
 * 시군구 <select> 채우기 — 넘겨받은 시도에 속한 목록만 채웁니다.
 * (시도가 바뀔 때마다 다시 호출해서 옵션을 새로 채워야 함)
 * value는 항상 한국어 구/시/군 이름(데이터 매칭용)이고, 화면에 보이는 텍스트만 언어별로 바뀐다.
 */
function olaPopulateGuSelect(selectEl, sido, selectedGu) {
  const group = OLA_REGION_GROUPS.find((g) => g.sido === sido);
  const list = group ? group.list : [];
  const isKo = olaRegionDisplayLocale() === "ko";
  selectEl.innerHTML = list
    .map((gu, i) => `<option value="${gu}">${isKo ? gu : (group.enList[i] || gu)}</option>`)
    .join("");
  if (selectedGu && list.includes(selectedGu)) selectEl.value = selectedGu;
}

window.OLA_REGION_GROUPS = OLA_REGION_GROUPS;
window.olaRegionKey = olaRegionKey;
window.olaRegionLabel = olaRegionLabel;
window.olaSidoShort = olaSidoShort;
window.olaSidoDisplay = olaSidoDisplay;
window.olaGuDisplay = olaGuDisplay;
window.olaPopulateRegionSelect = olaPopulateRegionSelect;
window.olaPopulateSidoSelect = olaPopulateSidoSelect;
window.olaPopulateGuSelect = olaPopulateGuSelect;
