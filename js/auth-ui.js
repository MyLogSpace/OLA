/**
 * js/auth-ui.js — 로그인 모달(탭/폼) 동작과 헤더·사이드바의 로그인 상태 표시를
 * 모든 페이지에서 공통으로 처리합니다. (js/auth.js의 데이터 로직을 UI에 연결)
 */
const olaAuthUI = (() => {
  const PANELS = ["login", "signup", "findId", "resetPw"];

  function switchTab(tab) {
    const tabBar = document.getElementById("authTabBar");
    const backBtn = document.getElementById("authBackBtn");
    const loginTab = document.getElementById("authTabLogin");
    const signupTab = document.getElementById("authTabSignup");
    if (!loginTab || !signupTab) return;

    const isTabbed = tab === "login" || tab === "signup";
    if (tabBar) tabBar.classList.toggle("hidden", !isTabbed);
    if (backBtn) {
      backBtn.classList.toggle("hidden", isTabbed);
      backBtn.classList.toggle("flex", !isTabbed);
    }

    if (isTabbed) {
      const isLogin = tab === "login";
      loginTab.className = `flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${isLogin ? "bg-white text-primary shadow-sm" : "text-gray-500"}`;
      signupTab.className = `flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${!isLogin ? "bg-white text-primary shadow-sm" : "text-gray-500"}`;
    }

    PANELS.forEach((p) => {
      const el = document.getElementById(`${p}Panel`);
      if (el) el.classList.toggle("hidden", p !== tab);
    });

    hideMessage();
    hideSuccessMessage();
    const findIdResult = document.getElementById("findIdResult");
    if (findIdResult) findIdResult.innerHTML = "";
  }

  function showMessage(text) {
    hideSuccessMessage();
    const el = document.getElementById("authMessage");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function hideMessage() {
    const el = document.getElementById("authMessage");
    if (el) el.classList.add("hidden");
  }

  function showSuccessMessage(text) {
    hideMessage();
    const el = document.getElementById("authSuccessMessage");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function hideSuccessMessage() {
    const el = document.getElementById("authSuccessMessage");
    if (el) el.classList.add("hidden");
  }

  async function handleLogin() {
    const email = document.getElementById("loginEmail")?.value;
    const password = document.getElementById("loginPassword")?.value;
    const res = await olaAuth.logIn({ email, password });
    if (!res.ok) {
      showMessage(res.reason);
      return;
    }
    afterAuthSuccess();
  }

  async function handleSignup() {
    const name = document.getElementById("signupName")?.value;
    const email = document.getElementById("signupEmail")?.value;
    const password = document.getElementById("signupPassword")?.value;
    const res = await olaAuth.signUp({ name, email, password });
    if (!res.ok) {
      showMessage(res.reason);
      return;
    }
    afterAuthSuccess();
  }

  function handleFindId() {
    const name = document.getElementById("findIdName")?.value;
    const res = olaAuth.findAccountsByName(name);
    const resultEl = document.getElementById("findIdResult");
    if (!res.ok) {
      showMessage(res.reason);
      if (resultEl) resultEl.innerHTML = "";
      return;
    }
    hideMessage();
    if (resultEl) {
      resultEl.innerHTML = res.emails
        .map((e) => `<div class="bg-bg p-3 rounded-lg text-sm font-medium text-center">${e}</div>`)
        .join("");
    }
  }

  async function handleResetPassword() {
    const name = document.getElementById("resetPwName")?.value;
    const email = document.getElementById("resetPwEmail")?.value;
    const newPassword = document.getElementById("resetPwNew")?.value;
    const confirm = document.getElementById("resetPwConfirm")?.value;

    if (newPassword !== confirm) {
      showMessage("새 비밀번호가 서로 일치하지 않아요.");
      return;
    }
    const res = await olaAuth.resetPassword({ name, email, newPassword });
    if (!res.ok) {
      showMessage(res.reason);
      return;
    }
    showSuccessMessage("비밀번호가 변경되었어요. 새 비밀번호로 로그인해주세요.");
    ["resetPwName", "resetPwEmail", "resetPwNew", "resetPwConfirm"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  function afterAuthSuccess() {
    hideMessage();
    if (window.uiJS) uiJS.closeLoginModal();
    renderAuthState();
    ["loginEmail", "loginPassword", "signupName", "signupEmail", "signupPassword"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    if (typeof window.onOlaAuthChange === "function") window.onOlaAuthChange();
  }

  function handleSidebarAuthClick() {
    if (olaAuth.isLoggedIn()) {
      olaAuth.logOut();
      renderAuthState();
      if (typeof window.onOlaAuthChange === "function") window.onOlaAuthChange();
    } else {
      switchTab("login");
      if (window.uiJS) uiJS.openLoginModal();
    }
  }

  function initials(name) {
    if (!name) return "?";
    return name.trim().charAt(0).toUpperCase();
  }

  function renderAuthState() {
    const session = olaAuth.getSession();

    const link = document.getElementById("sidebar-auth-link");
    const icon = document.getElementById("sidebar-auth-icon");
    const text = document.getElementById("sidebar-auth-text");
    if (link && icon && text) {
      if (session) {
        icon.setAttribute("data-lucide", "log-out");
        text.textContent = window.olaI18n ? olaI18n.t("nav.logout") : "로그아웃";
      } else {
        icon.setAttribute("data-lucide", "log-in");
        text.textContent = window.olaI18n ? olaI18n.t("nav.login") : "로그인";
      }
    }

    const avatarInner = document.getElementById("header-avatar-inner");
    if (avatarInner) {
      avatarInner.innerHTML = session
        ? `<span class="text-sm font-bold">${initials(session.name)}</span>`
        : `<i data-lucide="user" class="w-5 h-5"></i>`;
    }

    if (window.lucide) lucide.createIcons();
  }

  function init() {
    switchTab("login");
    renderAuthState();
    if (window.olaI18n) olaI18n.onLocaleChange(renderAuthState);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { switchTab, handleLogin, handleSignup, handleFindId, handleResetPassword, handleSidebarAuthClick, renderAuthState };
})();

window.olaAuthUI = olaAuthUI;
