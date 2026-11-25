window.ZOOMQUILT_SHADERS = {
  layerVertex: `
    uniform mat4 uMVPMatrix;
    attribute vec2 aPosition;
    attribute vec2 aTexPosition;
    varying vec2 vTexPosition;
    void main() {
      gl_Position = uMVPMatrix * vec4(aPosition, 0.0, 1.0);
      vTexPosition = aTexPosition;
    }
  `,

  layerFragment: `
    precision mediump float;
    varying vec2 vTexPosition;
    uniform sampler2D uTexture;
    void main() {
      gl_FragColor = texture2D(uTexture, vTexPosition);
    }
  `,

  postVertex: `
    attribute vec2 aPosition;
    varying highp vec2 vTextureCoord;
    void main() {
      gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
      vTextureCoord = aPosition;
    }
  `,

  // Ported from the APK's res/raw/postprocess.glsl (Zoomquilt WebGL Player 2026)
  postFragment: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
precision mediump int;
varying highp vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 uResolution;
uniform vec2 uTexelSize;
uniform float uTime;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uZoomPhase;
uniform float uMotion;
uniform float uHueAngle;
uniform float uHueSeedAngle;
uniform float uColorTravelAngle;
uniform float uDistortionAmount;
uniform int uLegacyFxMode;
uniform int uDistortionMode;
uniform int uColorMode;
uniform vec3 uFadeLight;
uniform vec3 uFadeDark;
uniform vec3 uHueMatrix1;
uniform vec3 uHueMatrix2;
uniform vec3 uHueMatrix3;
const float TAU = 6.28318530718;

float luma(vec3 color) {
	return dot(color, vec3(0.299, 0.587, 0.114));
}

vec2 clampUv(vec2 uv) {
	vec2 padding = max(uTexelSize * 2.0, vec2(0.0005));
	return clamp(uv, padding, vec2(1.0) - padding);
}

vec2 overscanUv(vec2 uv, float margin) {
	float safeMargin = clamp(margin, 0.0, 0.18);
	float edgeBand = clamp(0.12 + safeMargin * 2.2, 0.12, 0.28);
	vec2 distanceToEdge = min(uv, vec2(1.0) - uv);
	vec2 edgeWeight = 1.0 - smoothstep(vec2(0.0), vec2(edgeBand), distanceToEdge);
	edgeWeight *= edgeWeight;
	vec2 overscanned = mix(vec2(safeMargin), vec2(1.0 - safeMargin), uv);
	return mix(uv, overscanned, edgeWeight);
}

vec3 sampleScene(vec2 uv) {
	return texture2D(uSampler, clampUv(uv)).rgb;
}

vec3 hueShift(vec3 color, float angle) {
	const mat3 toYiq = mat3(
		0.299, 0.587, 0.114,
		0.596, -0.275, -0.321,
		0.212, -0.523, 0.311
	);
	const mat3 toRgb = mat3(
		1.0, 0.956, 0.621,
		1.0, -0.272, -0.647,
		1.0, -1.107, 1.704
	);
	vec3 yiq = toYiq * color;
	float baseHue = atan(yiq.z, yiq.y) + angle;
	float chroma = sqrt(yiq.y * yiq.y + yiq.z * yiq.z);
	return clamp(toRgb * vec3(yiq.x, chroma * cos(baseHue), chroma * sin(baseHue)), 0.0, 1.0);
}

vec3 applyColorMatrix(vec3 color, vec3 row1, vec3 row2, vec3 row3) {
	return vec3(
		dot(row1, color),
		dot(row2, color),
		dot(row3, color)
	);
}

vec2 applySwirlDistortion(vec2 screenUv, vec2 overscannedUv, vec2 tangentialUvDir, vec2 radialUvDir, float radius, float portraitBoost, float amount) {
	float overscanBlend = clamp(amount, 0.0, 1.0);
	float portraitFocus = clamp(portraitBoost - 1.0, 0.0, 1.0);
	float swirlMask = smoothstep(mix(0.015, 0.006, portraitFocus), mix(0.22, 0.12, portraitFocus), radius)
		* (1.0 - smoothstep(0.78, 0.98, radius));
	float midSwirl = smoothstep(mix(0.08, 0.025, portraitFocus), mix(0.3, 0.18, portraitFocus), radius)
		* (1.0 - smoothstep(0.5, 0.82, radius));
	float centerBoost = 1.0 + 0.15 * portraitFocus * (1.0 - smoothstep(0.12, 0.28, radius));
	float swirlWave = 0.72 + 0.28 * sin(uTime * 0.55 + radius * 10.0);
	float swirlLeanPhase = sin(uTime * 0.12);
	float swirlLean = swirlLeanPhase / (0.35 + 0.65 * abs(swirlLeanPhase));
	float twist = (0.006 + 0.016 * swirlMask + 0.01 * midSwirl) * swirlWave * portraitBoost * centerBoost * amount;
	vec2 swirlBaseUv = mix(screenUv, overscannedUv, overscanBlend);
	vec2 swirlUv = swirlBaseUv + tangentialUvDir * twist * swirlLean * (0.35 + 0.65 * swirlMask);
	swirlUv += radialUvDir * 0.0045 * portraitBoost * sin(radius * 24.0 - uTime * 0.9) * (0.4 + 0.6 * midSwirl) * centerBoost * amount;
	return swirlUv;
}

vec2 applyAcidDistortion(vec2 screenUv, vec2 overscannedUv, vec2 tangentialUvDir, vec2 radialUvDir, float radius, float portraitBoost, float amount) {
	float acidOuter = smoothstep(0.02, 0.18, radius);
	float acidMid = smoothstep(0.08, 0.28, radius) * (1.0 - smoothstep(0.54, 0.92, radius));
	float acidSpin = 0.7 + 0.3 * sin(uTime * 0.42 + radius * 7.0);
	float acidTwist = (0.005 + 0.018 * acidOuter + 0.01 * acidMid) * acidSpin * portraitBoost * amount;
	vec2 acidBaseUv = mix(screenUv, overscannedUv, amount);
	vec2 acidUv = acidBaseUv + tangentialUvDir * acidTwist * (0.22 + 0.78 * acidOuter);
	acidUv += radialUvDir * 0.0055 * portraitBoost * sin(radius * 22.0 - uTime * 0.95) * (0.3 + 0.7 * acidMid) * amount;
	return acidUv;
}

vec2 applyDistortion(vec2 screenUv, vec2 overscannedUv, vec2 tangentialUvDir, vec2 radialUvDir, float radius, float portraitBoost, float amount) {
	if (uDistortionMode == 1) {
		return applySwirlDistortion(screenUv, overscannedUv, tangentialUvDir, radialUvDir, radius, portraitBoost, amount);
	}
	if (uDistortionMode == 2) {
		return applyAcidDistortion(screenUv, overscannedUv, tangentialUvDir, radialUvDir, radius, portraitBoost, amount);
	}
	return screenUv;
}

vec3 applyHueColor(vec3 sourceColor) {
	return applyColorMatrix(sourceColor, uHueMatrix1, uHueMatrix2, uHueMatrix3);
}

vec3 applyFlareColor(vec3 sourceColor, float radius, float cycleAngle) {
	float saturationBoost = 0.08 + 0.08 * sin(cycleAngle * 2.0 + radius * 10.0);
	vec3 flareColor = hueShift(sourceColor, cycleAngle);
	return mix(vec3(luma(flareColor)), flareColor, 1.0 + saturationBoost);
}

vec3 applyAcidColor(vec3 sourceColor, float radius, float cycleAngle) {
	vec3 acidColor = applyHueColor(sourceColor);
	float acidDrift = 0.085 * sin(cycleAngle * 1.22 + radius * 6.5) + 0.05 * sin(cycleAngle * 0.5 - radius * 11.0);
	acidColor = hueShift(acidColor, acidDrift);
	float acidSaturation = 1.08 + 0.06 * sin(cycleAngle * 1.67 + radius * 5.5);
	acidColor = mix(vec3(luma(acidColor)), acidColor, acidSaturation);
	float acidWash = 0.5 + 0.5 * sin(cycleAngle * 1.33 + radius * 4.0);
	acidColor *= mix(vec3(1.025, 0.99, 1.0), vec3(0.975, 1.02, 1.04), acidWash);
	return clamp((acidColor - 0.5) * 1.1 + 0.5, 0.0, 1.0);
}

vec3 applyCycleColor(vec3 sourceColor, float radius) {
	float sequencePhase = mod(uColorTravelAngle + uHueSeedAngle, TAU * 2.0);
	if (sequencePhase < TAU) {
		return hueShift(sourceColor, sequencePhase);
	}
	float flarePhase = sequencePhase - TAU;
	vec3 flareColor = applyFlareColor(sourceColor, radius, flarePhase);
	float flareEnvelope = sin(flarePhase * 0.5);
	flareEnvelope *= flareEnvelope;
	return mix(sourceColor, flareColor, flareEnvelope);
}

vec3 applyColorEffect(vec3 sourceColor, float radius) {
	if (uColorMode == 1) {
		return applyHueColor(sourceColor);
	}
	if (uColorMode == 2) {
		return applyFlareColor(sourceColor, radius, uHueSeedAngle + uColorTravelAngle);
	}
	if (uColorMode == 3) {
		return applyAcidColor(sourceColor, radius, uColorTravelAngle);
	}
	if (uColorMode == 4) {
		return applyCycleColor(sourceColor, radius);
	}
	if (uColorMode == 6) {
		float grey = smoothstep(0.08, 0.92, dot(sourceColor, vec3(0.21, 0.71, 0.07)) / 0.99);
		return mix(uFadeDark, uFadeLight, grey);
	}
	return sourceColor;
}

void main(void) {
	vec2 resolution = max(uResolution, vec2(1.0));
	float aspect = resolution.x / resolution.y;
	vec2 screenUv = vTextureCoord;
	vec3 baseColor = sampleScene(screenUv);
	vec3 color = baseColor;
	vec2 centered = screenUv - vec2(0.5);
	centered.x *= aspect;
	float radius = length(centered);
	vec2 radialDir = radius > 0.0001 ? centered / radius : vec2(0.0, 1.0);
	vec2 tangentialDir = vec2(-radialDir.y, radialDir.x);
	vec2 radialUvDir = normalize(vec2(radialDir.x / aspect, radialDir.y));
	vec2 tangentialUvDir = normalize(vec2(tangentialDir.x / aspect, tangentialDir.y));
	float portraitBoost = 1.0 + max(0.0, (1.0 / max(aspect, 0.0001)) - 1.0) * 0.55;
	float distortionMargin = clamp(0.032 + max(0.0, portraitBoost - 1.0) * 0.014, 0.032, 0.05);
	vec2 distortionBaseUv = overscanUv(screenUv, distortionMargin);
	vec3 distortionBaseColor = sampleScene(distortionBaseUv);
	float centerMask = smoothstep(0.03, 0.12, radius);
	float outerMask = smoothstep(0.06, 0.82, radius);
	float distortionAmount = clamp(uDistortionAmount, 0.0, 3.0);

	if (uLegacyFxMode == 3) {
		float ringWave = sin(radius * 16.0 - uTime * 0.8);
		float ribbon = sin(radius * 7.0 + uTime * 0.55);
		float drift = sin(radius * 3.5 - uTime * 0.3);
		float pulse = 0.78 + 0.22 * sin(uTime * 0.45 + radius * 6.0);
		float spread = (0.0034 + 0.0102 * outerMask) * (0.65 + 0.35 * ringWave * ringWave) * pulse * portraitBoost;
		vec2 offset = (tangentialUvDir * ringWave + radialUvDir * 0.62 * ribbon + tangentialUvDir * 0.42 * drift) * spread * centerMask;
		vec3 prismColor = vec3(
			sampleScene(screenUv + offset * 1.95).r,
			sampleScene(screenUv + offset * 0.18).g,
			sampleScene(screenUv - offset * 1.95).b
		);
		color = mix(baseColor, prismColor, 0.92);
		color += vec3(0.055, 0.078, 0.105) * outerMask * (0.45 + 0.55 * ringWave * ringWave) * pulse;
	} else if (uLegacyFxMode == 10) {
		float carnivalResponse = clamp((distortionAmount - 1.0) / 4.0, 0.0, 1.0);
		float carnivalAmount = mix(0.45, 4.5, pow(carnivalResponse, 1.6));
		float carnivalOverscan = clamp(carnivalAmount, 0.0, 1.0);
		float carnivalMask = smoothstep(0.02, 0.9, radius);
		float spin = sin(radius * 22.0 - uTime * 1.6);
		float bounce = cos(radius * 9.0 + uTime * 1.15);
		vec2 carnivalWarp = tangentialUvDir * spin * (0.006 + 0.018 * carnivalMask) * portraitBoost * carnivalAmount;
		carnivalWarp += radialUvDir * bounce * (0.003 + 0.008 * centerMask) * portraitBoost * carnivalAmount;
		vec2 carnivalUv = mix(screenUv, distortionBaseUv, carnivalOverscan) + carnivalWarp;
		vec3 carnivalColor = vec3(
			sampleScene(carnivalUv + carnivalWarp * 0.9).r,
			sampleScene(carnivalUv - carnivalWarp * 0.15).g,
			sampleScene(carnivalUv - carnivalWarp * 0.9).b
		);
		carnivalColor = hueShift(carnivalColor, uHueSeedAngle + uColorTravelAngle + 0.8 * sin(uTime * 0.9) + radius * 1.4);
		color = mix(distortionBaseColor, carnivalColor, 0.92);
	} else {
		vec2 effectUv = applyDistortion(screenUv, distortionBaseUv, tangentialUvDir, radialUvDir, radius, portraitBoost, distortionAmount);
		vec3 sourceColor = sampleScene(effectUv);
		color = applyColorEffect(sourceColor, radius);
	}

	color = clamp(color, 0.0, 1.0);
	color = mix(vec3(luma(color)), color, uSaturation);
	color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);
	color = mix(color, uBrightness < 0.0 ? vec3(0.0) : vec3(1.0), abs(uBrightness));
	gl_FragColor = vec4(color, 1.0);
}
`
};
