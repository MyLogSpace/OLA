/* js/complaint-image.js
   =============================================================================
   민원 사진 업로드 → 브라우저에서 직접 CNN(ONNX) 추론 → "AI 분석 결과" 패널에 반영
   + 카테고리별 법령 안내 카드 (과태료·신고방법·근거 법령)
   + 불법주정차일 경우 Tesseract.js OCR로 차량번호 자동 인식 (수정 가능)
   + ★ NEW: 모델 2종 전환 지원 (전이학습 ResNet18 93.1% ↔ 직접 설계 CNN 86.3%)
   =============================================================================

   ★ 배포 전 반드시 확인해야 할 것 3가지 ★

   1) MODELS 의 각 url 경로에 실제 학습된 모델(.onnx)을 반드시 넣어둘 것.
      Colab v3 노트북에서 EXPORT_TARGET을 바꿔가며 두 번 내보내면 됩니다.
        - EXPORT_TARGET='transfer' 로 내보낸 파일
            → assets/models/ola_complaint_model_resnet18.onnx
        - EXPORT_TARGET='scratch' 로 내보낸 파일
            → assets/models/ola_complaint_model_scratch.onnx
      ⚠️ 두 모델은 입력 크기가 다릅니다(224 vs 160). 아래 MODELS에 이미
      맞춰뒀으니 파일명만 맞으면 됩니다.
      (직접 설계 모델 없이 ResNet18 하나만 쓰려면, scratch 항목을 지우면
       전환 버튼이 자동으로 숨겨집니다)

   2) CLASS_NAMES 순서가 학습 때와 반드시 일치해야 함.
      PyTorch의 ImageFolder는 폴더명을 "가나다순"으로 정렬해 클래스 인덱스를 매기는데,
      지금까지 실험에서 확인된 순서는 "보행방해물"(0) → "불법주정차"(1) → "현수막"(2) 입니다.
      노트북에서 저장한 ola_class_names.json 파일을 열어 class_names 배열과
      아래 CLASS_NAMES 순서가 정확히 같은지 반드시 대조 확인하세요.
      순서가 다르면 모델은 정상 동작하지만 라벨이 뒤바뀌어 표시되는,
      눈에 띄지 않는 심각한 오류가 생깁니다. (두 모델 모두 같은 데이터로
      학습했으므로 순서는 동일합니다)

   3) DEPT_MAP / DRAFT_TEMPLATE 은 예시 문구입니다.
      실제 서비스에 맞는 담당 부서명, 민원 문구로 바꿔서 사용하세요.

   ★ 차량번호 OCR 관련 주의 ★
   - Tesseract.js는 불법주정차로 분류된 경우에만 CDN에서 지연 로드됩니다(~수 MB).
   - 멀리서 찍은 사진·기울어진 번호판은 인식률이 낮습니다. 그래서 인식 결과를
     바로 확정하지 않고 "수정 가능한 입력칸"에 넣어 사용자가 확인하게 했습니다.
   - 인식 실패 시에도 민원 작성은 정상 진행되고, 번호는 직접 입력하면 됩니다.
   - 인식률 개선을 위해 (1) 흑백+대비 스트레칭 전처리, (2) Tesseract PSM을
     SPARSE_TEXT로, (3) 번호판 문자 화이트리스트를 적용해뒀습니다
     (recognizePlate/preprocessForOcr/getOcrWorker 참고). 그래도 번호판 자체가
     사진에서 너무 작게 나오면(차량 전체 샷) 여전히 잘 안 읽힐 수 있으니, 더
     끌어올리려면 번호판 영역만 잘라서 OCR에 넘기는 크롭 UI를 추가하는 게 다음
     단계입니다.

   ★ 로컬에서 테스트할 때 주의 ★
   file:// 로 html을 직접 열면 브라우저 보안 정책(CORS) 때문에 모델(.onnx) 파일을
   fetch로 불러오지 못해 실패합니다. 반드시 로컬 서버로 열어서 테스트하세요.
   예) 프로젝트 루트에서: python -m http.server 8000  →  http://localhost:8000/...
   =============================================================================
*/

(function () {
    // =========================================================================
    // ★ 모델 설정 — 두 가지 버전을 모두 지원 (사용자가 모달에서 전환 가능)
    //   - 기본값은 정확도가 높은 전이학습 모델 (서비스 품질 우선)
    //   - 직접 설계 모델은 "우리가 처음부터 설계·학습한 모델" 데모/비교용
    //   - 선택된 모델만 지연 로드하므로 초기 로딩 부담 없음
    // =========================================================================
    const MODELS = {
        transfer: {
            label: "전이학습 ResNet18",
            desc: "검증 정확도 93.1%",
            url: "../assets/models/ola_complaint_model_resnet18.onnx",
            imgSize: 224, // ⚠️ 학습 때 입력 해상도와 반드시 일치해야 함
        },
        scratch: {
            label: "직접 설계 CNN",
            desc: "검증 정확도 86.3%",
            url: "../assets/models/ola_complaint_model_scratch.onnx",
            imgSize: 160, // ⚠️ v3 노트북에서 IMG_SIZE=160으로 학습됨 (v2의 128 아님!)
        },
    };
    let activeModelKey = "transfer"; // 기본: 정확도 높은 쪽

    // MODELS의 label/desc, CLASS_NAMES는 내부 로직(ONNX 입력 크기 매칭·모델 파일 경로 등)에도
    // 쓰이는 값이라 그대로 두고, 화면 표시용 번역은 아래 헬퍼로 별도 조회한다.
    const MODEL_I18N_KEYS = {
        transfer: { label: "complaint.img.modelLabelTransfer", desc: "complaint.img.modelDescTransfer" },
        scratch: { label: "complaint.img.modelLabelScratch", desc: "complaint.img.modelDescScratch" },
    };
    function modelLabel(key) {
        const t = window.olaI18n ? olaI18n.t : (k) => k;
        const ik = MODEL_I18N_KEYS[key];
        return ik ? t(ik.label) : MODELS[key].label;
    }
    function modelDesc(key) {
        const t = window.olaI18n ? olaI18n.t : (k) => k;
        const ik = MODEL_I18N_KEYS[key];
        return ik ? t(ik.desc) : MODELS[key].desc;
    }

    // CLASS_NAMES(모델 출력 순서/키)는 그대로 두고, 화면 표시용 라벨만 언어별로 조회.
    const CLASS_I18N_KEYS = {
        보행방해물: "complaint.img.classPedestrian",
        불법주정차: "complaint.img.classIllegalParking",
        현수막: "complaint.img.classBanner",
    };
    function classLabel(name) {
        const t = window.olaI18n ? olaI18n.t : (k) => k;
        const ik = CLASS_I18N_KEYS[name];
        return ik ? t(ik) : name;
    }

    const IMAGENET_MEAN = [0.485, 0.456, 0.406];
    const IMAGENET_STD = [0.229, 0.224, 0.225];

    // ⚠️ ola_class_names.json 의 class_names 순서와 반드시 대조할 것 (위 설명 참고)
    const CLASS_NAMES = ["보행방해물", "불법주정차", "현수막"];

    // 카테고리 → 담당 부서(dept=부서명) 매핑.
    const DEPT_MAP = {
        보행방해물: "도로관리과 · 보행환경팀",
        불법주정차: "교통행정과 · 주정차단속팀",
        현수막: "환경미화과 · 옥외광고물팀",
    };

    // 카테고리 → "바로가기" 외부 신고 링크. 세 카테고리 모두 안전신문고 앱/사이트에서
    // 신고서 접수가 이뤄지므로 동일하게 연결한다. (불법주정차를 안전신문고 대신 국민신문고로
    // 잘못 연결하는 문제 예방 → js/issue.js의 CATEGORY_RULES와 동일한 목적)
    const PHOTO_AGENCY_LINK = {
        보행방해물: { url: "https://www.safetyreport.go.kr/", urlLabel: "안전신문고 바로가기" },
        불법주정차: { url: "https://www.safetyreport.go.kr/", urlLabel: "안전신문고 바로가기" },
        현수막: { url: "https://www.safetyreport.go.kr/", urlLabel: "안전신문고 바로가기" },
    };

    // =========================================================================
    // 카테고리별 법령·과태료·신고방법 안내 데이터
    // 출처: 행정안전부 6대 불법주정차 주민신고제(korea.kr 정책브리핑),
    //       국민권익위원회, 옥외광고물법. 과태료 금액은 법령 개정으로 바뀔 수
    //       있으니 주기적으로 확인해서 갱신하세요.
    // =========================================================================
    const LEGAL_INFO = {
        불법주정차: {
            law: "도로교통법 제32조~제34조 (정차 및 주차의 금지)",
            fineRows: [
                // [구역, 승용차, 승합차]
                ["일반 도로", "4만원", "5만원"],
                ["인도(보도) 위", "4만원", "5만원"],
                ["횡단보도 · 교차로 모퉁이 5m · 버스정류소 10m 이내", "4만원", "5만원"],
                ["소화전 등 소방시설 5m 이내", "8만원", "9만원"],
                ["어린이보호구역", "12만원", "13만원"],
            ],
            report:
                "<b>안전신문고 앱</b> → 신고하기 → 불법주정차 유형 선택. " +
                "같은 위치·같은 각도에서 <b>1분 이상 간격으로 사진 2장</b>(차량번호와 주변 배경이 함께 " +
                "식별되게)을 앱 안에서 직접 촬영해 제출하면, 공무원 현장 출동 없이 과태료가 부과돼요.",
            tips: [
                "촬영 간격은 예전엔 지자체마다 5분·10분 등 제각각이었지만, 지금은 <b>전국 공통 '1분 이상'</b>으로 통일됐어요. 즉, 1분 이상 같은 자리에 서 있는 차량이 신고 대상이에요.",
                "6대 절대 금지구역(소화전·교차로 모퉁이·버스정류소·횡단보도·어린이보호구역·인도)은 주민 신고만으로 즉시 과태료가 부과돼요.",
                "사진은 안전신문고 <b>앱 내 카메라로만</b> 촬영 가능하고, 촬영 다음 날까지 신고를 접수해야 해요.",
            ],
            agency: "{region} 교통행정과(주정차 단속) · {call}",
        },
        보행방해물: {
            law: "도로교통법 제68조 제2항·제152조 · 도로법 제61조·제72조",
            fineRows: null,
            fineText:
                "제재는 두 갈래예요.<br>" +
                "① <b>도로교통법 제152조</b>: 교통에 방해될 물건을 도로에 함부로 내버려두면 " +
                "<b>1년 이하 징역 또는 300만원 이하 벌금</b> 대상이에요.<br>" +
                "② <b>도로법 제72조</b>: 허가 없는 점용(적치·진열)은 <b>점용료의 120%</b>를 변상금으로 " +
                "징수해요. 점용료 자체가 점용 <b>면적 × 기간 × 해당 토지 가격</b>으로 지자체 조례에 따라 " +
                "사례별로 계산되는 구조라, 불법주정차처럼 전국 공통 정액표가 없어요. 정확한 액수는 " +
                "구청이 현장 확인 후 산정합니다.",
            report:
                "<b>안전신문고 앱</b> → 생활불편 신고 → '도로·시설물' 유형으로 사진과 위치를 첨부해 " +
                "신고하면 관할 구청 도로관리 부서가 계고(경고) 후 이동·철거 조치해요.",
            tips: [
                "상가 앞 입간판·물건 적치, 장기간 방치된 폐자재, 인도를 막는 오토바이 등이 대표적인 신고 대상이에요.",
                "시각장애인 점자블록이나 휠체어 통행로를 막는 경우엔 더 빠르게 처리되는 편이에요 — 신고 내용에 함께 적어주세요.",
            ],
            agency: "{region} 도로관리과 · {call}",
        },
        현수막: {
            law: "옥외광고물법 제20조 (옥외광고물 등의 관리와 옥외광고산업 진흥에 관한 법률)",
            fineRows: null,
            fineText:
                "지정 게시대가 아닌 곳에 무단 설치한 현수막은 <b>500만원 이하 과태료</b> 부과 대상이고, " +
                "지자체가 즉시 강제 철거할 수 있어요. (상습 위반 시 장당 가산 부과하는 지자체도 있어요)",
            report:
                "<b>안전신문고 앱</b> → 생활불편 신고 → '불법 광고물' 유형으로 현수막 <b>전체가 보이는 사진</b> + " +
                "<b>업체 전화번호가 식별되는 근접 사진</b>을 함께 첨부해 신고하세요.",
            tips: [
                "일부 지자체는 불법 현수막 <b>수거보상제</b>(포상금·지역상품권 지급)를 운영해요 — 관할 구청에 확인해보세요.",
                "정당 현수막은 법에서 정한 개수·게시 기간 요건 안에서는 예외적으로 허용되는 경우가 있어요.",
            ],
            agency: "{region} 옥외광고물 담당 부서(도시경관과 등) · {call}",
        },
    };

    // 안내 문구의 {region}/{call} 자리표시자를 현재 위치 기반 실제 값으로 치환.
    // 위치 시스템(olaLocation)이 있으니 "관할 구청" 대신 실제 지역명을 보여준다.
    // (예: "서울 관악구 도로관리과 · 다산콜 120")
    function fillRegionPlaceholders(str) {
        const region = getCurrentAgencyName(); // 예: "서울 관악구" (location.js 기반, 폴백 있음)
        const call = /^서울/.test(region) ? "다산콜 120" : "국민콜 110";
        return String(str).replace(/\{region\}/g, region).replace(/\{call\}/g, call);
    }

    // =========================================================================
    // 차량번호 OCR (Tesseract.js — 불법주정차일 때만 지연 로드)
    // =========================================================================
    const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    let tesseractLoading = null;

    function loadTesseract() {
        if (window.Tesseract) return Promise.resolve();
        if (!tesseractLoading) {
            tesseractLoading = new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = TESSERACT_URL;
                s.onload = resolve;
                s.onerror = () => {
                    tesseractLoading = null; // 다음에 다시 시도할 수 있게
                    reject(new Error("tesseract.js 로드 실패"));
                };
                document.head.appendChild(s);
            });
        }
        return tesseractLoading;
    }

    // 한국 차량번호판 패턴: 신형(12가3456 / 123가4567), 구형 지역판(서울12가3456)
    const PLATE_REGEXES = [
        /[가-힣]{2}\s?\d{2}\s?[가-힣]\s?\d{4}/, // 구형(지역명 포함)을 먼저 — 신형 패턴이 부분 매칭하는 것 방지
        /\d{2,3}\s?[가-힣]\s?\d{4}/,
    ];

    // 번호판에 실제로 쓰이는 문자만 화이트리스트로 제한 — 숫자 0~9 + 용도구분 한글 40자.
    // 사진 전체(차량·배경 포함)를 그대로 읽다 보니 번호판이 아닌 글자를 억지로
    // 비슷한 문자로 오인식하는 경우가 많았는데, 이걸 크게 줄여준다.
    const PLATE_CHAR_WHITELIST =
        "0123456789가나다라마바사아자차카타파하거너더러머버서어저고노도로모보소오조구누두루무부수우주";

    // OCR 인식률을 높이기 위해 원본 해상도를 유지한 캔버스(최대 1600px)로 넘긴다.
    // (미리보기 img는 CSS로 축소돼 있어도 naturalWidth 기준으로 그려짐)
    function toOcrCanvas(imgEl) {
        const MAX = 1600;
        const w = imgEl.naturalWidth || imgEl.width;
        const h = imgEl.naturalHeight || imgEl.height;
        const scale = Math.min(1, MAX / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext("2d").drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    // 회색조 변환 + 대비(min-max) 스트레칭.
    // 사진 자체는 선명해도 차량 전체가 나온 프레임에서는 번호판 영역의 명암 대비가
    // 낮은 경우가 많아, 이걸 인위적으로 키워주면 Tesseract 인식률이 눈에 띄게 오른다.
    function preprocessForOcr(canvas) {
        const ctx = canvas.getContext("2d");
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        const n = d.length / 4;
        const gray = new Float32Array(n);
        let min = 255;
        let max = 0;
        for (let i = 0, p = 0; p < n; i += 4, p++) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            gray[p] = g;
            if (g < min) min = g;
            if (g > max) max = g;
        }
        const range = Math.max(1, max - min);
        for (let i = 0, p = 0; p < n; i += 4, p++) {
            const v = ((gray[p] - min) / range) * 255;
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }

    // Tesseract 워커는 최초 1회만 생성해서 재사용 (매번 새로 만들면 느림).
    // - tessedit_pageseg_mode: SPARSE_TEXT — "문서 전체를 읽는" 기본 모드 대신,
    //   사진 안에 흩어진 짧은 텍스트 블록을 찾는 모드. 번호판처럼 화면 일부에만
    //   있는 텍스트에 훨씬 적합하다.
    // - tessedit_char_whitelist: 번호판 문자 40여 개로 제한.
    let ocrWorkerLoading = null;
    async function getOcrWorker() {
        if (!ocrWorkerLoading) {
            ocrWorkerLoading = (async () => {
                await loadTesseract();
                const worker = await Tesseract.createWorker(["kor", "eng"]);
                await worker.setParameters({
                    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
                    tessedit_char_whitelist: PLATE_CHAR_WHITELIST,
                });
                return worker;
            })().catch((err) => {
                ocrWorkerLoading = null; // 실패하면 다음 시도 때 다시 생성
                throw err;
            });
        }
        return ocrWorkerLoading;
    }

    // 캔버스 하나를 지정된 PSM으로 인식해서 텍스트를 반환하는 공용 헬퍼.
    // (워커는 재사용하되, 호출마다 페이지 분석 모드만 바꿔서 setParameters)
    async function recognizeCanvas(canvas, psm) {
        const worker = await getOcrWorker();
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const { data } = await worker.recognize(preprocessForOcr(canvas));
        return (data && data.text ? data.text : "").replace(/\s+/g, " ");
    }

    async function recognizePlate(imgEl) {
        const text = await recognizeCanvas(toOcrCanvas(imgEl), Tesseract.PSM.SPARSE_TEXT);
        for (const re of PLATE_REGEXES) {
            const m = text.match(re);
            if (m) return m[0].replace(/\s+/g, "");
        }
        return null;
    }

    // 사용자가 직접 번호판 영역만 잘라낸 캔버스를 인식. 이 경우엔 이미지 전체가
    // "번호판 한 줄"이라고 가정할 수 있으므로 SINGLE_LINE 모드를 쓴다 — 배경 잡음이
    // 없어서 SPARSE_TEXT보다 정확도가 높다.
    async function recognizePlateFromCrop(cropCanvas) {
        const text = await recognizeCanvas(cropCanvas, Tesseract.PSM.SINGLE_LINE);
        for (const re of PLATE_REGEXES) {
            const m = text.match(re);
            if (m) return m[0].replace(/\s+/g, "");
        }
        // 사용자가 번호판만 정확히 잘라낸 상황이라, 정규식과 완전히 안 맞아도
        // 인식된 숫자/한글이 있으면 후보로라도 보여준다 (직접 수정 가능하니까).
        const cleaned = text.replace(/[^0-9가-힣]/g, "");
        return cleaned || null;
    }

    // =========================================================================
    // 번호판 영역 수동 크롭 — 자동 인식이 잘 안 될 때, 사진에서 번호판 부분만
    // 드래그로 지정해서 그 영역만 확대해 다시 OCR을 돌리는 기능.
    // 차량 전체가 나온 사진은 번호판 자체의 실제 해상도가 낮아서, 배경 없이
    // 번호판만 확대해서 넘기면 인식률이 크게 오른다.
    // =========================================================================

    // object-fit:contain으로 표시된 <img> 안에서 실제 이미지가 그려지는 사각형
    // (레터박스 여백 제외)을, img 엘리먼트 기준 좌표로 계산.
    function getContainedImageRect(imgEl) {
        const cw = imgEl.clientWidth;
        const ch = imgEl.clientHeight;
        const nw = imgEl.naturalWidth || cw;
        const nh = imgEl.naturalHeight || ch;
        const scale = Math.min(cw / nw, ch / nh) || 1;
        const w = nw * scale;
        const h = nh * scale;
        return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, scale };
    }

    // 화면에 표시된 드래그 사각형(overlay 기준 px)을 원본 이미지의 자연 픽셀
    // 좌표로 변환해서 잘라내고, 글자가 너무 작으면 확대까지 해서 캔버스로 반환.
    function cropToNaturalCanvas(imgEl, rectOnScreen) {
        const contained = getContainedImageRect(imgEl);
        const x0 = Math.max(contained.x, Math.min(rectOnScreen.x, contained.x + contained.w));
        const y0 = Math.max(contained.y, Math.min(rectOnScreen.y, contained.y + contained.h));
        const x1 = Math.min(contained.x + contained.w, Math.max(rectOnScreen.x + rectOnScreen.w, contained.x));
        const y1 = Math.min(contained.y + contained.h, Math.max(rectOnScreen.y + rectOnScreen.h, contained.y));

        const natX = (x0 - contained.x) / contained.scale;
        const natY = (y0 - contained.y) / contained.scale;
        const natW = Math.max(1, (x1 - x0) / contained.scale);
        const natH = Math.max(1, (y1 - y0) / contained.scale);

        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = imgEl.naturalWidth;
        srcCanvas.height = imgEl.naturalHeight;
        srcCanvas.getContext("2d").drawImage(imgEl, 0, 0);

        // 잘라낸 영역의 세로 길이가 최소 180px는 되도록 확대 (작은 크롭일수록 Tesseract가 잘 못 읽음)
        const MIN_H = 180;
        const upscale = Math.max(1, MIN_H / natH);

        const out = document.createElement("canvas");
        out.width = Math.round(natW * upscale);
        out.height = Math.round(natH * upscale);
        const octx = out.getContext("2d");
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = "high";
        octx.drawImage(srcCanvas, natX, natY, natW, natH, 0, 0, out.width, out.height);
        // 사람이 손으로 찍은 사진은 번호판이 완전히 수평인 경우가 거의 없다.
        // 사각형으로 자르기만 하면 글자가 여전히 기울어져 있어서 Tesseract가
        // 글자 하나하나의 경계를 잘못 나누기 쉬운데, 그게 살짝 기울어진 사진에서
        // 유독 인식이 안 되는 주된 원인이다. 그래서 잘라낸 조각을 자동으로
        // 수평에 맞게 회전 보정한다.
        return autoDeskew(out);
    }

    // 캔버스를 deg(도)만큼 회전한 새 캔버스를 반환. 회전하면서 생기는 여백은
    // 흰색으로 채운다 (번호판은 대부분 밝은 바탕이라 흰 여백이 잡음을 덜 만듦).
    function rotateCanvasDeg(canvas, deg) {
        if (!deg) return canvas;
        const rad = (deg * Math.PI) / 180;
        const w = canvas.width;
        const h = canvas.height;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const nw = Math.round(w * cos + h * sin);
        const nh = Math.round(w * sin + h * cos);
        const out = document.createElement("canvas");
        out.width = nw;
        out.height = nh;
        const octx = out.getContext("2d");
        octx.fillStyle = "#fff";
        octx.fillRect(0, 0, nw, nh);
        octx.translate(nw / 2, nh / 2);
        octx.rotate(rad);
        octx.drawImage(canvas, -w / 2, -h / 2);
        return out;
    }

    // "가로줄 명암 분산" 점수 — 글자 줄이 수평에 가까울수록, 글자가 있는 행과
    // 배경만 있는 행의 평균 밝기 차이가 뚜렷해져서 이 값이 커진다(투영 프로파일 기법).
    function horizontalVarianceScore(canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        const { data } = ctx.getImageData(0, 0, w, h);
        const rowMean = new Float32Array(h);
        for (let y = 0; y < h; y++) {
            let s = 0;
            const rowStart = y * w * 4;
            for (let x = 0; x < w; x++) {
                const i = rowStart + x * 4;
                s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
            rowMean[y] = s / w;
        }
        let mean = 0;
        for (let y = 0; y < h; y++) mean += rowMean[y];
        mean /= h;
        let variance = 0;
        for (let y = 0; y < h; y++) variance += (rowMean[y] - mean) * (rowMean[y] - mean);
        return variance / h;
    }

    // -15°~+15° 범위(사람이 손으로 찍었을 때 흔히 생기는 정도의 기울기)를 1° 단위로
    // 훑어서, 글자 줄이 가장 수평에 가까워지는 각도를 찾아 회전 보정한다.
    function autoDeskew(canvas) {
        let bestAngle = 0;
        let bestScore = -Infinity;
        for (let deg = -15; deg <= 15; deg++) {
            const score = horizontalVarianceScore(rotateCanvasDeg(canvas, deg));
            if (score > bestScore) {
                bestScore = score;
                bestAngle = deg;
            }
        }
        return rotateCanvasDeg(canvas, bestAngle);
    }

    let cropState = null; // { cleanup }

    function removeCropOverlay() {
        if (cropState && cropState.cleanup) cropState.cleanup();
        const overlay = $("imgPlateCropOverlay");
        if (overlay) overlay.remove();
        const wrap = $("imgClassifyPreviewWrap");
        if (wrap) wrap.classList.remove("relative");
        cropState = null;
    }

    // "번호판 잘라서 재인식" 버튼을 누르면 미리보기 사진 위에 드래그 선택 오버레이를 띄운다.
    function startCropSelection() {
        const wrap = $("imgClassifyPreviewWrap");
        const imgEl = $("imgClassifyPreview");
        if (!wrap || !imgEl) return;
        removeCropOverlay();
        wrap.classList.add("relative");

        const overlay = document.createElement("div");
        overlay.id = "imgPlateCropOverlay";
        overlay.className = "absolute inset-0 cursor-crosshair";
        overlay.style.touchAction = "none";

        const hint = document.createElement("p");
        hint.className = "absolute top-1 left-1 bg-dark bg-opacity-70 text-white text-[11px] px-2 py-1 rounded pointer-events-none";
        hint.textContent = window.olaI18n ? olaI18n.t("complaint.img.cropHint") : "번호판 부분만 드래그로 선택하세요";
        overlay.appendChild(hint);

        const box = document.createElement("div");
        box.className = "absolute border-2 border-primary bg-primary bg-opacity-20 hidden pointer-events-none";
        overlay.appendChild(box);

        wrap.appendChild(overlay);

        let dragging = false;
        let startX = 0;
        let startY = 0;

        function getPos(e) {
            const r = overlay.getBoundingClientRect();
            const p = e.touches ? e.touches[0] : e;
            return { x: p.clientX - r.left, y: p.clientY - r.top };
        }
        function onDown(e) {
            e.preventDefault();
            dragging = true;
            const p = getPos(e);
            startX = p.x;
            startY = p.y;
            box.classList.remove("hidden");
            box.style.left = startX + "px";
            box.style.top = startY + "px";
            box.style.width = "0px";
            box.style.height = "0px";
        }
        function onMove(e) {
            if (!dragging) return;
            e.preventDefault();
            const p = getPos(e);
            const x = Math.min(p.x, startX);
            const y = Math.min(p.y, startY);
            box.style.left = x + "px";
            box.style.top = y + "px";
            box.style.width = Math.abs(p.x - startX) + "px";
            box.style.height = Math.abs(p.y - startY) + "px";
        }
        async function onUp(e) {
            if (!dragging) return;
            dragging = false;
            const rect = {
                x: parseFloat(box.style.left) || 0,
                y: parseFloat(box.style.top) || 0,
                w: parseFloat(box.style.width) || 0,
                h: parseFloat(box.style.height) || 0,
            };
            if (rect.w < 8 || rect.h < 8) return; // 너무 작은 드래그(오클릭)는 무시
            await recropAndRecognize(imgEl, rect);
        }

        overlay.addEventListener("mousedown", onDown);
        overlay.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        overlay.addEventListener("touchstart", onDown, { passive: false });
        overlay.addEventListener("touchmove", onMove, { passive: false });
        overlay.addEventListener("touchend", onUp);

        cropState = {
            cleanup: () => window.removeEventListener("mouseup", onUp),
        };
    }

    async function recropAndRecognize(imgEl, rectOnScreen) {
        const t = window.olaI18n ? olaI18n.t : (k, vars) => k;
        const status = $("imgPlateStatus");
        if (status) status.textContent = t("complaint.img.cropRecognizing");
        // 아래 크롭+회전보정은 동기 연산이라, 화면에 위 상태 문구가 먼저 그려지도록
        // 한 프레임 양보한 뒤에 실행한다 (안 그러면 버튼 클릭 반응이 잠깐 멈춘 것처럼 보임).
        await new Promise((r) => requestAnimationFrame(r));
        try {
            const cropCanvas = cropToNaturalCanvas(imgEl, rectOnScreen);
            const plate = await recognizePlateFromCrop(cropCanvas);
            const input = $("imgPlateInput");
            if (plate) {
                if (input) input.value = plate;
                if (status) status.textContent = t("complaint.img.cropResult", { plate });
            } else if (status) {
                status.textContent = t("complaint.img.cropNotFound");
            }
        } catch (err) {
            console.warn("[complaint-image] 크롭 재인식 실패:", err);
            if (status) status.textContent = t("complaint.img.cropFailed");
        } finally {
            removeCropOverlay();
        }
    }

    // =========================================================================
    // 법령 안내 카드 HTML 생성 (모달 결과 박스 + AI 분석 결과 패널 공용)
    // =========================================================================
    // ⚠️ info.law/report/tips/fineText 등 실제 법령·과태료·팁 "본문"은 KB와 같은 문단
    // 단위 콘텐츠라 이번 작업 범위 밖(한국어 고정)이고, 아래는 그 주변 짧은 라벨만 번역한다.
    function buildLegalHtml(category, opts) {
        const info = LEGAL_INFO[category];
        if (!info) return "";
        const compact = opts && opts.compact;
        const t = window.olaI18n ? olaI18n.t : (k) => k;

        let fineHtml = "";
        if (info.fineRows) {
            fineHtml =
                `<table class="w-full text-xs border-collapse">` +
                `<thead><tr class="text-gray-400">` +
                `<th class="text-left font-medium py-1">${t("complaint.img.zoneCol")}</th>` +
                `<th class="text-right font-medium py-1 w-16">${t("complaint.img.carCol")}</th>` +
                `<th class="text-right font-medium py-1 w-16">${t("complaint.img.vanCol")}</th>` +
                `</tr></thead><tbody>` +
                info.fineRows
                    .map(
                        (r) =>
                            `<tr class="border-t border-border">` +
                            `<td class="py-1 pr-2 text-gray-600">${r[0]}</td>` +
                            `<td class="py-1 text-right font-bold text-dark">${r[1]}</td>` +
                            `<td class="py-1 text-right font-bold text-dark">${r[2]}</td>` +
                            `</tr>`
                    )
                    .join("") +
                `</tbody></table>`;
        } else if (info.fineText) {
            fineHtml = `<p class="text-xs text-gray-600 leading-relaxed">${info.fineText}</p>`;
        }

        const tipsHtml =
            !compact && info.tips && info.tips.length
                ? `<div class="mt-3"><p class="text-xs font-bold text-gray-500 mb-1">${t("complaint.img.tipsLabel")}</p>` +
                  info.tips.map((tip) => `<p class="text-xs text-gray-600 leading-relaxed mb-1">· ${tip}</p>`).join("") +
                  `</div>`
                : "";

        return (
            `<div class="space-y-3">` +
            `<div><p class="text-xs font-bold text-gray-500 mb-1">${t("complaint.img.fineLabel")}</p>${fineHtml}</div>` +
            `<div><p class="text-xs font-bold text-gray-500 mb-1">${t("complaint.img.reportMethodLabel")}</p>` +
            `<p class="text-xs text-gray-600 leading-relaxed">${info.report}</p></div>` +
            tipsHtml +
            `<p class="text-[11px] text-gray-400 leading-relaxed">${t("complaint.img.lawBasisLabel")}: ${info.law}<br>${t("complaint.img.contactLabel")}: ${fillRegionPlaceholders(info.agency)}</p>` +
            `</div>`
        );
    }

    // 모달 결과 박스 안에 법령 안내 + (불법주정차면) 차량번호 입력칸을 렌더
    function renderLegalSection(category) {
        const resultBox = $("imgClassifyResultBox");
        if (!resultBox) return;

        let box = $("imgClassifyLegalInfo");
        if (!box) {
            box = document.createElement("div");
            box.id = "imgClassifyLegalInfo";
            box.className = "mt-4 pt-4 border-t border-border";
            resultBox.appendChild(box);
        }

        const t = window.olaI18n ? olaI18n.t : (k) => k;
        const plateHtml =
            category === "불법주정차"
                ? `<div class="mb-3">` +
                  `<p class="text-xs font-bold text-gray-500 mb-1">${t("complaint.img.vehicleLabel")}</p>` +
                  `<div class="flex items-center gap-2">` +
                  `<input type="text" id="imgPlateInput" placeholder="${escapeHtml(t("complaint.img.platePlaceholder"))}"` +
                  ` class="flex-1 text-sm px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary">` +
                  `<button type="button" onclick="olaImageUI.cropPlate()"` +
                  ` class="flex-shrink-0 text-xs px-3 py-2 border border-border rounded-lg text-gray-500 hover:border-primary hover:text-primary whitespace-nowrap">` +
                  `${t("complaint.img.plateRecrop")}</button>` +
                  `</div>` +
                  `<p id="imgPlateStatus" class="text-[11px] text-gray-400 mt-1">${t("complaint.img.plateRecognizing")}</p>` +
                  `</div>`
                : "";

        box.innerHTML = plateHtml + buildLegalHtml(category, { compact: true });
    }

    // "이 결과로 민원 작성하기" 후 우측 AI 분석 결과 패널에도 법령 안내를 표시
    function injectLegalIntoAnalysis(category, plate) {
        const inner = $("analysisResultInner");
        if (!inner) return;

        let section = $("resultLegal");
        if (!section) {
            section = document.createElement("div");
            section.id = "resultLegal";
            inner.appendChild(section);
        }

        const t = window.olaI18n ? olaI18n.t : (k) => k;
        const plateLine = plate
            ? `<p class="text-sm bg-white px-3 py-2 border border-border rounded-lg mb-2">${t("complaint.img.recognizedPlate")}: <b>${escapeHtml(plate)}</b></p>`
            : "";

        section.innerHTML =
            `<span class="text-xs text-gray-400">${t("complaint.img.fineReportLabel")}</span>` +
            `<div class="bg-white p-3 border border-border rounded-lg mt-1">` +
            plateLine +
            buildLegalHtml(category, { compact: false }) +
            `</div>`;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // =========================================================================

    // 실제 위치 시스템(js/location.js의 olaLocation)에서 직접 읽어옵니다.
    function getCurrentAgencyName() {
        if (window.olaLocation) {
            const { sido, gu } = olaLocation.getSidoGu();
            if (sido && gu) {
                return window.olaRegionLabel ? olaRegionLabel(sido, gu) : `${sido} ${gu}`;
            }
        }

        const el = document.getElementById("current-location");
        const text = el && el.textContent && el.textContent.trim();
        if (text) return text;

        if (window.OLA_CONFIG && OLA_CONFIG.DEFAULT_REGION) {
            const { sido, gu } = OLA_CONFIG.DEFAULT_REGION;
            const combined = [sido, gu].filter(Boolean).join(" ");
            if (combined) return combined;
        }
        return window.olaI18n ? olaI18n.t("complaint.img.defaultAgency") : "관할 지자체";
    }

    // 이 페이지엔 원래 위치 표시 갱신 로직이 없었어서(다른 페이지엔 각자
    // home.js/emergency.js 등에 있음), 여기서 최소한으로 맞춰줍니다.
    function refreshLocationDisplay() {
        if (!window.olaLocation) return;
        const { sido, gu } = olaLocation.getSidoGu();
        const locEl = document.getElementById("current-location");
        const radiusEl = document.getElementById("current-location-radius");
        if (locEl) locEl.textContent = window.olaRegionLabel ? olaRegionLabel(sido, gu) : `${sido} ${gu}`;
        if (radiusEl) {
            const km = window.olaSettings
                ? olaSettings.getRadiusKm()
                : (window.OLA_CONFIG && OLA_CONFIG.DEFAULT_RADIUS_KM) || 1;
            const t = window.olaI18n ? olaI18n.t : (k, vars) => `반경 ${vars.km}km 범위 밀착 감시`;
            radiusEl.textContent = t("nav.radiusHint", { km: Number(km).toFixed(1) });
        }
    }

    document.addEventListener("DOMContentLoaded", refreshLocationDisplay);
    window.onOlaLocationChange = refreshLocationDisplay;

    // 언어를 바꾸면, 이미 화면에 떠 있는 모델 선택 바 / 분류 결과(라벨·확신도·막대그래프·
    // 과태료 안내 카드)를 새 언어로 다시 그린다. (KB성 법령 본문 자체는 번역 대상이 아니지만
    // 그 주변 라벨은 다시 그려줘야 한다)
    document.addEventListener("DOMContentLoaded", () => {
        if (!window.olaI18n) return;
        olaI18n.onLocaleChange(() => {
            if ($("imgModelSelector")) renderModelSelector();
            if (lastRanked && lastModelKey && $("imgClassifyResultBox") && !$("imgClassifyResultBox").classList.contains("hidden")) {
                const top = lastRanked[0];
                const t = olaI18n.t;
                $("imgClassifyTopLabel").textContent = classLabel(top.name);
                $("imgClassifyTopConfidence").textContent = t("complaint.img.confidence", {
                    pct: Math.round(top.prob * 100),
                    model: modelLabel(lastModelKey),
                });
                renderProbBars(lastRanked);
                // renderLegalSection이 차량번호 입력칸을 새로 그리므로, 사용자가 이미
                // 입력/수정해둔 값이 있으면 다시 그린 뒤 복원한다.
                const plateBefore = $("imgPlateInput") ? $("imgPlateInput").value : "";
                renderLegalSection(top.name);
                const plateAfter = $("imgPlateInput");
                if (plateAfter && plateBefore) plateAfter.value = plateBefore;
            }
        });
    });

    // 카테고리별 민원 초안 템플릿 (예시 문구입니다. 필요에 맞게 수정하세요)
    const DRAFT_TEMPLATE = {
        보행방해물:
            "인도에 보행을 방해하는 물건이 놓여 있어 통행에 불편을 겪고 있습니다. 확인 후 조치 부탁드립니다.",
        불법주정차:
            "인도 또는 도로에 불법으로 주정차된 차량이 있어 보행 및 통행에 지장을 주고 있습니다. 단속 및 조치를 요청합니다.",
        현수막:
            "허가되지 않은 것으로 보이는 현수막이 게시되어 있습니다. 확인 후 철거 등 조치를 요청합니다.",
    };

    // ONNX 세션은 모델별로 최초 1회만 로드하고 이후에는 재사용
    const sessions = {};        // modelKey → InferenceSession
    const sessionLoadings = {}; // modelKey → Promise

    // 언어 전환 시 이미 화면에 표시된 분류 결과(라벨/확신도/막대그래프)를 다시 그리기 위해
    // 마지막 결과를 기억해둔다.
    let lastRanked = null;
    let lastModelKey = null;

    function $(id) {
        return document.getElementById(id);
    }

    function ensureSession(modelKey) {
        const key = modelKey || activeModelKey;
        if (sessions[key]) return Promise.resolve(sessions[key]);
        if (!sessionLoadings[key]) {
            if (window.ort && ort.env && ort.env.wasm) {
                ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/";
                ort.env.wasm.numThreads = 1;
            }
            sessionLoadings[key] = ort.InferenceSession.create(MODELS[key].url)
                .then((s) => {
                    sessions[key] = s;
                    return s;
                })
                .catch((err) => {
                    sessionLoadings[key] = null; // 실패 시 다음에 다시 시도 가능하게
                    throw err;
                });
        }
        return sessionLoadings[key];
    }

    // 이미지를 (모델별) imgSize x imgSize 로 리사이즈 + 학습 때와 동일한 정규화 적용
    function imageToTensor(imgEl, imgSize) {
        const canvas = document.createElement("canvas");
        canvas.width = imgSize;
        canvas.height = imgSize;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgEl, 0, 0, imgSize, imgSize);
        const { data } = ctx.getImageData(0, 0, imgSize, imgSize); // RGBA, 0~255

        const plane = imgSize * imgSize;
        const chw = new Float32Array(3 * plane);
        for (let i = 0; i < plane; i++) {
            const r = data[i * 4] / 255;
            const g = data[i * 4 + 1] / 255;
            const b = data[i * 4 + 2] / 255;
            chw[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
            chw[plane + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
            chw[plane * 2 + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
        }
        return new ort.Tensor("float32", chw, [1, 3, imgSize, imgSize]);
    }

    function softmax(arr) {
        const max = Math.max(...arr);
        const exps = arr.map((v) => Math.exp(v - max));
        const sum = exps.reduce((a, b) => a + b, 0);
        return exps.map((v) => v / sum);
    }

    // 모델의 최종 Linear층 출력은 softmax 이전의 raw logit이므로 여기서 직접 softmax 적용
    async function classify(imgEl) {
        const modelKey = activeModelKey; // 추론 도중 전환돼도 이번 결과는 시작 시점 모델 기준
        const sess = await ensureSession(modelKey);
        const tensor = imageToTensor(imgEl, MODELS[modelKey].imgSize);
        const feeds = {};
        feeds[sess.inputNames[0]] = tensor;
        const results = await sess.run(feeds);
        const output = results[sess.outputNames[0]];
        const probs = softmax(Array.from(output.data));
        return CLASS_NAMES.map((name, i) => ({ name, prob: probs[i] })).sort(
            (a, b) => b.prob - a.prob
        );
    }

    function renderProbBars(ranked) {
        const wrap = $("imgClassifyProbs");
        if (!wrap) return;
        wrap.innerHTML = ranked
            .map((r) => {
                const pct = Math.round(r.prob * 100);
                return `
                <div class="flex items-center gap-2 text-xs">
                    <span class="w-20 flex-shrink-0 text-gray-500">${classLabel(r.name)}</span>
                    <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full bg-primary rounded-full" style="width:${pct}%"></div>
                    </div>
                    <span class="w-10 text-right text-gray-400">${pct}%</span>
                </div>`;
            })
            .join("");
    }

    // =========================================================================
    // ★ 모델 전환 UI — 모달 안 업로드 영역 위에 동적으로 삽입
    //    (complaint.html은 수정할 필요 없음)
    // =========================================================================
    function renderModelSelector() {
        const modelKeys = Object.keys(MODELS);
        if (modelKeys.length < 2) return; // 모델이 하나뿐이면 전환 UI 자체를 안 만듦

        const fileLabel = document.querySelector('label[for="imgClassifyFileInput"]');
        if (!fileLabel) return;

        let bar = $("imgModelSelector");
        if (!bar) {
            bar = document.createElement("div");
            bar.id = "imgModelSelector";
            bar.className = "flex gap-2 mb-4";
            fileLabel.parentNode.insertBefore(bar, fileLabel);
        }

        bar.innerHTML = modelKeys
            .map((key) => {
                const active = key === activeModelKey;
                return (
                    `<button type="button" data-model-key="${key}" ` +
                    `class="flex-1 px-3 py-2 rounded-xl border text-left transition-colors ${
                        active
                            ? "border-primary bg-blue-50 text-primary"
                            : "border-border bg-white text-gray-500 hover:border-primary"
                    }">` +
                    `<span class="block text-xs font-bold">${modelLabel(key)}</span>` +
                    `<span class="block text-[11px] ${active ? "text-primary" : "text-gray-400"}">${modelDesc(key)}</span>` +
                    `</button>`
                );
            })
            .join("");

        bar.querySelectorAll("button[data-model-key]").forEach((btn) => {
            btn.addEventListener("click", () => switchModel(btn.dataset.modelKey));
        });
    }

    function switchModel(key) {
        if (!MODELS[key] || key === activeModelKey) return;
        activeModelKey = key;
        renderModelSelector();
        // 새 모델 미리 로드 시작 (첫 사용 시 다운로드 시간 단축)
        ensureSession(key).catch((err) => {
            console.error("[complaint-image] 모델 로드 실패:", err);
        });
        // 이미 분석한 사진이 있으면 같은 사진을 새 모델로 즉시 재분석
        // → "같은 사진, 두 모델 비교" 데모가 버튼 클릭 한 번으로 됨
        const preview = $("imgClassifyPreview");
        const previewWrap = $("imgClassifyPreviewWrap");
        if (preview && preview.src && previewWrap && !previewWrap.classList.contains("hidden")) {
            classifyAndRender(preview);
        }
    }

    // =========================================================================

    // 불법주정차로 분류됐을 때 백그라운드로 번호판 OCR 실행 → 입력칸에 채움
    async function runPlateOcr(imgEl) {
        const t = window.olaI18n ? olaI18n.t : (k, vars) => k;
        const statusEl = () => $("imgPlateStatus");
        const inputEl = () => $("imgPlateInput");
        try {
            const plate = await recognizePlate(imgEl);
            const input = inputEl();
            const status = statusEl();
            if (!input) return; // 사용자가 이미 모달을 닫았거나 다른 사진으로 교체함
            if (plate) {
                if (!input.value.trim()) input.value = plate; // 사용자가 이미 입력했으면 덮어쓰지 않음
                if (status) status.textContent = t("complaint.img.plateResult", { plate });
            } else if (status) {
                status.textContent = t("complaint.img.plateNotFound");
            }
        } catch (err) {
            console.warn("[complaint-image] 번호판 OCR 실패:", err);
            const status = statusEl();
            if (status) status.textContent = t("complaint.img.plateLoadFailed");
        }
    }

    // 현재 미리보기 이미지를 activeModelKey 모델로 분석해서 결과 UI를 갱신
    // (파일 업로드 직후 + 모델 전환 시 재분석, 두 곳에서 공용)
    async function classifyAndRender(imgEl) {
        const status = $("imgClassifyStatus");
        const resultBox = $("imgClassifyResultBox");
        const applyBtn = $("imgClassifyApplyBtn");
        const modelKey = activeModelKey;

        // 기존 차량번호 입력값은 모델 전환 후에도 유지되도록 백업
        const prevPlateInput = $("imgPlateInput");
        const prevPlate = prevPlateInput ? prevPlateInput.value.trim() : "";

        const t = window.olaI18n ? olaI18n.t : (k, vars) => k;
        status.textContent = sessions[modelKey]
            ? t("complaint.img.analyzing")
            : t("complaint.img.loadingModel", { model: modelLabel(modelKey) });
        status.classList.remove("hidden", "text-red-500");

        try {
            const ranked = await classify(imgEl);
            if (modelKey !== activeModelKey) return; // 분석 중 사용자가 또 전환했으면 이 결과는 버림

            // 언어 전환 시 화면에 이미 표시된 결과를 다시 그릴 수 있도록 마지막 결과를 기억해둔다.
            lastRanked = ranked;
            lastModelKey = modelKey;

            const top = ranked[0];
            status.classList.add("hidden");
            resultBox.classList.remove("hidden");
            $("imgClassifyTopLabel").textContent = classLabel(top.name);
            // 어떤 모델의 판단인지 함께 표시 → 모델 전환 비교가 한눈에 보임
            $("imgClassifyTopConfidence").textContent = t("complaint.img.confidence", {
                pct: Math.round(top.prob * 100),
                model: modelLabel(modelKey),
            });
            renderProbBars(ranked);

            // ▼ 카테고리별 과태료·신고방법 안내 카드 표시
            renderLegalSection(top.name);
            // 모델 전환 전에 입력해둔 차량번호가 있으면 복원
            if (top.name === "불법주정차" && prevPlate) {
                const input = $("imgPlateInput");
                if (input) input.value = prevPlate;
            }
            // ▼ 불법주정차면 차량번호 OCR을 백그라운드로 시작 (기다리지 않음)
            if (top.name === "불법주정차" && !prevPlate) runPlateOcr(imgEl);

            applyBtn.classList.remove("hidden");
            applyBtn.dataset.category = top.name;
        } catch (err) {
            console.error("[complaint-image] 분석 실패:", err);
            status.textContent = t("complaint.img.analyzeError", { url: MODELS[modelKey].url });
            status.classList.remove("hidden");
            status.classList.add("text-red-500");
        }
    }

    async function handleFile(file) {
        if (!file || !file.type.startsWith("image/")) return;

        const previewWrap = $("imgClassifyPreviewWrap");
        const preview = $("imgClassifyPreview");
        const status = $("imgClassifyStatus");
        const resultBox = $("imgClassifyResultBox");
        const applyBtn = $("imgClassifyApplyBtn");

        const url = URL.createObjectURL(file);
        previewWrap.classList.remove("hidden");
        resultBox.classList.add("hidden");
        applyBtn.classList.add("hidden");
        // 이전 사진의 법령 안내/차량번호/크롭 오버레이가 남아있으면 제거
        const oldLegal = $("imgClassifyLegalInfo");
        if (oldLegal) oldLegal.remove();
        removeCropOverlay();
        status.textContent = window.olaI18n ? olaI18n.t("complaint.img.analyzing") : "AI가 사진을 분석하고 있어요...";
        status.classList.remove("hidden", "text-red-500");

        preview.onload = () => classifyAndRender(preview);
        preview.src = url;
    }

    function openModal() {
        $("imageUploadModal").classList.remove("hidden");
        requestAnimationFrame(() => {
            $("imageUploadModal").classList.remove("opacity-0");
        });
        // ★ 모델 전환 버튼 렌더 (최초 1회 생성, 이후엔 상태만 갱신)
        renderModelSelector();
        // 모달을 열자마자 기본 모델을 미리 로드해둬서, 이미지를 선택했을 때 대기 시간을 줄임
        ensureSession().catch((err) => {
            console.error("[complaint-image] 모델 로드 실패:", err);
        });
    }

    function closeModal() {
        removeCropOverlay();
        const modal = $("imageUploadModal");
        modal.classList.add("opacity-0");
        setTimeout(() => modal.classList.add("hidden"), 200);
    }

    function applyResult() {
        const category = $("imgClassifyApplyBtn").dataset.category;
        if (!category) return;

        // 차량번호 입력칸 값 (불법주정차가 아닐 땐 입력칸 자체가 없음)
        const plateInput = $("imgPlateInput");
        const plate = plateInput ? plateInput.value.trim() : "";

        const dept = DEPT_MAP[category];
        const agencyText = dept ? `${getCurrentAgencyName()} · ${dept}` : category;
        $("resultAgency").textContent = agencyText;

        // 사진 분석 결과를 "민원 내용"으로 사용 (텍스트 분석과 동일한 형식으로 초안 작성)
        let reportText = DRAFT_TEMPLATE[category] || category;
        if (category === "불법주정차" && plate) {
            reportText += `\n- 차량번호: ${plate}`;
        }

        // ▼ js/issue.js의 buildDraft로 텍스트 분석 결과와 동일한 형식으로 완전한 초안을
        //   작성한다. 이전엔 여기서 짧은 문장 하나만 넣어서 "텍스트 복사"를 눌러도
        //   내용이 거의 없다고 느껴졌던 문제를 해결.
        const rule = {
            category,
            agency: agencyText,
            ...(PHOTO_AGENCY_LINK[category] || {}),
        };
        const draft =
            window.olaIssue && typeof window.olaIssue.buildDraft === "function"
                ? window.olaIssue.buildDraft(reportText, rule)
                : reportText;

        $("resultDraft").textContent = draft;
        $("analysisResultInner").classList.remove("opacity-50");

        // ▼ "바로가기" 링크를 이번 사진 제보 카테고리 기준으로 새로 갱신.
        //   (이전엔 텍스트로 분석하던 다른 카테고리의 링크가 그대로 남아 엉뚱한 곳으로
        //   연결되는 문제 예방 → 세 카테고리 모두 안전신문고로 연결)
        const agencyLinkEl = $("resultAgencyLink");
        if (window.olaIssue && typeof window.olaIssue.updateAgencyLink === "function") {
            window.olaIssue.updateAgencyLink(agencyLinkEl, rule);
        } else if (agencyLinkEl) {
            agencyLinkEl.href = rule.url || "#";
            const span = agencyLinkEl.querySelector("span");
            if (span) span.innerText = rule.urlLabel || "바로가기";
            agencyLinkEl.classList.toggle("hidden", !rule.url);
            agencyLinkEl.classList.toggle("flex", !!rule.url);
        }

        // ▼ AI 분석 결과 패널에 과태료·신고방법 안내도 함께 표시
        injectLegalIntoAnalysis(category, plate);

        // ▼ 민원 입력창을 이번 사진 제보 내용으로 갱신. (이전엔 입력창에 이미 값이
        //   있으면 안 덮어썼는데, 사진 제보를 적용했는데도 화면에 이전 값이 그대로
        //   남아있는 것처럼 보였음 → 사진 제보 적용은 사용자가 명시적으로 누른 동작이므로
        //   항상 최신 결과로 덮어쓴다)
        const input = $("complaintInput");
        if (input) input.value = draft;

        // ▼ 유사 민원 사례도 이번 사진 제보 내용 기준으로 새로 조회 (이전 텍스트
        //   분석 때 조회됐던 사례가 그대로 남아있지 않도록)
        const similarEl = $("resultSimilar");
        if (similarEl && window.olaIssue && typeof window.olaIssue.loadSimilarInto === "function") {
            window.olaIssue.loadSimilarInto(similarEl, reportText, 3);
        }

        closeModal();
    }

    window.olaImageUI = {
        openModal,
        closeModal,
        applyResult,
        switchModel, // 필요하면 다른 곳(콘솔/버튼)에서도 모델 전환 가능
        cropPlate: startCropSelection, // "번호판 잘라서 재인식" 버튼
        onFileSelected(event) {
            const file = event.target.files && event.target.files[0];
            handleFile(file);
        },
        onDrop(event) {
            event.preventDefault();
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            handleFile(file);
        },
    };
})();