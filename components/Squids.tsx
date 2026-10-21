"use client";

import { useEffect, useRef } from "react";
import type { LiquidInk } from "@/components/LiquidBackground";
import { liquidLayers } from "@/lib/liquid-layers";

// Little squids swimming at mid-depth in the homepage water, seen from above.
// They are drawn on a 2D canvas that the liquid background renders between the seabed and the surface,
// so they get refracted by the ripples, tinted by depth and lit by the caustics.
// Like real squids they swim mantle first by jet propulsion: the mantle contracts, they surge, then
// glide with their arms trailing. They wander, change depth, keep apart and avoid the edges.
// Get the cursor too close and they jet away, leaving a puff of ink.

type SquidPalette = { base: string; shadow: string; light: string; spots: string };

// Glossy vinyl, the colours of the banner's columns
const PALETTES: SquidPalette[] = [
  { base: "#f06aa8", shadow: "#9c2d66", light: "#ffb3d6", spots: "#7a1f4f" },
  { base: "#f39a3a", shadow: "#a3561a", light: "#ffd29a", spots: "#7d3c0d" },
  { base: "#3cc6c0", shadow: "#1d7c78", light: "#a8f1ec", spots: "#135a57" },
  { base: "#f2cf3b", shadow: "#a8871b", light: "#fff0a3", spots: "#7a5f0c" },
  { base: "#ee5a4a", shadow: "#9c2a20", light: "#ffb1a6", spots: "#6e1a12" },
  { base: "#b98af0", shadow: "#6a3fa8", light: "#e3cfff", spots: "#4a2a7a" },
];

const COUNT = 12;
const LAYER_SCALE = 0.6; // resolution of the layer, softened by the shader anyway
const EDGE = 90; // px from the edges where squids start turning back
const SPACING = 95; // px they keep between each other
const FLEE_RADIUS = 130; // px around the cursor that scares them
const INK_COOLDOWN = 2.5; // s between two ink puffs from the same squid
const LIGHT = { x: -0.6, y: -0.8 }; // light from the top left, like the tentacles

type Squid = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  length: number; // px, mantle tip to arm tips
  depthPhase: number;
  pulse: number; // propulsion cycle, in turns
  frequency: number; // propulsion cycles per second when cruising
  seed: number;
  palette: SquidPalette;
  spots: { x: number; y: number; r: number }[]; // chromatophores, in squid units
  fear: number; // 1 right after being scared, decays to 0
  lastInk: number;
};

// Organic wandering: a few incommensurate sines, so it never visibly loops
const wander = (t: number, seed: number) =>
  (Math.sin(t * 0.31 + seed) + Math.sin(t * 0.53 + seed * 2.1) * 0.6 + Math.sin(t * 0.87 + seed * 3.7) * 0.35) / 1.95;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function spawn(width: number, height: number, index: number): Squid {
  return {
    x: EDGE + Math.random() * Math.max(1, width - EDGE * 2),
    y: EDGE + Math.random() * Math.max(1, height - EDGE * 2),
    heading: Math.random() * Math.PI * 2,
    speed: 0,
    length: 58 + Math.random() * 40,
    depthPhase: Math.random() * Math.PI * 2,
    pulse: Math.random(),
    frequency: 0.8 + Math.random() * 0.5,
    seed: Math.random() * 100,
    palette: PALETTES[index % PALETTES.length],
    spots: Array.from({ length: 7 }, () => ({ x: -4 + Math.random() * 44, y: (Math.random() - 0.5) * 16, r: 0.8 + Math.random() * 1.4 })),
    fear: 0,
    lastInk: -INK_COOLDOWN,
  };
}

/* ------------------------------------------------------------------ */
/* DRAWING                                                             */
/* ------------------------------------------------------------------ */

// A tapered, wavy arm from (x0, y0) going backwards (-x) at `angle`
function drawArm(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  angle: number,
  length: number,
  width: number,
  waveTime: number,
  waveSeed: number
) {
  const segments = 9;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= segments; i++) {
    const s = i / segments;
    const sway = Math.sin(waveTime * 5 + waveSeed - s * 5) * 2.6 * s;
    const nx = x0 + Math.cos(angle) * length * s - Math.sin(angle) * sway;
    const ny = y0 + Math.sin(angle) * length * s + Math.cos(angle) * sway;
    ctx.lineWidth = width * (1 - s * 0.8);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    px = nx;
    py = ny;
  }
  return { x: px, y: py };
}

function mantlePath(ctx: CanvasRenderingContext2D, halfWidth: number) {
  ctx.beginPath();
  ctx.moveTo(-8, -halfWidth);
  ctx.bezierCurveTo(10, -halfWidth * 1.25, 36, -halfWidth * 0.75, 48, 0);
  ctx.bezierCurveTo(36, halfWidth * 0.75, 10, halfWidth * 1.25, -8, halfWidth);
  ctx.quadraticCurveTo(-11, 0, -8, -halfWidth);
  ctx.closePath();
}

// Squid drawn in a 100-unit frame: +x is the mantle tip (it swims that way), arms trail towards -x
function drawSquid(
  ctx: CanvasRenderingContext2D,
  squid: Squid,
  scale: number,
  alpha: number,
  time: number,
  look: { x: number; y: number }
) {
  const { palette } = squid;
  const contraction = Math.max(0, Math.sin(squid.pulse * Math.PI * 2));
  const flare = Math.max(0, -Math.sin(squid.pulse * Math.PI * 2));
  const halfWidth = 13 * (1 - 0.16 * contraction);
  const fin = 0.75 + 0.25 * Math.sin(time * 6 + squid.seed);

  // Light direction in the squid's frame
  const c = Math.cos(-squid.heading);
  const s = Math.sin(-squid.heading);
  const light = { x: LIGHT.x * c - LIGHT.y * s, y: LIGHT.x * s + LIGHT.y * c };

  ctx.save();
  ctx.translate(squid.x, squid.y);
  ctx.rotate(squid.heading);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";

  // Arms: eight short ones fanning out more while the mantle refills, two long tentacles with clubs
  ctx.strokeStyle = palette.shadow;
  for (let i = 0; i < 8; i++) {
    const spread = (i / 7 - 0.5) * (0.55 + flare * 0.7);
    drawArm(ctx, -21, (i / 7 - 0.5) * 12, Math.PI + spread, 28, 3.4, time, squid.seed + i);
  }
  ctx.strokeStyle = palette.base;
  for (const side of [-1, 1]) {
    const tip = drawArm(ctx, -21, side * 3, Math.PI + side * (0.12 + flare * 0.15), 52, 2.3, time * 0.8, squid.seed + side * 4);
    ctx.fillStyle = palette.base;
    ctx.beginPath();
    ctx.ellipse(tip.x, tip.y, 4.2, 2.3, Math.PI + side * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fins near the mantle tip, flapping
  ctx.fillStyle = palette.shadow;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(27, side * 6);
    ctx.quadraticCurveTo(37, side * 21 * fin, 50, side * 1);
    ctx.closePath();
    ctx.fill();
  }

  // Mantle: vinyl shading lit from the top left, a glossy streak and a few chromatophores
  const shine = ctx.createRadialGradient(14 + light.x * 10, light.y * 7, 2, 14, 0, 34);
  shine.addColorStop(0, palette.light);
  shine.addColorStop(0.45, palette.base);
  shine.addColorStop(1, palette.shadow);
  ctx.fillStyle = shine;
  mantlePath(ctx, halfWidth);
  ctx.fill();

  ctx.fillStyle = palette.spots;
  ctx.globalAlpha = alpha * 0.45;
  for (const spot of squid.spots) {
    ctx.beginPath();
    ctx.arc(spot.x, spot.y * (halfWidth / 13), spot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = alpha * 0.75;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(16 + light.x * 6, light.y * halfWidth * 0.5, 10, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;

  // Head
  const head = ctx.createRadialGradient(-15 + light.x * 4, light.y * 5, 1, -15, 0, 12);
  head.addColorStop(0, palette.light);
  head.addColorStop(0.5, palette.base);
  head.addColorStop(1, palette.shadow);
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(-15, 0, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Big eyes, pupils following the cursor
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#fdfbf6";
    ctx.beginPath();
    ctx.ellipse(-15, side * 9, 5.5, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1020";
    ctx.beginPath();
    ctx.arc(-15 + look.x * 1.7, side * 9 + look.y * 1.4, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-15 + look.x * 1.7 - 0.9, side * 9 + look.y * 1.4 - 0.9, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* COMPONENT                                                           */
/* ------------------------------------------------------------------ */

export default function Squids() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Never on screen: handed to the liquid background as a texture
    const layer = document.createElement("canvas");
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    liquidLayers.creatures = layer;

    let stage = stageEl.getBoundingClientRect();
    let squids: Squid[] = [];
    const mouse = { x: -9999, y: -9999 };
    let raf = 0;
    let last = performance.now();
    let clock = 0;

    const measure = () => {
      stage = stageEl.getBoundingClientRect();
      const w = Math.max(1, Math.floor(stage.width * LAYER_SCALE));
      const h = Math.max(1, Math.floor(stage.height * LAYER_SCALE));
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      if (squids.length === 0 && stage.width > 0) {
        squids = Array.from({ length: COUNT }, (_, i) => spawn(stage.width, stage.height, i));
      }
    };
    measure();

    const ink = (detail: LiquidInk) => window.dispatchEvent(new CustomEvent("liquid:ink", { detail }));

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      clock += dt;

      const width = stage.width;
      const height = stage.height;
      ctx.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const hasMouse = mouse.x > -9999;

      for (const squid of squids) {
        const dir = { x: Math.cos(squid.heading), y: Math.sin(squid.heading) };

        /* ---- Steering: wander, stay away from edges and from each other, flee the cursor ---- */
        const desired = squid.heading + wander(clock * 0.4, squid.seed) * 0.9;
        const steer = { x: Math.cos(desired), y: Math.sin(desired) };
        steer.x += Math.max(0, (EDGE - squid.x) / EDGE) * 2 - Math.max(0, (squid.x - (width - EDGE)) / EDGE) * 2;
        steer.y += Math.max(0, (EDGE - squid.y) / EDGE) * 2 - Math.max(0, (squid.y - (height - EDGE)) / EDGE) * 2;

        for (const other of squids) {
          if (other === squid) continue;
          const ox = squid.x - other.x;
          const oy = squid.y - other.y;
          const d = Math.hypot(ox, oy);
          if (d > 0 && d < SPACING) {
            steer.x += (ox / d) * ((SPACING - d) / SPACING) * 1.5;
            steer.y += (oy / d) * ((SPACING - d) / SPACING) * 1.5;
          }
        }

        if (hasMouse) {
          const mx = squid.x - mouse.x;
          const my = squid.y - mouse.y;
          const d = Math.hypot(mx, my);
          if (d > 0 && d < FLEE_RADIUS) {
            steer.x += (mx / d) * 3 * (1 - d / FLEE_RADIUS);
            steer.y += (my / d) * 3 * (1 - d / FLEE_RADIUS);
            // Startled: jet away and ink from the siphon, behind it
            if (squid.fear < 0.5 && clock - squid.lastInk > INK_COOLDOWN) {
              squid.lastInk = clock;
              ink({
                x: stage.left + squid.x - dir.x * squid.length * 0.3,
                y: stage.top + squid.y - dir.y * squid.length * 0.3,
                dx: -dir.x,
                dy: -dir.y,
                amount: 0.8,
              });
            }
            squid.fear = 1;
          }
        }
        squid.fear = Math.max(0, squid.fear - dt * 0.7);

        const turnRate = 1.8 + squid.fear * 6;
        const turn = wrapAngle(Math.atan2(steer.y, steer.x) - squid.heading);
        squid.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, turn));

        /* ---- Jet propulsion: surge on each contraction, glide in between ---- */
        squid.pulse += squid.frequency * dt * (1 + squid.fear * 2);
        const thrust = Math.max(0, Math.sin(squid.pulse * Math.PI * 2));
        const cruise = 30 + squid.length * 0.3;
        const target = cruise * (0.35 + 1.2 * thrust) * (1 + squid.fear * 3);
        squid.speed += (target - squid.speed) * Math.min(1, dt * 4);
        squid.x += Math.cos(squid.heading) * squid.speed * dt;
        squid.y += Math.sin(squid.heading) * squid.speed * dt;

        /* ---- Depth: deeper is smaller, fainter, and drifts with the seabed ---- */
        const depth = 0.45 + 0.35 * Math.sin(clock * 0.15 + squid.depthPhase);
        const scale = (squid.length / 100) * (1 - 0.35 * depth);
        const alpha = 1 - 0.45 * depth;
        const parallax = hasMouse ? { x: (mouse.x - width / 2) * 0.012 * depth, y: (mouse.y - height / 2) * 0.012 * depth } : { x: 0, y: 0 };

        // Pupils look at the cursor, in the squid's frame
        let look = { x: 0, y: 0 };
        if (hasMouse) {
          const lx = mouse.x - squid.x;
          const ly = mouse.y - squid.y;
          const d = Math.hypot(lx, ly) || 1;
          const c = Math.cos(-squid.heading);
          const s = Math.sin(-squid.heading);
          look = { x: (lx * c - ly * s) / d, y: (lx * s + ly * c) / d };
        }

        // Shadow on the seabed, further from the squid the higher it swims
        const lift = 10 + 28 * (1 - depth);
        ctx.save();
        ctx.translate(squid.x + parallax.x + lift * 0.6, squid.y + parallax.y + lift);
        ctx.rotate(squid.heading);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * alpha})`;
        ctx.beginPath();
        ctx.ellipse(-squid.length * scale * 0.05, 0, squid.length * scale * 0.55, squid.length * scale * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        drawSquid(ctx, { ...squid, x: squid.x + parallax.x, y: squid.y + parallax.y }, scale, alpha, clock, look);
      }
    };

    const onPointerMove = (e: PointerEvent) => Object.assign(mouse, { x: e.clientX - stage.left, y: e.clientY - stage.top });
    const onPointerLeave = () => Object.assign(mouse, { x: -9999, y: -9999 });

    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", measure);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", measure);
      if (liquidLayers.creatures === layer) liquidLayers.creatures = null;
    };
  }, []);

  // Only used to know the size of the stage; the squids themselves are rendered in the liquid background
  return <div ref={stageRef} className="absolute inset-0 pointer-events-none" aria-hidden />;
}
