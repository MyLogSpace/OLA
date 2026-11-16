(function () {
  "use strict";

  const CLIP_MAP = Object.freeze({
    WAKE_UP: ["WakeUp", "Wake"],
    IDLE: ["Idle"],
    FOLLOW: ["Walk"],
    POINT: ["Point"],
    THINK: ["Think"],
    HAPPY: ["Happy", "Wave"],
    ALERT: ["Alert"],
    SLEEP_PREPARE: ["Yawn", "Sit"],
    SLEEP: ["Sleep"],
  });

  function translate(key, safeFallback) {
    return window.olaUiI18n
      ? window.olaUiI18n.t(key, null, safeFallback)
      : safeFallback;
  }

  function createRenderer(renderArea) {
    let scene, camera, webglRenderer, clock, mixer, model;
    let animationFrame = 0;
    let currentAction = null;
    let clips = [];
    let disposed = false;
    let fallbackRequested = false;
    let options = {};

    function requestFallback(reason) {
      if (fallbackRequested || disposed) return;
      fallbackRequested = true;
      console.warn("[OLA] 3D 렌더러를 사용할 수 없어 2D로 전환합니다. " + reason);
      if (typeof options.onFallback === "function") options.onFallback(reason);
    }

    function findClip(names) {
      const lowered = names.map(function (name) { return name.toLowerCase(); });
      return clips.find(function (clip) {
        return lowered.includes(clip.name.toLowerCase());
      }) || clips.find(function (clip) {
        const clipName = clip.name.toLowerCase();
        return lowered.some(function (name) {
          return clipName.includes(name) || name.includes(clipName);
        });
      });
    }

    function playState(state) {
      if (!mixer || !clips.length) return;
      const names = CLIP_MAP[state] || CLIP_MAP.IDLE;
      const clip = findClip(names) || findClip(CLIP_MAP.IDLE);
      if (!clip) return;
      const nextAction = mixer.clipAction(clip);
      if (nextAction === currentAction) return;
      nextAction.reset().fadeIn(0.25).play();
      if (currentAction) currentAction.fadeOut(0.25);
      currentAction = nextAction;
    }

    function disposeMaterial(material) {
      if (!material) return;
      Object.keys(material).forEach(function (key) {
        const value = material[key];
        if (value && value.isTexture && typeof value.dispose === "function") value.dispose();
      });
      if (typeof material.dispose === "function") material.dispose();
    }

    function renderLoop() {
      if (disposed || !webglRenderer || !scene || !camera) return;
      animationFrame = requestAnimationFrame(renderLoop);
      const delta = clock ? clock.getDelta() : 0;
      if (mixer) mixer.update(delta);
      webglRenderer.render(scene, camera);
    }

    function resize() {
      if (!webglRenderer || !camera) return;
      const width = Math.max(renderArea.clientWidth, 1);
      const height = Math.max(renderArea.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      webglRenderer.setSize(width, height, false);
    }

    return {
      init(initOptions) {
        options = initOptions || {};
        disposed = false;
        fallbackRequested = false;
        const THREE = window.THREE;
        const Loader = window.GLTFLoader || (THREE && THREE.GLTFLoader);

        if (!THREE || !Loader) {
          requestFallback("Three.js 또는 GLTFLoader가 로드되지 않았습니다.");
          return false;
        }

        try {
          const canvas = document.createElement("canvas");
          canvas.setAttribute(
            "aria-label",
            translate("accessibility.companion", "OLA")
          );
          scene = new THREE.Scene();
          camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
          camera.position.set(0, 1.25, 4.2);
          webglRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
          webglRenderer.outputColorSpace = THREE.SRGBColorSpace || webglRenderer.outputColorSpace;
          clock = new THREE.Clock();

          const ambient = THREE.HemisphereLight
            ? new THREE.HemisphereLight(0xffffff, 0x9fc8d0, 2.1)
            : new THREE.AmbientLight(0xffffff, 1.8);
          const directional = new THREE.DirectionalLight(0xffffff, 2.4);
          directional.position.set(3, 5, 4);
          scene.add(ambient, directional);
          renderArea.replaceChildren(canvas);
          resize();

          const loader = new Loader();
          loader.load(
            options.modelPath || "assets/ola/3d/models/ola.glb",
            function (gltf) {
              if (disposed) return;
              model = gltf.scene;
              clips = gltf.animations || [];
              scene.add(model);
              mixer = clips.length ? new THREE.AnimationMixer(model) : null;
              playState(options.initialState || "IDLE");
            },
            undefined,
            function () { requestFallback("GLB 모델을 불러오지 못했습니다."); }
          );
          renderLoop();
          return true;
        } catch (error) {
          requestFallback(error && error.message ? error.message : "WebGL 초기화에 실패했습니다.");
          return false;
        }
      },
      setState(state) { playState(state); },
      show() {
        renderArea.classList.remove("is-renderer-inactive");
        renderArea.setAttribute("aria-hidden", "false");
      },
      hide() {
        renderArea.classList.add("is-renderer-inactive");
        renderArea.setAttribute("aria-hidden", "false");
      },
      resize: resize,
      destroy() {
        disposed = true;
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        if (mixer) {
          mixer.stopAllAction();
          if (model) mixer.uncacheRoot(model);
        }
        if (model) {
          model.traverse(function (object) {
            if (object.geometry && typeof object.geometry.dispose === "function") object.geometry.dispose();
            if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
            else disposeMaterial(object.material);
          });
        }
        if (webglRenderer) {
          webglRenderer.dispose();
          if (typeof webglRenderer.forceContextLoss === "function") webglRenderer.forceContextLoss();
        }
        renderArea.replaceChildren();
        scene = camera = webglRenderer = clock = mixer = model = null;
        currentAction = null;
        clips = [];
      },
    };
  }

  window.olaRenderer3D = { create: createRenderer };
})();
