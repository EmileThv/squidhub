"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// Homepage background: the banner floats on a GPU fluid simulation (stable fluids).
// Moving the mouse gently stirs the liquid and leaves a rippling wake on a water surface (a separate
// wave simulation that refracts the image and catches the light). Clicking drops a ripple and squirts
// thin wisps of squid ink that curl and dissolve. Falls back to the static banner without WebGL2 or with reduced motion.

const IMAGE_SRC = "/images/bannerv3.png";

const SIM_RESOLUTION = 256;
const DYE_RESOLUTION = 1024;
const PRESSURE_ITERATIONS = 20;
const CURL_STRENGTH = 12;
const VELOCITY_DISSIPATION = 1.6;
const INK_DISSIPATION = 0.45;
const PRESSURE_DECAY = 0.8;
const STIR_FORCE = 2500;
const STIR_RADIUS = 0.0012;
const WAVE_RESOLUTION = 512;
const WAVE_DAMPING = 0.988; // per step: how long ripples last
const WAVE_STEPS = 2; // propagation steps per frame: how fast ripples travel
const WAKE_STRENGTH = 0.06;
const WAKE_RADIUS = 0.00004;
const WAKE_SPACING = 0.0025; // distance between drops along the cursor path
const MAX_WAKE_DROPS = 16;
const REFRACTION = 0.08;
const WAVE_INK_PUSH = 600; // how strongly passing ripples carry the ink

/* ------------------------------------------------------------------ */
/* SHADERS                                                             */
/* ------------------------------------------------------------------ */

const VERTEX = `#version 300 es
in vec2 aPosition;
uniform vec2 texelSize;
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB;
out vec4 fragColor;
`;

const SPLAT = `${HEADER}
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  fragColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
}`;

const ADVECTION = `${HEADER}
uniform sampler2D uVelocity, uSource, uWaves;
uniform vec2 velocityTexelSize, waveTexelSize;
uniform float dt, dissipation, wavePush;
void main() {
  // Water runs down the slope of the ripples, so whatever floats on it (the ink) rocks with them
  vec2 slope = vec2(
    texture(uWaves, vUv + vec2(waveTexelSize.x, 0.0)).r - texture(uWaves, vUv - vec2(waveTexelSize.x, 0.0)).r,
    texture(uWaves, vUv + vec2(0.0, waveTexelSize.y)).r - texture(uWaves, vUv - vec2(0.0, waveTexelSize.y)).r
  );
  vec2 velocity = texture(uVelocity, vUv).xy - slope * wavePush;
  vec2 coord = vUv - dt * velocity * velocityTexelSize;
  fragColor = texture(uSource, coord) / (1.0 + dissipation * dt);
}`;

const DIVERGENCE = `${HEADER}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  // Walls: reflect velocity at the edges
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const CURL = `${HEADER}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `${HEADER}
uniform sampler2D uVelocity, uCurl;
uniform float curl, dt;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy + force * dt;
  fragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
}`;

const PRESSURE = `${HEADER}
uniform sampler2D uPressure, uDivergence;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT = `${HEADER}
uniform sampler2D uPressure, uVelocity;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const SCALE = `${HEADER}
uniform sampler2D uTexture;
uniform float value;
void main() {
  fragColor = value * texture(uTexture, vUv);
}`;

// Water surface: r = current height, g = previous height (discrete wave equation)
const WAVES = `${HEADER}
uniform sampler2D uWaves;
uniform float damping;
void main() {
  vec2 C = texture(uWaves, vUv).rg;
  float neighbours = texture(uWaves, vL).r + texture(uWaves, vR).r + texture(uWaves, vT).r + texture(uWaves, vB).r;
  fragColor = vec4((neighbours * 0.5 - C.g) * damping, C.r, 0.0, 1.0);
}`;

const DISPLAY = `${HEADER}
uniform sampler2D uImage, uInk, uVelocity, uWaves;
uniform vec2 cover;
uniform vec2 inkTexelSize, waveTexelSize;
uniform float time;
uniform float refraction;

void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;

  // Slope of the water surface, used to refract the image and catch the light
  vec2 slope = vec2(
    texture(uWaves, vUv + vec2(waveTexelSize.x, 0.0)).r - texture(uWaves, vUv - vec2(waveTexelSize.x, 0.0)).r,
    texture(uWaves, vUv + vec2(0.0, waveTexelSize.y)).r - texture(uWaves, vUv - vec2(0.0, waveTexelSize.y)).r
  );

  // Slow ambient wobble so the image always feels liquid, plus the stirred velocity
  vec2 ambient = vec2(
    sin(vUv.y * 5.0 + time * 0.22) + sin(vUv.x * 3.0 - time * 0.17),
    cos(vUv.x * 4.0 + time * 0.19) + cos(vUv.y * 2.5 - time * 0.13)
  ) * 0.0008;
  vec2 uv = (vUv + velocity * 0.00008 + ambient + slope * refraction - 0.5) * cover + 0.5;

  // Chromatic split along the flow when the liquid moves fast
  vec2 dir = normalize(velocity + 0.00001);
  float split = clamp(length(velocity) * 0.000006, 0.0, 0.002);
  vec3 image = vec3(
    texture(uImage, uv + dir * split).r,
    texture(uImage, uv).g,
    texture(uImage, uv - dir * split).b
  );
  vec3 background = vec3(0.169, 0.176, 0.192);
  vec3 color = mix(background, image, 0.75);

  // Squid ink, seen through the same rippling surface: near-black body with an iridescent sheen on its edges
  vec2 inkUv = vUv + slope * refraction;
  float ink = texture(uInk, inkUv).r;
  vec2 gradient = vec2(
    texture(uInk, inkUv + vec2(inkTexelSize.x, 0.0)).r - texture(uInk, inkUv - vec2(inkTexelSize.x, 0.0)).r,
    texture(uInk, inkUv + vec2(0.0, inkTexelSize.y)).r - texture(uInk, inkUv - vec2(0.0, inkTexelSize.y)).r
  );
  float edge = clamp(length(gradient) * 5.0, 0.0, 1.0);
  float density = 1.0 - exp(-ink * 2.5);
  color = mix(color, vec3(0.03, 0.02, 0.06), density * 0.96);
  vec3 sheen = 0.5 + 0.5 * cos(6.2831 * (ink * 0.6 + time * 0.05 + vec3(0.0, 0.33, 0.67)));
  color += sheen * edge * 0.35;

  // Light on the ripples: zero on flat water, bright crests and dark troughs where it moves
  vec3 normal = normalize(vec3(-slope * 6.0, 1.0));
  vec3 light = normalize(vec3(-0.5, 0.7, 0.6));
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float diffuse = dot(normal, light) - light.z;
  float specular = max(pow(max(dot(normal, halfway), 0.0), 120.0) - pow(halfway.z, 120.0), 0.0);
  color += diffuse * 0.35 + specular * 0.6;

  fragColor = vec4(color, 1.0);
}`;

/* ------------------------------------------------------------------ */
/* WEBGL PLUMBING                                                      */
/* ------------------------------------------------------------------ */

type Program = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
};

type Target = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelX: number;
  texelY: number;
};

type DoubleTarget = { read: Target; write: Target; swap: () => void };

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertex: WebGLShader, fragmentSource: string): Program {
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
  }

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i)!.name;
    uniforms[name] = gl.getUniformLocation(program, name)!;
  }
  return { program, uniforms };
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number): Target {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, width, height);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return { texture, fbo, width, height, texelX: 1 / width, texelY: 1 / height };
}

function createDoubleTarget(gl: WebGL2RenderingContext, width: number, height: number): DoubleTarget {
  const target = {
    read: createTarget(gl, width, height),
    write: createTarget(gl, width, height),
    swap() {
      [target.read, target.write] = [target.write, target.read];
    },
  };
  return target;
}

// Grid size keeping the canvas aspect, with `resolution` cells on the short side
function gridSize(gl: WebGL2RenderingContext, resolution: number) {
  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const long = Math.round(resolution * (aspect < 1 ? 1 / aspect : aspect));
  return aspect > 1 ? { width: long, height: resolution } : { width: resolution, height: long };
}

/* ------------------------------------------------------------------ */
/* COMPONENT                                                           */
/* ------------------------------------------------------------------ */

export default function LiquidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return;

    let raf = 0;
    let disposed = false;

    try {
      const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
      const programs = {
        splat: createProgram(gl, vertex, SPLAT),
        advection: createProgram(gl, vertex, ADVECTION),
        divergence: createProgram(gl, vertex, DIVERGENCE),
        curl: createProgram(gl, vertex, CURL),
        vorticity: createProgram(gl, vertex, VORTICITY),
        pressure: createProgram(gl, vertex, PRESSURE),
        gradientSubtract: createProgram(gl, vertex, GRADIENT_SUBTRACT),
        scale: createProgram(gl, vertex, SCALE),
        waves: createProgram(gl, vertex, WAVES),
        display: createProgram(gl, vertex, DISPLAY),
      };

      // Fullscreen quad
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);

      const blit = (target: Target | null) => {
        if (target) {
          gl.viewport(0, 0, target.width, target.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        } else {
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      };

      // Texture units are assigned per pass; returns the unit index for a sampler uniform
      const bindTexture = (unit: number, texture: WebGLTexture) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return unit;
      };

      const bindProgram = (p: Program, texel: { texelX: number; texelY: number }) => {
        gl.useProgram(p.program);
        gl.uniform2f(p.uniforms.texelSize, texel.texelX, texel.texelY);
        return p.uniforms;
      };

      let velocity: DoubleTarget, ink: DoubleTarget, pressure: DoubleTarget, waves: DoubleTarget;
      let divergence: Target, curl: Target;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.floor(canvas.clientWidth * dpr);
        const height = Math.floor(canvas.clientHeight * dpr);
        if (width === 0 || height === 0) return false;
        if (canvas.width === width && canvas.height === height && velocity) return false;
        canvas.width = width;
        canvas.height = height;

        const sim = gridSize(gl, SIM_RESOLUTION);
        const dye = gridSize(gl, DYE_RESOLUTION);
        velocity = createDoubleTarget(gl, sim.width, sim.height);
        pressure = createDoubleTarget(gl, sim.width, sim.height);
        divergence = createTarget(gl, sim.width, sim.height);
        curl = createTarget(gl, sim.width, sim.height);
        ink = createDoubleTarget(gl, dye.width, dye.height);
        const water = gridSize(gl, WAVE_RESOLUTION);
        waves = createDoubleTarget(gl, water.width, water.height);
        return true;
      };

      const aspect = () => canvas.width / canvas.height;

      const splat = (target: DoubleTarget, x: number, y: number, color: [number, number, number], radius: number) => {
        const u = bindProgram(programs.splat, target.read);
        gl.uniform1i(u.uTarget, bindTexture(0, target.read.texture));
        gl.uniform1f(u.aspectRatio, aspect());
        gl.uniform2f(u.point, x, y);
        gl.uniform3f(u.color, ...color);
        gl.uniform1f(u.radius, aspect() > 1 ? radius * aspect() : radius);
        blit(target.write);
        target.swap();
      };

      // Drops along the cursor path dig a continuous wake in the water surface
      const wake = (x0: number, y0: number, x1: number, y1: number) => {
        const distance = Math.hypot((x1 - x0) * aspect(), y1 - y0);
        const drops = Math.min(MAX_WAKE_DROPS, Math.ceil(distance / WAKE_SPACING));
        for (let i = 1; i <= drops; i++) {
          const t = i / drops;
          splat(waves, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, [-WAKE_STRENGTH, 0, 0], WAKE_RADIUS);
        }
      };

      const stir = (x: number, y: number, dx: number, dy: number) => {
        splat(velocity, x, y, [dx * STIR_FORCE, dy * STIR_FORCE, 0], STIR_RADIUS);
      };

      // A squirt of ink: a dense core plus a few lobes pushed outwards so it billows
      const squirt = (x: number, y: number, scale = 1) => {
        splat(ink, x, y, [1.6 * scale, 0, 0], 0.0018 * scale);
        const lobes = 7;
        const spin = Math.random() * Math.PI * 2;
        for (let i = 0; i < lobes; i++) {
          const angle = spin + (i / lobes) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
          const power = (180 + Math.random() * 220) * scale;
          const ox = x + Math.cos(angle) * 0.008 * scale;
          const oy = y + Math.sin(angle) * 0.008 * scale * aspect();
          splat(velocity, ox, oy, [Math.cos(angle) * power, Math.sin(angle) * power, 0], 0.0007 * scale);
          splat(ink, ox, oy, [0.5 * scale * Math.random() + 0.3, 0, 0], 0.0006 * scale);
        }
      };

      const step = (dt: number) => {
        let u = bindProgram(programs.curl, velocity.read);
        gl.uniform1i(u.uVelocity, bindTexture(0, velocity.read.texture));
        blit(curl);

        u = bindProgram(programs.vorticity, velocity.read);
        gl.uniform1i(u.uVelocity, bindTexture(0, velocity.read.texture));
        gl.uniform1i(u.uCurl, bindTexture(1, curl.texture));
        gl.uniform1f(u.curl, CURL_STRENGTH);
        gl.uniform1f(u.dt, dt);
        blit(velocity.write);
        velocity.swap();

        u = bindProgram(programs.divergence, velocity.read);
        gl.uniform1i(u.uVelocity, bindTexture(0, velocity.read.texture));
        blit(divergence);

        u = bindProgram(programs.scale, pressure.read);
        gl.uniform1i(u.uTexture, bindTexture(0, pressure.read.texture));
        gl.uniform1f(u.value, PRESSURE_DECAY);
        blit(pressure.write);
        pressure.swap();

        u = bindProgram(programs.pressure, velocity.read);
        gl.uniform1i(u.uDivergence, bindTexture(0, divergence.texture));
        for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
          gl.uniform1i(u.uPressure, bindTexture(1, pressure.read.texture));
          blit(pressure.write);
          pressure.swap();
        }

        u = bindProgram(programs.gradientSubtract, velocity.read);
        gl.uniform1i(u.uPressure, bindTexture(0, pressure.read.texture));
        gl.uniform1i(u.uVelocity, bindTexture(1, velocity.read.texture));
        blit(velocity.write);
        velocity.swap();

        u = bindProgram(programs.advection, velocity.read);
        gl.uniform2f(u.velocityTexelSize, velocity.read.texelX, velocity.read.texelY);
        gl.uniform1i(u.uVelocity, bindTexture(0, velocity.read.texture));
        gl.uniform1i(u.uSource, bindTexture(0, velocity.read.texture));
        gl.uniform1f(u.dt, dt);
        gl.uniform1f(u.dissipation, VELOCITY_DISSIPATION);
        gl.uniform1i(u.uWaves, bindTexture(1, waves.read.texture));
        gl.uniform2f(u.waveTexelSize, waves.read.texelX, waves.read.texelY);
        gl.uniform1f(u.wavePush, 0);
        blit(velocity.write);
        velocity.swap();

        u = bindProgram(programs.advection, ink.read);
        gl.uniform2f(u.velocityTexelSize, velocity.read.texelX, velocity.read.texelY);
        gl.uniform1i(u.uVelocity, bindTexture(0, velocity.read.texture));
        gl.uniform1i(u.uSource, bindTexture(1, ink.read.texture));
        gl.uniform1f(u.dissipation, INK_DISSIPATION);
        gl.uniform1i(u.uWaves, bindTexture(2, waves.read.texture));
        gl.uniform2f(u.waveTexelSize, waves.read.texelX, waves.read.texelY);
        gl.uniform1f(u.wavePush, WAVE_INK_PUSH);
        blit(ink.write);
        ink.swap();

        u = bindProgram(programs.waves, waves.read);
        gl.uniform1f(u.damping, WAVE_DAMPING);
        for (let i = 0; i < WAVE_STEPS; i++) {
          gl.uniform1i(u.uWaves, bindTexture(0, waves.read.texture));
          blit(waves.write);
          waves.swap();
        }
      };

      let imageTexture: WebGLTexture | null = null;
      let imageAspect = 16 / 9;

      const render = (time: number) => {
        const u = bindProgram(programs.display, ink.read);
        const canvasAspect = aspect();
        gl.uniform2f(
          u.cover,
          canvasAspect > imageAspect ? 1 : canvasAspect / imageAspect,
          canvasAspect > imageAspect ? imageAspect / canvasAspect : 1
        );
        gl.uniform2f(u.inkTexelSize, ink.read.texelX, ink.read.texelY);
        gl.uniform1f(u.time, time);
        gl.uniform1i(u.uImage, bindTexture(0, imageTexture!));
        gl.uniform1i(u.uInk, bindTexture(1, ink.read.texture));
        gl.uniform1i(u.uVelocity, bindTexture(2, velocity.read.texture));
        gl.uniform2f(u.waveTexelSize, waves.read.texelX, waves.read.texelY);
        gl.uniform1f(u.refraction, REFRACTION);
        gl.uniform1i(u.uWaves, bindTexture(3, waves.read.texture));
        blit(null);
      };

      // Pointer: moving stirs the liquid and leaves a wake, clicking (outside of controls) drops a ripple and squirts ink
      const pointer = { x: 0, y: 0, seen: false };
      const toUv = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / rect.width, y: 1 - (e.clientY - rect.top) / rect.height };
      };

      const onPointerMove = (e: PointerEvent) => {
        const { x, y } = toUv(e);
        if (pointer.seen) {
          const dx = x - pointer.x;
          const dy = (y - pointer.y) / aspect();
          if (dx !== 0 || dy !== 0) {
            stir(x, y, dx, dy);
            wake(pointer.x, pointer.y, x, y);
          }
        }
        Object.assign(pointer, { x, y, seen: true });
      };

      const onPointerDown = (e: PointerEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("a, button, input, textarea, select, label")) return;
        const { x, y } = toUv(e);
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        splat(waves, x, y, [-0.8, 0, 0], 0.0004);
        squirt(x, y);
      };

      let last = performance.now();
      const loop = (now: number) => {
        if (disposed) return;
        resize();
        const dt = Math.min((now - last) / 1000, 1 / 60);
        last = now;
        step(dt);
        render(now / 1000);
        raf = requestAnimationFrame(loop);
      };

      const image = new window.Image();
      image.onload = () => {
        if (disposed) return;
        imageTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, imageTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        imageAspect = image.width / image.height;

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerdown", onPointerDown);
        raf = requestAnimationFrame(loop);
        setReady(true);
      };
      image.src = IMAGE_SRC;

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerdown", onPointerDown);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    } catch (e) {
      console.error("[LiquidBackground] WebGL init failed, keeping the static banner", e);
    }
  }, []);

  return (
    <div className="absolute inset-0 z-0">
      {/* Static banner: shown until the simulation is running, and as the fallback */}
      <Image
        src={IMAGE_SRC}
        alt="Background"
        fill
        priority
        className={`object-cover transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-75"}`}
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
