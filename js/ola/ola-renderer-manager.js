(function () {
  "use strict";

  function create(renderArea, managerOptions) {
    const options = managerOptions || {};
    let renderer = null;
    let rendererType = null;
    let rendererOptions = {};
    let state = "IDLE";
    let switching = false;

    function getFactory(type) {
      if (type === "3d" && window.olaRenderer3D) return window.olaRenderer3D;
      return window.olaRenderer2D || null;
    }

    function init(type, initOptions) {
      rendererOptions = Object.assign({}, initOptions || {});
      state = rendererOptions.initialState || state;
      return switchRenderer(type || options.defaultType || "2d");
    }

    function switchRenderer(requestedType) {
      if (switching) return renderer;
      switching = true;
      const normalizedType = String(requestedType || "2d").toLowerCase();
      const nextType = normalizedType === "3d" && window.olaRenderer3D ? "3d" : "2d";
      const factory = getFactory(nextType);

      if (!factory || typeof factory.create !== "function") {
        switching = false;
        console.warn("[OLA] 사용할 수 있는 렌더러가 없습니다.");
        return null;
      }

      if (renderer) renderer.destroy();
      renderer = factory.create(renderArea);
      rendererType = nextType;
      const initResult = renderer.init(Object.assign({}, rendererOptions, {
        initialState: state,
        onFallback: function () {
          setTimeout(function () {
            switching = false;
            if (rendererType !== "2d") switchRenderer("2d");
          }, 0);
        },
      }));
      renderer.setState(state, rendererOptions);
      switching = false;

      if (nextType === "3d" && initResult === false) {
        return switchRenderer("2d");
      }
      return renderer;
    }

    return Object.freeze({
      init: init,
      setState: function (nextState, stateOptions) {
        state = nextState;
        if (renderer) renderer.setState(nextState, stateOptions || rendererOptions);
      },
      show: function () { if (renderer) renderer.show(); },
      hide: function () { if (renderer) renderer.hide(); },
      resize: function () { if (renderer) renderer.resize(); },
      moveTo: function (x, y, duration) {
        return renderer && typeof renderer.moveTo === "function"
          ? renderer.moveTo(x, y, duration)
          : false;
      },
      dock: function () {
        return renderer && typeof renderer.dock === "function" ? renderer.dock() : false;
      },
      cancelMovement: function (reason) {
        return renderer && typeof renderer.cancelMovement === "function"
          ? renderer.cancelMovement(reason)
          : false;
      },
      resetPlacement: function (policy) {
        return renderer && typeof renderer.resetPlacement === "function"
          ? renderer.resetPlacement(policy)
          : false;
      },
      setExpression: function (expression) {
        if (renderer && typeof renderer.setExpression === "function") renderer.setExpression(expression);
      },
      setMotion: function (motion, detail) {
        return renderer && typeof renderer.setMotion === "function"
          ? renderer.setMotion(motion, detail || {})
          : false;
      },
      getDiagnostics: function () {
        return renderer && typeof renderer.getDiagnostics === "function"
          ? renderer.getDiagnostics()
          : { mode: rendererType };
      },
      destroy: function () {
        if (renderer) renderer.destroy();
        renderer = null;
        rendererType = null;
      },
      switchRenderer: switchRenderer,
      getRenderer: function () { return renderer; },
      getRendererType: function () { return rendererType; },
    });
  }

  window.olaRendererManager = Object.freeze({ create: create });
})();
