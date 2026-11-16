(function () {
  "use strict";

  if (window.olaUiI18n) return;

  const base = window.OLA_BASE !== undefined ? window.OLA_BASE : "";
  const APP_LOCALE_EVENT = "app:locale-change";
  const SUPPORTED = Object.freeze(["ko", "en", "zh-CN", "ja"]);
  const SITE_LOCALE_MAP = Object.freeze({
    ko: "ko",
    en: "en",
    zh: "zh-CN",
    "zh-CN": "zh-CN",
    ja: "ja",
  });
  const INTL_LOCALE_MAP = Object.freeze({
    ko: "ko-KR",
    en: "en-US",
    "zh-CN": "zh-CN",
    ja: "ja-JP",
  });
  const uiCatalogs = {};
  const contextCatalogs = {};
  const listeners = new Set();
  const diagnosedKeys = new Set();
  const SAFE_DEFAULTS = Object.freeze({
    "actions.openPage": "페이지 열기",
    "context.actions.ask": "OLA에게 질문",
    "context.form.label": "무엇이 궁금한가요?",
    "context.form.placeholder": "이 영역에 관해 질문해 주세요.",
    "context.form.submit": "질문 보내기",
    "context.form.cancel": "취소",
    "context.form.empty": "질문을 입력해 주세요.",
    "context.form.loading": "답변을 확인하고 있어요.",
    "context.form.unavailable": "지금은 AI 상담을 연결할 수 없어요. 위의 고정 안내는 계속 확인할 수 있어요.",
    "context.form.failed": "AI 답변을 불러오지 못했어요. 위의 고정 안내를 참고해 주세요.",
    "messages.helpTitle": "올라 사용 안내",
    "messages.helpSummary": "가슴 코어를 누르면 저를 깨우거나 쉬게 할 수 있어요.",
    "messages.sleepWarningTitle": "올라가 졸려요",
    "messages.sleepWarning": "잠시 후 쉬고 있을게요.",
    "messages.sleep": "잠시 쉬고 있을게요.",
    "messages.wake": "다시 함께 살펴볼게요!",
    "greetings.title": "반가워요!",
    "greetings.home": "안녕하세요! 여기는 홈이에요.",
    "greetings.safety": "여기는 생활안전 페이지예요.",
    "greetings.emergency": "여기는 응급 페이지예요.",
    "greetings.disaster": "여기는 재난 페이지예요.",
    "emotions.angry.title": "올라가 어질어질해요",
    "emotions.angry.message": "앗, 조금만 살살 움직여 주세요!",
    "accessibility.companion": "올라 AI 반려 로봇",
    "accessibility.robotAlt": "올라 안내 로봇",
    "accessibility.openSettings": "올라 설정 열기",
    "accessibility.closeSettings": "올라 설정 닫기",
    "accessibility.restoreCompanion": "올라 다시 표시",
    "accessibility.wake": "올라 깨우기",
    "accessibility.sleep": "올라 쉬게 하기",
    "accessibility.move": "올라 이동",
    "accessibility.closeDescription": "올라 설명 닫기",
  });

  const TEXT_BINDINGS = Object.freeze([
    ["#ola-settings-panel header strong", "settings.title"],
    ["#ola-settings-basic-title", "settings.sections.basic"],
    ["#ola-settings-sleep-title", "settings.sections.autoSleep"],
    ["#ola-settings-guide-title", "settings.sections.greetingGuide"],
    ["#ola-settings-motion-title", "settings.sections.motion"],
    ["#ola-settings-emotion-title", "settings.sections.emotion"],
    ["#ola-settings-position-title", "settings.sections.position"],
    ["#ola-settings-help-title", "help.title"],
    ["#ola-setting-hide-page", "actions.hideOnPage"],
    ["#ola-restore-trigger", "actions.restoreCompanion"],
    ["#ola-setting-reset-position", "actions.resetPosition"],
    ["#ola-settings-help-guide", "actions.viewGuide"],
    ["#ola-setting-replay-intro", "actions.replayIntro"],
    ["#ola-setting-reset-position-footer", "actions.resetPosition"],
    ["#ola-setting-reset-defaults", "actions.restoreDefaults"],
  ]);

  const FIELD_BINDINGS = Object.freeze([
    ["ola-setting-visible", "settings.fields.visible"],
    ["ola-setting-sleep", "settings.fields.sleepTimeout"],
    ["ola-setting-sleep-warning", "settings.fields.sleepWarning"],
    ["ola-setting-welcome", "settings.fields.welcome"],
    ["ola-setting-idle-messages", "settings.fields.idleMessages"],
    ["ola-setting-guide-frequency", "settings.fields.guideFrequency"],
    ["ola-setting-motion-intensity", "settings.fields.motionIntensity"],
    ["ola-setting-reduce-motion", "settings.fields.reduceMotion"],
    ["ola-setting-auto-flight", "settings.fields.autoFlight"],
    ["ola-setting-emotion-intensity", "settings.fields.emotionExpression"],
    ["ola-setting-empathy", "settings.fields.empathy"],
    ["ola-setting-drag-reaction", "settings.fields.repeatDrag"],
    ["ola-setting-dock-position", "settings.fields.dockPosition"],
    ["ola-setting-station", "settings.fields.station"],
  ]);

  const OPTION_BINDINGS = Object.freeze([
    ["ola-setting-sleep", "60000", "settings.options.oneMinute"],
    ["ola-setting-sleep", "300000", "settings.options.fiveMinutesDefault"],
    ["ola-setting-sleep", "3600000", "settings.options.oneHour"],
    ["ola-setting-sleep", "0", "settings.options.none"],
    ["ola-setting-guide-frequency", "minimal", "settings.options.minimal"],
    ["ola-setting-guide-frequency", "normal", "settings.options.normal"],
    ["ola-setting-guide-frequency", "active", "settings.options.active"],
    ["ola-setting-motion-intensity", "minimal", "settings.options.minimal"],
    ["ola-setting-motion-intensity", "normal", "settings.options.normal"],
    ["ola-setting-motion-intensity", "active", "settings.options.active"],
    ["ola-setting-reduce-motion", "system", "settings.options.system"],
    ["ola-setting-reduce-motion", "always", "settings.options.always"],
    ["ola-setting-reduce-motion", "never", "settings.options.never"],
    ["ola-setting-emotion-intensity", "minimal", "settings.options.minimal"],
    ["ola-setting-emotion-intensity", "normal", "settings.options.normal"],
    ["ola-setting-emotion-intensity", "rich", "settings.options.rich"],
    ["ola-setting-dock-position", "right", "settings.options.right"],
    ["ola-setting-dock-position", "left", "settings.options.left"],
  ]);

  function normalizeLocale(locale) {
    return SITE_LOCALE_MAP[String(locale || "")] || "ko";
  }

  function getLocale() {
    if (window.olaI18n && typeof window.olaI18n.getLocale === "function") {
      return normalizeLocale(window.olaI18n.getLocale());
    }
    return "ko";
  }

  function getIntlLocale() {
    return INTL_LOCALE_MAP[getLocale()] || "ko-KR";
  }

  function getPath(source, path) {
    return String(path || "").split(".").reduce(function (value, part) {
      return value && Object.prototype.hasOwnProperty.call(value, part)
        ? value[part]
        : undefined;
    }, source);
  }

  function diagnoseMissing(key) {
    if (window.OLA_DEBUG_I18N !== true || diagnosedKeys.has(key)) return;
    diagnosedKeys.add(key);
    console.warn("[OLA i18n] 번역 key를 찾지 못했습니다.", key);
  }

  function interpolate(text, variables) {
    let output = String(text);
    Object.keys(variables || {}).forEach(function (name) {
      output = output.replace(
        new RegExp("{{" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "}}", "g"),
        String(variables[name])
      );
    });
    return output;
  }

  function getUiValue(key) {
    const locale = getLocale();
    const current = getPath(uiCatalogs[locale] && uiCatalogs[locale].ola, key);
    if (current !== undefined && current !== null) return current;
    return getPath(uiCatalogs.ko && uiCatalogs.ko.ola, key);
  }

  function t(key, variables, safeFallback) {
    const value = getUiValue(key);
    if (typeof value === "string" && value.trim()) return interpolate(value, variables);
    diagnoseMissing(key);
    const fallback = SAFE_DEFAULTS[key]
      || (typeof safeFallback === "string" && safeFallback.trim() ? safeFallback : "");
    return typeof fallback === "string" ? interpolate(fallback, variables) : "";
  }

  function list(key, safeFallback) {
    const value = getUiValue(key);
    if (Array.isArray(value)) return value.map(String);
    diagnoseMissing(key);
    return Array.isArray(safeFallback) ? safeFallback.map(String) : [];
  }

  function findOne(scope, selector) {
    if (!scope) return null;
    if (scope.matches && scope.matches(selector)) return scope;
    return scope.querySelector ? scope.querySelector(selector) : null;
  }

  function findAll(scope, selector) {
    const matches = [];
    if (!scope) return matches;
    if (scope.matches && scope.matches(selector)) matches.push(scope);
    if (scope.querySelectorAll) matches.push.apply(matches, scope.querySelectorAll(selector));
    return matches;
  }

  function setText(element, key) {
    if (!element) return;
    const translated = t(key, null, element.textContent || "");
    if (translated) element.textContent = translated;
  }

  function apply(root) {
    const scope = root || document;
    TEXT_BINDINGS.forEach(function (binding) {
      setText(findOne(scope, binding[0]), binding[1]);
    });
    FIELD_BINDINGS.forEach(function (binding) {
      const control = findOne(scope, "#" + binding[0]);
      const label = control && control.closest("label");
      setText(label && label.querySelector("span"), binding[1]);
    });
    OPTION_BINDINGS.forEach(function (binding) {
      const select = findOne(scope, "#" + binding[0]);
      const option = select && select.querySelector('option[value="' + binding[1] + '"]');
      setText(option, binding[2]);
    });

    const helpList = findOne(scope, "#ola-settings-help-title + ul");
    if (helpList) {
      const fallbackItems = Array.from(helpList.querySelectorAll("li")).map(function (item) {
        return item.textContent;
      });
      const translatedItems = list("help.items", fallbackItems);
      if (translatedItems.length) {
        helpList.replaceChildren.apply(
          helpList,
          translatedItems.map(function (text) {
            const item = document.createElement("li");
            item.textContent = text;
            return item;
          })
        );
      }
    }

    const layer = findOne(scope, "#ola-layer");
    if (layer) layer.setAttribute("aria-label", t("accessibility.companion", null, layer.getAttribute("aria-label") || "OLA"));
    const messageClose = findOne(scope, "#ola-message-close");
    if (messageClose) {
      const label = t("accessibility.closeDescription", null, "Close");
      messageClose.setAttribute("aria-label", label);
      messageClose.title = label;
    }
    const settingsTrigger = findOne(scope, "#ola-settings-trigger");
    if (settingsTrigger) {
      const label = t("accessibility.openSettings", null, "OLA settings");
      settingsTrigger.setAttribute("aria-label", label);
      settingsTrigger.title = label;
    }
    const restoreTrigger = findOne(scope, "#ola-restore-trigger");
    if (restoreTrigger) {
      const label = t("accessibility.restoreCompanion", null, "Show OLA");
      restoreTrigger.setAttribute("aria-label", label);
      restoreTrigger.title = label;
    }
    const settingsPanel = findOne(scope, "#ola-settings-panel");
    if (settingsPanel) settingsPanel.setAttribute("aria-label", t("settings.title", null, "OLA"));
    const settingsClose = findOne(scope, "#ola-settings-close");
    if (settingsClose) {
      const label = t("accessibility.closeSettings", null, "Close");
      settingsClose.setAttribute("aria-label", label);
      settingsClose.title = label;
    }

    findAll(scope, ".ola-reference-body").forEach(function (image) {
      image.alt = t("accessibility.robotAlt", null, image.alt || "OLA");
    });
    findAll(scope, ".ola-reference-character, .ola-character").forEach(function (character) {
      character.setAttribute("aria-label", t("accessibility.companion", null, "OLA"));
    });
    findAll(scope, "#ola-render-area canvas").forEach(function (canvas) {
      canvas.setAttribute("aria-label", t("accessibility.companion", null, "OLA"));
    });
    findAll(scope, ".ola-drag-hit").forEach(function (hit) {
      const label = t("accessibility.move", null, "Move OLA");
      hit.setAttribute("aria-label", label);
      hit.title = label;
    });
    const stage = findOne(scope, "#ola-stage") || document.getElementById("ola-stage");
    const sleeping = Boolean(stage && (
      stage.dataset.olaState === "SLEEP"
      || stage.dataset.olaState === "SLEEP_PREPARE"
    ));
    findAll(scope, ".ola-core-toggle").forEach(function (core) {
      const label = t(sleeping ? "accessibility.wake" : "accessibility.sleep", null, "OLA");
      core.setAttribute("aria-label", label);
      core.title = label;
    });
    return getLocale();
  }

  function mergeContextMaps() {
    const fallback = contextCatalogs.ko || {};
    const current = contextCatalogs[getLocale()] || {};
    const merged = {};
    new Set(Object.keys(fallback).concat(Object.keys(current))).forEach(function (contextId) {
      merged[contextId] = Object.assign({}, fallback[contextId] || {}, current[contextId] || {});
    });
    return merged;
  }

  function getContextMap() {
    return mergeContextMaps();
  }

  function getContext(contextId) {
    return mergeContextMaps()[contextId] || null;
  }

  function emit(locale, reason) {
    listeners.forEach(function (listener) {
      try {
        listener(locale, reason);
      } catch (error) {
        if (window.OLA_DEBUG_I18N === true) {
          console.warn("[OLA i18n] 언어 변경 listener를 처리하지 못했습니다.", error);
        }
      }
    });
  }

  function onLocaleChange(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.add(listener);
    return function () {
      listeners.delete(listener);
    };
  }

  function loadJson(path) {
    return fetch(base + path, {
      credentials: "same-origin",
      cache: "no-store",
    }).then(function (response) {
      if (!response.ok) throw new Error(path + " (" + response.status + ")");
      return response.json();
    });
  }

  const loads = [];
  SUPPORTED.forEach(function (locale) {
    loads.push(
      loadJson("assets/ola/i18n/" + locale + ".json")
        .then(function (data) {
          uiCatalogs[locale] = data;
        })
        .catch(function (error) {
          if (window.OLA_DEBUG_I18N === true) console.warn("[OLA i18n] UI 번역 로드 실패", error);
        })
    );
    loads.push(
      loadJson("assets/ola/context/" + locale + ".json")
        .then(function (data) {
          contextCatalogs[locale] = data;
        })
        .catch(function (error) {
          if (window.OLA_DEBUG_I18N === true) console.warn("[OLA i18n] context 번역 로드 실패", error);
        })
    );
  });

  const ready = Promise.all(loads).then(function () {
    apply(document.getElementById("ola-layer") || document);
    emit(getLocale(), "ready");
    return true;
  });

  window.addEventListener(APP_LOCALE_EVENT, function (event) {
    const announcedLocale = normalizeLocale(event && event.detail && event.detail.locale);
    const locale = getLocale();
    if (window.OLA_DEBUG_I18N === true && announcedLocale !== locale) {
      console.warn("[OLA i18n] 사이트 locale과 변경 이벤트가 일치하지 않습니다.", {
        siteLocale: locale,
        eventLocale: announcedLocale,
      });
    }
    apply(document.getElementById("ola-layer") || document);
    emit(locale, APP_LOCALE_EVENT);
  });

  window.olaUiI18n = Object.freeze({
    SUPPORTED: SUPPORTED,
    LOCALE_EVENT: APP_LOCALE_EVENT,
    ready: ready,
    normalizeLocale: normalizeLocale,
    getLocale: getLocale,
    getIntlLocale: getIntlLocale,
    t: t,
    list: list,
    apply: apply,
    getContext: getContext,
    getContextMap: getContextMap,
    onLocaleChange: onLocaleChange,
  });
})();
