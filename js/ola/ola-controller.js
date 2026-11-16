(function () {
  "use strict";

  const LEGACY_STORAGE_KEY = "ola_bot_enabled";
  const STORAGE_KEY = "ola_companion_state";
  const POSITION_STORAGE_KEY = "ola_companion_position";
  const HELP_STORAGE_KEY = "ola_core_help_seen";
  const LAST_EMOTION_STORAGE_KEY = "ola_last_emotion";
  const LAST_CONTEXT_STORAGE_KEY = "ola_last_context";
  const CHAT_ENABLED_STORAGE_KEY = "ola_chat_enabled";
  const MANIFEST_VERSION_STORAGE_KEY = "ola_motion_manifest_version";
  const PENDING_CONTEXT_STORAGE_KEY = "ola_pending_context";
  const SETTINGS_STORAGE_KEY = "ola_companion_settings";
  const PAGE_HIDDEN_STORAGE_KEY = "ola_companion_page_hidden:";
  const CHAT_ENABLED = false;
  const DEFAULT_SETTINGS = Object.freeze({
    sleepDelay: 300000,
    visible: true,
    sleepWarning: true,
    welcome: true,
    idleMessages: true,
    guideFrequency: "normal",
    motionIntensity: "normal",
    reduceMotion: "system",
    autoFlight: true,
    emotionIntensity: "normal",
    empathy: true,
    dragReaction: true,
    dockPosition: "right",
    station: true,
    chatEnabled: false,
  });
  const EMOTION_RULES = Object.freeze({
    HAPPY: { duration: 950, priority: 2, cooldown: 1200, exitState: "IDLE" },
    THINK: { duration: 1200, priority: 2, cooldown: 600, exitState: "IDLE" },
    WORRIED: { duration: 1800, priority: 3, cooldown: 2500, exitState: "IDLE" },
    ALERT: { duration: 2200, priority: 4, cooldown: 3000, exitState: "IDLE" },
    ANGRY: { duration: 1800, priority: 4, cooldown: 15000, exitState: "IDLE" },
    SAD: { duration: 2200, priority: 3, cooldown: 5000, exitState: "IDLE" },
    SLEEPY: { duration: 2600, priority: 2, cooldown: 3000, exitState: "IDLE" },
  });
  const DRAG_THRESHOLD = 5;
  const base = window.OLA_BASE !== undefined ? window.OLA_BASE : "";
  const CONTEXT_MAP_PATH = base + "assets/ola/context/ola-context-map.json";
  const rendererOptions = {
    states: {
      IDLE: base + "assets/ola/2d/states/ola-idle.webp",
    },
    referenceImagePath: base + "assets/ola/2d/reference/OLA_REFERENCE_FRONT_v01.png",
    svgPath: base + "assets/ola/2d/svg/ola-master.svg",
    motionManifestPath: base + "assets/ola/2d/motions/ola-motion-manifest.json",
    motionAssetBase: base + "assets/ola/2d/motions/",
    modelPath: base + "assets/ola/3d/models/ola.glb",
  };

  let stage;
  let layer;
  let message;
  let messageTitle;
  let messageText;
  let messageDetails;
  let messageActions;
  let messageClose;
  let settingsHelpGuide;
  let settingsTrigger;
  let restoreTrigger;
  let settingsPanel;
  let settingsClose;
  let settingSleep;
  let settingVisible;
  let settingHidePage;
  let settingSleepWarning;
  let settingWelcome;
  let settingIdleMessages;
  let settingGuideFrequency;
  let settingMotionIntensity;
  let settingReduceMotion;
  let settingAutoFlight;
  let settingEmotionIntensity;
  let settingEmpathy;
  let settingDragReaction;
  let settingDockPosition;
  let settingStation;
  let settingResetPosition;
  let settingResetPositionFooter;
  let settingReplayIntro;
  let settingResetDefaults;
  let zzz;
  let stateManager;
  let rendererManager;
  let unsubscribeState;
  let unsubscribeLocale;
  let drag;
  let hoverDropZone;
  let activeContext;
  let contextMap = {};
  let contextLoadPromise;
  let contextRequestVersion = 0;
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let autoSleepTimer = 0;
  let sleepWarningTimer = 0;
  let gearHideTimer = 0;
  let bubbleTimer = 0;
  let idleMessageTimer = 0;
  let resizeFrame = 0;
  let pageHidden = false;
  let autoSlept = false;
  let welcomedThisLoad = false;
  let recentDrags = [];
  let lastActivityAt = 0;
  let lastAngryAt = 0;
  const lastEmotionAt = new Map();
  let ignoreStageClickUntil = 0;
  let settingsReturnFocus = null;
  let activeMessageDescriptor = null;
  // 수면 확인 팝업이 지금 떠 있는지 여부 — true인 동안 말풍선(#ola-message) 바깥을 클릭하면
  // (올라 몸체를 포함해) 자동으로 팝업을 닫는다(onContextClick 참고). showMessage()가 호출될
  // 때마다 일단 false로 리셋되고, confirmSleep()에서만 다시 true로 세팅한다.
  let sleepConfirmVisible = false;
  let gearAssetStatus = "unchecked";
  let gearAssetRequestVersion = 0;
  let placementMode = "custom";
  let initialized = false;
  const transitionTimers = new Set();
  let lastContextKey = "";
  let lastContextSignature = "";
  const idleMessageHistory = [];
  const IDLE_MESSAGES = Object.freeze({
    ko: ["궁금한 박스가 있으면 빈 공간을 살짝 눌러 주세요.", "잠깐 쉬어 가도 괜찮아요. 저는 여기서 조용히 기다릴게요.", "외출 전에는 휴대폰 배터리와 필요한 연락처를 확인해 두면 좋아요.", "자주 쓰는 안전 정보는 미리 확인해 두면 마음이 한결 가벼워져요.", "오늘도 무사히 지나가도록 제가 옆에서 살펴볼게요."],
    en: ["Tap an empty area of a card when you want a quick explanation.", "It is okay to take a break. I will wait quietly here.", "Before going out, check your phone battery and essential contacts.", "Checking frequently used safety information in advance can bring peace of mind.", "I will stay nearby and help you review things safely."],
    "zh-CN": ["想快速了解内容时，请轻触卡片的空白区域。", "休息一下也没关系，我会在这里安静等候。", "外出前，建议检查手机电量和必要的联系方式。", "提前确认常用的安全信息，会更安心。", "我会在旁边陪你一起安全地查看信息。"],
    ja: ["気になるカードの空白部分を押すと、簡単に説明します。", "少し休んでも大丈夫です。ここで静かに待っています。", "外出前にスマートフォンの充電と必要な連絡先を確認しておくと安心です。", "よく使う安全情報は事前に確認しておくと安心です。", "今日も安全に確認できるよう、そばで見守ります。"]
  });

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function translate(key, variables, safeFallback) {
    if (window.olaUiI18n && typeof window.olaUiI18n.t === "function") {
      return window.olaUiI18n.t(key, variables, safeFallback);
    }
    return typeof safeFallback === "string" ? safeFallback : "";
  }

  function getCurrentLocale() {
    return window.olaUiI18n && typeof window.olaUiI18n.getLocale === "function"
      ? window.olaUiI18n.getLocale()
      : String(document.documentElement.lang || "ko");
  }

  function getContextVisitKey(contextId) {
    const normalizedId = String(contextId || "").trim();
    return normalizedId ? getCurrentLocale() + ":" + normalizedId : "";
  }

  function isLanguageSwitcherEvent(event) {
    const target = event && event.target;
    if (target && target.closest && target.closest("[data-i18n-switcher]")) return true;
    if (!event || typeof event.composedPath !== "function") return false;
    return event.composedPath().some(function (node) {
      return node
        && node.matches
        && node.matches(
          "[data-i18n-switcher], [data-lang-btn], [data-lang-menu], [data-lang-option]"
        );
    });
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      // 저장 공간을 사용할 수 없어도 현재 세션 동작은 유지합니다.
    }
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      // 저장 공간을 사용할 수 없어도 현재 세션 동작은 유지합니다.
    }
  }

  function safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (_) {
      // 세션 저장이 제한돼도 현재 페이지의 고정 안내는 유지합니다.
    }
  }

  function safeSessionRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {
      // 세션 저장이 제한돼도 현재 페이지의 고정 안내는 유지합니다.
    }
  }

  function clearGearHideTimer() {
    if (gearHideTimer) window.clearTimeout(gearHideTimer);
    gearHideTimer = 0;
  }

  function updateSettingsGearPlacement() {
    if (!stage) return;
    stage.classList.add("is-settings-gear-below");
    stage.classList.remove("is-settings-gear-right");
  }

  function hideSettingsGear() {
    clearGearHideTimer();
    if (!settingsTrigger || (settingsPanel && !settingsPanel.hidden)) return;
    settingsTrigger.hidden = true;
  }

  function scheduleSettingsGearHide(delay) {
    clearGearHideTimer();
    if (!settingsTrigger || (settingsPanel && !settingsPanel.hidden)) return;
    gearHideTimer = window.setTimeout(function () {
      gearHideTimer = 0;
      hideSettingsGear();
    }, Math.max(0, Number(delay) || 0));
  }

  function showSettingsGear(duration) {
    if (!settingsTrigger || !settings.visible || pageHidden || drag) return false;
    clearGearHideTimer();
    updateSettingsGearPlacement();
    settingsTrigger.hidden = false;
    if (Number(duration) > 0 && (!settingsPanel || settingsPanel.hidden)) {
      scheduleSettingsGearHide(duration);
    }
    return true;
  }

  function onStagePointerEnter() {
    showSettingsGear(0);
  }

  function onStagePointerLeave(event) {
    if (event.relatedTarget && settingsTrigger && settingsTrigger.contains(event.relatedTarget)) return;
    scheduleSettingsGearHide(300);
  }

  function onSettingsTriggerPointerEnter() {
    clearGearHideTimer();
  }

  function onSettingsTriggerPointerLeave(event) {
    if (event.relatedTarget && stage && stage.contains(event.relatedTarget)) return;
    scheduleSettingsGearHide(300);
  }

  function onStageFocusIn() {
    showSettingsGear(0);
  }

  function onStageFocusOut(event) {
    if (event.relatedTarget && stage && stage.contains(event.relatedTarget)) return;
    scheduleSettingsGearHide(300);
  }

  function loadSettingsGear() {
    if (!settingsTrigger) return;
    const image = settingsTrigger.querySelector("img[data-src]");
    const source = image && image.dataset.src;
    if (!image || !source) return;
    const requestVersion = ++gearAssetRequestVersion;
    gearAssetStatus = "checking";
    image.onload = function () {
      image.onload = null;
      image.onerror = null;
      if (!initialized || requestVersion !== gearAssetRequestVersion) return;
      gearAssetStatus = "loaded";
      settingsTrigger.dataset.olaGearAsset = "loaded";
    };
    image.onerror = function () {
      image.onload = null;
      image.onerror = null;
      if (!initialized || requestVersion !== gearAssetRequestVersion) return;
        gearAssetStatus = "missing";
        settingsTrigger.dataset.olaGearAsset = "missing";
    };
    image.src = source;
  }

  function loadSettings() {
    let stored = {};
    try {
      stored = JSON.parse(safeStorageGet(SETTINGS_STORAGE_KEY)) || {};
    } catch (_) {
      stored = {};
    }
    const sleepValues = [0, 60000, 300000, 3600000];
    const guideValues = ["minimal", "normal", "active"];
    const intensityValues = ["minimal", "normal", "active"];
    const reduceValues = ["system", "always", "never"];
    const emotionValues = ["minimal", "normal", "rich"];
    const dockValues = ["right", "left"];
    const legacyReduceMotion = stored.motion === "reduced"
      ? "always"
      : stored.motion === "full" ? "never" : "system";
    settings = {
      sleepDelay: sleepValues.includes(Number(stored.sleepDelay))
        ? Number(stored.sleepDelay)
        : DEFAULT_SETTINGS.sleepDelay,
      visible: typeof stored.visible === "boolean" ? stored.visible : DEFAULT_SETTINGS.visible,
      sleepWarning: typeof stored.sleepWarning === "boolean"
        ? stored.sleepWarning
        : DEFAULT_SETTINGS.sleepWarning,
      welcome: typeof stored.welcome === "boolean" ? stored.welcome : DEFAULT_SETTINGS.welcome,
      idleMessages: typeof stored.idleMessages === "boolean"
        ? stored.idleMessages : DEFAULT_SETTINGS.idleMessages,
      guideFrequency: guideValues.includes(stored.guideFrequency)
        ? stored.guideFrequency
        : DEFAULT_SETTINGS.guideFrequency,
      motionIntensity: intensityValues.includes(stored.motionIntensity)
        ? stored.motionIntensity
        : DEFAULT_SETTINGS.motionIntensity,
      reduceMotion: reduceValues.includes(stored.reduceMotion)
        ? stored.reduceMotion
        : legacyReduceMotion,
      autoFlight: typeof stored.autoFlight === "boolean"
        ? stored.autoFlight
        : DEFAULT_SETTINGS.autoFlight,
      emotionIntensity: emotionValues.includes(stored.emotionIntensity)
        ? stored.emotionIntensity
        : DEFAULT_SETTINGS.emotionIntensity,
      empathy: typeof stored.empathy === "boolean" ? stored.empathy : DEFAULT_SETTINGS.empathy,
      dragReaction: typeof stored.dragReaction === "boolean"
        ? stored.dragReaction
        : DEFAULT_SETTINGS.dragReaction,
      dockPosition: dockValues.includes(stored.dockPosition)
        ? stored.dockPosition
        : DEFAULT_SETTINGS.dockPosition,
      station: typeof stored.station === "boolean" ? stored.station : DEFAULT_SETTINGS.station,
      chatEnabled: false,
    };
    pageHidden = safeSessionGet(PAGE_HIDDEN_STORAGE_KEY + window.location.pathname) === "true";
    return settings;
  }

  function saveSettings() {
    settings.chatEnabled = false;
    safeStorageSet(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    safeStorageSet(CHAT_ENABLED_STORAGE_KEY, "false");
  }

  function applySettings() {
    if (!layer) return;
    const companionVisible = settings.visible && !pageHidden;
    layer.classList.toggle("is-user-hidden", !companionVisible);
    const systemReduced = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    layer.classList.toggle(
      "is-motion-reduced",
      settings.reduceMotion === "always"
        || (settings.reduceMotion === "system" && systemReduced)
    );
    layer.classList.toggle("is-motion-minimal", settings.motionIntensity === "minimal");
    layer.classList.toggle("is-motion-active", settings.motionIntensity === "active");
    layer.dataset.olaEmotionIntensity = settings.emotionIntensity;
    if (settingSleep) settingSleep.value = String(settings.sleepDelay);
    if (settingVisible) settingVisible.checked = settings.visible;
    if (settingSleepWarning) settingSleepWarning.checked = settings.sleepWarning;
    if (settingWelcome) settingWelcome.checked = settings.welcome;
    if (settingIdleMessages) settingIdleMessages.checked = settings.idleMessages;
    if (settingGuideFrequency) settingGuideFrequency.value = settings.guideFrequency;
    if (settingMotionIntensity) settingMotionIntensity.value = settings.motionIntensity;
    if (settingReduceMotion) settingReduceMotion.value = settings.reduceMotion;
    if (settingAutoFlight) settingAutoFlight.checked = settings.autoFlight;
    if (settingEmotionIntensity) settingEmotionIntensity.value = settings.emotionIntensity;
    if (settingEmpathy) settingEmpathy.checked = settings.empathy;
    if (settingDragReaction) settingDragReaction.checked = settings.dragReaction;
    if (settingDockPosition) settingDockPosition.value = settings.dockPosition;
    if (settingStation) settingStation.checked = settings.station;
    if (restoreTrigger) restoreTrigger.hidden = companionVisible;
    if (!companionVisible) {
      hideSettingsGear();
      hideMessageOnly();
      closeSettings(false);
    }
  }

  function clearAutoSleepTimer() {
    if (autoSleepTimer) window.clearTimeout(autoSleepTimer);
    autoSleepTimer = 0;
    if (sleepWarningTimer) window.clearTimeout(sleepWarningTimer);
    sleepWarningTimer = 0;
  }

  function clearBubbleTimer() {
    if (bubbleTimer) window.clearTimeout(bubbleTimer);
    bubbleTimer = 0;
  }

  function clearIdleMessageTimer() {
    if (idleMessageTimer) window.clearTimeout(idleMessageTimer);
    idleMessageTimer = 0;
  }

  function canShowIdleMessage() {
    return initialized && settings.idleMessages && settings.visible && !pageHidden
      && stateManager && stateManager.getState() === "IDLE" && !activeContext && !drag
      && (!settingsPanel || settingsPanel.hidden)
      && (!message || !message.classList.contains("is-visible"));
  }

  function scheduleIdleMessage(delay) {
    clearIdleMessageTimer();
    if (!settings.idleMessages || !initialized) return;
    idleMessageTimer = window.setTimeout(function () {
      idleMessageTimer = 0;
      if (!canShowIdleMessage()) return scheduleIdleMessage(90000);
      const locale = window.olaUiI18n ? window.olaUiI18n.getLocale() : "ko";
      const messages = IDLE_MESSAGES[locale] || IDLE_MESSAGES.ko;
      const available = messages.filter(function (item) {
        return !idleMessageHistory.includes(item);
      });
      const pool = available.length ? available : messages;
      const text = pool[Math.floor(Math.random() * pool.length)];
      idleMessageHistory.push(text);
      if (idleMessageHistory.length > 5) idleMessageHistory.shift();
      showMessage(text, { duration: 14000, idle: true });
      scheduleIdleMessage(90000 + Math.floor(Math.random() * 150001));
    }, Math.max(1000, Number(delay) || 30000));
  }

  function scheduleAutoSleep() {
    clearAutoSleepTimer();
    if (
      !initialized
      || !settings.visible
      || pageHidden
      || settings.sleepDelay <= 0
      || !stateManager
      || isSleepingState(stateManager.getState())
    ) return;
    if (settings.sleepWarning && settings.sleepDelay > 10000) {
      sleepWarningTimer = window.setTimeout(function () {
        sleepWarningTimer = 0;
        if (
          !initialized || !settings.visible || pageHidden || !stateManager
          || isSleepingState(stateManager.getState())
        ) return;
        stateManager.setState("SLEEPY", { reason: "auto-sleep-warning" });
        showLocalizedMessage("messages.sleepWarning", {
          titleKey: "messages.sleepWarningTitle",
        });
      }, settings.sleepDelay - 10000);
    }
    autoSleepTimer = window.setTimeout(function () {
      autoSleepTimer = 0;
      if (!initialized || !settings.visible || pageHidden || !stateManager) return;
      autoSlept = true;
      sleep("auto-timeout");
    }, settings.sleepDelay);
  }

  function onUserActivity(event) {
    if (!initialized || !stateManager) return;
    if (isLanguageSwitcherEvent(event)) return;
    const now = performance.now();
    if (event && event.type === "pointermove" && now - lastActivityAt < 1000) return;
    lastActivityAt = now;
    clearIdleMessageTimer();
    if (message && message.dataset.olaMessageType === "idle") hideMessageOnly();
    if (autoSlept && isSleepingState(stateManager.getState())) {
      autoSlept = false;
      wake("activity");
      return;
    }
    if (stateManager.getState() === "SLEEPY") {
      stateManager.setState("IDLE", { reason: "activity-after-sleep-warning" });
      if (!activeContext) hideMessageOnly();
    }
    if (!isSleepingState(stateManager.getState())) {
      scheduleAutoSleep();
      scheduleIdleMessage(30000);
    }
  }

  function openSettings() {
    if (!settingsPanel || !settingsTrigger) return;
    clearGearHideTimer();
    settingsReturnFocus = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : settingsTrigger;
    showSettingsGear(0);
    settingsPanel.hidden = false;
    settingsPanel.inert = false;
    settingsPanel.removeAttribute("inert");
    settingsPanel.setAttribute("aria-hidden", "false");
    settingsTrigger.setAttribute("aria-expanded", "true");
    settingsPanel.focus({ preventScroll: true });
  }

  function closeSettings(restoreFocus) {
    if (!settingsPanel || !settingsTrigger) return;
    const wasOpen = !settingsPanel.hidden;
    settingsPanel.setAttribute("aria-hidden", "true");
    settingsPanel.inert = true;
    settingsPanel.setAttribute("inert", "");
    settingsPanel.hidden = true;
    settingsTrigger.setAttribute("aria-expanded", "false");
    if (wasOpen && restoreFocus !== false && settings.visible && !pageHidden) {
      const focusTarget = settingsReturnFocus && document.documentElement.contains(settingsReturnFocus)
        ? settingsReturnFocus
        : settingsTrigger;
      focusTarget.focus({ preventScroll: true });
    }
    settingsReturnFocus = null;
    if (wasOpen && restoreFocus === false) scheduleSettingsGearHide(300);
  }

  function toggleSettings() {
    if (!settingsPanel) return;
    if (settingsPanel.hidden) openSettings();
    else closeSettings();
  }

  function onSettingsChange() {
    settings.sleepDelay = Number(settingSleep.value);
    settings.visible = Boolean(settingVisible.checked);
    settings.sleepWarning = Boolean(settingSleepWarning.checked);
    settings.welcome = Boolean(settingWelcome.checked);
    settings.idleMessages = Boolean(settingIdleMessages.checked);
    settings.guideFrequency = settingGuideFrequency.value;
    settings.motionIntensity = settingMotionIntensity.value;
    settings.reduceMotion = settingReduceMotion.value;
    settings.autoFlight = Boolean(settingAutoFlight.checked);
    settings.emotionIntensity = settingEmotionIntensity.value;
    settings.empathy = Boolean(settingEmpathy.checked);
    settings.dragReaction = Boolean(settingDragReaction.checked);
    settings.dockPosition = settingDockPosition.value;
    settings.station = Boolean(settingStation.checked);
    settings.chatEnabled = false;
    if (settings.visible) pageHidden = false;
    saveSettings();
    applySettings();
    scheduleAutoSleep();
    if (settings.idleMessages) scheduleIdleMessage(30000);
    else {
      clearIdleMessageTimer();
      if (message && message.dataset.olaMessageType === "idle") hideMessageOnly();
    }
  }

  function hideOnCurrentPage() {
    pageHidden = true;
    safeSessionSet(PAGE_HIDDEN_STORAGE_KEY + window.location.pathname, "true");
    clearAutoSleepTimer();
    applySettings();
  }

  function restoreCompanion() {
    pageHidden = false;
    settings.visible = true;
    safeSessionRemove(PAGE_HIDDEN_STORAGE_KEY + window.location.pathname);
    saveSettings();
    applySettings();
    resetPosition();
    scheduleAutoSleep();
  }

  function restoreDefaultSettings() {
    settings = Object.assign({}, DEFAULT_SETTINGS);
    pageHidden = false;
    safeSessionRemove(PAGE_HIDDEN_STORAGE_KEY + window.location.pathname);
    saveSettings();
    applySettings();
    resetPosition();
    scheduleAutoSleep();
  }

  function replayIntroduction() {
    safeStorageRemove(HELP_STORAGE_KEY);
    welcomedThisLoad = false;
    closeSettings(false);
    showHelp();
  }

  function onSettingsPanelClick(event) {
    const button = event.target.closest && event.target.closest("button");
    if (!button) return;
    switch (button.id) {
      case "ola-setting-hide-page":
        hideOnCurrentPage();
        break;
      case "ola-setting-reset-position":
      case "ola-setting-reset-position-footer":
        resetPosition();
        break;
      case "ola-settings-help-guide":
        showHelp();
        break;
      case "ola-setting-replay-intro":
        replayIntroduction();
        break;
      case "ola-setting-reset-defaults":
        restoreDefaultSettings();
        break;
      default:
        break;
    }
  }

  function clearTransitionTimers() {
    transitionTimers.forEach(function (timer) {
      clearTimeout(timer);
    });
    transitionTimers.clear();
  }

  function schedule(callback, delay) {
    const timer = window.setTimeout(function () {
      transitionTimers.delete(timer);
      if (initialized) callback();
    }, delay);
    transitionTimers.add(timer);
    return timer;
  }

  function isSleepingState(state) {
    return state === "SLEEP" || state === "SLEEP_PREPARE";
  }

  function updatePresentation(state) {
    if (!stage) return;
    stage.dataset.olaState = state;
    stage.classList.toggle("is-sleeping", state === "SLEEP");
    stage.classList.toggle("is-sleep-preparing", state === "SLEEP_PREPARE");
    stage.classList.toggle("is-waking", state === "WAKE_UP");
    if (zzz) zzz.setAttribute("aria-hidden", String(state !== "SLEEP"));
  }

  function saveCompanionState(state) {
    const sleeping = isSleepingState(state);
    safeStorageSet(STORAGE_KEY, sleeping ? "sleep" : "awake");
    safeStorageSet(LEGACY_STORAGE_KEY, String(!sleeping));
  }

  function onStateChange(state, previousState, context) {
    if (!rendererManager) return;
    rendererManager.setState(state, rendererOptions);
    updatePresentation(state);
    saveCompanionState(state);
    if (!isSleepingState(state) && state !== "WAKE_UP") {
      safeStorageSet(LAST_EMOTION_STORAGE_KEY, state.toLowerCase());
    }
    if (isSleepingState(state)) setHoverDropZone(null);
    if (!(state === "SLEEPY" && context && context.reason === "auto-sleep-warning")) {
      scheduleAutoSleep();
    }
  }

  function moveTo(x, y) {
    if (!stage) return false;
    const rect = stage.getBoundingClientRect();
    const maxX = Math.max(window.innerWidth - rect.width, 0);
    const maxY = Math.max(window.innerHeight - rect.height, 0);
    stage.style.left = clamp(x, 0, maxX) + "px";
    stage.style.top = clamp(y, 0, maxY) + "px";
    stage.style.right = "auto";
    stage.style.bottom = "auto";
    updateSettingsGearPlacement();
    return true;
  }

  function flyTo(x, y, duration) {
    hideSettingsGear();
    if (
      settings.autoFlight
      && rendererManager
      && rendererManager.moveTo(x, y, duration)
    ) return true;
    return moveTo(x, y);
  }

  function moveToSleepCorner() {
    if (!stage || !rendererManager) return;
    const rect = stage.getBoundingClientRect();
    if (!settings.autoFlight || !rendererManager.dock()) {
      moveTo(window.innerWidth - rect.width - 10, window.innerHeight - rect.height - 10);
    }
  }

  function savePosition(x, y, mode) {
    const nextMode = mode === "default-left" ? "default-left" : "custom";
    placementMode = nextMode;
    safeStorageSet(POSITION_STORAGE_KEY, JSON.stringify({ x: x, y: y, mode: nextMode }));
  }

  function restorePosition() {
    let preferred = null;
    let savedMode = "custom";
    try {
      const saved = JSON.parse(safeStorageGet(POSITION_STORAGE_KEY));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        preferred = { x: saved.x, y: saved.y };
        savedMode = saved.mode === "default-left" ? "default-left" : "custom";
      }
    } catch (_) {
      safeStorageRemove(POSITION_STORAGE_KEY);
    }
    placementMode = savedMode;
    if (rendererManager && typeof rendererManager.resetPlacement === "function") {
      rendererManager.resetPlacement(placementMode);
    }
    const safe = placementMode === "default-left"
      ? computeDefaultLeftPosition()
      : findSafeStagePosition(preferred);
    moveTo(safe.x, safe.y);
    if (preferred && (safe.x !== preferred.x || safe.y !== preferred.y)) {
      savePosition(safe.x, safe.y, placementMode);
    }
  }

  function dockAfterDrag() {
    if (!stage || !rendererManager) return;
    const rect = stage.getBoundingClientRect();
    const margin = window.innerWidth <= 640 ? 16 : 24;
    const targetX = rect.left + rect.width / 2 < window.innerWidth / 2
      ? margin
      : window.innerWidth - rect.width - margin;
    const targetY = clamp(rect.top, margin, window.innerHeight - rect.height - margin);
    const safe = findSafeStagePosition({ x: targetX, y: targetY });
    if (rendererManager && typeof rendererManager.resetPlacement === "function") {
      rendererManager.resetPlacement("custom");
    }
    flyTo(safe.x, safe.y, 620);
    savePosition(safe.x, safe.y, "custom");
  }

  function clearDragForPositionReset() {
    if (drag && drag.captureTarget && drag.captureTarget.hasPointerCapture(drag.pointerId)) {
      drag.captureTarget.releasePointerCapture(drag.pointerId);
    }
    drag = null;
    setHoverDropZone(null);
    ignoreStageClickUntil = 0;
    stage.classList.remove("is-dragging", "is-ola-moving", "is-ola-flying", "is-ola-landing");
    setDragTilt(0);
    if (stateManager && stateManager.getState() === "FOLLOW") {
      stateManager.setState("IDLE", { reason: "position-reset" });
    }
  }

  function resetPosition() {
    if (!stage) return false;
    closeSettings(false);
    if (activeContext) closeActiveContext(false);
    clearDragForPositionReset();
    if (rendererManager && typeof rendererManager.resetPlacement === "function") {
      rendererManager.resetPlacement("default-left");
    } else if (rendererManager && typeof rendererManager.cancelMovement === "function") {
      rendererManager.cancelMovement("position-reset");
    }
    safeStorageRemove(POSITION_STORAGE_KEY);
    placementMode = "default-left";
    ["left", "right", "top", "bottom", "transform"].forEach(function (property) {
      stage.style.removeProperty(property);
    });
    requestAnimationFrame(function () {
      if (!initialized || !stage) return;
      const safe = computeDefaultLeftPosition();
      flyTo(safe.x, safe.y, 620);
      savePosition(safe.x, safe.y, "default-left");
    });
    return true;
  }

  function overlapArea(first, second) {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return width * height;
  }

  function getVisibleUiBlockers(excluded) {
    return Array.from(document.querySelectorAll(
      "#sidebar, header, main h1, main h2, [data-ola-drop-zone='true'], .ola-card, [role='dialog'], .fixed"
    )).filter(function (element) {
      if (element === excluded || element.closest("#ola-layer")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden"
        && parseFloat(style.opacity || "1") > 0.1 && rect.width > 0 && rect.height > 0;
    });
  }

  function findSafeStagePosition(preferred) {
    const rect = stage.getBoundingClientRect();
    const margin = window.innerWidth <= 640 ? 10 : 20;
    const gearReserve = window.innerWidth <= 640 ? 58 : 54;
    const maxX = Math.max(window.innerWidth - rect.width - margin, margin);
    const maxY = Math.max(window.innerHeight - rect.height - gearReserve, margin);
    const sidebar = document.getElementById("sidebar");
    const sidebarRect = sidebar && sidebar.getClientRects().length
      ? sidebar.getBoundingClientRect() : null;
    const header = document.querySelector("main header");
    const headerRect = header && header.getClientRects().length
      ? header.getBoundingClientRect() : null;
    const contentLeft = sidebarRect ? Math.min(sidebarRect.right + margin, maxX) : margin;
    const topSafe = clamp((headerRect ? headerRect.bottom : 0) + margin, margin, maxY);
    const candidates = [];
    if (preferred) candidates.push(preferred);
    candidates.push(
      { x: maxX, y: maxY },
      { x: contentLeft, y: maxY },
      { x: clamp((window.innerWidth - rect.width) / 2, margin, maxX), y: maxY },
      { x: maxX, y: topSafe },
      { x: contentLeft, y: topSafe },
      { x: clamp((window.innerWidth - rect.width) / 2, margin, maxX), y: topSafe },
      { x: maxX, y: clamp(window.innerHeight * 0.46, margin, maxY) },
      { x: contentLeft, y: clamp(window.innerHeight * 0.46, margin, maxY) }
    );
    const blockers = getVisibleUiBlockers();
    let best = null;
    let bestPenalty = Infinity;
    candidates.forEach(function (candidate, index) {
      const x = clamp(Number(candidate.x) || 0, margin, maxX);
      const y = clamp(Number(candidate.y) || 0, margin, maxY);
      const candidateRect = { left: x, top: y, right: x + rect.width, bottom: y + rect.height };
      let penalty = index;
      blockers.forEach(function (element) {
        const area = overlapArea(candidateRect, element.getBoundingClientRect());
        penalty += area * (element.id === "sidebar" ? 20 : 1);
      });
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = { x: x, y: y };
      }
    });
    return best || { x: maxX, y: maxY };
  }

  function getMainContentRect() {
    const main = document.querySelector("main");
    if (!main) return null;
    const candidates = Array.from(new Set(Array.from(main.querySelectorAll(
      ".page-scroll > section, .page-scroll > [id^='view-'], .page-scroll > [class*='max-w-']"
    )))).filter(function (element) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden"
        && rect.width > 0 && rect.height > 0;
    });
    if (!candidates.length) return main.getBoundingClientRect();
    candidates.sort(function (first, second) {
      return second.getBoundingClientRect().width - first.getBoundingClientRect().width;
    });
    return candidates[0].getBoundingClientRect();
  }

  function computeDefaultLeftPosition() {
    const rect = stage.getBoundingClientRect();
    const margin = window.innerWidth <= 640 ? 16 : 20;
    const gearReserve = window.innerWidth <= 640 ? 58 : 54;
    const maxX = Math.max(window.innerWidth - rect.width - margin, margin);
    const maxY = Math.max(window.innerHeight - rect.height - gearReserve, margin);
    if (window.innerWidth <= 640) {
      return findSafeStagePosition({ x: margin, y: maxY });
    }

    const sidebar = document.getElementById("sidebar");
    const sidebarRect = sidebar && sidebar.getClientRects().length
      ? sidebar.getBoundingClientRect() : null;
    const contentRect = getMainContentRect();
    const leftBoundary = sidebarRect ? sidebarRect.right + margin : margin;
    const contentBoundary = contentRect ? contentRect.left - margin : window.innerWidth * 0.36;
    const gapWidth = contentBoundary - leftBoundary;
    const centeredGapX = gapWidth >= rect.width
      ? leftBoundary + (gapWidth - rect.width) / 2
      : leftBoundary;
    const xCandidates = [
      centeredGapX,
      leftBoundary,
      contentRect ? contentRect.left - rect.width - margin : leftBoundary,
      margin,
    ];
    const yCandidates = [
      clamp(window.innerHeight * 0.46, margin, maxY),
      clamp(window.innerHeight * 0.6, margin, maxY),
      maxY,
      clamp(window.innerHeight * 0.34, margin, maxY),
    ];
    const blockers = getVisibleUiBlockers();
    let best = null;
    let bestPenalty = Infinity;
    xCandidates.forEach(function (candidateX, xIndex) {
      yCandidates.forEach(function (candidateY, yIndex) {
        const x = clamp(candidateX, margin, maxX);
        const y = clamp(candidateY, margin, maxY);
        const candidateRect = { left: x, top: y, right: x + rect.width, bottom: y + rect.height };
        let penalty = xIndex * 4 + yIndex;
        blockers.forEach(function (element) {
          const weight = element.id === "sidebar" ? 20
            : element.matches("[role='dialog']") ? 8
              : element.matches("[data-ola-drop-zone='true'], .ola-card") ? 3
                : 1;
          penalty += overlapArea(candidateRect, element.getBoundingClientRect()) * weight;
        });
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          best = { x: x, y: y };
        }
      });
    });
    return best || { x: clamp(leftBoundary, margin, maxX), y: maxY };
  }

  function positionMessage(anchorX, anchorY, avoidElement) {
    if (!message || !stage) return;
    message.classList.remove("is-open-right", "is-below");
    message.style.left = "0px";
    message.style.top = "0px";
    const stageRect = stage.getBoundingClientRect();
    const x = Number.isFinite(anchorX) ? anchorX : stageRect.left;
    const y = Number.isFinite(anchorY) ? anchorY : stageRect.top;
    const width = message.offsetWidth;
    const height = message.offsetHeight;
    const gap = 12;
    const margin = window.innerWidth <= 640 ? 8 : 10;
    const centerX = x + stageRect.width / 2;
    const centerY = y + stageRect.height / 2;
    const candidates = [
      { placement: "above", left: centerX - width / 2, top: y - height - gap },
      { placement: "right", left: x + stageRect.width + gap, top: centerY - height / 2 },
      { placement: "left", left: x - width - gap, top: centerY - height / 2 },
      { placement: "below", left: centerX - width / 2, top: y + stageRect.height + gap },
    ];
    const blockers = getVisibleUiBlockers();
    const robotRect = { left: x, top: y, right: x + stageRect.width, bottom: y + stageRect.height };
    let best = null;
    let bestPenalty = Infinity;
    candidates.forEach(function (candidate, index) {
      const outside = Math.max(0, margin - candidate.left)
        + Math.max(0, candidate.left + width - (window.innerWidth - margin))
        + Math.max(0, margin - candidate.top)
        + Math.max(0, candidate.top + height - (window.innerHeight - margin));
      const left = clamp(candidate.left, margin, Math.max(margin, window.innerWidth - width - margin));
      const top = clamp(candidate.top, margin, Math.max(margin, window.innerHeight - height - margin));
      const bubbleRect = { left: left, top: top, right: left + width, bottom: top + height };
      let penalty = outside * 1000000 + overlapArea(bubbleRect, robotRect) * 1000 + index;
      blockers.forEach(function (element) {
        penalty += overlapArea(bubbleRect, element.getBoundingClientRect());
      });
      if (avoidElement && avoidElement.getClientRects().length) {
        penalty += overlapArea(bubbleRect, avoidElement.getBoundingClientRect()) * 2;
      }
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = { placement: candidate.placement, left: left, top: top };
      }
    });
    if (!best) return;
    message.dataset.placement = best.placement;
    message.style.left = best.left + "px";
    message.style.top = best.top + "px";
    const tailOffset = best.placement === "above" || best.placement === "below"
      ? clamp(centerX - best.left - 7, 16, width - 24)
      : clamp(centerY - best.top - 7, 16, height - 24);
    message.style.setProperty("--ola-tail-offset", tailOffset + "px");
  }

  function clearMessageContent() {
    if (!messageTitle) return;
    messageTitle.textContent = "";
    messageText.textContent = "";
    messageDetails.replaceChildren();
    messageActions.replaceChildren();
  }

  function createActionButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler, { once: true });
    return button;
  }

  function showMessage(text, options) {
    if (!message || !text) return;
    const settings = options || {};
    clearBubbleTimer();
    activeMessageDescriptor = settings.i18nDescriptor || null;
    sleepConfirmVisible = false;
    clearMessageContent();
    messageTitle.textContent = settings.title || "";
    messageText.textContent = String(text);
    (settings.details || []).forEach(function (detail) {
      const item = document.createElement("li");
      item.textContent = String(detail);
      messageDetails.appendChild(item);
    });
    (settings.actions || []).forEach(function (action) {
      if (!action || !action.label || typeof action.handler !== "function") return;
      messageActions.appendChild(createActionButton(action.label, action.handler));
    });
    positionMessage(settings.anchorX, settings.anchorY, settings.avoidElement);
    message.setAttribute("aria-hidden", "false");
    message.dataset.olaMessageType = settings.idle ? "idle" : "guide";
    message.classList.add("is-visible");
    const duration = Number(settings.duration || (settings.persistent ? 0 : 30000));
    if (duration > 0) {
      bubbleTimer = window.setTimeout(function () {
        bubbleTimer = 0;
        if (!initialized) return;
        if (activeContext) closeActiveContext(true);
        else hideMessageOnly();
      }, duration);
    }
  }

  function showLocalizedMessage(textKey, options) {
    const settings = options || {};
    const descriptor = {
      textKey: textKey,
      titleKey: settings.titleKey || "",
      fallbackText: settings.fallbackText || "",
      fallbackTitle: settings.fallbackTitle || "",
    };
    showMessage(
      translate(descriptor.textKey, null, descriptor.fallbackText),
      {
        title: descriptor.titleKey
          ? translate(descriptor.titleKey, null, descriptor.fallbackTitle)
          : "",
        i18nDescriptor: descriptor,
      }
    );
  }

  function hideMessageOnly() {
    if (!message) return;
    clearBubbleTimer();
    message.classList.remove("is-visible", "is-open-right", "is-below");
    message.setAttribute("aria-hidden", "true");
    message.removeAttribute("data-placement");
    message.style.removeProperty("left");
    message.style.removeProperty("top");
    message.style.removeProperty("--ola-tail-offset");
    delete message.dataset.olaMessageType;
    activeMessageDescriptor = null;
    sleepConfirmVisible = false;
    clearMessageContent();
  }

  function hasSeenHelp() {
    return safeSessionGet(HELP_STORAGE_KEY) === "true";
  }

  function showHelp() {
    if (!settings.visible || pageHidden) return;
    closeSettings();
    safeSessionSet(HELP_STORAGE_KEY, "true");
    showLocalizedMessage("messages.helpSummary", {
      titleKey: "messages.helpTitle",
    });
  }

  function showPageWelcome() {
    if (
      welcomedThisLoad
      || !settings.welcome
      || !settings.visible
      || pageHidden
      || !stateManager
      || isSleepingState(stateManager.getState())
      || !window.olaPagePolicy
    ) return false;
    const pageId = window.olaPagePolicy.getPageId(window.location.pathname);
    const greetingKey = "greetings." + pageId;
    const greeting = translate(
      greetingKey,
      null,
      window.olaPagePolicy.getWelcomeMessage(window.location.pathname)
    );
    if (!greeting) return false;
    welcomedThisLoad = true;
    stateManager.setState("HAPPY", { reason: "page-welcome" });
    showLocalizedMessage(greetingKey, {
      titleKey: "greetings.title",
      fallbackText: greeting,
    });
    schedule(function () {
      if (stateManager && stateManager.getState() === "HAPPY") {
        stateManager.setState("IDLE", { reason: "page-welcome-complete" });
      }
    }, 950);
    schedule(function () {
      if (!activeContext) hideMessageOnly();
    }, 5600);
    return true;
  }

  function setHoverDropZone(zone) {
    if (hoverDropZone === zone) return;
    if (hoverDropZone) hoverDropZone.classList.remove("is-ola-drop-hover");
    hoverDropZone = zone || null;
    if (hoverDropZone) hoverDropZone.classList.add("is-ola-drop-hover");
  }

  function getDropZoneAtPoint(x, y) {
    if (typeof document.elementsFromPoint !== "function") return null;
    const elements = document.elementsFromPoint(x, y);
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const zone = element.closest && element.closest('[data-ola-drop-zone="true"]');
      if (zone) return zone;
    }
    return null;
  }

  function getDropZoneUnderStage() {
    if (!stage) return null;
    const stageRect = stage.getBoundingClientRect();
    const centerZone = getDropZoneAtPoint(
      stageRect.left + stageRect.width / 2,
      stageRect.top + stageRect.height / 2
    );
    if (centerZone) return centerZone;

    const stageArea = stageRect.width * stageRect.height;
    if (!stageArea) return null;
    let bestZone = null;
    let bestRatio = 0;
    document.querySelectorAll('[data-ola-drop-zone="true"]').forEach(function (zone) {
      const style = getComputedStyle(zone);
      const rect = zone.getBoundingClientRect();
      if (
        style.display === "none"
        || style.visibility === "hidden"
        || parseFloat(style.opacity || "1") <= 0.1
        || rect.width <= 0
        || rect.height <= 0
      ) return;
      const overlapWidth = Math.max(0, Math.min(stageRect.right, rect.right) - Math.max(stageRect.left, rect.left));
      const overlapHeight = Math.max(0, Math.min(stageRect.bottom, rect.bottom) - Math.max(stageRect.top, rect.top));
      const ratio = (overlapWidth * overlapHeight) / stageArea;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestZone = zone;
      }
    });
    return bestRatio >= 0.18 ? bestZone : null;
  }

  function getContextTarget(zone) {
    const zoneRect = zone.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const margin = window.innerWidth <= 640 ? 8 : 12;
    const gap = window.innerWidth <= 640 ? 6 : 10;
    const scrollbarWidth = Math.max(window.innerWidth - document.documentElement.clientWidth, 0);
    const maxX = Math.max(window.innerWidth - scrollbarWidth - stageRect.width - margin, margin);
    const maxY = Math.max(window.innerHeight - stageRect.height - margin, margin);
    const alignedY = clamp(zoneRect.top + Math.min(28, zoneRect.height * 0.18), margin, maxY);
    const centeredX = clamp(
      zoneRect.left + zoneRect.width / 2 - stageRect.width / 2,
      margin,
      maxX
    );
    const candidates = [
      {
        x: centeredX,
        y: zoneRect.top - stageRect.height - gap,
      },
      { x: zoneRect.right + gap, y: alignedY },
      { x: zoneRect.left - stageRect.width - gap, y: alignedY },
      {
        x: centeredX,
        y: zoneRect.bottom + gap,
      },
    ];

    function overlaps(first, second) {
      return first.left < second.right && first.right > second.left
        && first.top < second.bottom && first.bottom > second.top;
    }

    const blockers = Array.from(document.querySelectorAll(
      "button, a, input, textarea, select, [role='button'], header, aside, .sidebar, #ola-settings-panel"
    )).filter(function (element) {
      if (element.closest("#ola-layer") || zone.contains(element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && parseFloat(style.opacity || "1") > 0.1
        && rect.width > 0
        && rect.height > 0;
    });

    const fitting = candidates.find(function (candidate) {
      const candidateRect = {
        left: candidate.x,
        top: candidate.y,
        right: candidate.x + stageRect.width,
        bottom: candidate.y + stageRect.height,
      };
      return candidate.x >= margin
        && candidate.y >= margin
        && candidate.x <= maxX
        && candidate.y <= maxY
        && !blockers.some(function (element) {
          return overlaps(candidateRect, element.getBoundingClientRect());
        });
    });
    const target = fitting || {
      x: clamp(zoneRect.right - stageRect.width * 0.62, margin, maxX),
      y: clamp(zoneRect.top - stageRect.height * 0.55, margin, maxY),
    };
    target.x = clamp(target.x, margin, maxX);
    target.y = clamp(target.y, margin, maxY);
    target.direction = target.x + stageRect.width / 2 < zoneRect.left + zoneRect.width / 2
      ? "right"
      : "left";
    return target;
  }

  function normalizeVisibleText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function collectVisibleValues(zone, context) {
    const values = [];
    (context.visibleValueSelectors || []).forEach(function (selector) {
      let element;
      try {
        element = zone.querySelector(selector);
      } catch (_) {
        element = null;
      }
      if (!element || element.getClientRects().length === 0) return;
      const value = normalizeVisibleText(element.textContent);
      if (!value || value === "-" || values.includes(value)) return;
      values.push(value.slice(0, 160));
    });
    return values.join(" · ").slice(0, 600);
  }

  function buildSafeAiPrompt(contextId, context, zone, question) {
    const visibleValues = collectVisibleValues(zone, context);
    const details = Array.isArray(context.details) ? context.details.join(" / ") : "";
    return [
      "다음 OLA 화면 영역에 관해 사용자의 질문에만 간결하게 답해 주세요.",
      "화면에 없는 사실은 추측하지 말고, 안전 관련 내용은 공식 안내 확인을 권해 주세요.",
      "contextId: " + contextId,
      "선별된 설명: " + context.title + " — " + context.userSummary,
      details ? "선별된 세부 정보: " + details : "",
      "현재 화면에 표시된 값: " + (visibleValues || "전달할 값 없음"),
      "사용자 질문: " + question,
    ].filter(Boolean).join("\n");
  }

  function renderAiQuestionForm(contextId, context, zone, navigation) {
    if (!CHAT_ENABLED || !messageActions) return;
    messageActions.replaceChildren();

    const label = document.createElement("label");
    label.htmlFor = "ola-context-question";
    label.textContent = translate("context.form.label");

    const input = document.createElement("input");
    input.id = "ola-context-question";
    input.type = "text";
    input.maxLength = 240;
    input.autocomplete = "off";
    input.placeholder = context.suggestedQuestion || translate("context.form.placeholder");

    const submit = document.createElement("button");
    submit.type = "button";
    submit.textContent = translate("context.form.submit");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = translate("context.form.cancel");

    const response = document.createElement("p");
    response.className = "ola-ai-response";
    response.setAttribute("aria-live", "polite");

    messageActions.append(label, input, submit, cancel, response);
    input.focus();

    cancel.addEventListener("click", function () {
      renderContextActions(contextId, context, zone, navigation);
    }, { once: true });

    submit.addEventListener("click", async function () {
      const question = normalizeVisibleText(input.value);
      if (!question) {
        response.textContent = translate("context.form.empty");
        input.focus();
        return;
      }

      submit.disabled = true;
      input.disabled = true;
      response.textContent = translate("context.form.loading");
      const requestVersion = ++contextRequestVersion;
      if (!window.olaOpenAI || typeof window.olaOpenAI.chat !== "function") {
        response.textContent = translate("context.form.unavailable");
        submit.disabled = false;
        input.disabled = false;
        return;
      }

      const result = await window.olaOpenAI.chat(
        buildSafeAiPrompt(contextId, context, zone, question),
        []
      );
      if (!initialized || requestVersion !== contextRequestVersion || !activeContext) return;
      if (result && result.ok) {
        response.textContent = result.text;
      } else {
        response.textContent = translate("context.form.failed");
        submit.disabled = false;
        input.disabled = false;
      }
    });
  }

  function renderContextActions(contextId, context, zone, navigation) {
    messageActions.replaceChildren();
    if (navigation && navigation.url) {
      messageActions.appendChild(createActionButton(translate("actions.openPage"), function () {
        if (navigation.target === "_blank") {
          window.open(navigation.url, "_blank", "noopener");
        } else {
          window.location.assign(navigation.url);
        }
      }));
    }
    if (!CHAT_ENABLED) return;
    messageActions.appendChild(createActionButton(translate("context.actions.ask"), function () {
      renderAiQuestionForm(contextId, context, zone, navigation);
    }));
  }

  function getContextDetails(context) {
    const details = (context.details || []).slice(0, 3);
    if (context.suggestedQuestion) details.push(context.suggestedQuestion);
    return details;
  }

  function getDynamicContextValues(zone, context) {
    const bindings = context && context.dynamicValueBindings;
    if (!zone || !bindings || typeof bindings !== "object" || Array.isArray(bindings)) return null;
    const values = {};
    let complete = true;
    Object.keys(bindings).forEach(function (name) {
      let element = null;
      try {
        element = zone.querySelector(bindings[name]);
      } catch (_) {
        element = null;
      }
      const value = normalizeVisibleText(element && element.textContent);
      if (!value || value === "-") complete = false;
      values[name] = value;
    });
    return {
      values: values,
      loading: zone.getAttribute("aria-busy") === "true"
        || zone.dataset.weatherState === "loading"
        || !complete,
    };
  }

  function interpolateContextText(template, values) {
    return String(template || "").replace(/\{\{([^{}]+)\}\}/g, function (_, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : "";
    });
  }

  function getContextPresentation(zone, context) {
    const dynamic = getDynamicContextValues(zone, context);
    if (!dynamic) {
      return { summary: context.userSummary || context.fallback, details: getContextDetails(context) };
    }
    if (dynamic.loading) {
      return {
        summary: context.loadingSummary || context.userSummary || context.fallback,
        details: [],
      };
    }
    return {
      summary: interpolateContextText(context.dynamicSummary || context.userSummary, dynamic.values),
      details: getContextDetails(context),
    };
  }

  function getContextContentSignature(zone, context) {
    const dynamic = getDynamicContextValues(zone, context);
    return dynamic ? JSON.stringify({ loading: dynamic.loading, values: dynamic.values }) : "";
  }

  function isDuplicateContextRequest(contextKey, contextSignature) {
    return Boolean(contextKey)
      && contextKey === lastContextKey
      && contextSignature === lastContextSignature;
  }

  function rememberContextRequest(contextKey, contextSignature) {
    lastContextKey = contextKey;
    lastContextSignature = contextSignature;
  }

  function renderActiveContextText() {
    if (!activeContext) return false;
    const context = contextMap[activeContext.id] || activeContext.context;
    if (!context || typeof context.userSummary !== "string") return false;
    activeContext.context = context;
    let anchorX;
    let anchorY;
    if (activeContext.zone) {
      const target = getContextTarget(activeContext.zone);
      anchorX = target.x;
      anchorY = target.y;
    }
    const presentation = getContextPresentation(activeContext.zone, context);
    showMessage(presentation.summary, {
      title: context.title,
      details: presentation.details,
      anchorX: anchorX,
      anchorY: anchorY,
      avoidElement: activeContext.zone || null,
    });
    renderContextActions(
      activeContext.id,
      context,
      activeContext.zone,
      activeContext.navigation
    );
    return true;
  }

  function refreshLocaleText() {
    if (!initialized || !window.olaUiI18n) return false;
    const contextToReopen = activeContext ? {
      id: activeContext.id,
      zone: activeContext.zone,
      returnPosition: activeContext.returnPosition,
      navigation: activeContext.navigation,
    } : null;
    if (contextToReopen) {
      if (rendererManager && typeof rendererManager.cancelMovement === "function") {
        rendererManager.cancelMovement("locale-change");
      }
      closeActiveContext(false);
    }
    window.olaUiI18n.apply(layer);
    const localizedContexts = window.olaUiI18n.getContextMap();
    if (localizedContexts && Object.keys(localizedContexts).length) {
      contextMap = localizedContexts;
    }
    if (
      contextToReopen
      && contextToReopen.zone
      && document.documentElement.contains(contextToReopen.zone)
    ) {
      openContextForZone(
        contextToReopen.zone,
        contextToReopen.returnPosition,
        contextToReopen.navigation
      );
      return true;
    }
    if (
      activeMessageDescriptor
      && message
      && message.classList.contains("is-visible")
    ) {
      const descriptor = Object.assign({}, activeMessageDescriptor);
      showLocalizedMessage(descriptor.textKey, {
        titleKey: descriptor.titleKey,
        fallbackText: descriptor.fallbackText,
        fallbackTitle: descriptor.fallbackTitle,
      });
      return true;
    }
    return true;
  }

  function closeActiveContext(returnToPrevious) {
    if (!activeContext) return false;
    contextRequestVersion += 1;
    const current = activeContext;
    activeContext = null;
    if (current.zone) current.zone.classList.remove("is-ola-context-active");
    stage.removeAttribute("data-ola-guide-direction");
    hideMessageOnly();
    if (stateManager && stateManager.getState() === "GUIDE") {
      stateManager.setState(current.previousState || "IDLE", { reason: "guide-close" });
    }
    if (returnToPrevious !== false && current.returnPosition) {
      flyTo(current.returnPosition.x, current.returnPosition.y, 620);
    }
    return true;
  }

  function openContextForZone(zone, returnPosition, navigation) {
    if (!zone || !stateManager || isSleepingState(stateManager.getState())) {
      dockAfterDrag();
      return;
    }
    const contextId = zone.getAttribute("data-ola-context");
    const contextVisitKey = getContextVisitKey(contextId);
    const context = contextMap[contextId];
    const contentSignature = getContextContentSignature(zone, context);
    if (
      zone.matches('[data-ola-ignore="true"]')
      || !contextVisitKey
      || isDuplicateContextRequest(contextVisitKey, contentSignature)
    ) return;
    if (!context || typeof context.userSummary !== "string") {
      dockAfterDrag();
      return;
    }

    closeActiveContext(false);
    const previousState = stateManager.getState() === "GUIDE"
      ? "IDLE"
      : stateManager.getState();
    const target = getContextTarget(zone);
    activeContext = {
      id: contextId,
      zone: zone,
      context: context,
      previousState: previousState,
      returnPosition: returnPosition,
      navigation: navigation || null,
    };
    safeStorageSet(LAST_CONTEXT_STORAGE_KEY, contextId);
    rememberContextRequest(contextVisitKey, contentSignature);
    zone.classList.add("is-ola-context-active");
    stage.dataset.olaGuideDirection = target.direction;
    flyTo(target.x, target.y, 980);
    stateManager.setState("GUIDE", { reason: "card-drop", contextId: contextId });
    if (context.emotion) rendererManager.setExpression(context.emotion);
    renderActiveContextText();
  }

  function showPendingContext(contextId) {
    if (!contextId || !stateManager || isSleepingState(stateManager.getState())) return false;
    const context = contextMap[contextId];
    if (!context || typeof context.userSummary !== "string") return false;
    closeActiveContext(false);
    const previousState = stateManager.getState() === "GUIDE"
      ? "IDLE"
      : stateManager.getState();
    activeContext = {
      id: contextId,
      zone: null,
      context: context,
      previousState: previousState,
      returnPosition: null,
    };
    safeStorageSet(LAST_CONTEXT_STORAGE_KEY, contextId);
    stateManager.setState("GUIDE", { reason: "pending-context", contextId: contextId });
    if (context.emotion) rendererManager.setExpression(context.emotion);
    renderActiveContextText();
    return true;
  }

  function restorePendingContext() {
    let pending;
    try {
      pending = JSON.parse(safeSessionGet(PENDING_CONTEXT_STORAGE_KEY));
    } catch (_) {
      pending = null;
    }
    if (!pending || typeof pending.contextId !== "string") {
      safeSessionRemove(PENDING_CONTEXT_STORAGE_KEY);
      return;
    }
    const age = Date.now() - Number(pending.createdAt || 0);
    if (age < 0 || age > 5 * 60 * 1000) {
      safeSessionRemove(PENDING_CONTEXT_STORAGE_KEY);
      return;
    }
    if (pending.targetPath && pending.targetPath !== window.location.pathname) return;
    safeSessionRemove(PENDING_CONTEXT_STORAGE_KEY);
    showPendingContext(pending.contextId);
  }

  function onContextClick(event) {
    const target = event.target && event.target.closest ? event.target : null;
    // 수면 확인 팝업이 떠 있는 동안 말풍선(#ola-message, Yes/No 버튼 포함) 바깥을 클릭하면 —
    // 페이지의 다른 곳이든 올라 몸체의 다른 부분이든 — "아니요"를 누른 것과 같게 팝업만 닫고
    // 수면 모드로는 들어가지 않는다. Yes/No 버튼 자체는 #ola-message 안에 있으므로 여기서
    // 걸러지지 않고 각자의 클릭 핸들러가 정상적으로 처리한다.
    if (sleepConfirmVisible && (!target || !target.closest("#ola-message"))) {
      hideMessageOnly();
    }
    if (
      target && settingsPanel && !settingsPanel.hidden
      && !target.closest("#ola-settings-panel")
      && !target.closest("#ola-settings-trigger")
      && !isLanguageSwitcherEvent(event)
    ) {
      closeSettings(false);
    }
    if (!target || target.closest("#ola-layer")) return;
    const navigationTarget = target.closest(
      'a[href], a[target], a[download], [data-href], [data-url], [data-nav], button[type="submit"]'
    );
    if (navigationTarget) return;
    const zone = target.closest("[data-ola-context]");
    if (!zone) return;
    const contextId = zone.getAttribute("data-ola-context");
    if (!contextId) return;

    if (zone.matches('[data-ola-ignore="true"]')) return;
    const link = target.closest("a[href]");
    const href = link && link.getAttribute("href");
    const navigates = Boolean(
      link
      && href
      && !href.startsWith("#")
      && !/^javascript:/i.test(href)
      && !/^(?:mailto:|tel:)/i.test(href)
    );
    // 실제 이동 링크는 로봇 설명 팝업(및 "페이지 열기" 재클릭) 없이 클릭 즉시 이동한다.
    if (navigates) return;

    requestContextForZone(zone);
  }

  function requestContextForZone(zone) {
    if (!zone || zone.matches('[data-ola-ignore="true"]')) return;
    const rect = stage && stage.getBoundingClientRect();
    const returnPosition = rect ? { x: rect.left, y: rect.top } : null;
    if (rendererManager && stateManager && !isSleepingState(stateManager.getState())) {
      rendererManager.setExpression("think");
    }
    loadContextMap().then(function () {
      if (initialized && document.documentElement.contains(zone)) {
        openContextForZone(zone, returnPosition, null);
      }
    });
  }

  function loadContextMap() {
    if (contextLoadPromise) return contextLoadPromise;
    let localizedLoad;
    if (window.olaUiI18n) {
      localizedLoad = Promise.resolve(window.olaUiI18n.ready).then(function () {
        const localized = window.olaUiI18n.getContextMap();
        if (!localized || Object.keys(localized).length === 0) {
          throw new Error("Localized context unavailable");
        }
        return localized;
      });
    } else {
      localizedLoad = Promise.reject(new Error("OLA i18n unavailable"));
    }
    contextLoadPromise = localizedLoad.catch(function () {
      return fetch(CONTEXT_MAP_PATH, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      });
    })
      .then(function (data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("올바르지 않은 카드 설명 데이터");
        }
        contextMap = data;
        restorePendingContext();
        return contextMap;
      })
      .catch(function (error) {
        contextMap = {};
        console.warn("[OLA] 카드 설명 데이터를 불러오지 못했습니다.", error.message || error);
        return contextMap;
      });
    return contextLoadPromise;
  }

  function sleep(reason) {
    if (!stateManager) return;
    const state = stateManager.getState();
    if (isSleepingState(state)) return;
    if (reason !== "auto-timeout") autoSlept = false;
    closeActiveContext(false);
    clearTransitionTimers();
    clearAutoSleepTimer();
    stateManager.setState("SLEEP_PREPARE", { reason: reason || "user" });
    showLocalizedMessage("messages.sleep");
    schedule(moveToSleepCorner, 520);
    schedule(function () {
      hideMessageOnly();
      stateManager.setState("SLEEP", { reason: "sleep-sequence" });
    }, 1700);
  }

  function wake(reason) {
    if (!stateManager || !isSleepingState(stateManager.getState())) return;
    autoSlept = false;
    clearTransitionTimers();
    stateManager.setState("WAKE_UP", { reason: reason || "user" });
    showLocalizedMessage("messages.wake");
    schedule(function () {
      stateManager.setState("IDLE", { reason: "wake-sequence" });
      hideMessageOnly();
      if (!hasSeenHelp()) schedule(showHelp, 450);
    }, 1400);
  }

  // 가운데 코어를 눌렀을 때 곧바로 수면 모드로 들어가면 의도치 않은 클릭에도 갑자기 잠들어
  // 버리므로, Wake와 달리 Sleep으로 가는 방향에는 먼저 확인 버블을 띄우고 "네"를 눌렀을 때만
  // 실제로 sleep()을 호출한다.
  function confirmSleep() {
    if (!stateManager || isSleepingState(stateManager.getState())) return;
    showMessage(
      translate("messages.confirmSleep", null, "지금 수면 모드로 들어갈까요? 다시 부르면 바로 깨어날게요."),
      {
        title: translate("messages.confirmSleepTitle", null, "잠깐, 확인할게요"),
        persistent: true,
        actions: [
          {
            label: translate("actions.confirmSleepYes", null, "네, 쉴게요"),
            handler: function () {
              hideMessageOnly();
              sleep("user");
            },
          },
          {
            label: translate("actions.confirmSleepNo", null, "아니요, 계속 볼게요"),
            handler: function () {
              hideMessageOnly();
            },
          },
        ],
      }
    );
    // showMessage()는 호출될 때마다 sleepConfirmVisible을 일단 false로 리셋하므로, 반드시 그
    // 호출 다음에 true로 세팅해야 한다 — 이 값이 true인 동안에만 onContextClick이 바깥 클릭을
    // "아니요"로 취급해 팝업을 닫아 준다.
    //
    // 단, 여기서 곧바로(동기적으로) true로 세팅하면 안 된다: 지금 이 확인창을 띄운 바로 그
    // 클릭 이벤트가 — 올라 코어(.ola-core-toggle)에서 시작해 stage의 클릭 리스너(여기 이
    // confirmSleep 호출)를 거쳐 — 계속 document까지 버블링되고, 같은 클릭의 버블링이 끝나기
    // 전에 onContextClick이 실행되면서 "확인창(#ola-message) 바깥을 클릭했다"고 오인해(클릭
    // 대상이 올라 코어이므로) 방금 띄운 확인창을 그 자리에서 즉시 닫아버린다 — 이게 바로
    // "올라를 눌러도 수면 모드 확인이 아예 안 뜨는(또는 뜨자마자 사라지는)" 버그의 원인이었다.
    //
    // 마이크로태스크(Promise.resolve().then)로 미루는 것만으로는 부족하다 — 실제 브라우저는
    // document까지 버블링하는 동안 리스너 하나가 끝날 때마다(스테이지 리스너가 끝난 직후
    // document 리스너가 실행되기 전에도) 마이크로태스크 큐를 비워버리기 때문에, 이 확인창을
    // 연 바로 그 클릭 안에서 onContextClick이 실행되기 전에 마이크로태스크가 먼저 실행되어
    // sleepConfirmVisible이 이미 true가 되어 있었다(Playwright로 실제 클릭을 재현해서 직접
    // 확인함 — Node.js로 흉내낸 단위 테스트만으로는 이 차이를 못 잡아냈다). setTimeout은
    // 진짜 매크로태스크라서 지금 이 클릭 이벤트의 디스패치 전체(버블링 + 그 사이 모든
    // 마이크로태스크)가 완전히 끝난 뒤, 완전히 별도의 턴에서만 실행된다 — 그래서 이번 클릭
    // 자체에는 절대 반응하지 않고, 그 다음(진짜) 바깥 클릭부터만 반응하게 된다.
    window.setTimeout(function () {
      sleepConfirmVisible = true;
    }, 0);
  }

  function toggle() {
    if (!stateManager) return;
    if (isSleepingState(stateManager.getState())) wake("user");
    else confirmSleep();
  }

  function activateCore() {
    const helpWasUnseen = !hasSeenHelp();
    toggle();
    if (helpWasUnseen) schedule(showHelp, 1850);
  }

  function triggerEmotion(name, reason) {
    if (!stateManager || !rendererManager) return false;
    let normalized = String(name || "").toUpperCase();
    if (normalized === "EMPATHY") {
      if (!settings.empathy) return false;
      normalized = "SAD";
    }
    const rule = EMOTION_RULES[normalized];
    if (!rule || isSleepingState(stateManager.getState())) return false;
    const now = Date.now();
    const last = lastEmotionAt.get(normalized) || 0;
    if (now - last < rule.cooldown) return false;
    lastEmotionAt.set(normalized, now);
    stateManager.setState(normalized, {
      reason: reason || "emotion-api",
      priority: rule.priority,
    });
    rendererManager.setExpression(normalized.toLowerCase());
    schedule(function () {
      if (!stateManager || stateManager.getState() !== normalized) return;
      rendererManager.setExpression("idle");
      stateManager.setState(rule.exitState, { reason: "emotion-complete" });
    }, rule.duration);
    return true;
  }

  function setDragTilt(degrees) {
    if (!stage) return;
    const motionRoot = stage.querySelector(".ola-reference-motion");
    if (motionRoot) {
      motionRoot.style.setProperty("--ola-flight-tilt", clamp(degrees, -4, 4).toFixed(2) + "deg");
    }
  }

  function onPointerDown(event) {
    const hit = event.target.closest && event.target.closest(".ola-drag-hit");
    if (!hit || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (activeContext) closeActiveContext(false);
    const rect = stage.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      captureTarget: hit,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      startPosition: { x: rect.left, y: rect.top },
      previousState: stateManager ? stateManager.getState() : "IDLE",
      moved: false,
    };
    hit.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance > DRAG_THRESHOLD) {
      drag.moved = true;
      ignoreStageClickUntil = performance.now() + 300;
      stage.classList.add("is-dragging");
      if (settingsPanel && !settingsPanel.hidden) closeSettings(false);
      clearGearHideTimer();
      if (settingsTrigger) settingsTrigger.hidden = true;
      hideMessageOnly();
      if (stateManager && !isSleepingState(stateManager.getState())) {
        stateManager.setState("FOLLOW", { reason: "body-drag" });
      }
    }
    if (!drag.moved) return;
    setDragTilt((event.clientX - drag.lastX) * 0.45);
    drag.lastX = event.clientX;
    moveTo(event.clientX - drag.dx, event.clientY - drag.dy);
    if (!isSleepingState(stateManager.getState())) {
      setHoverDropZone(getDropZoneAtPoint(event.clientX, event.clientY));
    }
    event.preventDefault();
  }

  function finishPointer(event, cancelled) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const currentDrag = drag;
    drag = null;
    stage.classList.remove("is-dragging");
    setDragTilt(0);
    if (currentDrag.captureTarget.hasPointerCapture(event.pointerId)) {
      currentDrag.captureTarget.releasePointerCapture(event.pointerId);
    }

    const zone = !cancelled && currentDrag.moved ? (hoverDropZone || getDropZoneUnderStage()) : null;
    setHoverDropZone(null);
    if (!currentDrag.moved && !cancelled) {
      showSettingsGear(event.pointerType === "touch" ? 4000 : 0);
      return;
    }
    if (stateManager.getState() === "FOLLOW") {
      stateManager.setState(currentDrag.previousState || "IDLE", { reason: "body-drag-end" });
    }
    if (cancelled || isSleepingState(stateManager.getState())) {
      dockAfterDrag();
      return;
    }
    if (zone) {
      openContextForZone(zone, currentDrag.startPosition);
    } else {
      dockAfterDrag();
      const now = Date.now();
      recentDrags = recentDrags.filter(function (time) { return now - time < 6000; });
      recentDrags.push(now);
      if (
        settings.dragReaction
        && recentDrags.length >= 4
        && now - lastAngryAt >= 15000
        && rendererManager
      ) {
        recentDrags = [];
        lastAngryAt = now;
        if (stateManager) stateManager.setState("ANGRY", { reason: "repeated-drag" });
        rendererManager.setExpression("angry");
        showLocalizedMessage("emotions.angry.message", {
          titleKey: "emotions.angry.title",
        });
        schedule(function () {
          if (rendererManager) rendererManager.setExpression("idle");
          if (stateManager && stateManager.getState() === "ANGRY") {
            stateManager.setState("IDLE", { reason: "repeated-drag-complete" });
          }
          if (!activeContext) hideMessageOnly();
        }, 1800);
      }
    }
  }

  function onPointerUp(event) {
    finishPointer(event, false);
  }

  function onPointerCancel(event) {
    finishPointer(event, true);
  }

  function onStageClick(event) {
    const core = event.target.closest && event.target.closest(".ola-core-toggle");
    if (core) {
      activateCore();
      return;
    }
    if (performance.now() < ignoreStageClickUntil) return;
    if (event.target.closest && event.target.closest(".ola-drag-hit")) {
      showSettingsGear(event.pointerType === "touch" ? 4000 : 0);
    }
  }

  function onMessageClose() {
    if (!closeActiveContext(true)) hideMessageOnly();
  }

  function onKeyDown(event) {
    const bodyHit = event.target && event.target.closest
      ? event.target.closest(".ola-drag-hit")
      : null;
    if (bodyHit && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      showSettingsGear(4000);
      return;
    }
    const contextZone = event.target && event.target.closest
      ? event.target.closest('[data-ola-context][role="button"]')
      : null;
    if (contextZone && !event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      requestContextForZone(contextZone);
      return;
    }
    if (event.key !== "Escape") return;
    let handled = false;
    if (settingsPanel && !settingsPanel.hidden) {
      closeSettings();
      handled = true;
    }
    if (message && message.classList.contains("is-visible")) {
      onMessageClose();
      handled = true;
    }
    if (handled) event.preventDefault();
  }

  function onResize() {
    if (!initialized || !rendererManager || !stage) return;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      handleResize();
    });
  }

  function handleResize() {
    if (!initialized || !rendererManager || !stage) return;
    rendererManager.resize();
    updateSettingsGearPlacement();
    const rect = stage.getBoundingClientRect();
    if (stateManager.getState() === "SLEEP") {
      moveToSleepCorner();
    } else if (activeContext && activeContext.zone) {
      const target = getContextTarget(activeContext.zone);
      stage.dataset.olaGuideDirection = target.direction;
      flyTo(target.x, target.y, 240);
      positionMessage(target.x, target.y, activeContext.zone);
    } else if (activeContext) {
      positionMessage();
    } else {
      const safe = placementMode === "default-left"
        ? computeDefaultLeftPosition()
        : findSafeStagePosition({ x: rect.left, y: rect.top });
      moveTo(safe.x, safe.y);
      if (placementMode === "default-left") {
        savePosition(safe.x, safe.y, "default-left");
      }
      positionMessage();
    }
  }

  function getStoredInitialState() {
    const saved = safeStorageGet(STORAGE_KEY);
    if (saved === "sleep") return "SLEEP";
    if (saved === "awake") return "IDLE";
    return safeStorageGet(LEGACY_STORAGE_KEY) === "false" ? "SLEEP" : "IDLE";
  }

  function bindDom() {
    layer = document.getElementById("ola-layer");
    stage = document.getElementById("ola-stage");
    message = document.getElementById("ola-message");
    messageTitle = document.getElementById("ola-message-title");
    messageText = document.getElementById("ola-message-text");
    messageDetails = document.getElementById("ola-message-details");
    messageActions = document.getElementById("ola-message-actions");
    messageClose = document.getElementById("ola-message-close");
    settingsHelpGuide = document.getElementById("ola-settings-help-guide");
    settingsTrigger = document.getElementById("ola-settings-trigger");
    restoreTrigger = document.getElementById("ola-restore-trigger");
    settingsPanel = document.getElementById("ola-settings-panel");
    settingsClose = document.getElementById("ola-settings-close");
    settingSleep = document.getElementById("ola-setting-sleep");
    settingVisible = document.getElementById("ola-setting-visible");
    settingHidePage = document.getElementById("ola-setting-hide-page");
    settingSleepWarning = document.getElementById("ola-setting-sleep-warning");
    settingWelcome = document.getElementById("ola-setting-welcome");
    settingIdleMessages = document.getElementById("ola-setting-idle-messages");
    if (!settingIdleMessages && settingWelcome && settingWelcome.parentElement) {
      const label = document.createElement("label");
      const text = document.createElement("span");
      text.textContent = translate("settings.fields.idleMessages", null, "자동 이야기와 생활 팁");
      settingIdleMessages = document.createElement("input");
      settingIdleMessages.id = "ola-setting-idle-messages";
      settingIdleMessages.type = "checkbox";
      label.append(text, settingIdleMessages);
      settingWelcome.parentElement.after(label);
    }
    settingGuideFrequency = document.getElementById("ola-setting-guide-frequency");
    settingMotionIntensity = document.getElementById("ola-setting-motion-intensity");
    settingReduceMotion = document.getElementById("ola-setting-reduce-motion");
    settingAutoFlight = document.getElementById("ola-setting-auto-flight");
    settingEmotionIntensity = document.getElementById("ola-setting-emotion-intensity");
    settingEmpathy = document.getElementById("ola-setting-empathy");
    settingDragReaction = document.getElementById("ola-setting-drag-reaction");
    settingDockPosition = document.getElementById("ola-setting-dock-position");
    settingStation = document.getElementById("ola-setting-station");
    settingResetPosition = document.getElementById("ola-setting-reset-position");
    settingResetPositionFooter = document.getElementById("ola-setting-reset-position-footer");
    settingReplayIntro = document.getElementById("ola-setting-replay-intro");
    settingResetDefaults = document.getElementById("ola-setting-reset-defaults");
    zzz = document.getElementById("ola-zzz");
    const renderArea = document.getElementById("ola-render-area");
    if (
      !layer || !stage || !message || !messageTitle || !messageText || !messageDetails
      || !messageActions || !messageClose || !settingsHelpGuide || !settingsTrigger
      || !restoreTrigger
      || !settingsPanel || !settingsClose || !settingSleep || !settingVisible
      || !settingHidePage || !settingSleepWarning || !settingWelcome || !settingIdleMessages
      || !settingGuideFrequency || !settingMotionIntensity || !settingReduceMotion
      || !settingAutoFlight || !settingEmotionIntensity || !settingEmpathy
      || !settingDragReaction || !settingDockPosition || !settingStation
      || !settingResetPosition || !settingResetPositionFooter || !settingReplayIntro
      || !settingResetDefaults
      || !zzz || !renderArea
    ) {
      return null;
    }
    return renderArea;
  }

  function init() {
    if (initialized) return true;
    const renderArea = bindDom();
    if (!renderArea || !window.olaStateManager || !window.olaRendererManager) return false;
    if (window.olaPagePolicy && !window.olaPagePolicy.isEnabled(window.location.pathname)) return false;

    try {
      initialized = true;
      loadSettings();
      const initialState = getStoredInitialState();
      stateManager = window.olaStateManager.create(initialState);
      rendererManager = window.olaRendererManager.create(renderArea, { defaultType: "2d" });
      rendererManager.init("2d", Object.assign({
        initialState: initialState,
        stage: stage,
      }, rendererOptions));
      unsubscribeState = stateManager.subscribe(onStateChange);
      updatePresentation(initialState);
      rendererManager.setState(initialState, rendererOptions);
      if (initialState === "SLEEP") moveToSleepCorner();
      else restorePosition();
      safeStorageSet(CHAT_ENABLED_STORAGE_KEY, "false");
      safeStorageSet(MANIFEST_VERSION_STORAGE_KEY, "2");
      applySettings();
      loadSettingsGear();
      if (window.olaUiI18n) {
        window.olaUiI18n.apply(layer);
        unsubscribeLocale = window.olaUiI18n.onLocaleChange(refreshLocaleText);
      }

      stage.addEventListener("pointerdown", onPointerDown);
      stage.addEventListener("pointermove", onPointerMove);
      stage.addEventListener("pointerup", onPointerUp);
      stage.addEventListener("pointercancel", onPointerCancel);
      stage.addEventListener("click", onStageClick);
      stage.addEventListener("pointerenter", onStagePointerEnter);
      stage.addEventListener("pointerleave", onStagePointerLeave);
      stage.addEventListener("focusin", onStageFocusIn);
      stage.addEventListener("focusout", onStageFocusOut);
      messageClose.addEventListener("click", onMessageClose);
      settingsTrigger.addEventListener("click", toggleSettings);
      settingsTrigger.addEventListener("pointerenter", onSettingsTriggerPointerEnter);
      settingsTrigger.addEventListener("pointerleave", onSettingsTriggerPointerLeave);
      restoreTrigger.addEventListener("click", restoreCompanion);
      settingsClose.addEventListener("click", closeSettings);
      settingsPanel.addEventListener("change", onSettingsChange);
      settingsPanel.addEventListener("click", onSettingsPanelClick);
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("click", onContextClick);
      document.addEventListener("pointerdown", onUserActivity, { passive: true });
      document.addEventListener("pointermove", onUserActivity, { passive: true });
      document.addEventListener("touchstart", onUserActivity, { passive: true });
      document.addEventListener("keydown", onUserActivity);
      window.addEventListener("resize", onResize);
      settingsTrigger.setAttribute("aria-expanded", "false");
      settingsPanel.hidden = true;
      settingsPanel.inert = true;
      settingsPanel.setAttribute("inert", "");
      loadContextMap();
      if (initialState === "IDLE") {
        if (!hasSeenHelp()) schedule(showHelp, 650);
        else schedule(showPageWelcome, 650);
      }
      scheduleAutoSleep();
      scheduleIdleMessage(30000);
      return true;
    } catch (error) {
      console.warn("[OLA] 초기화에 실패했지만 기존 페이지는 계속 실행됩니다.", error);
      destroy();
      return false;
    }
  }

  function destroy() {
    if (!initialized) return false;
    initialized = false;
    gearAssetRequestVersion += 1;
    clearTransitionTimers();
    clearAutoSleepTimer();
    clearGearHideTimer();
    clearBubbleTimer();
    clearIdleMessageTimer();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    contextRequestVersion += 1;
    setHoverDropZone(null);
    if (activeContext) {
      if (activeContext.zone) activeContext.zone.classList.remove("is-ola-context-active");
      activeContext = null;
    }
    if (drag && drag.captureTarget && drag.captureTarget.hasPointerCapture(drag.pointerId)) {
      drag.captureTarget.releasePointerCapture(drag.pointerId);
    }
    drag = null;

    if (stage) {
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerCancel);
      stage.removeEventListener("click", onStageClick);
      stage.removeEventListener("pointerenter", onStagePointerEnter);
      stage.removeEventListener("pointerleave", onStagePointerLeave);
      stage.removeEventListener("focusin", onStageFocusIn);
      stage.removeEventListener("focusout", onStageFocusOut);
      stage.classList.remove("is-dragging");
      stage.classList.remove("is-settings-gear-below", "is-settings-gear-right");
      stage.removeAttribute("data-ola-guide-direction");
      setDragTilt(0);
    }
    if (messageClose) messageClose.removeEventListener("click", onMessageClose);
    if (settingsTrigger) settingsTrigger.removeEventListener("click", toggleSettings);
    if (settingsTrigger) settingsTrigger.removeEventListener("pointerenter", onSettingsTriggerPointerEnter);
    if (settingsTrigger) settingsTrigger.removeEventListener("pointerleave", onSettingsTriggerPointerLeave);
    if (restoreTrigger) restoreTrigger.removeEventListener("click", restoreCompanion);
    if (settingsClose) settingsClose.removeEventListener("click", closeSettings);
    if (settingsPanel) {
      settingsPanel.removeEventListener("change", onSettingsChange);
      settingsPanel.removeEventListener("click", onSettingsPanelClick);
    }
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("click", onContextClick);
    document.removeEventListener("pointerdown", onUserActivity);
    document.removeEventListener("pointermove", onUserActivity);
    document.removeEventListener("touchstart", onUserActivity);
    document.removeEventListener("keydown", onUserActivity);
    window.removeEventListener("resize", onResize);
    if (unsubscribeState) unsubscribeState();
    unsubscribeState = null;
    if (unsubscribeLocale) unsubscribeLocale();
    unsubscribeLocale = null;
    if (rendererManager) rendererManager.destroy();
    hideMessageOnly();
    if (settingsPanel) {
      settingsPanel.hidden = true;
      settingsPanel.inert = true;
      settingsPanel.setAttribute("inert", "");
      settingsPanel.setAttribute("aria-hidden", "true");
    }
    if (settingsTrigger) {
      const gearImage = settingsTrigger.querySelector("img");
      if (gearImage) {
        gearImage.onload = null;
        gearImage.onerror = null;
      }
      settingsTrigger.hidden = true;
      settingsTrigger.setAttribute("aria-expanded", "false");
    }
    if (restoreTrigger) restoreTrigger.hidden = true;
    stateManager = null;
    rendererManager = null;
    contextLoadPromise = null;
    contextMap = {};
    lastContextKey = "";
    lastContextSignature = "";
    placementMode = "custom";
    recentDrags = [];
    lastEmotionAt.clear();
    lastAngryAt = 0;
    ignoreStageClickUntil = 0;
    return true;
  }

  window.olaBot = {
    init: init,
    destroy: destroy,
    toggle: toggle,
    sleep: sleep,
    wake: wake,
    moveTo: moveTo,
    showMessage: showMessage,
    hideMessage: function () {
      if (!closeActiveContext(true)) hideMessageOnly();
    },
    showHelp: showHelp,
    showSettings: openSettings,
    resetPosition: resetPosition,
    triggerEmotion: triggerEmotion,
    setMotion: function (motion, detail) {
      return rendererManager ? rendererManager.setMotion(motion, detail || {}) : false;
    },
    setState: function (state, context) {
      return stateManager ? stateManager.setState(state, context) : false;
    },
    getState: function () {
      return stateManager ? stateManager.getState() : null;
    },
    switchRenderer: function (type) {
      return rendererManager ? rendererManager.switchRenderer(type) : null;
    },
    getRendererType: function () {
      return rendererManager ? rendererManager.getRendererType() : null;
    },
    getDiagnostics: function () {
      return {
        initialized: initialized,
        state: stateManager ? stateManager.getState() : null,
        renderer: rendererManager ? rendererManager.getDiagnostics() : null,
        transitionTimerCount: transitionTimers.size,
        contextCount: Object.keys(contextMap).length,
        activeContextId: activeContext ? activeContext.id : null,
        lastContextKey: lastContextKey,
        lastContextSignature: lastContextSignature,
        placementMode: placementMode,
        chatEnabled: CHAT_ENABLED,
        controllerListenerCount: initialized ? 24 : 0,
        observerCount: rendererManager && rendererManager.getDiagnostics().motionEngine
          ? rendererManager.getDiagnostics().motionEngine.observerCount
          : 0,
        autoSleepTimerCount: autoSleepTimer ? 1 : 0,
        locale: window.olaUiI18n ? window.olaUiI18n.getLocale() : "ko",
        pageId: window.olaPagePolicy
          ? window.olaPagePolicy.getPageId(window.location.pathname)
          : "unknown",
        settings: Object.assign({}, settings),
        pageHidden: pageHidden,
        settingsOpen: Boolean(settingsPanel && !settingsPanel.hidden),
        settingsTriggerVisible: Boolean(settingsTrigger && !settingsTrigger.hidden),
        gearAssetStatus: gearAssetStatus,
        gearHideTimerCount: gearHideTimer ? 1 : 0,
        sleepWarningTimerCount: sleepWarningTimer ? 1 : 0,
        welcomedThisLoad: welcomedThisLoad,
      };
    },
    getSettings: function () {
      return Object.assign({}, settings);
    },
    isEnabled: function () {
      return settings.visible && !pageHidden
        && (stateManager ? !isSleepingState(stateManager.getState()) : true);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
