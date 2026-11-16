/**
 * ============================================================================
 *  OLA 오늘의 속보 티커 (news.js)
 * ============================================================================
 *  server/app.py 의 /api/news 프록시(연합뉴스 RSS, 인증키 불필요/무료)에서
 *  헤드라인을 받아와 헤더의 속보 티커에 스크롤 표시합니다.
 * ============================================================================
 */

const olaNews = (() => {
  async function fetchHeadlines(limit = 8) {
    const url = window.OLA_CONFIG?.NEWS_PROXY_URL;
    if (!url) return { ok: false, reason: "no-proxy" };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${url}?limit=${limit}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!json.ok || !json.items?.length) return { ok: false, reason: "empty" };
      return { ok: true, items: json.items };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  async function renderTicker(containerId = "news-ticker-content") {
    const el = document.getElementById(containerId);
    if (!el) return;

    const result = await fetchHeadlines();
    if (!result.ok) {
      el.classList.remove("news-ticker-scroll");
      el.innerHTML = '<span class="text-xs text-gray-400">오늘의 속보를 불러올 수 없습니다.</span>';
      return;
    }

    const headlineHtml = result.items
      .map(
        (it) =>
          `<a href="${it.link}" target="_blank" rel="noopener noreferrer" class="font-medium text-gray-700 hover:text-primary transition-colors">${it.title}</a>`
      )
      .join('<span class="text-gray-300 mx-2">·</span>');

    // 끊김 없이 이어지도록 콘텐츠를 두 번 이어붙인 뒤 -50% 만큼 이동시킵니다.
    el.innerHTML = `${headlineHtml}<span class="text-gray-300 mx-2">·</span>${headlineHtml}<span class="text-gray-300 mx-2">·</span>`;
    el.classList.add("news-ticker-scroll");

    const trackWidth = el.scrollWidth / 2;
    const duration = Math.max(25, Math.round(trackWidth / 45));
    el.style.animationDuration = `${duration}s`;
  }

  return { fetchHeadlines, renderTicker };
})();

window.olaNews = olaNews;

document.addEventListener("DOMContentLoaded", () => {
  olaNews.renderTicker();
});
