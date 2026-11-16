/* js/briefing.js
   "오늘의 AI 브리핑" 관련 로직 — index.html(요약 카드), pages/briefing.html(상세 페이지) 공통 사용
*/

const briefingJS = {
    init: function () {
        this.updateDate();
        if (window.olaI18n) olaI18n.onLocaleChange(() => this.updateDate());
    },

    // 브리핑 기준 시각 표시 (오전 9시 기준 문구)
    updateDate: function () {
        const el = document.getElementById('briefing-time');
        if (!el) return;
        const now = new Date();
        now.setHours(9, 0, 0, 0);
        el.innerText = window.olaI18n ? olaI18n.formatAsOf(now) : el.innerText;
    }
};

document.addEventListener('DOMContentLoaded', () => briefingJS.init());
