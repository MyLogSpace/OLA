(function () {
  "use strict";

  const STATE_EXPRESSIONS = Object.freeze({
    IDLE: "idle",
    FOLLOW: "idle",
    POINT: "happy",
    GUIDE: "happy",
    THINK: "think",
    HAPPY: "happy",
    WORRIED: "worried",
    ALERT: "alert",
    ANGRY: "angry",
    SAD: "sad",
    SLEEPY: "sleepy",
    SLEEP_PREPARE: "sleepy",
    SLEEP: "sleepy",
    WAKE_UP: "wake",
    TAKEOFF_PREPARE: "idle",
    FLY_START: "idle",
    FLY_CRUISE: "idle",
    FLY_TURN: "idle",
    FLY_BRAKE: "idle",
    LANDING: "idle",
  });

  const REQUIRED_GROUPS = Object.freeze([
    "ola-root", "shadow", "leg-left", "leg-right", "foot-left", "foot-right",
    "body", "chest-led", "arm-left", "arm-right", "hand-left", "hand-right",
    "head", "ear-left", "ear-right", "face-screen", "cheek-left", "cheek-right",
    "eye-left", "eye-right", "lash-left", "lash-right", "mouth", "sleep-zzz",
    "alert-mark",
  ]);

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function easeInOutSine(value) {
    return -(Math.cos(Math.PI * value) - 1) / 2;
  }

  function create(svg, options) {
    options = options || {};
    const stage = options.stage || null;
    const referenceMode = svg.classList.contains("ola-reference-character");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const groups = {};
    let state = "IDLE";
    let expression = "idle";
    let destroyed = false;
    let animationFrame = 0;
    let blinkTimer = 0;
    let wakeTimer = 0;
    let landingTimer = 0;
    let touchResetTimer = 0;
    let initialDockTimer = 0;
    let obstructionTimer = 0;
    let obstructionSettleTimer = 0;
    let dockObserver = null;
    let displacedByBlocker = false;
    let placementPolicy = "managed";
    let pointerTarget = { x: 0, y: 0, headX: 0, headY: 0 };
    let pointerCurrent = { x: 0, y: 0, headX: 0, headY: 0 };
    let flight = null;
    let movementPhase = null;
    let lastPointer = null;
    let lastFollowAt = 0;

    if (referenceMode) {
      groups["ola-root"] = svg.querySelector(".ola-reference-motion");
      groups.shadow = svg.querySelector(".ola-reference-shadow");
      groups.head = svg.querySelector(".ola-reference-tracker");
      groups["chest-led"] = svg.querySelector(".ola-reference-heart-glow");
      groups["sleep-zzz"] = svg.querySelector(".ola-reference-zzz");
      groups["alert-mark"] = svg.querySelector(".ola-reference-alert");
    } else {
      REQUIRED_GROUPS.forEach(function (id) {
        groups[id] = svg.querySelector("#" + id);
      });
    }

    function setClassExpression(nextExpression) {
      expression = nextExpression || "idle";
      svg.dataset.expression = expression;
      svg.classList.remove(
        "expression-idle", "expression-happy", "expression-think", "expression-blink",
        "expression-sleepy", "expression-wake", "expression-alert", "expression-sad",
        "expression-love", "expression-angry", "expression-worried", "expression-gentle",
        "expression-talk", "expression-curious", "expression-success"
      );
      svg.classList.add("expression-" + expression);
    }

    function requestTick() {
      if (!animationFrame && !destroyed) animationFrame = requestAnimationFrame(tick);
    }

    function resetPointer() {
      pointerTarget = { x: 0, y: 0, headX: 0, headY: 0 };
      requestTick();
    }

    function onPointerMove(event) {
      if (state === "SLEEP" || state === "SLEEP_PREPARE" || state === "ALERT") return;
      lastPointer = { x: event.clientX, y: event.clientY };
      if (state === "FOLLOW" && stage && performance.now() - lastFollowAt > 320) {
        lastFollowAt = performance.now();
        followPointer();
      }
      const rect = svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * 0.36;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.hypot(dx, dy);
      const nearDistance = Math.max(rect.width * 2.8, 340);
      const farDistance = Math.max(rect.width * 5.5, 680);
      if (distance > farDistance) {
        resetPointer();
        return;
      }
      const eyeStrength = clamp(1 - distance / farDistance, 0, 1);
      const headStrength = distance < nearDistance ? clamp(1 - distance / nearDistance, 0, 1) : 0;
      pointerTarget.x = clamp(dx / Math.max(rect.width, 1) * 22, -18, 18) * eyeStrength;
      pointerTarget.y = clamp(dy / Math.max(rect.height, 1) * 18, -12, 12) * eyeStrength;
      pointerTarget.headX = clamp(-dy / Math.max(rect.height, 1) * 8, -3, 3) * headStrength;
      pointerTarget.headY = clamp(dx / Math.max(rect.width, 1) * 12, -5, 5) * headStrength;
      requestTick();
    }

    function followPointer() {
      if (!stage || !lastPointer || state !== "FOLLOW" || stage.classList.contains("is-dragging")) return;
      const rect = stage.getBoundingClientRect();
      const horizontalDirection = lastPointer.x < window.innerWidth / 2 ? 1 : -1;
      let targetX = lastPointer.x + horizontalDirection * 110 - rect.width / 2;
      let targetY = lastPointer.y - rect.height / 2;
      const hit = document.elementFromPoint(lastPointer.x, lastPointer.y);
      if (hit && hit.closest && hit.closest("button, a, input, textarea, select, [role='button']")) {
        targetY += rect.height * 0.75;
      }
      curveTo(targetX, targetY, 1050);
    }

    function onScroll() {
      if (state === "FOLLOW") followPointer();
    }

    function onPointerDown(event) {
      if (event.pointerType !== "touch" || state === "SLEEP") return;
      onPointerMove(event);
      clearTimeout(touchResetTimer);
      touchResetTimer = window.setTimeout(function () {
        touchResetTimer = 0;
        resetPointer();
      }, 650);
    }

    function applyTracking() {
      const smoothing = reducedMotion ? 1 : 0.18;
      ["x", "y", "headX", "headY"].forEach(function (key) {
        pointerCurrent[key] += (pointerTarget[key] - pointerCurrent[key]) * smoothing;
      });
      const eyeTransform = "translate(" + pointerCurrent.x.toFixed(2) + "px," + pointerCurrent.y.toFixed(2) + "px)";
      if (!referenceMode && groups["eye-left"]) groups["eye-left"].style.transform = eyeTransform;
      if (!referenceMode && groups["eye-right"]) groups["eye-right"].style.transform = eyeTransform;
      if (groups.head) {
        groups.head.style.setProperty("--ola-head-rx", pointerCurrent.headX.toFixed(2) + "deg");
        groups.head.style.setProperty("--ola-head-ry", pointerCurrent.headY.toFixed(2) + "deg");
      }
      return Math.abs(pointerTarget.x - pointerCurrent.x) > 0.05
        || Math.abs(pointerTarget.y - pointerCurrent.y) > 0.05
        || Math.abs(pointerTarget.headX - pointerCurrent.headX) > 0.03
        || Math.abs(pointerTarget.headY - pointerCurrent.headY) > 0.03;
    }

    function angleDelta(first, second) {
      let delta = (first - second) % 360;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      return Math.abs(delta);
    }

    function emitMovementPhase(nextPhase, progress, tangentAngle, reason) {
      if (!flight || movementPhase === nextPhase) return;
      movementPhase = nextPhase;
      if (stage) stage.dataset.olaMotionPhase = nextPhase;
      if (typeof options.onMovementPhase !== "function") return;
      try {
        options.onMovementPhase(nextPhase, {
          progress: progress,
          tangentAngle: tangentAngle,
          direction: flight.direction,
          distance: flight.distance,
          reason: reason || "curve-progress",
        });
      } catch (error) {
        if (window.OLA_DEBUG_MOTION === true) {
          console.warn("[OLA] 이동 모션 단계 콜백을 처리하지 못했습니다.", error);
        }
      }
    }

    function completeMovement(reason) {
      const completed = flight;
      flight = null;
      if (stage) {
        stage.classList.remove("is-ola-moving");
        stage.classList.remove("is-ola-flying");
        stage.classList.add("is-ola-landing");
      }
      clearTimeout(landingTimer);
      landingTimer = window.setTimeout(function () {
        landingTimer = 0;
        if (destroyed) return;
        if (stage) {
          stage.classList.remove("is-ola-landing");
          stage.removeAttribute("data-ola-motion-phase");
          stage.removeAttribute("data-ola-flight-direction");
        }
        movementPhase = null;
        if (typeof options.onMovementComplete === "function") {
          try {
            options.onMovementComplete({
              reason: reason || "curve-complete",
              distance: completed ? completed.distance : 0,
            });
          } catch (error) {
            if (window.OLA_DEBUG_MOTION === true) {
              console.warn("[OLA] 이동 완료 콜백을 처리하지 못했습니다.", error);
            }
          }
        }
      }, reducedMotion ? 20 : 320);
    }

    function cancelMovement(reason) {
      const cancelled = flight;
      flight = null;
      movementPhase = null;
      clearTimeout(landingTimer);
      landingTimer = 0;
      if (stage) {
        stage.classList.remove("is-ola-moving", "is-ola-flying", "is-ola-landing");
        stage.removeAttribute("data-ola-motion-phase");
        stage.removeAttribute("data-ola-flight-direction");
      }
      if (groups["ola-root"]) groups["ola-root"].style.setProperty("--ola-flight-tilt", "0deg");
      if (cancelled && typeof options.onMovementComplete === "function") {
        try {
          options.onMovementComplete({
            reason: reason || "curve-cancelled",
            distance: cancelled.distance,
            cancelled: true,
          });
        } catch (error) {
          if (window.OLA_DEBUG_MOTION === true) {
            console.warn("[OLA] 취소된 이동 콜백을 처리하지 못했습니다.", error);
          }
        }
      }
      return Boolean(cancelled);
    }

    function resetPlacement(policy) {
      placementPolicy = policy === "default-left" ? "default-left" : "managed";
      clearTimeout(initialDockTimer);
      clearTimeout(obstructionTimer);
      clearTimeout(obstructionSettleTimer);
      initialDockTimer = 0;
      obstructionTimer = 0;
      obstructionSettleTimer = 0;
      displacedByBlocker = false;
      cancelMovement("placement-reset");
      return true;
    }

    function applyFlight(time) {
      if (!flight || !stage) return false;
      const progress = clamp((time - flight.startedAt) / flight.duration, 0, 1);
      const eased = easeInOutSine(progress);
      const inverse = 1 - eased;
      const rawX = inverse * inverse * inverse * flight.startX
        + 3 * inverse * inverse * eased * flight.control1X
        + 3 * inverse * eased * eased * flight.control2X
        + eased * eased * eased * flight.targetX;
      const rawY = inverse * inverse * inverse * flight.startY
        + 3 * inverse * inverse * eased * flight.control1Y
        + 3 * inverse * eased * eased * flight.control2Y
        + eased * eased * eased * flight.targetY;
      const x = clamp(rawX, 0, Math.max(window.innerWidth - flight.stageWidth, 0));
      const y = clamp(rawY, 0, Math.max(window.innerHeight - flight.stageHeight, 0));
      stage.style.left = x.toFixed(2) + "px";
      stage.style.top = y.toFixed(2) + "px";
      stage.style.right = "auto";
      stage.style.bottom = "auto";
      const inverseProgress = 1 - progress;
      const tangentX = 3 * inverseProgress * inverseProgress * (flight.control1X - flight.startX)
        + 6 * inverseProgress * progress * (flight.control2X - flight.control1X)
        + 3 * progress * progress * (flight.targetX - flight.control2X);
      const tangentY = 3 * inverseProgress * inverseProgress * (flight.control1Y - flight.startY)
        + 6 * inverseProgress * progress * (flight.control2Y - flight.control1Y)
        + 3 * progress * progress * (flight.targetY - flight.control2Y);
      const tangentAngle = Math.atan2(tangentY, tangentX) * 180 / Math.PI;
      if (flight.longDistance) {
        let nextPhase;
        if (progress < 0.18) nextPhase = "TAKEOFF_PREPARE";
        else if (progress < 0.72) {
          if (
            flight.distance >= 420
            && !flight.turnEmitted
            && angleDelta(tangentAngle, flight.startTangentAngle) >= 42
          ) {
            flight.turnEmitted = true;
            flight.turnUntil = progress + 0.06;
          }
          nextPhase = progress < flight.turnUntil ? "FLY_TURN" : "FLY_CRUISE";
        } else if (progress < 0.86) nextPhase = "FLY_BRAKE";
        else nextPhase = "LANDING";
        emitMovementPhase(nextPhase, progress, tangentAngle, "curve-progress");
      }
      if (groups["ola-root"]) {
        groups["ola-root"].style.setProperty(
          "--ola-flight-tilt",
          (flight.directionSign * 2.2 * Math.sin(progress * Math.PI)).toFixed(2) + "deg"
        );
      }
      if (progress >= 1) {
        if (groups["ola-root"]) groups["ola-root"].style.setProperty("--ola-flight-tilt", "0deg");
        completeMovement("curve-complete");
        return false;
      }
      return true;
    }

    function tick(time) {
      animationFrame = 0;
      if (destroyed) return;
      const trackingActive = applyTracking();
      const flightActive = applyFlight(time);
      if (trackingActive || flightActive) requestTick();
    }

    function curveTo(x, y, duration) {
      if (!stage) return false;
      clearTimeout(landingTimer);
      landingTimer = 0;
      stage.classList.remove("is-ola-landing");
      stage.removeAttribute("data-ola-motion-phase");
      const rect = stage.getBoundingClientRect();
      const maxX = Math.max(window.innerWidth - rect.width, 0);
      const gearReserve = window.innerWidth <= 640 ? 58 : 54;
      const maxY = Math.max(window.innerHeight - rect.height - gearReserve, 0);
      const targetX = clamp(x, 0, maxX);
      const targetY = clamp(y, 0, maxY);
      if (reducedMotion) {
        stage.style.left = targetX + "px";
        stage.style.top = targetY + "px";
        stage.style.right = "auto";
        stage.style.bottom = "auto";
        movementPhase = null;
        if (typeof options.onMovementComplete === "function") {
          options.onMovementComplete({ reason: "reduced-motion", distance: Math.hypot(targetX - rect.left, targetY - rect.top) });
        }
        return true;
      }
      const deltaX = targetX - rect.left;
      const deltaY = targetY - rect.top;
      const distance = Math.hypot(deltaX, deltaY);
      const calmDuration = distance >= 120
        ? clamp(1000 + distance * 1.2, 1200, 2200)
        : clamp(600 + distance * 1.8, 700, 900);
      const requestedDuration = Math.max(Number(duration) || 0, 0);
      const layer = stage.closest("#ola-layer");
      const intensityMultiplier = layer && layer.classList.contains("is-motion-minimal")
        ? 1.16
        : layer && layer.classList.contains("is-motion-active")
          ? 0.92
          : 1;
      const urgencyMultiplier = state === "ALERT" || expression === "alert" ? 0.9 : 1;
      const resolvedDuration = Math.round(
        Math.max(calmDuration, requestedDuration) * intensityMultiplier * urgencyMultiplier
      );
      const lift = clamp(Math.abs(deltaX) * 0.1 + 22, 22, 72);
      const directionSign = Math.sign(deltaX) || 1;
      const control1X = rect.left + deltaX * 0.28;
      const control1Y = Math.min(rect.top, targetY) - lift;
      const control2X = rect.left + deltaX * 0.76;
      const control2Y = targetY - lift * 0.38;
      stage.classList.add("is-ola-moving");
      flight = {
        startX: rect.left,
        startY: rect.top,
        control1X: control1X,
        control1Y: control1Y,
        control2X: control2X,
        control2Y: control2Y,
        targetX: targetX,
        targetY: targetY,
        stageWidth: rect.width,
        stageHeight: rect.height,
        startedAt: performance.now(),
        duration: resolvedDuration,
        distance: distance,
        longDistance: distance >= 120,
        directionSign: directionSign,
        direction: directionSign < 0 ? "left" : "right",
        startTangentAngle: Math.atan2(control1Y - rect.top, control1X - rect.left) * 180 / Math.PI,
        turnUntil: 0,
        turnEmitted: false,
      };
      movementPhase = null;
      stage.dataset.olaFlightDirection = flight.direction;
      if (flight.longDistance) {
        stage.classList.add("is-ola-flying");
        emitMovementPhase("TAKEOFF_PREPARE", 0, flight.startTangentAngle, "curve-start");
      } else {
        stage.classList.remove("is-ola-flying");
      }
      requestTick();
      return true;
    }

    function getVisibleDockBlockers() {
      return Array.from(document.querySelectorAll("#toast-notif")).filter(function (element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && parseFloat(style.opacity || "1") > 0.12
          && rect.width > 0
          && rect.height > 0;
      });
    }

    function dock() {
      if (!stage) return false;
      placementPolicy = "dock";
      const rect = stage.getBoundingClientRect();
      const margin = window.innerWidth <= 640 ? 16 : 24;
      const targetX = window.innerWidth - rect.width - margin;
      const gearReserve = window.innerWidth <= 640 ? 58 : 54;
      let targetY = window.innerHeight - rect.height - gearReserve;
      getVisibleDockBlockers().forEach(function (element) {
        const blocker = element.getBoundingClientRect();
        const overlapsHorizontally = targetX < blocker.right && targetX + rect.width > blocker.left;
        if (overlapsHorizontally) {
          targetY = Math.min(targetY, blocker.top - rect.height - margin);
        }
      });
      return curveTo(targetX, clamp(targetY, margin, window.innerHeight - rect.height - gearReserve), 1200);
    }

    function avoidDockObstruction() {
      if (!stage || state === "FOLLOW") return;
      const rect = stage.getBoundingClientRect();
      const blockers = getVisibleDockBlockers();
      const obstructed = blockers.some(function (element) {
        const blocker = element.getBoundingClientRect();
        return rect.left < blocker.right && rect.right > blocker.left
          && rect.top < blocker.bottom && rect.bottom > blocker.top;
      });
      if (obstructed) {
        displacedByBlocker = true;
        if (placementPolicy === "dock") {
          dock();
          return;
        }
        const margin = window.innerWidth <= 640 ? 16 : 24;
        const gearReserve = window.innerWidth <= 640 ? 58 : 54;
        const maxY = Math.max(window.innerHeight - rect.height - gearReserve, margin);
        let targetY = rect.top;
        blockers.forEach(function (element) {
          const blocker = element.getBoundingClientRect();
          const overlapsHorizontally = rect.left < blocker.right && rect.right > blocker.left;
          if (overlapsHorizontally && rect.top < blocker.bottom && rect.bottom > blocker.top) {
            targetY = Math.min(targetY, blocker.top - rect.height - margin);
          }
        });
        curveTo(rect.left, clamp(targetY, margin, maxY), 480);
      } else if (displacedByBlocker) {
        displacedByBlocker = false;
        if (placementPolicy === "dock") dock();
      }
    }

    function scheduleBlink() {
      clearTimeout(blinkTimer);
      blinkTimer = 0;
      if (destroyed || state !== "IDLE") return;
      const delay = reducedMotion ? 6500 : 3000 + Math.round(Math.random() * 3000);
      blinkTimer = window.setTimeout(function () {
        blinkTimer = 0;
        if (destroyed || state !== "IDLE") return;
        setClassExpression("blink");
        blinkTimer = window.setTimeout(function () {
          blinkTimer = 0;
          if (!destroyed && state === "IDLE") {
            setClassExpression("idle");
            scheduleBlink();
          }
        }, reducedMotion ? 120 : 170);
      }, delay);
    }

    function setState(nextState) {
      state = String(nextState || "IDLE").toUpperCase();
      if (
        state !== "SLEEP"
        && state !== "SLEEP_PREPARE"
        && placementPolicy === "dock"
      ) {
        placementPolicy = "managed";
      }
      if (state === "FOLLOW" || state === "SLEEP" || state === "SLEEP_PREPARE") {
        cancelMovement("state-" + state.toLowerCase());
      }
      clearTimeout(wakeTimer);
      wakeTimer = 0;
      setClassExpression(STATE_EXPRESSIONS[state] || "idle");
      svg.dataset.state = state;
      if (state === "SLEEP" || state === "SLEEP_PREPARE") resetPointer();
      if (state === "WAKE_UP") {
        wakeTimer = window.setTimeout(function () {
          wakeTimer = 0;
          if (!destroyed && state === "WAKE_UP") setClassExpression("idle");
        }, reducedMotion ? 160 : 900);
      }
      scheduleBlink();
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    setState(options.initialState || "IDLE");
    if (stage) {
      initialDockTimer = window.setTimeout(function () {
        initialDockTimer = 0;
        if (destroyed) return;
        if (!stage.style.left && !stage.style.top) dock();
        avoidDockObstruction();
      }, 500);
      const toast = document.querySelector("#toast-notif");
      if (toast && typeof MutationObserver === "function") {
        dockObserver = new MutationObserver(function () {
          clearTimeout(obstructionTimer);
          clearTimeout(obstructionSettleTimer);
          obstructionTimer = window.setTimeout(function () {
            obstructionTimer = 0;
            avoidDockObstruction();
          }, 40);
          obstructionSettleTimer = window.setTimeout(function () {
            obstructionSettleTimer = 0;
            avoidDockObstruction();
          }, 450);
        });
        dockObserver.observe(toast, { attributes: true, attributeFilter: ["class", "style"] });
      }
    }

    return Object.freeze({
      setState: setState,
      setExpression: setClassExpression,
      moveTo: curveTo,
      dock: dock,
      cancelMovement: cancelMovement,
      resetPlacement: resetPlacement,
      getState: function () { return state; },
      getExpression: function () { return expression; },
      getMissingGroups: function () {
        if (referenceMode) return [];
        return REQUIRED_GROUPS.filter(function (id) { return !groups[id]; });
      },
      getDiagnostics: function () {
        const timers = [
          blinkTimer,
          wakeTimer,
          landingTimer,
          touchResetTimer,
          initialDockTimer,
          obstructionTimer,
          obstructionSettleTimer,
        ].filter(function (timer) { return Boolean(timer); }).length;
        return {
          listenerCount: destroyed ? 0 : 3,
          observerCount: dockObserver ? 1 : 0,
          timerCount: timers,
          rafCount: animationFrame ? 1 : 0,
          movementPhase: movementPhase,
          flightActive: Boolean(flight),
          flightDuration: flight ? flight.duration : null,
          flightDistance: flight ? flight.distance : null,
          placementPolicy: placementPolicy,
        };
      },
      destroy: function () {
        destroyed = true;
        clearTimeout(blinkTimer);
        clearTimeout(wakeTimer);
        clearTimeout(landingTimer);
        clearTimeout(touchResetTimer);
        clearTimeout(initialDockTimer);
        clearTimeout(obstructionTimer);
        clearTimeout(obstructionSettleTimer);
        if (dockObserver) dockObserver.disconnect();
        dockObserver = null;
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        flight = null;
        movementPhase = null;
        if (stage) {
          stage.classList.remove("is-ola-moving", "is-ola-flying", "is-ola-landing");
          stage.removeAttribute("data-ola-motion-phase");
          stage.removeAttribute("data-ola-flight-direction");
        }
        if (groups["ola-root"]) groups["ola-root"].style.setProperty("--ola-flight-tilt", "0deg");
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("scroll", onScroll);
        Object.keys(groups).forEach(function (key) { groups[key] = null; });
      },
    });
  }

  window.ola2DMotionEngine = Object.freeze({
    create: create,
    requiredGroups: REQUIRED_GROUPS,
  });
})();
