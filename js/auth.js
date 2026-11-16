/**
 * ============================================================================
 *  js/auth.js — 클라이언트 사이드 데모 로그인 모듈
 * ============================================================================
 *  ⚠️ 중요: 이 로그인은 실제 서버/데이터베이스가 없는 정적 웹사이트에서
 *  동작하도록 브라우저 localStorage에 계정 정보를 저장하는 "데모용" 구현입니다.
 *
 *  실제 서비스에 쓰기에는 안전하지 않습니다:
 *  - 비밀번호를 SHA-256으로 해시해서 저장하긴 하지만, salt가 없고 서버 검증이
 *    없어서 브라우저 개발자도구로 누구나 localStorage 값을 보거나 조작할 수 있습니다.
 *  - 계정 정보가 기기/브라우저별로 각각 저장되어 다른 기기에서는 로그인이 안 됩니다.
 *  - 진짜 서비스로 배포하려면 Flask 등 백엔드 서버 + 데이터베이스 + 세션(또는 JWT)
 *    기반 인증으로 반드시 교체해야 합니다.
 *
 *  그래도 화면 흐름(회원가입 → 로그인 → 세션 유지 → 로그아웃, 여러 페이지에서
 *  로그인 상태 공유)은 실제 서비스와 동일하게 동작합니다.
 * ============================================================================
 */

const olaAuth = (() => {
  const USERS_KEY = "ola_users";
  const SESSION_KEY = "ola_session";

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
      return null;
    }
  }

  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, email: user.email }));
  }

  function isLoggedIn() {
    return !!getSession();
  }

  function logOut() {
    localStorage.removeItem(SESSION_KEY);
  }

  /**
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  async function signUp({ name, email, password }) {
    name = (name || "").trim();
    email = (email || "").trim().toLowerCase();
    if (!name) return { ok: false, reason: "이름을 입력해주세요." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "이메일 형식이 올바르지 않아요." };
    if (!password || password.length < 6) return { ok: false, reason: "비밀번호는 6자 이상이어야 해요." };

    const users = getUsers();
    if (users.some((u) => u.email === email)) {
      return { ok: false, reason: "이미 가입된 이메일이에요. 로그인해주세요." };
    }
    const passwordHash = await sha256(password);
    users.push({ name, email, passwordHash });
    saveUsers(users);
    setSession({ name, email });
    return { ok: true };
  }

  /**
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  async function logIn({ email, password }) {
    email = (email || "").trim().toLowerCase();
    if (!email || !password) return { ok: false, reason: "이메일과 비밀번호를 입력해주세요." };

    const users = getUsers();
    const user = users.find((u) => u.email === email);
    if (!user) return { ok: false, reason: "가입되지 않은 이메일이에요." };

    const passwordHash = await sha256(password);
    if (passwordHash !== user.passwordHash) return { ok: false, reason: "비밀번호가 일치하지 않아요." };

    setSession(user);
    return { ok: true };
  }

  function maskEmail(email) {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
  }

  /**
   * 아이디(이메일) 찾기 — 이름으로 검색해 마스킹된 이메일 목록을 반환
   */
  function findAccountsByName(name) {
    name = (name || "").trim();
    if (!name) return { ok: false, reason: "이름을 입력해주세요." };
    const users = getUsers();
    const matches = users.filter((u) => u.name.trim() === name);
    if (!matches.length) return { ok: false, reason: "일치하는 회원 정보를 찾을 수 없어요." };
    return { ok: true, emails: matches.map((u) => maskEmail(u.email)) };
  }

  /**
   * 비밀번호 재설정 — 이름 + 이메일(아이디)이 모두 일치해야 새 비밀번호로 변경
   */
  async function resetPassword({ name, email, newPassword }) {
    name = (name || "").trim();
    email = (email || "").trim().toLowerCase();
    if (!name || !email) return { ok: false, reason: "이름과 아이디(이메일)를 모두 입력해주세요." };
    if (!newPassword || newPassword.length < 6) return { ok: false, reason: "새 비밀번호는 6자 이상이어야 해요." };

    const users = getUsers();
    const idx = users.findIndex((u) => u.name.trim() === name && u.email === email);
    if (idx === -1) return { ok: false, reason: "이름과 아이디(이메일)가 일치하는 회원을 찾을 수 없어요." };

    users[idx].passwordHash = await sha256(newPassword);
    saveUsers(users);
    return { ok: true };
  }

  return { signUp, logIn, logOut, getSession, isLoggedIn, findAccountsByName, resetPassword };
})();

window.olaAuth = olaAuth;
