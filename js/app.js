(function () {
  "use strict";

  const STORAGE_KEY = "zoomquilt_web_prefs_v1";
  const artworks = window.ZOOMQUILT_ARTWORKS || [];

  const I18N = {
    en: {
      pageTitle: "Zoomrift — Infinite Zoom",
      loading: "Loading artwork…",
      streaming: (r, t) => `Streaming layers (${r}/${t})…`,
      webglError: "WebGL is not supported in this browser.",
      prevTitle: "Previous artwork (Left Arrow)",
      nextTitle: "Next artwork (Right Arrow)",
      langBtn: "فا",
      langTitle: "تغییر زبان به فارسی (L)",
      randomTitle: "Random artwork & FX (R)",
      adjustTitle: "Color & center adjustments",
      fullscreenTitle: "Fullscreen (F)",
      hideTitle: "Hide controls (H or tap canvas)",
      playLabel: "Play",
      pauseLabel: "Pause",
      playPauseTitle: "Play / Pause (Space)",
      speed: "Speed",
      reverse: "Reverse",
      reverseTitle: "Reverse zoom direction",
      brightness: "Brightness",
      contrast: "Contrast",
      saturation: "Saturation",
      randomCenter: "Random Center Offset",
      reset: "Reset",
      hint: "Drag vertically on canvas to control zoom speed, or tap to toggle UI.",
      fx: {
        original: "Original",
        hue: "Hue",
        flare: "Fade",
        prism: "Prism",
        swirl: "Swirl",
        acid: "Acid",
      },
    },
    fa: {
      pageTitle: "زوم‌ریفت — زوم بی‌نهایت",
      loading: "در حال بارگذاری اثر…",
      streaming: (r, t) => `در حال بارگذاری لایه‌ها (${r}/${t})…`,
      webglError: "مرورگر شما از WebGL پشتیبانی نمی‌کند.",
      prevTitle: "اثر قبلی (فلش چپ/راست)",
      nextTitle: "اثر بعدی (فلش چپ/راست)",
      langBtn: "EN",
      langTitle: "Switch to English (L)",
      randomTitle: "انتخاب تصادفی اثر و افکت (R)",
      adjustTitle: "تنظیمات رنگ و مرکز",
      fullscreenTitle: "تمام‌صفحه (F)",
      hideTitle: "مخفی‌کردن کنترل‌ها (H یا لمس صفحه)",
      playLabel: "پخش",
      pauseLabel: "توقف",
      playPauseTitle: "پخش / توقف (Space)",
      speed: "سرعت",
      reverse: "معکوس",
      reverseTitle: "برعکس کردن جهت زوم",
      brightness: "روشنایی",
      contrast: "کنتراست",
      saturation: "اشباع رنگ",
      randomCenter: "مرکز تصادفی",
      reset: "بازنشانی",
      hint: "برای کنترل سرعت زوم، انگشت یا ماوس را عمودی بکشید؛ برای مخفی‌کردن منو ضربه بزنید.",
      fx: {
        original: "اصلی",
        hue: "چرخش رنگ",
        flare: "محو رنگی",
        prism: "منشوری",
        swirl: "گرداب",
        acid: "اسیدی",
      },
    },
  };

  const els = {
    stage: document.getElementById("stage"),
    canvas: document.getElementById("zoom-canvas"),
    loader: document.getElementById("loader"),
    loaderText: document.getElementById("loader-text"),
    hud: document.getElementById("hud"),
    title: document.getElementById("artwork-title"),
    author: document.getElementById("artwork-author"),
    artworkStrip: document.getElementById("artwork-strip"),
    fxStrip: document.getElementById("fx-strip"),
    btnLang: document.getElementById("btn-lang"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
    btnRandom: document.getElementById("btn-random"),
    btnAdjustToggle: document.getElementById("btn-adjust-toggle"),
    adjustPopover: document.getElementById("adjust-popover"),
    btnFullscreen: document.getElementById("btn-fullscreen"),
    btnHideHud: document.getElementById("btn-hide-hud"),
    btnPlayPause: document.getElementById("btn-play-pause"),
    iconPause: document.getElementById("icon-pause"),
    iconPlay: document.getElementById("icon-play"),
    btnReverse: document.getElementById("btn-reverse"),
    lblSpeed: document.getElementById("lbl-speed"),
    rngSpeed: document.getElementById("rng-speed"),
    valSpeed: document.getElementById("val-speed"),
    lblBrightness: document.getElementById("lbl-brightness"),
    rngBrightness: document.getElementById("rng-brightness"),
    valBrightness: document.getElementById("val-brightness"),
    lblContrast: document.getElementById("lbl-contrast"),
    rngContrast: document.getElementById("rng-contrast"),
    valContrast: document.getElementById("val-contrast"),
    lblSaturation: document.getElementById("lbl-saturation"),
    rngSaturation: document.getElementById("rng-saturation"),
    valSaturation: document.getElementById("val-saturation"),
    lblRandomCenter: document.getElementById("lbl-random-center"),
    chkRandomCenter: document.getElementById("chk-random-center"),
    btnResetAdjust: document.getElementById("btn-reset-adjust"),
    lblHint: document.getElementById("lbl-hint"),
    errorBanner: document.getElementById("error-banner"),
  };

  function loadPrefs() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (_) {
      saved = {};
    }
    const params = new URLSearchParams(window.location.search);
    const paramLang = params.get("lang");
    const defaultLang =
      paramLang === "fa" || paramLang === "en"
        ? paramLang
        : saved.lang === "fa" || saved.lang === "en"
        ? saved.lang
        : (navigator.language || "").toLowerCase().startsWith("fa")
        ? "fa"
        : "en";

    return {
      lang: defaultLang,
      quiltId: params.get("quilt") || saved.quiltId || (artworks[0] && artworks[0].id) || "zq1",
      fx: params.get("fx") || saved.fx || "original",
      speed: Number.isFinite(parseFloat(params.get("speed")))
        ? parseFloat(params.get("speed"))
        : (typeof saved.speed === "number" ? saved.speed : 1.1),
      brightness: typeof saved.brightness === "number" ? saved.brightness : 0,
      contrast: typeof saved.contrast === "number" ? saved.contrast : 0,
      saturation: typeof saved.saturation === "number" ? saved.saturation : 0,
      randomCenter: !!saved.randomCenter,
      paused: false,
    };
  }

  const state = loadPrefs();
  let hudHidden = false;

  function t() {
    return I18N[state.lang] || I18N.en;
  }

  function savePrefs() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lang: state.lang,
          quiltId: state.quiltId,
          fx: state.fx,
          speed: state.speed,
          brightness: state.brightness,
          contrast: state.contrast,
          saturation: state.saturation,
          randomCenter: state.randomCenter,
        })
      );
    } catch (_) {
      // Ignore storage errors in private mode
    }
  }

  const engine = new window.ZoomQuiltEngine(els.canvas, {
    onLoadProgress(ready, total) {
      const tr = t();
      if (ready < 1) {
        els.loaderText.textContent = tr.loading;
      } else if (ready < total) {
        els.loaderText.textContent = tr.streaming(ready, total);
      }
    },
    onFirstFrame() {
      els.loader.classList.add("hidden");
    },
    onError() {
      els.errorBanner.textContent = t().webglError;
      els.errorBanner.hidden = false;
      els.loader.classList.add("hidden");
    },
  });

  function buildArtworkPills() {
    els.artworkStrip.innerHTML = "";
    for (const art of artworks) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill-btn";
      btn.dataset.quiltId = art.id;
      btn.textContent = state.lang === "fa" ? art.nameFa || art.name : art.name;
      btn.addEventListener("click", () => selectArtwork(art.id));
      els.artworkStrip.appendChild(btn);
    }
  }

  function applyLanguage() {
    const isFa = state.lang === "fa";
    const tr = t();
    document.documentElement.lang = isFa ? "fa" : "en";
    document.documentElement.dir = isFa ? "rtl" : "ltr";
    document.title = tr.pageTitle;

    els.btnLang.textContent = tr.langBtn;
    els.btnLang.title = tr.langTitle;
    els.btnLang.setAttribute("aria-label", tr.langTitle);

    els.btnPrev.title = tr.prevTitle;
    els.btnPrev.setAttribute("aria-label", tr.prevTitle);
    els.btnNext.title = tr.nextTitle;
    els.btnNext.setAttribute("aria-label", tr.nextTitle);
    els.btnRandom.title = tr.randomTitle;
    els.btnRandom.setAttribute("aria-label", tr.randomTitle);
    els.btnAdjustToggle.title = tr.adjustTitle;
    els.btnAdjustToggle.setAttribute("aria-label", tr.adjustTitle);
    els.btnFullscreen.title = tr.fullscreenTitle;
    els.btnFullscreen.setAttribute("aria-label", tr.fullscreenTitle);
    els.btnHideHud.title = tr.hideTitle;
    els.btnHideHud.setAttribute("aria-label", tr.hideTitle);

    els.btnPlayPause.title = tr.playPauseTitle;
    els.lblSpeed.textContent = tr.speed;
    els.btnReverse.textContent = tr.reverse;
    els.btnReverse.title = tr.reverseTitle;

    els.lblBrightness.textContent = tr.brightness;
    els.lblContrast.textContent = tr.contrast;
    els.lblSaturation.textContent = tr.saturation;
    els.lblRandomCenter.textContent = tr.randomCenter;
    els.btnResetAdjust.textContent = tr.reset;
    els.lblHint.textContent = tr.hint;

    for (const btn of els.fxStrip.querySelectorAll(".pill-btn")) {
      const key = btn.dataset.fx;
      if (tr.fx[key]) btn.textContent = tr.fx[key];
    }
    for (const btn of els.artworkStrip.querySelectorAll(".pill-btn")) {
      const art = artworks.find((a) => a.id === btn.dataset.quiltId);
      if (art) btn.textContent = isFa ? art.nameFa || art.name : art.name;
    }

    if (!els.errorBanner.hidden) {
      els.errorBanner.textContent = tr.webglError;
    }
  }

  function syncUI() {
    const isFa = state.lang === "fa";
    const tr = t();
    const current = artworks.find((a) => a.id === state.quiltId) || artworks[0];
    if (current) {
      els.title.textContent = isFa ? current.nameFa || current.name : current.name;
      els.author.textContent = isFa ? current.authorFa || current.author : current.author;
    }

    for (const btn of els.artworkStrip.querySelectorAll(".pill-btn")) {
      btn.classList.toggle("active", btn.dataset.quiltId === state.quiltId);
    }
    for (const btn of els.fxStrip.querySelectorAll(".pill-btn")) {
      btn.classList.toggle("active", btn.dataset.fx === state.fx);
    }

    els.rngSpeed.value = String(state.speed);
    els.valSpeed.textContent = (state.speed >= 0 ? "+" : "") + state.speed.toFixed(2);
    els.iconPause.hidden = state.paused;
    els.iconPlay.hidden = !state.paused;
    els.btnPlayPause.setAttribute("aria-label", state.paused ? tr.playLabel : tr.pauseLabel);

    els.rngBrightness.value = String(state.brightness);
    els.valBrightness.textContent = String(state.brightness);
    els.rngContrast.value = String(state.contrast);
    els.valContrast.textContent = String(state.contrast);
    els.rngSaturation.value = String(state.saturation);
    els.valSaturation.textContent = String(state.saturation);
    els.chkRandomCenter.checked = state.randomCenter;
  }

  function toggleLanguage() {
    state.lang = state.lang === "fa" ? "en" : "fa";
    applyLanguage();
    syncUI();
    savePrefs();
  }

  function selectArtwork(quiltId, startPos) {
    const art = artworks.find((a) => a.id === quiltId) || artworks[0];
    if (!art) return;
    state.quiltId = art.id;
    els.loaderText.textContent = t().loading;
    els.loader.classList.remove("hidden");
    engine.setArtwork(art, startPos);
    syncUI();
    savePrefs();
  }

  function selectFx(fx) {
    state.fx = fx;
    engine.setFx(fx);
    syncUI();
    savePrefs();
  }

  function cycleArtwork(step) {
    if (!artworks.length) return;
    const idx = artworks.findIndex((a) => a.id === state.quiltId);
    const nextIdx = (idx + step + artworks.length) % artworks.length;
    selectArtwork(artworks[nextIdx].id);
  }

  function togglePause() {
    state.paused = !state.paused;
    engine.setPaused(state.paused);
    syncUI();
  }

  function toggleHud(force) {
    hudHidden = typeof force === "boolean" ? force : !hudHidden;
    els.hud.classList.toggle("hud-hidden", hudHidden);
    if (hudHidden) {
      els.adjustPopover.hidden = true;
      els.btnAdjustToggle.setAttribute("aria-expanded", "false");
    }
  }

  function randomizeAll() {
    if (!artworks.length) return;
    const fxList = ["original", "hue", "flare", "prism", "swirl", "acid"];
    const nextArt = artworks[Math.floor(Math.random() * artworks.length)];
    const nextFx = fxList[Math.floor(Math.random() * fxList.length)];
    const randPos = Math.random() * nextArt.tiles.length;
    state.fx = nextFx;
    engine.setFx(nextFx);
    if (state.randomCenter) {
      engine.setRandomCenter(true);
    }
    selectArtwork(nextArt.id, randPos);
  }

  // Wire buttons & sliders
  els.btnLang.addEventListener("click", toggleLanguage);
  els.btnPrev.addEventListener("click", () => cycleArtwork(-1));
  els.btnNext.addEventListener("click", () => cycleArtwork(1));
  els.btnRandom.addEventListener("click", randomizeAll);
  els.btnPlayPause.addEventListener("click", togglePause);
  els.btnReverse.addEventListener("click", () => {
    state.speed = Math.abs(state.speed) < 0.05 ? -1.1 : -state.speed;
    engine.setSpeed(state.speed);
    syncUI();
    savePrefs();
  });

  els.btnAdjustToggle.addEventListener("click", () => {
    const open = els.adjustPopover.hidden;
    els.adjustPopover.hidden = !open;
    els.btnAdjustToggle.setAttribute("aria-expanded", String(open));
  });

  els.btnHideHud.addEventListener("click", () => toggleHud(true));

  els.btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      els.stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  for (const btn of els.fxStrip.querySelectorAll(".pill-btn")) {
    btn.addEventListener("click", () => selectFx(btn.dataset.fx));
  }

  els.rngSpeed.addEventListener("input", () => {
    state.speed = parseFloat(els.rngSpeed.value);
    if (state.paused && Math.abs(state.speed) > 0) {
      state.paused = false;
      engine.setPaused(false);
    }
    engine.setSpeed(state.speed);
    syncUI();
    savePrefs();
  });

  function updateColorAdjustments() {
    state.brightness = parseInt(els.rngBrightness.value, 10) || 0;
    state.contrast = parseInt(els.rngContrast.value, 10) || 0;
    state.saturation = parseInt(els.rngSaturation.value, 10) || 0;
    engine.setAdjustments({
      brightness: state.brightness,
      contrast: state.contrast,
      saturation: state.saturation,
    });
    syncUI();
    savePrefs();
  }

  els.rngBrightness.addEventListener("input", updateColorAdjustments);
  els.rngContrast.addEventListener("input", updateColorAdjustments);
  els.rngSaturation.addEventListener("input", updateColorAdjustments);

  els.chkRandomCenter.addEventListener("change", () => {
    state.randomCenter = els.chkRandomCenter.checked;
    engine.setRandomCenter(state.randomCenter);
    savePrefs();
  });

  els.btnResetAdjust.addEventListener("click", () => {
    state.brightness = 0;
    state.contrast = 0;
    state.saturation = 0;
    state.randomCenter = false;
    engine.setAdjustments({ brightness: 0, contrast: 0, saturation: 0 });
    engine.setRandomCenter(false);
    syncUI();
    savePrefs();
  });

  // Canvas pointer/drag interaction
  let pointerActive = false;
  let pointerStartY = 0;
  let pointerStartX = 0;
  let pointerMoved = false;

  els.canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointerActive = true;
    pointerStartY = e.clientY;
    pointerStartX = e.clientX;
    pointerMoved = false;
    els.canvas.setPointerCapture(e.pointerId);
    engine.beginDrag();
  });

  els.canvas.addEventListener("pointermove", (e) => {
    if (!pointerActive) return;
    const dy = pointerStartY - e.clientY;
    const dx = e.clientX - pointerStartX;
    if (!pointerMoved && Math.hypot(dx, dy) > 6) {
      pointerMoved = true;
    }
    if (pointerMoved) {
      const normalized = dy / Math.max(120, window.innerHeight * 0.25);
      const speed = Math.max(-3.5, Math.min(3.5, normalized * 3.5));
      engine.updateDrag(speed);
    }
  });

  function endPointer(e) {
    if (!pointerActive) return;
    pointerActive = false;
    try {
      els.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    engine.endDrag();
    if (!pointerMoved) {
      toggleHud();
    }
  }

  els.canvas.addEventListener("pointerup", endPointer);
  els.canvas.addEventListener("pointercancel", endPointer);

  els.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      engine.nudgeZoom(-e.deltaY * 0.0012);
    },
    { passive: false }
  );

  function enableDragScroll(strip) {
    let isDown = false;
    let moved = false;
    let startX = 0;
    let startScrollLeft = 0;
    let suppressNextClick = false;

    strip.addEventListener(
      "click",
      (e) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    strip.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScrollLeft = strip.scrollLeft;
    });

    window.addEventListener("pointermove", (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        strip.classList.add("is-dragging");
      }
      if (moved) {
        strip.scrollLeft = startScrollLeft - dx;
      }
    });

    function stopDrag() {
      if (!isDown) return;
      isDown = false;
      strip.classList.remove("is-dragging");
      if (moved) {
        suppressNextClick = true;
        setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }
    }

    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    strip.addEventListener(
      "wheel",
      (e) => {
        if (strip.scrollWidth <= strip.clientWidth) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          strip.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );
  }

  enableDragScroll(els.fxStrip);
  enableDragScroll(els.artworkStrip);

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePause();
    } else if (e.key === "l" || e.key === "L") {
      toggleLanguage();
    } else if (e.key === "h" || e.key === "H") {
      toggleHud();
    } else if (e.key === "f" || e.key === "F") {
      els.btnFullscreen.click();
    } else if (e.key === "r" || e.key === "R") {
      randomizeAll();
    } else if (e.key === "ArrowLeft") {
      cycleArtwork(state.lang === "fa" ? 1 : -1);
    } else if (e.key === "ArrowRight") {
      cycleArtwork(state.lang === "fa" ? -1 : 1);
    } else if (e.key === "ArrowUp") {
      state.speed = Math.min(3.5, +(state.speed + 0.2).toFixed(2));
      engine.setSpeed(state.speed);
      syncUI();
      savePrefs();
    } else if (e.key === "ArrowDown") {
      state.speed = Math.max(-3.5, +(state.speed - 0.2).toFixed(2));
      engine.setSpeed(state.speed);
      syncUI();
      savePrefs();
    }
  });

  window.addEventListener("resize", () => engine.resize());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) engine.stop();
    else engine.start();
  });

  // Boot
  buildArtworkPills();
  applyLanguage();
  engine.setSpeed(state.speed);
  engine.setFx(state.fx);
  engine.setAdjustments({
    brightness: state.brightness,
    contrast: state.contrast,
    saturation: state.saturation,
  });
  engine.setRandomCenter(state.randomCenter);
  selectArtwork(state.quiltId);
  engine.start();
})();
