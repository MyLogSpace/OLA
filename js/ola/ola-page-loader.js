(function () {
  "use strict";

  const marker = "olaPageLoader";
  if (document.documentElement.dataset[marker] === "loading"
    || document.documentElement.dataset[marker] === "ready") return;
  document.documentElement.dataset[marker] = "loading";

  const currentScript = document.currentScript;
  if (!currentScript || !currentScript.src) {
    console.warn("[OLA] 공통 페이지 로더의 기준 경로를 확인할 수 없습니다.");
    return;
  }

  const projectBase = new URL("../../", currentScript.src).href;
  window.OLA_BASE = projectBase;

  const stylePaths = [
    "css/ola-2d-svg.css",
    "css/ola-bot.css",
  ];
  const scriptPaths = [
    "js/ola/ola-i18n.js",
    "js/ola/ola-state-manager.js",
    "js/ola/ola-2d-motion-engine.js",
    "js/ola/ola-renderer-2d.js",
    "js/ola/ola-renderer-3d.js",
    "js/ola/ola-renderer-manager.js",
    "js/ola/ola-controller.js",
  ];

  function ensureStyles() {
    stylePaths.forEach(function (path) {
      if (document.querySelector('link[data-ola-style="' + path + '"]')) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = projectBase + path;
      link.dataset.olaStyle = path;
      document.head.appendChild(link);
    });
  }

  function ensureLayer() {
    const existing = document.getElementById("ola-layer");
    if (existing) return existing;
    const layer = document.createElement("div");
    layer.id = "ola-layer";
    layer.setAttribute("aria-label", "OLA AI 안내 로봇");
    layer.innerHTML = [
      '<div id="ola-stage">',
      '  <div id="ola-message" role="status" aria-live="polite" aria-atomic="true" aria-hidden="true">',
      '    <button id="ola-message-close" type="button" aria-label="OLA 안내 닫기">×</button>',
      '    <strong id="ola-message-title"></strong>',
      '    <p id="ola-message-text"></p>',
      '    <ul id="ola-message-details"></ul>',
      '    <div id="ola-message-actions"></div>',
      "  </div>",
      '  <div id="ola-render-area"></div>',
      '  <div id="ola-zzz" aria-hidden="true">Zzz</div>',
      '  <button id="ola-settings-trigger" type="button" aria-label="올라 설정 열기" aria-controls="ola-settings-panel" aria-expanded="false" hidden><img data-src="' + projectBase + 'assets/ola/ui/ola-settings-gear.png" alt="" width="36" height="36"></button>',
      "</div>",
      '<button id="ola-restore-trigger" type="button" aria-label="올라 다시 표시" hidden>올라 다시 표시</button>',
      '<aside id="ola-settings-panel" role="dialog" aria-label="올라 설정" aria-hidden="true" aria-modal="false" tabindex="-1" hidden inert>',
      '  <header><strong>올라 설정</strong><button id="ola-settings-close" type="button" aria-label="올라 설정 닫기">×</button></header>',
      '  <div class="ola-settings-content">',
      '    <section class="ola-settings-group" aria-labelledby="ola-settings-basic-title"><h3 id="ola-settings-basic-title">기본</h3><label><span>올라 표시</span><input id="ola-setting-visible" type="checkbox"></label><button id="ola-setting-hide-page" type="button">현재 페이지에서 숨기기</button></section>',
      '    <section class="ola-settings-group" aria-labelledby="ola-settings-sleep-title"><h3 id="ola-settings-sleep-title">자동 수면</h3><label><span>수면 시간</span><select id="ola-setting-sleep"><option value="60000">1분</option><option value="300000">5분 (기본값)</option><option value="3600000">1시간</option><option value="0">없음</option></select></label><label><span>수면 예고</span><input id="ola-setting-sleep-warning" type="checkbox"></label></section>',
      '    <section class="ola-settings-group" aria-labelledby="ola-settings-guide-title"><h3 id="ola-settings-guide-title">인사와 안내</h3><label><span>페이지 입장 인사</span><input id="ola-setting-welcome" type="checkbox"></label><label><span>자동 안내 빈도</span><select id="ola-setting-guide-frequency"><option value="minimal">최소</option><option value="normal">보통</option><option value="active">활발</option></select></label></section>',
      '    <section class="ola-settings-group" aria-labelledby="ola-settings-motion-title"><h3 id="ola-settings-motion-title">움직임</h3><label><span>모션 강도</span><select id="ola-setting-motion-intensity"><option value="minimal">최소</option><option value="normal">보통</option><option value="active">활발</option></select></label><label><span>움직임 줄이기</span><select id="ola-setting-reduce-motion"><option value="system">시스템</option><option value="always">항상</option><option value="never">사용 안 함</option></select></label><label><span>자동 비행</span><input id="ola-setting-auto-flight" type="checkbox"></label></section>',
      '    <section class="ola-settings-group" aria-labelledby="ola-settings-emotion-title"><h3 id="ola-settings-emotion-title">감정</h3><label><span>감정 표현</span><select id="ola-setting-emotion-intensity"><option value="minimal">최소</option><option value="normal">보통</option><option value="rich">풍부하게</option></select></label><label><span>공감 반응</span><input id="ola-setting-empathy" type="checkbox"></label><label><span>반복 드래그 반응</span><input id="ola-setting-drag-reaction" type="checkbox"></label></section>',
      '    <section class="ola-settings-group" aria-labelledby="ola-settings-position-title"><h3 id="ola-settings-position-title">위치</h3><label><span>기본 대기 위치</span><select id="ola-setting-dock-position"><option value="right">오른쪽</option><option value="left">왼쪽</option></select></label><label><span>올라 스테이션 사용</span><input id="ola-setting-station" type="checkbox"></label><button id="ola-setting-reset-position" type="button">올라 위치 초기화</button></section>',
      '    <section class="ola-settings-group ola-settings-help" aria-labelledby="ola-settings-help-title"><h3 id="ola-settings-help-title">올라 도움말</h3><ul><li>몸체를 드래그해 올라를 움직일 수 있어요.</li><li>가슴 코어로 Sleep/Wake를 전환해요.</li><li>카드나 박스를 누르면 해당 기능을 설명해요.</li><li>상황에 따라 감정과 안내 모션으로 반응해요.</li></ul><button id="ola-settings-help-guide" type="button">사용법 보기</button><button id="ola-setting-replay-intro" type="button">처음 사용 안내 다시 보기</button></section>',
      "  </div>",
      '  <footer><button id="ola-setting-reset-position-footer" type="button">올라 위치 초기화</button><button id="ola-setting-reset-defaults" type="button">기본 설정으로 복원</button></footer>',
      "</aside>",
    ].join("");
    document.body.appendChild(layer);
    return layer;
  }

  function loadScript(path) {
    const existing = document.querySelector('script[data-ola-script="' + path + '"]');
    if (existing) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = projectBase + path;
      script.dataset.olaScript = path;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error(path + " 로드 실패"));
      };
      document.body.appendChild(script);
    });
  }

  function start() {
    loadScript("js/ola/ola-page-config.js").then(function () {
      if (!window.olaPagePolicy || !window.olaPagePolicy.isEnabled(window.location.pathname)) {
        document.documentElement.dataset[marker] = "disabled";
        return null;
      }
      ensureStyles();
      ensureLayer();
      return scriptPaths.reduce(function (promise, path) {
        return promise.then(function () {
          return loadScript(path);
        });
      }, Promise.resolve()).then(function () {
        document.documentElement.dataset[marker] = "ready";
        if (window.olaBot && typeof window.olaBot.init === "function") window.olaBot.init();
      });
    }).catch(function (error) {
      document.documentElement.dataset[marker] = "error";
      console.warn("[OLA] 공통 페이지 초기화에 실패했지만 기존 페이지는 계속 실행됩니다.", error.message || error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
