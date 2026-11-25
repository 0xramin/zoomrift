(function () {
  "use strict";

  function createOrthoMatrix(left, right, bottom, top, near, far) {
    const rl = right - left;
    const tb = top - bottom;
    const fn = far - near;
    return new Float32Array([
      2 / rl, 0, 0, 0,
      0, 2 / tb, 0, 0,
      0, 0, -2 / fn, 0,
      -(right + left) / rl, -(top + bottom) / tb, -(far + near) / fn, 1
    ]);
  }

  function hsvToRgb(hDeg, s, v) {
    const h = ((hDeg % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [r + m, g + m, b + m];
  }

  function buildFadeColor(hueDeg, isLight) {
    const targetLuma = isLight ? 0.72 : 0.10;
    let [r, g, b] = hsvToRgb(hueDeg, 0.95, 1.0);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (isLight && luma < targetLuma) {
      const t = (targetLuma - luma) / (1.0 - luma);
      r += (1.0 - r) * t;
      g += (1.0 - g) * t;
      b += (1.0 - b) * t;
    } else if (luma > targetLuma) {
      const k = targetLuma / luma;
      r *= k;
      g *= k;
      b *= k;
    }
    return [r, g, b];
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("Shader compile error: " + info);
    }
    return shader;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("Program link error: " + info);
    }
    return prog;
  }

  class ZoomQuiltEngine {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.onLoadProgress = (options && options.onLoadProgress) || function () {};
      this.onFirstFrame = (options && options.onFirstFrame) || function () {};
      this.onError = (options && options.onError) || function () {};

      this.artwork = null;
      this.artworkVersion = 0;

      // Render state
      this.zpos = 0;
      this.sliderSpeed = 1.1;
      this.paused = false;
      this.activeSpeed = 1.1;
      this.isDragging = false;
      this.dragTargetSpeed = 0;
      this.dragTauMs = 32;

      this.fx = "original";
      this.brightness = 0; // -50..50
      this.contrast = 0;   // -50..50
      this.saturation = 0; // -50..50
      this.randomCenter = false;
      this.centerOffsetX = 0;
      this.centerOffsetY = 0;

      // Shader animation clocks (matching Lbc in APK)
      this.shaderTime = 0;
      this.hueSeedDeg = Math.random() * 360;
      this.colorTravelDeg = 0;
      this.fadeLightHue = Math.random() * 360;
      this.fadeDarkHue = Math.random() * 360;
      this.lastFxKey = "";

      // Texture streaming & LRU cache
      this.tiles = [];
      this.maxCachedTextures = 34;
      this.activeLoads = 0;
      this.maxConcurrentLoads = 4;
      this.firstFrameFired = false;

      // GL objects
      this.gl = null;
      this.isWebGL2 = false;
      this.width = 1;
      this.height = 1;
      this.baseW = 1;
      this.baseH = 1;
      this.mvpMatrix = createOrthoMatrix(0, 1, 0, 1, 1, -1);

      this.fbo = null;
      this.fboTex = null;
      this.fboW = 0;
      this.fboH = 0;

      this.rafId = null;
      this.lastTimestamp = 0;

      this._initGL();
      this._resize();

      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(this.canvas);
      }
    }

    _initGL() {
      const opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
      let gl = this.canvas.getContext("webgl2", opts);
      this.isWebGL2 = !!gl;
      if (!gl) {
        gl = this.canvas.getContext("webgl", opts) || this.canvas.getContext("experimental-webgl", opts);
      }
      if (!gl) {
        this.onError("WebGL is not supported in this browser.");
        return;
      }
      this.gl = gl;

      const S = window.ZOOMQUILT_SHADERS;
      this.layerProg = createProgram(gl, S.layerVertex, S.layerFragment);
      this.layerLoc = {
        aPosition: gl.getAttribLocation(this.layerProg, "aPosition"),
        aTexPosition: gl.getAttribLocation(this.layerProg, "aTexPosition"),
        uTexture: gl.getUniformLocation(this.layerProg, "uTexture"),
        uMVPMatrix: gl.getUniformLocation(this.layerProg, "uMVPMatrix"),
      };

      this.postProg = createProgram(gl, S.postVertex, S.postFragment);
      this.postLoc = {
        aPosition: gl.getAttribLocation(this.postProg, "aPosition"),
        uSampler: gl.getUniformLocation(this.postProg, "uSampler"),
        uResolution: gl.getUniformLocation(this.postProg, "uResolution"),
        uTexelSize: gl.getUniformLocation(this.postProg, "uTexelSize"),
        uTime: gl.getUniformLocation(this.postProg, "uTime"),
        uBrightness: gl.getUniformLocation(this.postProg, "uBrightness"),
        uContrast: gl.getUniformLocation(this.postProg, "uContrast"),
        uSaturation: gl.getUniformLocation(this.postProg, "uSaturation"),
        uHueSeedAngle: gl.getUniformLocation(this.postProg, "uHueSeedAngle"),
        uColorTravelAngle: gl.getUniformLocation(this.postProg, "uColorTravelAngle"),
        uDistortionAmount: gl.getUniformLocation(this.postProg, "uDistortionAmount"),
        uLegacyFxMode: gl.getUniformLocation(this.postProg, "uLegacyFxMode"),
        uDistortionMode: gl.getUniformLocation(this.postProg, "uDistortionMode"),
        uColorMode: gl.getUniformLocation(this.postProg, "uColorMode"),
        uFadeLight: gl.getUniformLocation(this.postProg, "uFadeLight"),
        uFadeDark: gl.getUniformLocation(this.postProg, "uFadeDark"),
        uHueMatrix1: gl.getUniformLocation(this.postProg, "uHueMatrix1"),
        uHueMatrix2: gl.getUniformLocation(this.postProg, "uHueMatrix2"),
        uHueMatrix3: gl.getUniformLocation(this.postProg, "uHueMatrix3"),
      };

      // Buffers
      this.quadPosBuf = gl.createBuffer();
      this.quadPosData = new Float32Array(8);

      // Android array_c: (0,1), (1,1), (0,0), (1,0) paired with ortho(0, W, 0, H)
      this.quadTexBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTexBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);

      this.postPosBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.postPosBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

      gl.clearColor(0, 0, 0, 1);
      gl.disable(gl.DEPTH_TEST);
    }

    _resize() {
      if (!this.gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.width = w;
      this.height = h;

      const artW = this.artwork ? this.artwork.width : 800;
      const artH = this.artwork ? this.artwork.height : 600;
      const scaledW = (artW / artH) * h;
      if (w > scaledW) {
        this.baseW = w;
        this.baseH = (artH / artW) * w;
      } else {
        this.baseW = scaledW;
        this.baseH = h;
      }
      this.mvpMatrix = createOrthoMatrix(0, w, 0, h, 1, -1);
    }

    resize() {
      this._resize();
    }

    _ensureFBO() {
      const gl = this.gl;
      if (this.fbo && this.fboW === this.width && this.fboH === this.height) {
        return true;
      }
      this._destroyFBO();
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);
        return false;
      }
      this.fbo = fbo;
      this.fboTex = tex;
      this.fboW = this.width;
      this.fboH = this.height;
      return true;
    }

    _destroyFBO() {
      if (!this.gl) return;
      if (this.fboTex) {
        this.gl.deleteTexture(this.fboTex);
        this.fboTex = null;
      }
      if (this.fbo) {
        this.gl.deleteFramebuffer(this.fbo);
        this.fbo = null;
      }
      this.fboW = 0;
      this.fboH = 0;
    }

    _disposeTiles() {
      const gl = this.gl;
      for (const t of this.tiles) {
        if (t.texture && gl) {
          gl.deleteTexture(t.texture);
        }
        if (t.img) {
          t.img.onload = null;
          t.img.onerror = null;
        }
      }
      this.tiles = [];
      this.activeLoads = 0;
    }

    setArtwork(artwork, startPos) {
      this.artworkVersion += 1;
      this._disposeTiles();
      this.artwork = artwork;
      this.firstFrameFired = false;
      this.zpos = typeof startPos === "number" ? ((startPos % artwork.tiles.length) + artwork.tiles.length) % artwork.tiles.length : 0;

      this.tiles = artwork.tiles.map((src, idx) => ({
        index: idx,
        src,
        state: "idle", // idle | loading | ready | error
        texture: null,
        img: null,
        lastUsed: 0,
      }));

      this._resize();
      this._scheduleWindowLoads();
    }

    setSpeed(speed) {
      this.sliderSpeed = Math.max(-3.5, Math.min(3.5, speed));
      if (!this.isDragging) {
        this.activeSpeed = this.paused ? 0 : this.sliderSpeed;
      }
    }

    setPaused(paused) {
      this.paused = !!paused;
      if (!this.isDragging) {
        this.activeSpeed = this.paused ? 0 : this.sliderSpeed;
      }
    }

    setFx(fx) {
      this.fx = fx;
    }

    setAdjustments({ brightness, contrast, saturation }) {
      if (typeof brightness === "number") this.brightness = brightness;
      if (typeof contrast === "number") this.contrast = contrast;
      if (typeof saturation === "number") this.saturation = saturation;
    }

    setRandomCenter(enabled) {
      this.randomCenter = !!enabled;
      if (this.randomCenter) {
        this.centerOffsetX = Math.random() - 0.5;
        this.centerOffsetY = Math.random() - 0.5;
      } else {
        this.centerOffsetX = 0;
        this.centerOffsetY = 0;
      }
    }

    beginDrag() {
      this.isDragging = true;
      this.dragTargetSpeed = 0;
    }

    updateDrag(speed) {
      if (!this.isDragging) return;
      this.dragTargetSpeed = Math.max(-3.5, Math.min(3.5, speed));
    }

    endDrag() {
      this.isDragging = false;
    }

    nudgeZoom(delta) {
      if (!this.artwork) return;
      const n = this.artwork.tiles.length;
      this.zpos = (((this.zpos + delta) % n) + n) % n;
      this._scheduleWindowLoads();
    }

    _requestTile(tile) {
      if (tile.state !== "idle" || this.activeLoads >= this.maxConcurrentLoads) return;
      tile.state = "loading";
      this.activeLoads += 1;
      const version = this.artworkVersion;
      const img = new Image();
      img.decoding = "async";
      tile.img = img;

      img.onload = () => {
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        if (version !== this.artworkVersion || !this.gl) return;
        this._uploadTexture(tile, img);
        tile.img = null;
        this._scheduleWindowLoads();
      };
      img.onerror = () => {
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        if (version !== this.artworkVersion) return;
        tile.state = "error";
        tile.img = null;
        this._scheduleWindowLoads();
      };
      img.src = tile.src;
    }

    _uploadTexture(tile, img) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const isPOT = (img.width & (img.width - 1)) === 0 && (img.height & (img.height - 1)) === 0;
      const canMipmap = this.isWebGL2 || isPOT;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      if (canMipmap) {
        gl.generateMipmap(gl.TEXTURE_2D);
        const minFilter = this.artwork && this.artwork.mipmapNearest ? gl.LINEAR_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }

      tile.texture = tex;
      tile.state = "ready";
      tile.lastUsed = performance.now();
      this._evictOldTextures();
    }

    _evictOldTextures() {
      if (!this.artwork || !this.gl) return;
      const ready = this.tiles.filter((t) => t.state === "ready");
      if (ready.length <= this.maxCachedTextures) return;

      const n = this.tiles.length;
      const base = Math.floor(this.zpos);
      const protectedSet = new Set();
      for (let i = -3; i <= 10; i++) {
        protectedSet.add((((base + i) % n) + n) % n);
      }

      ready.sort((a, b) => a.lastUsed - b.lastUsed);
      let excess = ready.length - this.maxCachedTextures;
      for (const t of ready) {
        if (excess <= 0) break;
        if (protectedSet.has(t.index)) continue;
        this.gl.deleteTexture(t.texture);
        t.texture = null;
        t.state = "idle";
        excess--;
      }
    }

    _scheduleWindowLoads() {
      if (!this.tiles.length) return;
      const n = this.tiles.length;
      const base = Math.floor(this.zpos);
      const dir = this.activeSpeed >= 0 ? 1 : -1;

      // Priority: active visible layers first, then lookahead in zoom direction, then opposite
      const order = [];
      const layers = this.randomCenter ? 6 : 5;
      for (let i = 0; i < layers; i++) order.push(i);
      for (let step = 1; step <= 8; step++) {
        order.push(dir > 0 ? layers - 1 + step : -step);
      }
      for (let step = 1; step <= 3; step++) {
        order.push(dir > 0 ? -step : layers - 1 + step);
      }

      let readyCount = 0;
      for (let i = 0; i < layers; i++) {
        const idx = (((base + i) % n) + n) % n;
        if (this.tiles[idx].state === "ready") readyCount++;
      }
      this.onLoadProgress(readyCount, layers);

      for (const offset of order) {
        if (this.activeLoads >= this.maxConcurrentLoads) break;
        const idx = (((base + offset) % n) + n) % n;
        this._requestTile(this.tiles[idx]);
      }
    }

    start() {
      if (this.rafId !== null) return;
      this.lastTimestamp = 0;
      const loop = (ts) => {
        this.rafId = requestAnimationFrame(loop);
        this._render(ts);
      };
      this.rafId = requestAnimationFrame(loop);
    }

    stop() {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    _updatePostClocks(dtMs) {
      if (this.fx !== this.lastFxKey) {
        if (this.fx === "flare") {
          this.fadeLightHue = Math.random() * 360;
          this.fadeDarkHue = Math.random() * 360;
        }
        this.hueSeedDeg = Math.random() * 360;
        this.colorTravelDeg = 0;
        this.lastFxKey = this.fx;
      }

      if (this.fx === "flare") {
        this.fadeLightHue = (this.fadeLightHue + (dtMs * 360) / 60000) % 360;
        this.fadeDarkHue = (this.fadeDarkHue + (dtMs * 360) / 60000) % 360;
      }
      this.shaderTime = (this.shaderTime + dtMs / 1000) % (Math.PI * 200);
      if (this.fx === "hue" || this.fx === "acid") {
        this.colorTravelDeg = (this.colorTravelDeg + dtMs / 50) % 720;
      }
    }

    _render(ts) {
      const gl = this.gl;
      if (!gl || !this.artwork || !this.tiles.length) return;

      const dtMs = this.lastTimestamp === 0 ? 0 : Math.min(100, Math.max(0, ts - this.lastTimestamp));
      this.lastTimestamp = ts;

      // Smooth speed interpolation (matches Lrm)
      const targetSpeed = this.isDragging ? this.dragTargetSpeed : (this.paused ? 0 : this.sliderSpeed);
      if (this.isDragging) {
        const alpha = 1 - Math.exp(-dtMs / this.dragTauMs);
        this.activeSpeed += (targetSpeed - this.activeSpeed) * alpha;
      } else if (Math.abs(targetSpeed - this.activeSpeed) > 0.005) {
        const alpha = 1 - Math.exp(-dtMs / 90);
        this.activeSpeed += (targetSpeed - this.activeSpeed) * alpha;
      } else {
        this.activeSpeed = targetSpeed;
      }

      const n = this.tiles.length;
      const base = Math.floor(this.zpos);
      const layers = this.randomCenter ? 6 : 5;

      // Only advance zoom once at least the outer visible layer is ready
      const baseTileReady = this.tiles[((base % n) + n) % n].state === "ready";
      if (baseTileReady && dtMs > 0) {
        const s = this.activeSpeed;
        const delta = s * s * dtMs * 0.0003;
        this.zpos = s >= 0 ? this.zpos + delta : this.zpos - delta;
        this.zpos = ((this.zpos % n) + n) % n;
      }

      this._updatePostClocks(dtMs);
      this._scheduleWindowLoads();

      if (!this.firstFrameFired && baseTileReady) {
        this.firstFrameFired = true;
        this.onFirstFrame();
      }

      const usePost =
        this.fx !== "original" ||
        this.brightness !== 0 ||
        this.contrast !== 0 ||
        this.saturation !== 0;

      let fboReady = false;
      if (usePost) {
        fboReady = this._ensureFBO();
      }

      if (fboReady) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.viewport(0, 0, this.width, this.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (baseTileReady) {
        gl.useProgram(this.layerProg);
        gl.uniformMatrix4fv(this.layerLoc.uMVPMatrix, false, this.mvpMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(this.layerLoc.uTexture, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTexBuf);
        gl.vertexAttribPointer(this.layerLoc.aTexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.layerLoc.aTexPosition);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadPosBuf);
        gl.enableVertexAttribArray(this.layerLoc.aPosition);

        const curBase = Math.floor(this.zpos);
        let scale = Math.pow(2, this.zpos % 1);
        if (this.randomCenter) scale *= 1.5;

        const offX = this.randomCenter ? (this.centerOffsetX * this.width) / 2 : 0;
        const offY = this.randomCenter ? (this.centerOffsetY * this.height) / 2 : 0;

        const now = performance.now();
        for (let i = 0; i < layers; i++) {
          const idx = (((curBase + i) % n) + n) % n;
          const tile = this.tiles[idx];
          if (tile.state === "ready" && tile.texture) {
            tile.lastUsed = now;
            const left = this.width / 2 - (this.baseW / 2) * scale + offX;
            const bottom = this.height / 2 - (this.baseH / 2) * scale + offY;
            const right = left + this.baseW * scale;
            const top = bottom + this.baseH * scale;

            this.quadPosData[0] = left;  this.quadPosData[1] = bottom;
            this.quadPosData[2] = right; this.quadPosData[3] = bottom;
            this.quadPosData[4] = left;  this.quadPosData[5] = top;
            this.quadPosData[6] = right; this.quadPosData[7] = top;

            gl.bufferData(gl.ARRAY_BUFFER, this.quadPosData, gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(this.layerLoc.aPosition, 2, gl.FLOAT, false, 0, 0);

            gl.bindTexture(gl.TEXTURE_2D, tile.texture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
          scale *= 0.5;
        }

        gl.disableVertexAttribArray(this.layerLoc.aPosition);
        gl.disableVertexAttribArray(this.layerLoc.aTexPosition);
      }

      if (fboReady) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.postProg);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
        gl.uniform1i(this.postLoc.uSampler, 0);

        gl.uniform2f(this.postLoc.uResolution, this.width, this.height);
        gl.uniform2f(this.postLoc.uTexelSize, 1 / this.width, 1 / this.height);
        gl.uniform1f(this.postLoc.uTime, this.shaderTime);
        gl.uniform1f(this.postLoc.uBrightness, Math.max(-50, Math.min(50, this.brightness)) / 100);
        gl.uniform1f(this.postLoc.uContrast, this.contrast / 100 + 1.0);
        gl.uniform1f(this.postLoc.uSaturation, this.saturation / 100 + 1.0);
        gl.uniform1f(this.postLoc.uHueSeedAngle, (this.hueSeedDeg * Math.PI) / 180);
        gl.uniform1f(this.postLoc.uColorTravelAngle, (this.colorTravelDeg * Math.PI) / 180);
        gl.uniform1f(this.postLoc.uDistortionAmount, 1.0);

        const legacyFxMode = this.fx === "prism" ? 3 : 0;
        const distortionMode = this.fx === "swirl" || this.fx === "acid" ? 1 : 0;
        let colorMode = 0;
        if (this.fx === "hue") colorMode = 1;
        else if (this.fx === "flare") colorMode = 6;
        else if (this.fx === "acid") colorMode = 3;

        gl.uniform1i(this.postLoc.uLegacyFxMode, legacyFxMode);
        gl.uniform1i(this.postLoc.uDistortionMode, distortionMode);
        gl.uniform1i(this.postLoc.uColorMode, colorMode);

        const [lr, lg, lb] = buildFadeColor(this.fadeLightHue, true);
        const [dr, dg, db] = buildFadeColor(this.fadeDarkHue, false);
        gl.uniform3f(this.postLoc.uFadeLight, lr, lg, lb);
        gl.uniform3f(this.postLoc.uFadeDark, dr, dg, db);

        const rad = (((this.hueSeedDeg + this.colorTravelDeg) % 360) * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        gl.uniform3f(
          this.postLoc.uHueMatrix1,
          0.213 + c * 0.787 - s * 0.213,
          0.715 - c * 0.715 - s * 0.715,
          0.072 - c * 0.072 + s * 0.928
        );
        gl.uniform3f(
          this.postLoc.uHueMatrix2,
          0.213 - c * 0.213 + s * 0.143,
          0.715 + c * 0.285 + s * 0.140,
          0.072 - c * 0.072 - s * 0.283
        );
        gl.uniform3f(
          this.postLoc.uHueMatrix3,
          0.213 - c * 0.213 - s * 0.787,
          0.715 - c * 0.715 + s * 0.715,
          0.072 + c * 0.928 + s * 0.072
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, this.postPosBuf);
        gl.vertexAttribPointer(this.postLoc.aPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.postLoc.aPosition);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(this.postLoc.aPosition);
      }
    }

    destroy() {
      this.stop();
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
      this._disposeTiles();
      this._destroyFBO();
      if (this.gl) {
        if (this.quadPosBuf) this.gl.deleteBuffer(this.quadPosBuf);
        if (this.quadTexBuf) this.gl.deleteBuffer(this.quadTexBuf);
        if (this.postPosBuf) this.gl.deleteBuffer(this.postPosBuf);
        if (this.layerProg) this.gl.deleteProgram(this.layerProg);
        if (this.postProg) this.gl.deleteProgram(this.postProg);
      }
    }
  }

  window.ZoomQuiltEngine = ZoomQuiltEngine;
})();
