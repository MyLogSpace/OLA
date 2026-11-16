/* js/app.js (엔트리 포인트)
   모든 페이지 공통 초기화. 페이지별 로직은 briefing.js / issue.js / insight.js 에서 담당합니다.
*/

document.addEventListener('DOMContentLoaded', () => {
    uiJS.init();

    // 반응형 사이드바 초기화
    if (window.innerWidth < 768) {
        uiJS.isSidebarExpanded = false; // 강제 상태 변경
        uiJS.toggleSidebar();
    }
});

/* [자산(Assets) 경로 안내]
로고: assets/logo/logo-main.png
아이콘: assets/icons/*.svg
현재는 코드 실행 테스트를 위해 lucide 아이콘 라이브러리를 사용합니다.
*/
