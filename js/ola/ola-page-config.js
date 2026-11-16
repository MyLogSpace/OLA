(function () {
  "use strict";

  const PAGE_RULES = Object.freeze({
    "/": { id: "home", enabled: true },
    "/index.html": { id: "home", enabled: true },
    "/pages/safety.html": { id: "safety", enabled: true },
    "/pages/emergency.html": { id: "emergency", enabled: true },
    "/pages/map.html": { id: "map", enabled: true },
    "/pages/complaint.html": { id: "complaint", enabled: false },
    "/pages/consult.html": { id: "consult", enabled: false },
    "/pages/mypage.html": { id: "mypage", enabled: false },
    "/pages/login.html": { id: "login", enabled: false },
    "/landing.html": { id: "landing", enabled: false },
  });

  function normalizePath(pathname) {
    let path = String(pathname || "/").replace(/\\/g, "/");
    const pagesIndex = path.lastIndexOf("/pages/");
    if (pagesIndex >= 0) return path.slice(pagesIndex);
    const filename = path.split("/").pop();
    if (filename === "index.html") return "/index.html";
    if (filename === "landing.html") return "/landing.html";
    if (!filename) return "/";
    return path;
  }

  function getRule(pathname) {
    const normalized = normalizePath(pathname);
    return PAGE_RULES[normalized] || { id: "unknown", enabled: false };
  }

  window.olaPagePolicy = Object.freeze({
    rules: PAGE_RULES,
    getRule: getRule,
    isEnabled: function (pathname) {
      return getRule(pathname).enabled === true;
    },
    getPageId: function (pathname) {
      return getRule(pathname).id;
    },
    getWelcomeMessage: function (pathname) {
      const pageId = getRule(pathname).id;
      return window.olaUiI18n
        ? window.olaUiI18n.t("greetings." + pageId)
        : "";
    },
  });
})();
