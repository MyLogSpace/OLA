(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const APPROVED_AUDIT_STATUSES = new Set(["usable", "auto-usable", "manual-approved"]);

  function translate(key, safeFallback) {
    return window.olaUiI18n
      ? window.olaUiI18n.t(key, null, safeFallback)
      : safeFallback;
  }

  function svgElement(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes || {}).forEach(function (name) {
      element.setAttribute(name, attributes[name]);
    });
    return element;
  }

  function createReferenceOverlay() {
    const overlay = svgElement("svg", {
      class: "ola-reference-overlay",
      viewBox: "0 0 1536 1024",
      "aria-hidden": "true",
      focusable: "false",
    });

    const eyelids = svgElement("g", { class: "ola-reference-eyelids" });
    eyelids.appendChild(svgElement("ellipse", { cx: "686", cy: "301", rx: "39", ry: "57" }));
    eyelids.appendChild(svgElement("ellipse", { cx: "850", cy: "301", rx: "39", ry: "57" }));
    const closedEyes = svgElement("g", { class: "ola-reference-closed-eyes" });
    closedEyes.appendChild(svgElement("path", { d: "M652 303 Q686 327 720 303" }));
    closedEyes.appendChild(svgElement("path", { d: "M816 303 Q850 327 884 303" }));
    eyelids.appendChild(closedEyes);
    overlay.appendChild(eyelids);

    overlay.appendChild(svgElement("circle", {
      class: "ola-reference-heart-glow", cx: "770", cy: "527", r: "38",
    }));

    const sparkle = svgElement("g", { class: "ola-reference-sparkle" });
    sparkle.appendChild(svgElement("path", { d: "M1010 258 v46 M987 281 h46" }));
    sparkle.appendChild(svgElement("circle", { cx: "1050", cy: "238", r: "8" }));
    overlay.appendChild(sparkle);

    const zzz = svgElement("g", { class: "ola-reference-zzz" });
    zzz.appendChild(svgElement("path", { d: "M1010 250 h35 l-35 42 h35" }));
    zzz.appendChild(svgElement("path", { d: "M1060 192 h45 l-45 54 h45" }));
    overlay.appendChild(zzz);

    const alert = svgElement("g", { class: "ola-reference-alert" });
    alert.appendChild(svgElement("path", { d: "M1032 225 l18 -58 18 58" }));
    alert.appendChild(svgElement("circle", { cx: "1050", cy: "250", r: "7" }));
    overlay.appendChild(alert);
    return overlay;
  }

  function createDragHitRegions() {
    const regions = document.createElement("div");
    regions.className = "ola-drag-hit-regions";
    ["head", "torso", "arm-left", "arm-right", "leg-left", "leg-right"].forEach(function (part) {
      const hit = document.createElement("div");
      hit.className = "ola-drag-hit ola-drag-hit--" + part;
      hit.dataset.olaDragPart = part;
      if (part === "torso") {
        hit.tabIndex = 0;
        hit.setAttribute("role", "button");
        hit.setAttribute("aria-label", translate("accessibility.move", "OLA"));
      } else {
        hit.setAttribute("aria-hidden", "true");
      }
      regions.appendChild(hit);
    });
    return regions;
  }

  function createRenderer(renderArea) {
    let referenceImage = null;
    let svg = null;
    let fallbackImage = null;
    let motionEngine = null;
    let frameLayers = [];
    let activeFrameIndex = 0;
    let frameRequestVersion = 0;
    let frameSwapRaf = 0;
    let frameTimer = null;
    let motionManifest = null;
    let motionManifestVersion = null;
    let motionManifestPath = "";
    let motionAssetBase = "";
    let activeMotionName = "reference";
    let activePhaseMotion = "";
    let activeExpressionMotion = "";
    let activeMotionDetail = {};
    let preloadedFrames = [];
    const preloadStatus = new Map();
    const failedFrameSources = new Set();
    let lastMotionDecision = {
      state: "IDLE",
      reason: "init",
      assetPath: "",
      auditStatus: "fallback",
      preloadStatus: "not-requested",
      rendererApplied: false,
      fallback: true,
      fallbackReason: "manifest-not-loaded",
      transitionDuration: 0,
    };
    let idleSource = "";
    let svgSource = "";
    let referenceSource = "";
    let currentState = "IDLE";
    let loadVersion = 0;
    let destroyed = false;
    let initOptions = {};

    function getStage() {
      return initOptions.stage || renderArea.closest("#ola-stage");
    }

    function isSleepingState(state) {
      return state === "SLEEP" || state === "SLEEP_PREPARE";
    }

    function isApprovedFrame(frame) {
      return Boolean(frame && frame.src && APPROVED_AUDIT_STATUSES.has(frame.auditStatus));
    }

    function createCoreToggle(isFallback) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ola-core-toggle" + (isFallback ? " ola-core-toggle--fallback" : "");
      button.setAttribute("aria-describedby", "ola-message-text");
      updateCoreToggle(button);
      return button;
    }

    function updateCoreToggle(button) {
      const target = button || renderArea.querySelector(".ola-core-toggle");
      if (!target) return;
      const sleeping = isSleepingState(currentState);
      const label = translate(
        sleeping ? "accessibility.wake" : "accessibility.sleep",
        "OLA"
      );
      target.setAttribute("aria-pressed", String(!sleeping));
      target.setAttribute("aria-label", label);
      target.title = label;
    }

    function clearMotionEngine() {
      if (motionEngine) motionEngine.destroy();
      motionEngine = null;
    }

    function clearFrameTimer() {
      if (frameTimer !== null) window.clearTimeout(frameTimer);
      frameTimer = null;
    }

    function resolveFrameSource(source) {
      if (!source) return "";
      return motionAssetBase + String(source).replace(/^\.?\//, "");
    }

    function getMotionName(state) {
      const mapping = {
        WAKE_UP: "wake",
        IDLE: "idle",
        FOLLOW: "follow",
        POINT: "guide",
        GUIDE: "guide",
        THINK: "think",
        HAPPY: "happy",
        WORRIED: "worried",
        ALERT: "alert",
        ANGRY: "angry",
        SAD: "sad",
        SLEEPY: "sleep-prepare",
        SLEEP_PREPARE: "sleep-prepare",
        SLEEP: "sleep",
        TAKEOFF_PREPARE: "takeoff-prepare",
        FLY_START: "fly-cruise",
        FLY_CRUISE: "fly-cruise",
        FLY_TURN: "fly-turn",
        FLY_BRAKE: "fly-brake",
        LANDING: "landing",
      };
      return mapping[state] || "idle";
    }

    function getCrossfadeDuration(duration) {
      const reduced = window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const normalized = Math.max(120, Math.min(Number(duration) || 180, 240));
      return reduced ? Math.min(normalized, 80) : normalized;
    }

    function transitionToFrame(source, crossfade, callback) {
      if (!frameLayers.length || !source || destroyed) {
        if (typeof callback === "function") callback(false);
        return;
      }
      if (frameSwapRaf) {
        cancelAnimationFrame(frameSwapRaf);
        frameSwapRaf = 0;
      }
      const active = frameLayers[activeFrameIndex];
      if (active && active.dataset.olaSource === source) {
        if (typeof callback === "function") callback(true);
        return;
      }

      const incomingIndex = activeFrameIndex === 0 ? 1 : 0;
      const incoming = frameLayers[incomingIndex];
      const requestVersion = ++frameRequestVersion;
      incoming.onload = function () {
        if (destroyed || requestVersion !== frameRequestVersion) return;
        incoming.onload = null;
        incoming.onerror = null;
        incoming.dataset.olaSource = source;
        incoming.style.setProperty("--ola-frame-crossfade", getCrossfadeDuration(crossfade) + "ms");
        if (active) active.style.setProperty("--ola-frame-crossfade", getCrossfadeDuration(crossfade) + "ms");
        frameSwapRaf = requestAnimationFrame(function () {
          frameSwapRaf = 0;
          if (destroyed || requestVersion !== frameRequestVersion) return;
          incoming.classList.add("is-active");
          incoming.setAttribute("aria-hidden", "false");
          if (active) {
            active.classList.remove("is-active");
            active.setAttribute("aria-hidden", "true");
          }
          activeFrameIndex = incomingIndex;
          if (typeof callback === "function") callback(true);
        });
      };
      incoming.onerror = function () {
        if (destroyed || requestVersion !== frameRequestVersion) return;
        incoming.onload = null;
        incoming.onerror = null;
        failedFrameSources.add(source);
        console.warn("[OLA] 감사된 모션 프레임을 불러오지 못해 공식 PNG를 유지합니다.", source);
        if (typeof callback === "function") callback(false);
      };
      incoming.src = source;
    }

    function setFramePresentation(isApproved, isFallback) {
      const stage = getStage();
      if (!stage) return;
      stage.classList.toggle("has-ola-approved-frame", Boolean(isApproved));
      stage.classList.toggle("is-ola-motion-fallback", Boolean(isFallback));
    }

    function recordMotionDecision(values) {
      lastMotionDecision = Object.assign({
        state: currentState,
        reason: "state",
        assetPath: "",
        auditStatus: "fallback",
        preloadStatus: "not-requested",
        rendererApplied: false,
        fallback: false,
        fallbackReason: "",
        transitionDuration: 0,
        motion: activeMotionName,
        phase: activePhaseMotion || null,
      }, values || {});
      if (window.OLA_DEBUG_MOTION === true) {
        console.debug("[OLA motion]", Object.assign({}, lastMotionDecision));
      }
    }

    function useReferenceFallback(motionName, motion, reason, detail) {
      clearFrameTimer();
      activeMotionName = "reference";
      setFramePresentation(false, Boolean(activePhaseMotion));
      transitionToFrame(referenceSource, motion ? motion.crossfade : 120);
      recordMotionDecision({
        state: currentState,
        reason: detail.reason || "motion-fallback",
        assetPath: referenceSource,
        auditStatus: "fallback",
        preloadStatus: referenceImage && referenceImage.naturalWidth ? "loaded" : "pending",
        rendererApplied: Boolean(referenceSource),
        fallback: true,
        fallbackReason: reason,
        transitionDuration: motion ? motion.crossfade : 120,
        motion: motionName,
      });
    }

    function playMotion(motionName, detail) {
      detail = detail || {};
      clearFrameTimer();
      const motion = motionManifest && motionManifest.motions
        ? motionManifest.motions[motionName]
        : null;
      let frames = motion && Array.isArray(motion.frames)
        ? motion.frames.filter(isApprovedFrame)
        : [];
      if (detail.direction) {
        const directional = frames.filter(function (frame) {
          return !frame.direction || frame.direction === detail.direction;
        });
        if (directional.length) frames = directional;
      }
      if (!motionManifest) {
        useReferenceFallback(motionName, null, "manifest-not-loaded", detail);
        return false;
      }
      if (!frames.length) {
        useReferenceFallback(motionName, motion, "no-approved-frame", detail);
        return false;
      }

      activeMotionName = motionName;
      let index = 0;
      const showNext = function () {
        if (destroyed || activeMotionName !== motionName) return;
        const frame = frames[index];
        const source = resolveFrameSource(frame.src);
        if (failedFrameSources.has(source)) {
          useReferenceFallback(motionName, motion, "asset-load-failed", detail);
          return;
        }
        recordMotionDecision({
          state: currentState,
          reason: detail.reason || "motion-request",
          assetPath: source,
          auditStatus: frame.auditStatus,
          preloadStatus: preloadStatus.get(source) || "pending",
          rendererApplied: false,
          fallback: false,
          fallbackReason: "",
          transitionDuration: motion.crossfade,
          motion: motionName,
        });
        transitionToFrame(source, motion.crossfade, function (loaded) {
          if (!loaded) {
            if (!destroyed && activeMotionName === motionName) {
              useReferenceFallback(motionName, motion, "asset-load-failed", detail);
            }
            return;
          }
          if (destroyed || activeMotionName !== motionName) return;
          setFramePresentation(true, false);
          recordMotionDecision({
            state: currentState,
            reason: detail.reason || "motion-applied",
            assetPath: source,
            auditStatus: frame.auditStatus,
            preloadStatus: preloadStatus.get(source) || "loaded",
            rendererApplied: true,
            fallback: false,
            fallbackReason: "",
            transitionDuration: motion.crossfade,
            motion: motionName,
          });
          const hasNext = index + 1 < frames.length;
          if (!hasNext && (!motion.loop || frames.length === 1)) return;
          frameTimer = window.setTimeout(function () {
            frameTimer = null;
            index = hasNext ? index + 1 : 0;
            showNext();
          }, Math.max(80, Number(frame.duration) || 800));
        });
      };
      showNext();
      return true;
    }

    function playActiveMotion(reason, detail) {
      activeMotionDetail = Object.assign({}, detail || {}, { reason: reason || "state" });
      return playMotion(
        activePhaseMotion || activeExpressionMotion || getMotionName(currentState),
        activeMotionDetail
      );
    }

    function setMovementMotion(phase, detail) {
      const motionName = getMotionName(phase);
      activePhaseMotion = motionName;
      activeMotionDetail = Object.assign({}, detail || {}, {
        reason: (detail && detail.reason) || "movement-phase",
      });
      return playMotion(motionName, activeMotionDetail);
    }

    function completeMovement() {
      activePhaseMotion = "";
      activeMotionDetail = {};
      playActiveMotion("movement-complete");
    }

    function preloadManifestFrames(manifest) {
      preloadedFrames.forEach(function (image) {
        image.onload = null;
        image.onerror = null;
      });
      preloadedFrames = [];
      preloadStatus.clear();
      const promises = [];
      Object.keys(manifest.motions || {}).forEach(function (motionName) {
        const motion = manifest.motions[motionName];
        (motion.frames || []).forEach(function (frame) {
          if (!isApprovedFrame(frame)) return;
          const source = resolveFrameSource(frame.src);
          const image = new Image();
          preloadedFrames.push(image);
          preloadStatus.set(source, "pending");
          promises.push(new Promise(function (resolve) {
            image.onload = function () {
              image.onload = null;
              image.onerror = null;
              preloadStatus.set(source, "loaded");
              resolve(true);
            };
            image.onerror = function () {
              image.onload = null;
              image.onerror = null;
              failedFrameSources.add(source);
              preloadStatus.set(source, "failed");
              resolve(false);
            };
            image.src = source;
          }));
        });
      });
      return Promise.all(promises);
    }

    function loadMotionManifest(version) {
      if (!motionManifestPath || typeof window.fetch !== "function") return;
      fetch(motionManifestPath, { credentials: "same-origin", cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (manifest) {
          if (destroyed || version !== loadVersion) return;
          if (!manifest || Number(manifest.version) !== 2 || !manifest.motions) {
            throw new Error("지원하지 않는 manifest 형식");
          }
          motionManifest = manifest;
          motionManifestVersion = Number(manifest.version);
          return preloadManifestFrames(manifest);
        })
        .then(function () {
          if (!destroyed && version === loadVersion) playActiveMotion("manifest-loaded", activeMotionDetail);
        })
        .catch(function (error) {
          if (destroyed || version !== loadVersion) return;
          motionManifest = null;
          motionManifestVersion = null;
          console.warn("[OLA] 모션 manifest를 사용할 수 없어 공식 PNG 모션을 유지합니다.", error.message || error);
        });
    }

    function activateMotion(root) {
      clearMotionEngine();
      if (!window.ola2DMotionEngine) {
        throw new Error("OLA MotionEngine이 로드되지 않았습니다.");
      }
      motionEngine = window.ola2DMotionEngine.create(root, {
        initialState: currentState,
        stage: getStage(),
        onMovementPhase: setMovementMotion,
        onMovementComplete: completeMovement,
      });
    }

    function createWebpFallback() {
      const image = document.createElement("img");
      image.alt = translate("accessibility.robotAlt", "OLA");
      image.draggable = false;
      image.decoding = "async";
      image.className = "ola-2d-fallback";
      if (idleSource) image.src = idleSource;
      fallbackImage = image;
      renderArea.replaceChildren(image, createDragHitRegions(), createCoreToggle(true));
      const stage = getStage();
      if (stage) stage.classList.remove("has-ola-reference", "has-ola-svg");
    }

    function sanitizeSvgText(text) {
      const parser = new DOMParser();
      const documentNode = parser.parseFromString(text, "image/svg+xml");
      if (documentNode.querySelector("parsererror, script, image")) {
        throw new Error("안전하지 않거나 올바르지 않은 SVG입니다.");
      }
      const inlineSvg = documentNode.documentElement;
      inlineSvg.querySelectorAll("[href], [xlink\\:href]").forEach(function (element) {
        const value = element.getAttribute("href") || element.getAttribute("xlink:href") || "";
        if (/^(?:https?:|data:|\/\/)/i.test(value)) element.remove();
      });
      return document.importNode(inlineSvg, true);
    }

    function loadSvgFallback(version, reason) {
      if (reason) console.warn("[OLA] 공식 PNG를 불러오지 못해 SVG로 전환합니다.", reason);
      if (!svgSource || typeof window.fetch !== "function") {
        createWebpFallback();
        return;
      }
      fetch(svgSource, { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.text();
        })
        .then(function (text) {
          if (destroyed || version !== loadVersion) return;
          const inlineSvg = sanitizeSvgText(text);
          inlineSvg.classList.add("ola-2d-svg");
          inlineSvg.setAttribute("focusable", "false");
          renderArea.replaceChildren(inlineSvg, createDragHitRegions(), createCoreToggle(true));
          referenceImage = null;
          fallbackImage = null;
          svg = inlineSvg;
          const stage = getStage();
          if (stage) {
            stage.classList.remove("has-ola-reference");
            stage.classList.add("has-ola-svg");
          }
          activateMotion(svg);
        })
        .catch(function (error) {
          if (destroyed || version !== loadVersion) return;
          console.warn("[OLA] SVG도 불러오지 못해 WEBP로 표시합니다.", error.message || error);
          createWebpFallback();
        });
    }

    function createReferenceCharacter(version) {
      const character = document.createElement("div");
      character.className = "ola-reference-character";
      character.setAttribute("role", "group");
      character.setAttribute(
        "aria-label",
        translate("accessibility.companion", "OLA")
      );

      const shadow = document.createElement("div");
      shadow.className = "ola-reference-shadow";
      const motion = document.createElement("div");
      motion.className = "ola-reference-motion";
      const tracker = document.createElement("div");
      tracker.className = "ola-reference-tracker";
      const asset = document.createElement("div");
      asset.className = "ola-reference-asset";
      const frame = document.createElement("div");
      frame.className = "ola-reference-frame";
      const image = document.createElement("img");
      image.className = "ola-reference-body ola-motion-frame is-active";
      image.alt = "";
      image.draggable = false;
      image.decoding = "async";
      image.onload = function () {
        if (destroyed || version !== loadVersion) return;
        image.onload = null;
        image.onerror = null;
        image.dataset.olaSource = referenceSource;
        const stage = getStage();
        if (stage) {
          stage.classList.remove("has-ola-svg");
          stage.classList.add("has-ola-reference");
        }
        try {
          activateMotion(character);
          playActiveMotion("reference-ready", activeMotionDetail);
        } catch (error) {
          loadSvgFallback(version, error.message || error);
        }
      };
      image.onerror = function () {
        if (destroyed || version !== loadVersion) return;
        loadSvgFallback(version, "PNG 이미지 로드 실패");
      };
      image.src = referenceSource;
      referenceImage = image;

      const nextImage = document.createElement("img");
      nextImage.className = "ola-reference-body ola-motion-frame";
      nextImage.alt = "";
      nextImage.draggable = false;
      nextImage.decoding = "async";
      nextImage.setAttribute("aria-hidden", "true");
      const frameStack = document.createElement("div");
      frameStack.className = "ola-motion-frame-stack";
      frameStack.append(image, nextImage);
      frameLayers = [image, nextImage];
      activeFrameIndex = 0;

      frame.append(
        frameStack,
        createReferenceOverlay(),
        createDragHitRegions(),
        createCoreToggle(false)
      );
      asset.appendChild(frame);
      tracker.appendChild(asset);
      motion.appendChild(tracker);
      character.append(shadow, motion);
      renderArea.replaceChildren(character);
      if (image.complete) {
        queueMicrotask(function () {
          if (destroyed || version !== loadVersion) return;
          const handler = image.naturalWidth > 0 ? image.onload : image.onerror;
          if (typeof handler === "function") handler();
        });
      }
    }

    return {
      init(options) {
        initOptions = options || {};
        destroyed = false;
        currentState = initOptions.initialState || "IDLE";
        const states = initOptions.states || {};
        idleSource = states.IDLE || states.idle || "";
        svgSource = initOptions.svgPath || "";
        referenceSource = initOptions.referenceImagePath || "";
        motionManifestPath = initOptions.motionManifestPath || "";
        motionAssetBase = initOptions.motionAssetBase || "";
        renderArea.classList.remove("is-renderer-inactive");
        loadVersion += 1;
        if (referenceSource) {
          createReferenceCharacter(loadVersion);
          loadMotionManifest(loadVersion);
        }
        else loadSvgFallback(loadVersion, "공식 PNG 경로 없음");
        return true;
      },
      setState(state) {
        currentState = String(state || "IDLE").toUpperCase();
        activeExpressionMotion = "";
        updateCoreToggle();
        if (motionEngine) motionEngine.setState(currentState);
        playActiveMotion("state-change");
      },
      setExpression(expression) {
        const normalized = String(expression || "idle").toLowerCase();
        const mapping = {
          happy: "happy",
          love: "happy",
          success: "happy",
          think: "think",
          curious: "think",
          worried: "worried",
          alert: "alert",
          angry: "angry",
          sad: "sad",
          sleepy: "sleep-prepare",
          wake: "wake",
          talk: "guide",
          gentle: "guide",
        };
        activeExpressionMotion = currentState === "GUIDE"
          ? ""
          : mapping[normalized] || "";
        if (motionEngine) motionEngine.setExpression(normalized);
        if (activePhaseMotion) return true;
        playActiveMotion("expression-" + normalized);
        return true;
      },
      setMotion(motion, detail) {
        const normalized = String(motion || "").toUpperCase();
        if (!normalized || normalized === "COMPLETE" || normalized === "RESET") {
          completeMovement();
          return true;
        }
        return setMovementMotion(normalized, detail || { reason: "manual-motion" });
      },
      moveTo(x, y, duration) {
        return motionEngine ? motionEngine.moveTo(x, y, duration) : false;
      },
      dock() {
        return motionEngine ? motionEngine.dock() : false;
      },
      cancelMovement(reason) {
        return motionEngine && typeof motionEngine.cancelMovement === "function"
          ? motionEngine.cancelMovement(reason)
          : false;
      },
      resetPlacement(policy) {
        return motionEngine && typeof motionEngine.resetPlacement === "function"
          ? motionEngine.resetPlacement(policy)
          : false;
      },
      getDiagnostics() {
        return {
          mode: referenceImage && motionEngine ? "reference-png" : svg ? "svg" : "webp",
          state: currentState,
          expression: motionEngine ? motionEngine.getExpression() : null,
          missingGroups: motionEngine ? motionEngine.getMissingGroups() : [],
          motionManifestVersion: motionManifestVersion,
          activeMotion: activeMotionName,
          frameLayerCount: frameLayers.length,
          frameSwapRafActive: frameSwapRaf !== 0,
          frameTimerActive: frameTimer !== null,
          failedFrameCount: failedFrameSources.size,
          preloadLoadedCount: Array.from(preloadStatus.values()).filter(function (status) {
            return status === "loaded";
          }).length,
          preloadFailedCount: Array.from(preloadStatus.values()).filter(function (status) {
            return status === "failed";
          }).length,
          movementMotion: activePhaseMotion || null,
          expressionMotion: activeExpressionMotion || null,
          motionDecision: Object.assign({}, lastMotionDecision),
          motionEngine: motionEngine && typeof motionEngine.getDiagnostics === "function"
            ? motionEngine.getDiagnostics()
            : null,
          referenceSize: referenceImage && referenceImage.naturalWidth
            ? [referenceImage.naturalWidth, referenceImage.naturalHeight]
            : null,
        };
      },
      show() {
        renderArea.classList.remove("is-renderer-inactive");
        renderArea.setAttribute("aria-hidden", "false");
      },
      hide() {
        renderArea.classList.add("is-renderer-inactive");
        renderArea.setAttribute("aria-hidden", "true");
      },
      resize() {
        if (motionEngine && currentState === "SLEEP") motionEngine.dock();
      },
      destroy() {
        destroyed = true;
        loadVersion += 1;
        frameRequestVersion += 1;
        if (frameSwapRaf) {
          cancelAnimationFrame(frameSwapRaf);
          frameSwapRaf = 0;
        }
        clearFrameTimer();
        frameLayers.forEach(function (image) {
          image.onload = null;
          image.onerror = null;
        });
        preloadedFrames.forEach(function (image) {
          image.onload = null;
          image.onerror = null;
        });
        clearMotionEngine();
        const stage = getStage();
        if (stage) stage.classList.remove("has-ola-reference", "has-ola-svg");
        renderArea.replaceChildren();
        referenceImage = null;
        fallbackImage = null;
        svg = null;
        frameLayers = [];
        preloadedFrames = [];
        failedFrameSources.clear();
        preloadStatus.clear();
        motionManifest = null;
        motionManifestVersion = null;
        activeMotionName = "reference";
        activePhaseMotion = "";
        activeExpressionMotion = "";
        activeMotionDetail = {};
        if (stage) stage.classList.remove("has-ola-approved-frame", "is-ola-motion-fallback");
        initOptions = {};
      },
    };
  }

  window.olaRenderer2D = Object.freeze({ create: createRenderer });
})();
