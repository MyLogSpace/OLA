(function () {
  "use strict";

  const STATES = Object.freeze({
    WAKE_UP: "WAKE_UP",
    IDLE: "IDLE",
    FOLLOW: "FOLLOW",
    POINT: "POINT",
    GUIDE: "GUIDE",
    THINK: "THINK",
    HAPPY: "HAPPY",
    WORRIED: "WORRIED",
    ALERT: "ALERT",
    ANGRY: "ANGRY",
    SAD: "SAD",
    SLEEPY: "SLEEPY",
    SLEEP_PREPARE: "SLEEP_PREPARE",
    SLEEP: "SLEEP",
    TAKEOFF_PREPARE: "TAKEOFF_PREPARE",
    FLY_START: "FLY_START",
    FLY_CRUISE: "FLY_CRUISE",
    FLY_TURN: "FLY_TURN",
    FLY_BRAKE: "FLY_BRAKE",
    LANDING: "LANDING",
  });

  const VALID_STATES = new Set(Object.values(STATES));

  function create(initialState) {
    let currentState = initialState || STATES.IDLE;
    let previousState = null;
    const listeners = new Set();

    if (!VALID_STATES.has(currentState)) {
      currentState = STATES.IDLE;
    }

    function setState(nextState, context) {
      if (!VALID_STATES.has(nextState)) {
        console.warn("[OLA] 알 수 없는 상태 요청을 무시했습니다:", nextState);
        return false;
      }
      if (nextState === currentState) return false;

      previousState = currentState;
      currentState = nextState;
      listeners.forEach(function (listener) {
        try {
          listener(currentState, previousState, context || {});
        } catch (error) {
          console.warn("[OLA] 상태 구독자 실행 중 오류가 발생했습니다.", error);
        }
      });
      return true;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("OLA 상태 구독자는 함수여야 합니다.");
      }
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    return Object.freeze({
      getState: function () { return currentState; },
      getPreviousState: function () { return previousState; },
      setState: setState,
      subscribe: subscribe,
      states: STATES,
    });
  }

  window.olaStateManager = Object.freeze({
    STATES: STATES,
    create: create,
  });
})();
