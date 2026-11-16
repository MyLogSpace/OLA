/* js/ui.js
   모든 페이지에서 공통으로 쓰는 UI 동작: 사이드바 토글 · 로그인 모달
*/

const uiJS = {
    isSidebarExpanded: true,

    init: function () {
        // 아이콘 렌더링
        if (window.lucide) lucide.createIcons();
    },

    // 사이드바 토글 (화살표 버튼 누르면 숨김 기능)
    toggleSidebar: function () {
        const sidebar = document.getElementById('sidebar');
        const toggleIcon = document.getElementById('toggleIcon');
        const toggleText = document.getElementById('toggleText');
        if (!sidebar) return;

        if (this.isSidebarExpanded) {
            sidebar.classList.remove('sidebar-expanded');
            sidebar.classList.add('sidebar-collapsed');
            // 모바일일때 닫기
            if (window.innerWidth < 768) {
                sidebar.classList.add('hidden');
            }
            if (toggleIcon) toggleIcon.setAttribute('data-lucide', 'panel-left-open');
            if (toggleText) toggleText.textContent = '사이드바 열기';
        } else {
            if (window.innerWidth < 768) {
                sidebar.classList.remove('hidden');
            }
            sidebar.classList.remove('sidebar-collapsed');
            sidebar.classList.add('sidebar-expanded');
            if (toggleIcon) toggleIcon.setAttribute('data-lucide', 'panel-left-close');
            if (toggleText) toggleText.textContent = '사이드바 닫기';
        }
        if (window.lucide) lucide.createIcons();
        this.isSidebarExpanded = !this.isSidebarExpanded;
    },

    // 사이드바가 접혀 있을 때는 로고 클릭 = 사이드바 열기 (펼쳐져 있으면 평소처럼 로고 링크(랜딩 페이지)로 이동)
    handleLogoClick: function (e) {
        if (!this.isSidebarExpanded) {
            e.preventDefault();
            this.toggleSidebar();
            return false;
        }
        return true;
    },

    // 로그인 모달 열기/닫기 (모달은 모든 페이지에 공통 포함되어 있음)
    openLoginModal: function () {
        const modal = document.getElementById('loginModal');
        const content = document.getElementById('loginModalContent');
        if (!modal) return;
        modal.classList.remove('hidden');
        // 타이밍 이슈로 requestAnimationFrame 사용
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        });
    },

    closeLoginModal: function () {
        const modal = document.getElementById('loginModal');
        const content = document.getElementById('loginModalContent');
        if (!modal) return;
        modal.classList.add('opacity-0');
        content.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300); // css duration 과 일치
    }
};

window.uiJS = uiJS;

/* ----------------------------------------------------------------------
   상단 헤더 공통 기능 — 모든 페이지의 헤더(검색창/주간·야간 토글/알림벨/토스트)가
   동일해지면서 index.html 전용이던 js/home.js에서 여기로 옮겨왔습니다.
   ---------------------------------------------------------------------- */

// 헤더 검색창 - 입력 중이거나 값이 있으면 순환 예시 문구 숨김
window.olaSearchPlaceholderToggle = function () {
  const input = document.getElementById("home-search-input");
  const rotator = document.getElementById("home-search-rotator");
  if (!input || !rotator) return;
  const shouldHide = document.activeElement === input || input.value.length > 0;
  rotator.classList.toggle("hidden", shouldHide);
};

// 헤더 검색창 - 입력한 질문을 AI 상담 페이지로 넘겨서 바로 답변을 받는다
// (index.html은 OLA_BASE가 빈 문자열이라 pages/consult.html, pages/*.html은 '../'라 sibling인 consult.html로 이동)
window.olaHomeSearchSubmit = function () {
  const input = document.getElementById("home-search-input");
  const text = input ? input.value.trim() : "";
  if (!text) return;
  const consultPath = window.OLA_BASE ? "consult.html" : "pages/consult.html";
  window.location.href = `${consultPath}?q=${encodeURIComponent(text)}`;
};

window.olaFillSearch = function (text) {
  const el = document.getElementById("home-search-input");
  if (el) {
    el.value = text;
    el.focus();
  }
  const bubble = document.getElementById("mascot-speech-bubble");
  if (bubble) bubble.textContent = `"${text}" 관련으로 최상의 안심 데이터를 꼼꼼히 탐색하고 있어요!`;
};

// 검색창 옆 마이크 버튼 — Web Speech API로 음성 인식 후 검색창에 채워줌
window.olaVoiceSearch = function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const input = document.getElementById("home-search-input");
  const btn = document.getElementById("home-voice-btn");

  if (!SpeechRecognition) {
    alert("이 브라우저는 음성 인식을 지원하지 않아요. 최신 Chrome/Edge에서 사용해주세요.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const placeholderDefault = input ? input.placeholder : "";

  recognition.onstart = function () {
    if (btn) btn.classList.add("text-red-400", "animate-pulse");
    if (input) input.placeholder = "듣고 있어요…";
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    if (input) {
      input.value = transcript;
      input.focus();
    }
  };

  recognition.onerror = function () {
    if (input) input.placeholder = placeholderDefault;
  };

  recognition.onend = function () {
    if (btn) btn.classList.remove("text-red-400", "animate-pulse");
    if (input) input.placeholder = placeholderDefault;
  };

  recognition.start();
};

// 토스트 알림 (마크업이 없는 페이지에서는 #toast-notif가 없어서 조용히 no-op)
window.olaToast = {
  show: function (title, msg) {
    const toast = document.getElementById("toast-notif");
    if (!toast) return;
    const titleEl = document.getElementById("toast-title");
    const bodyEl = document.getElementById("toast-body");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = msg;
    toast.classList.remove("translate-y-20", "opacity-0", "pointer-events-none");
    clearTimeout(window.__olaToastTimer);
    window.__olaToastTimer = setTimeout(() => olaToast.dismiss(), 4000);
  },
  dismiss: function () {
    const toast = document.getElementById("toast-notif");
    if (!toast) return;
    toast.classList.add("translate-y-20", "opacity-0", "pointer-events-none");
  },
};

// 알림 벨 드롭다운
window.olaNotif = {
  toggle: function () {
    const panel = document.getElementById("notif-panel");
    if (panel) panel.classList.toggle("hidden");
  },
  close: function () {
    const panel = document.getElementById("notif-panel");
    if (panel) panel.classList.add("hidden");
  },
};

document.addEventListener("click", (e) => {
  const panel = document.getElementById("notif-panel");
  const btn = document.getElementById("notif-bell-btn");
  if (!panel || panel.classList.contains("hidden")) return;
  if (!panel.contains(e.target) && !(btn && btn.contains(e.target))) {
    panel.classList.add("hidden");
  }
});

// 주간/야간 모드 토글 (데모: 안전도·기상특보 위젯 값 전환 + 사이드바 다크 테마)
// localStorage에 저장해서 페이지를 이동해도 선택한 모드가 유지되도록 함
const OLA_THEME_STORAGE_KEY = "ola-theme-mode";

window.olaTheme = {
  // 버튼 스타일 + 사이드바 다크 테마만 적용 (토스트/마스코트 문구 없이) — 페이지 로드 시 복원용
  applyMode: function (mode) {
    const dayBtn = document.getElementById("theme-btn-day");
    const nightBtn = document.getElementById("theme-btn-night");
    const activeDayCls = "flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full bg-white text-dark shadow-sm transition-all duration-300 whitespace-nowrap";
    const activeNightCls = "flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full bg-dark text-white shadow-sm transition-all duration-300 whitespace-nowrap";
    const inactiveCls = "flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full text-gray-500 hover:text-dark transition-all duration-300 whitespace-nowrap";
    const sidebar = document.getElementById("sidebar");

    if (mode === "night") {
      if (dayBtn) dayBtn.className = inactiveCls;
      if (nightBtn) nightBtn.className = activeNightCls;
      if (sidebar) sidebar.classList.add("sidebar-dark");
    } else {
      if (dayBtn) dayBtn.className = activeDayCls;
      if (nightBtn) nightBtn.className = inactiveCls;
      if (sidebar) sidebar.classList.remove("sidebar-dark");
    }
  },

  // 사용자가 헤더의 주간/야간 버튼을 직접 눌렀을 때 — 스타일 적용 + 저장 + 토스트/마스코트 안내
  set: function (mode) {
    this.applyMode(mode);
    try {
      localStorage.setItem(OLA_THEME_STORAGE_KEY, mode);
    } catch (e) {
      /* 저장 실패(용량 등)는 무시 — 이번 화면에서만 적용되고 넘어감 */
    }

    const bubble = document.getElementById("mascot-speech-bubble");
    if (mode === "night") {
      if (bubble) bubble.textContent = '"어두운 밤길 보행을 안전하게 가이드하는 야간 집중 모드로 전환되었습니다."';
      olaToast.show("야간 집중 수호 가동", "골목길 가로등 데이터 및 순찰 거점 위주 분석이 진행됩니다.");
    } else {
      if (bubble) bubble.textContent = '"쾌적하고 맑은 날씨입니다! 안심 보행로를 따라 산책하기 무척 좋은 일상입니다."';
      olaToast.show("주간 일상 수호 가동", "미세먼지 상태 및 보행장애물 분석 서비스가 작동 중입니다.");
    }
  },

  // 페이지 로드 시 이전에 저장해둔 모드를 조용히 복원 (토스트 없이)
  init: function () {
    let saved = "day";
    try {
      saved = localStorage.getItem(OLA_THEME_STORAGE_KEY) || "day";
    } catch (e) {
      /* localStorage 접근 실패 시 기본값(주간) 유지 */
    }
    this.applyMode(saved);
  },
};

/* ----------------------------------------------------------------------
   긴급 SOS 팝업 — 헤더의 "긴급 SOS" 버튼에서 호출.
   112/119는 tel: 링크로 실제 전화 연결이 되지만, "보호자에게 알림 보내기"는
   이 프로젝트에 실제 SMS/푸시 발송 서버가 없어서 데모용 토스트로만 시뮬레이션함
   (사용자와 상의해서 정한 방식 — 실제로 문자가 발송되지 않음).
   모든 페이지에서 쓸 수 있도록 모달을 JS로 동적 생성해서 HTML을 8개 파일에 중복하지 않음.
   ---------------------------------------------------------------------- */
window.olaSOS = {
  ensureModal: function () {
    if (document.getElementById("sos-modal")) return;
    const modal = document.createElement("div");
    modal.id = "sos-modal";
    modal.className = "fixed inset-0 bg-dark bg-opacity-50 z-[9999] hidden items-center justify-center";
    modal.innerHTML = `
      <div class="bg-white w-[90%] max-w-sm rounded-2xl shadow-xl overflow-hidden">
        <div class="p-6">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-bold text-red-600 flex items-center gap-2">
              <i data-lucide="siren" class="w-5 h-5"></i> <span data-i18n="header.sos">긴급 SOS</span>
            </h3>
            <button onclick="olaSOS.close()" class="text-gray-400 hover:text-dark">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <p class="text-xs text-gray-500 mb-5" data-i18n="sos.desc">위급 상황이면 아래에서 바로 전화하거나 보호자에게 알릴 수 있어요.</p>
          <div class="space-y-2">
            <a href="tel:112" class="flex items-center gap-3 p-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors">
              <span class="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0"><i data-lucide="shield" class="w-5 h-5"></i></span>
              <span class="min-w-0"><span class="block font-bold text-dark" data-i18n="sos.policeTitle">112 경찰 신고</span><span class="block text-xs text-gray-500" data-i18n="sos.tapToCall">탭하면 바로 전화 연결</span></span>
            </a>
            <a href="tel:119" class="flex items-center gap-3 p-3 rounded-xl bg-red-50 hover:bg-red-100 transition-colors">
              <span class="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center flex-shrink-0"><i data-lucide="flame" class="w-5 h-5"></i></span>
              <span class="min-w-0"><span class="block font-bold text-dark" data-i18n="sos.fireTitle">119 소방·구급 신고</span><span class="block text-xs text-gray-500" data-i18n="sos.tapToCall">탭하면 바로 전화 연결</span></span>
            </a>
            <button type="button" onclick="olaSOS.notifyGuardian()" class="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors text-left">
              <span class="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0"><i data-lucide="bell" class="w-5 h-5"></i></span>
              <span class="min-w-0"><span class="block font-bold text-dark" data-i18n="sos.notifyGuardianTitle">보호자에게 알림 보내기</span><span class="block text-xs text-gray-500" data-i18n="sos.notifyGuardianDesc">데모 시뮬레이션 (실제 발송 안 됨)</span></span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) olaSOS.close();
    });
    // 모달은 한 번만 만들어지므로(위의 early-return), 언어가 바뀔 때도 다시 그려주도록 여기서 등록한다.
    if (window.olaI18n) {
      olaI18n.apply(modal);
      olaI18n.onLocaleChange(() => olaI18n.apply(modal));
    }
  },
  open: function () {
    this.ensureModal();
    const modal = document.getElementById("sos-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    if (window.lucide) lucide.createIcons();
  },
  close: function () {
    const modal = document.getElementById("sos-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  },
  notifyGuardian: function () {
    const t = window.olaI18n ? olaI18n.t : (k) => k;
    olaToast.show(t("sos.toastTitle"), t("sos.toastDesc"));
    this.close();
  },
};

document.addEventListener("DOMContentLoaded", () => olaTheme.init());
