"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { LiquidRipple } from "@/components/LiquidBackground";
import { liquidLayers } from "@/lib/liquid-layers";

// Giant tentacles rising out of the water to hold the homepage cards.
// Each arm comes in from the side of the page, deep underwater, rises towards its card and breaks the
// surface beside the card's outer corner. The part above water is drawn on two canvases:
// the body behind the card, ending just past its bottom edge, and the tip in front, curling over the
// card face so the card looks gripped. The part below water is drawn on a third canvas that the
// liquid background renders under its surface, fading out with depth.
// The arms carry the cards: they lift them out of the water, sway them, jolt them when they flinch.
// Cards can be dragged away; the arm stretches after them and springs them back when released.

export type TentaclePalette = {
  shadow: string;
  base: string;
  light: string;
  spec: string;
  sucker: string;
  suckerHole: string;
};

// Glossy vinyl, matching the toy tentacles of the banner
export const PURPLE: TentaclePalette = {
  shadow: "#3a1160",
  base: "#7a2fc2",
  light: "#a66bea",
  spec: "#f4e8ff",
  sucker: "#c99cf5",
  suckerHole: "#4c1a80",
};

export const GREEN: TentaclePalette = {
  shadow: "#0d4520",
  base: "#1f8e42",
  light: "#52cf76",
  spec: "#e8fff0",
  sucker: "#8fdea6",
  suckerHole: "#0f5a30",
};

export type TentacleSpec = {
  anchor: RefObject<HTMLElement | null>; // untransformed box giving the card's resting place
  card: RefObject<HTMLElement | null>; // the card itself, moved by the arm
  palette: TentaclePalette;
  side: -1 | 1; // which side of the card the arm grips: -1 = left, 1 = right
  grip: number; // where it grips along the card's bottom edge, 0 = left, 1 = right
  tilt: number; // resting tilt of the card, in degrees
  phase: number; // desyncs the arms, also delays the rise
};

const ABOVE_POINTS = 48;
const BELOW_POINTS = 40;
const TIP_POINTS = 44;
const SURFACE_RADIUS = 36; // thickness where the arm breaks the surface
const GRIP_RADIUS = 19;
const DEEP_RADIUS = 70; // thickness at the bottom of the visible underwater part
const TIP_LENGTH = 210;
const SURFACE_OFFSET = { x: 55, y: 95 }; // where the arm breaks the surface, next to the card's outer corner
const DEEP_LEVEL = 0.82; // height (fraction of the stage) at which the arm enters from the side, deep down
const EDGE_MARGIN = 140; // how far past the screen edge the deep end of the arm sits
const DEPTH_SHRINK = 0.4; // perspective: how much thinner the arm looks deep down
const UNDERWATER_SCALE = 0.35; // resolution of the underwater layer, it is blurred by the shader anyway
const RISE_DISTANCE = 650; // how far below its place a card starts before being lifted
const AVOID_RADIUS = 150;
const LIGHT = { x: -0.6, y: -0.8 }; // light from the top left
const SHADOW_OFFSET = { x: 22, y: 30 }; // where arms cast their shadow on the water
const MEASURE_EVERY = 400; // ms between layout reads
// How far the arms carry the cards around their resting place, in px and degrees
const CARRY = { x: 60, y: 38, outwardBias: 25, maxRise: 55, tilt: 4.5 };
const DRAG_THRESHOLD = 5; // px of movement before a press on a card becomes a drag
const DRAG_REACH = 280; // rubber band: the further a card is pulled, the harder the arm resists
const SPRING = { stiffness: 85, damping: 8 }; // pulling the card back once released, bouncy

export type Point = { x: number; y: number; r: number };
export type Frame = Point & { nx: number; ny: number; tx: number; ty: number; lit: number };

type ArmState = {
  offsets: { x: number; y: number }[]; // per above-water point, eased cursor avoidance
  grip: number; // 0..1, eased hover tightening
  flinch: number; // 1 right after a click, decays to 0
  rise: number; // 0..1, the card being lifted out of the water
  lastSurfaceX: number | null;
  lastRipple: number;
  hit: Frame[]; // everything clickable on the arm
  gesture: { kind: GestureKind; start: number; duration: number } | null;
  nextGesture: number; // clock time of the next spontaneous gesture
  drag: { pointerId: number; start: Vec; base: Vec; target: Vec; active: boolean } | null;
  spring: { x: number; y: number; vx: number; vy: number }; // card offset from where the arm holds it
};

// Things an arm does on its own every few seconds
const GESTURES = ["flex", "regrip", "lift", "shiver", "stretch"] as const;
type GestureKind = (typeof GESTURES)[number];
type Gestures = Record<GestureKind, number>; // 0..1 intensity of each gesture right now

const GESTURE_PAUSE = { min: 2.5, max: 6 }; // seconds between gestures
const GESTURE_DURATION = { min: 1.6, max: 2.8 };

const randomBetween = (range: { min: number; max: number }) => range.min + Math.random() * (range.max - range.min);

// Organic idle motion: a few incommensurate sines, so it never visibly loops
const wander = (t: number, seed: number) =>
  (Math.sin(t * 0.31 + seed) + Math.sin(t * 0.53 + seed * 2.1) * 0.6 + Math.sin(t * 0.87 + seed * 3.7) * 0.35) / 1.95;

/* ------------------------------------------------------------------ */
/* GEOMETRY                                                            */
/* ------------------------------------------------------------------ */

type Vec = { x: number; y: number };

export function bezier(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

// Tangents, normals and how much each point faces the light
export function toFrames(points: Point[]): Frame[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    const nx = -ty;
    const ny = tx;
    return { ...p, tx, ty, nx, ny, lit: nx * LIGHT.x + ny * LIGHT.y };
  });
}

// 0 -> 1 with a small overshoot, so the card pops out of the water
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

/* ------------------------------------------------------------------ */
/* DRAWING                                                             */
/* ------------------------------------------------------------------ */

// Closed outline of a ribbon whose half width and centre shift vary per point
function ribbonPath(
  ctx: CanvasRenderingContext2D,
  frames: Frame[],
  halfWidth: (f: Frame) => number,
  shift: (f: Frame) => number
) {
  ctx.beginPath();
  frames.forEach((f, i) => {
    const s = shift(f);
    const w = halfWidth(f);
    const x = f.x + f.nx * (s + w);
    const y = f.y + f.ny * (s + w);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    const s = shift(f);
    const w = halfWidth(f);
    ctx.lineTo(f.x + f.nx * (s - w), f.y + f.ny * (s - w));
  }
  ctx.closePath();
}

export function drawArm(
  ctx: CanvasRenderingContext2D,
  frames: Frame[],
  palette: TentaclePalette,
  suckerSide: number,
  shadow?: { blur: number; y: number }
) {
  if (frames.length < 2) return;

  // Silhouette in the shadow colour, casting a soft shadow on what's behind
  ctx.save();
  if (shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetY = shadow.y;
  }
  ctx.fillStyle = palette.shadow;
  ribbonPath(ctx, frames, (f) => f.r, () => 0);
  ctx.fill();
  ctx.restore();

  // Body, nudged towards the light so the shadow side stays as a rim
  ctx.fillStyle = palette.base;
  ribbonPath(ctx, frames, (f) => f.r * 0.84, (f) => f.lit * f.r * 0.14);
  ctx.fill();

  // Soft light band on the lit side
  ctx.fillStyle = palette.light;
  ribbonPath(ctx, frames, (f) => f.r * 0.3, (f) => f.lit * f.r * 0.42);
  ctx.fill();

  // Crisp specular streak, the glossy vinyl look
  ctx.strokeStyle = palette.spec;
  ctx.lineCap = "round";
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    if (b.r < 2.5) continue;
    ctx.globalAlpha = 0.85 * Math.min(1, Math.max(0, (b.lit + 0.2) * 1.4));
    ctx.lineWidth = b.r * 0.11;
    ctx.beginPath();
    ctx.moveTo(a.x + a.nx * a.lit * a.r * 0.55, a.y + a.ny * a.lit * a.r * 0.55);
    ctx.lineTo(b.x + b.nx * b.lit * b.r * 0.55, b.y + b.ny * b.lit * b.r * 0.55);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Suckers along the underside, foreshortened discs spaced by the arm's thickness
  let travelled = 0;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    travelled += Math.hypot(f.x - frames[i - 1].x, f.y - frames[i - 1].y);
    if (f.r < 3 || travelled < f.r * 0.95) continue;
    travelled = 0;

    const cx = f.x + f.nx * suckerSide * f.r * 0.74;
    const cy = f.y + f.ny * suckerSide * f.r * 0.74;
    const angle = Math.atan2(f.ty, f.tx);
    const rx = f.r * 0.34;
    const ry = f.r * 0.2;
    ctx.fillStyle = palette.suckerHole;
    ctx.beginPath();
    ctx.ellipse(cx + f.nx * suckerSide * 1.5, cy + f.ny * suckerSide * 1.5, rx, ry, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.sucker;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.92, ry * 0.85, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.suckerHole;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(cx - f.nx * suckerSide * ry * 0.15, cy - f.ny * suckerSide * ry * 0.15, rx * 0.42, ry * 0.36, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Thin bright meniscus where the arm pierces the water, on the near side of the arm
function drawSurfaceRing(ctx: CanvasRenderingContext2D, f: Frame) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(Math.atan2(f.ny, f.nx));
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, f.r * 1.25, f.r * 0.32, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, f.r * 1.6, f.r * 0.45, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* COMPONENT                                                           */
/* ------------------------------------------------------------------ */

export default function Tentacles({ arms }: { arms: TentacleSpec[] }) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const back = backRef.current;
    const front = frontRef.current;
    const stageEl = back?.parentElement;
    if (!back || !front || !stageEl) return;
    const backCtx = back.getContext("2d");
    const frontCtx = front.getContext("2d");

    // Underwater layer: never on screen, handed to the liquid background as a texture
    const under = document.createElement("canvas");
    const underCtx = under.getContext("2d");
    const scratch = document.createElement("canvas");
    const scratchCtx = scratch.getContext("2d");
    if (!backCtx || !frontCtx || !underCtx || !scratchCtx) return;
    liquidLayers.underwater = under;

    // Arms only make sense with the cards side by side
    const desktop = window.matchMedia("(min-width: 768px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const states: ArmState[] = arms.map(() => ({
      offsets: Array.from({ length: ABOVE_POINTS }, () => ({ x: 0, y: 0 })),
      grip: 0,
      flinch: 0,
      rise: still ? 1 : 0,
      lastSurfaceX: null,
      lastRipple: 0,
      hit: [],
      gesture: null,
      nextGesture: 1.5 + Math.random() * 3,
      drag: null,
      spring: { x: 0, y: 0, vx: 0, vy: 0 },
    }));

    const mouse = { x: -9999, y: -9999 };
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let wasDesktop = true;

    const resize = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const [c, scale] of [[back, dpr], [front, dpr], [under, UNDERWATER_SCALE], [scratch, UNDERWATER_SCALE]] as const) {
        const w = Math.max(1, Math.floor(width * scale));
        const h = Math.max(1, Math.floor(height * scale));
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
      }
      return dpr;
    };

    const ripple = (detail: LiquidRipple) => window.dispatchEvent(new CustomEvent("liquid:ripple", { detail }));

    // Layout boxes only change on resize or scroll, so they are read now and then, not every frame
    let stage = stageEl.getBoundingClientRect();
    let anchors = arms.map((arm) => ({
      rect: arm.anchor.current?.getBoundingClientRect() ?? null,
      w: arm.anchor.current?.offsetWidth ?? 0,
      h: arm.anchor.current?.offsetHeight ?? 0,
    }));
    let lastMeasure = 0;
    const measure = () => {
      stage = stageEl.getBoundingClientRect();
      anchors = arms.map((arm) => ({
        rect: arm.anchor.current?.getBoundingClientRect() ?? null,
        w: arm.anchor.current?.offsetWidth ?? 0,
        h: arm.anchor.current?.offsetHeight ?? 0,
      }));
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (!still) clock += dt;

      if (now - lastMeasure > MEASURE_EVERY) {
        lastMeasure = now;
        measure();
      }
      const width = stage.width;
      const height = stage.height;
      const dpr = resize(width, height);
      backCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frontCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      underCtx.setTransform(UNDERWATER_SCALE, 0, 0, UNDERWATER_SCALE, 0, 0);
      for (const ctx of [backCtx, frontCtx, underCtx]) ctx.clearRect(0, 0, width, height);

      // Small screens: cards are stacked, no arms, cards stay put
      if (!desktop.matches) {
        if (wasDesktop) arms.forEach((arm) => arm.card.current?.style.removeProperty("transform"));
        wasDesktop = false;
        return;
      }
      wasDesktop = true;

      // Deeper parts drift against the cursor, like the seabed
      const drift = mouse.x > -9999 ? { x: (mouse.x - width / 2) * 0.012, y: (mouse.y - height / 2) * 0.012 } : { x: 0, y: 0 };

      arms.forEach((arm, index) => {
        const cardEl = arm.card.current;
        const { rect, w, h } = anchors[index];
        if (!cardEl || !rect) return;
        const state = states[index];
        const t = clock + arm.phase;

        const restX = rect.left - stage.left + w / 2;
        const restY = rect.top - stage.top + h / 2;

        // Hover tightens the grip and lifts the card, a click makes the arm flinch
        // Dragging: the card follows the pointer (elastic), released it springs back onto its arm
        const sp = state.spring;
        const dragging = !!state.drag?.active;
        if (state.drag?.active) {
          const prev = { x: sp.x, y: sp.y };
          sp.x += (state.drag.target.x - sp.x) * Math.min(1, dt * 16);
          sp.y += (state.drag.target.y - sp.y) * Math.min(1, dt * 16);
          sp.vx = (sp.x - prev.x) / Math.max(dt, 0.001);
          sp.vy = (sp.y - prev.y) / Math.max(dt, 0.001);
        } else {
          sp.vx += (-SPRING.stiffness * sp.x - SPRING.damping * sp.vx) * dt;
          sp.vy += (-SPRING.stiffness * sp.y - SPRING.damping * sp.vy) * dt;
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
        }

        const hovered = dragging ||
          mouse.x >= rect.left - stage.left && mouse.x <= rect.right - stage.left &&
          mouse.y >= rect.top - stage.top && mouse.y <= rect.bottom - stage.top;
        state.grip += ((hovered ? 1 : 0) - state.grip) * Math.min(1, dt * 6);
        state.flinch = Math.max(0, state.flinch - dt * 1.6);
        if (clock > index * 0.35 + 0.15) state.rise = Math.min(1, state.rise + dt / 2.2);
        const flinch = state.flinch * state.flinch;

        // Spontaneous gestures: pick one now and then, ease it in and out
        if (!state.gesture && clock >= state.nextGesture && state.rise >= 1) {
          state.gesture = { kind: GESTURES[Math.floor(Math.random() * GESTURES.length)], start: clock, duration: randomBetween(GESTURE_DURATION) };
        }
        const g: Gestures = { flex: 0, regrip: 0, lift: 0, shiver: 0, stretch: 0 };
        if (state.gesture) {
          const progress = (clock - state.gesture.start) / state.gesture.duration;
          if (progress >= 1) {
            state.gesture = null;
            state.nextGesture = clock + randomBetween(GESTURE_PAUSE);
          } else {
            g[state.gesture.kind] = Math.sin(Math.PI * progress) ** 2;
          }
        }
        const lift = easeOutBack(state.rise);

        /* ---- The arm moves the card ---- */
        const pull = state.offsets.slice(-14).reduce((acc, o) => ({ x: acc.x + o.x / 14, y: acc.y + o.y / 14 }), { x: 0, y: 0 });
        const jolt = Math.sin(state.flinch * Math.PI * 3) * flinch;
        // Carried around: a slow wide drift, biased outwards so the two cards never meet in the middle,
        // plus whatever the arm is busy doing
        const roam = {
          x: wander(t * 0.7, 1) * CARRY.x + arm.side * CARRY.outwardBias,
          y: wander(t * 0.6, 2) * CARRY.y,
        };
        const dx = sp.x + roam.x + pull.x * 0.5 - arm.side * jolt * 40 + arm.side * g.stretch * 55 - arm.side * g.flex * 35;
        const dy = sp.y + Math.max(-CARRY.maxRise, roam.y + pull.y * 0.5 + jolt * 24 - state.grip * 10 - g.lift * 45 + g.stretch * 25) + (1 - lift) * RISE_DISTANCE;
        const angle =
          arm.tilt + wander(t * 0.8, 3) * CARRY.tilt + roam.x * 0.03 + jolt * arm.side * 4 +
          Math.max(-10, Math.min(10, sp.vx * 0.006)) +
          arm.side * g.lift * 5 - arm.side * g.flex * 4 + g.shiver * Math.sin(t * 22) * 0.8;
        cardEl.style.transform = `translate(${dx}px, ${dy}px) rotate(${angle}deg)`;

        // Grip point on the card's bottom edge, following its rotation
        const rad = (angle * Math.PI) / 180;
        const lx = arm.grip * w - w / 2;
        const ly = h / 2;
        const grip = {
          x: restX + dx + Math.cos(rad) * lx - Math.sin(rad) * ly,
          y: restY + dy + Math.sin(rad) * lx + Math.cos(rad) * ly,
        };

        /* ---- Above water: breaks the surface beside the card's outer corner, climbs to its edge ---- */
        const surface = {
          x: grip.x + arm.side * (SURFACE_OFFSET.x + wander(t, 4) * 28 + g.stretch * 50),
          y: Math.min(height - 30, grip.y + SURFACE_OFFSET.y + wander(t, 5) * 18 + g.stretch * 30),
        };
        const end = { x: grip.x + Math.sin(rad) * 14, y: grip.y - Math.cos(rad) * 14 };
        const c1 = { x: surface.x + arm.side * (10 + wander(t, 6) * 25 + flinch * 40 + g.flex * 30), y: surface.y - 60 };
        const c2 = {
          x: grip.x + arm.side * (50 + wander(t, 7) * 40 + flinch * 80 + g.flex * 110),
          y: end.y + 45 + wander(t, 8) * 25 - g.flex * 20,
        };

        const amplitude = 10 + state.grip * 4 + flinch * 24 + g.flex * 8 + (dragging ? 10 : 0);
        const above: Point[] = [];
        for (let i = 0; i < ABOVE_POINTS; i++) {
          const s = i / (ABOVE_POINTS - 1);
          above.push({ ...bezier(surface, c1, c2, end, s), r: SURFACE_RADIUS + (GRIP_RADIUS - SURFACE_RADIUS) * Math.pow(s, 0.8) });
        }
        const aboveFrames = toFrames(
          toFrames(above).map((f, i) => {
            const s = i / (ABOVE_POINTS - 1);
            const envelope = Math.sin(Math.PI * Math.min(1, s * 1.15));
            const wave =
              (Math.sin(s * Math.PI * 4 - t * 1.7) + Math.sin(s * Math.PI * 7 + t * 2.3) * 0.3) * amplitude * envelope +
              Math.sin(s * Math.PI * 11 - t * 14) * g.shiver * 6 * envelope;

            // Shy away from the cursor
            const off = state.offsets[i];
            const ox = f.x - mouse.x;
            const oy = f.y - mouse.y;
            const d = Math.hypot(ox, oy);
            const push = d < AVOID_RADIUS && d > 0 ? ((AVOID_RADIUS - d) / AVOID_RADIUS) * 60 * envelope : 0;
            off.x += ((d > 0 ? (ox / d) * push : 0) - off.x) * Math.min(1, dt * 5);
            off.y += ((d > 0 ? (oy / d) * push : 0) - off.y) * Math.min(1, dt * 5);

            return { x: f.x + f.nx * wave + off.x, y: f.y + f.ny * wave + off.y, r: f.r };
          })
        );

        /* ---- Below water: from the surface back down and out to the side of the page, deep down ---- */
        const s0 = aboveFrames[0];
        const deep = {
          x: arm.side < 0 ? -EDGE_MARGIN : width + EDGE_MARGIN,
          y: height * DEEP_LEVEL + wander(t, 9) * 60,
        };
        const d1 = { x: s0.x + arm.side * 30, y: s0.y + 110 };
        const d2 = { x: deep.x - arm.side * (260 + wander(t, 11) * 80), y: deep.y + 10 + wander(t, 12) * 40 };
        const below: Point[] = [];
        for (let i = 0; i < BELOW_POINTS; i++) {
          const s = i / (BELOW_POINTS - 1);
          const p = bezier(s0, d1, d2, deep, s);
          const wave = (Math.sin(s * Math.PI * 3 - t * 1.4) + Math.sin(s * Math.PI * 5 - t * 2.1) * 0.4) * 30 * s;
          below.push({
            x: p.x + drift.x * s,
            y: p.y + wave + drift.y * s,
            r: (SURFACE_RADIUS + (DEEP_RADIUS - SURFACE_RADIUS) * s) * (1 - s * DEPTH_SHRINK),
          });
        }
        const belowFrames = toFrames(below);

        // Draw the dive once, then fade it out with depth (the shader softens it, no canvas blur)
        const bottom = belowFrames[BELOW_POINTS - 1];
        scratchCtx.setTransform(UNDERWATER_SCALE, 0, 0, UNDERWATER_SCALE, 0, 0);
        scratchCtx.globalCompositeOperation = "source-over";
        scratchCtx.clearRect(0, 0, width, height);
        drawArm(scratchCtx, belowFrames, arm.palette, arm.side);
        const fade = scratchCtx.createLinearGradient(s0.x, s0.y, bottom.x, bottom.y);
        fade.addColorStop(0, "rgba(0, 0, 0, 1)");
        fade.addColorStop(1, "rgba(0, 0, 0, 0.08)");
        scratchCtx.globalCompositeOperation = "destination-in";
        scratchCtx.fillStyle = fade;
        scratchCtx.fillRect(0, 0, width, height);
        scratchCtx.globalCompositeOperation = "source-over";
        underCtx.save();
        underCtx.setTransform(1, 0, 0, 1, 0, 0);
        underCtx.drawImage(scratch, 0, 0);
        underCtx.restore();

        // The arm above water casts its shadow on the water (softened by the shader)
        underCtx.save();
        underCtx.translate(SHADOW_OFFSET.x, SHADOW_OFFSET.y);
        underCtx.fillStyle = "rgba(0, 0, 0, 0.42)";
        ribbonPath(underCtx, aboveFrames, (f) => f.r * 1.05, () => 0);
        underCtx.fill();
        underCtx.restore();

        /* ---- Tip: starts on the card's edge and curls over its face into a spiral ---- */
        const curlEnd = (0.06 + state.grip * 0.022 + flinch * 0.05) * (1 + wander(t * 2.5, 10) * 0.15) * (1 - g.regrip * 0.6);
        const curlStart = 0.002;
        const tip: Point[] = [];
        let theta = rad - arm.side * 0.08;
        let px = grip.x;
        let py = grip.y;
        const ds = TIP_LENGTH / (TIP_POINTS - 1);
        for (let i = 0; i < TIP_POINTS; i++) {
          const s = i / (TIP_POINTS - 1);
          tip.push({ x: px, y: py, r: GRIP_RADIUS * Math.pow(1 - s, 0.75) + 1.5 * s });
          theta += arm.side * (curlStart + (curlEnd - curlStart) * s) * ds;
          px += Math.sin(theta) * ds;
          py -= Math.cos(theta) * ds;
        }
        const tipFrames = toFrames(tip);

        drawArm(backCtx, aboveFrames, arm.palette, arm.side);
        drawSurfaceRing(backCtx, aboveFrames[0]);
        drawArm(frontCtx, tipFrames, arm.palette, arm.side, { blur: 8, y: 5 });
        state.hit = [...aboveFrames, ...tipFrames];

        /* ---- Where the arm breaks the surface, keep the water moving ---- */
        const speed = state.lastSurfaceX === null ? 0 : Math.abs(s0.x - state.lastSurfaceX) / Math.max(dt, 0.001);
        state.lastSurfaceX = s0.x;
        if (now - state.lastRipple > 130) {
          state.lastRipple = now;
          ripple({
            x: stage.left + s0.x,
            y: stage.top + s0.y,
            strength: 0.03 + Math.min(speed * 0.0005, 0.08) + flinch * 0.2 + (1 - state.rise) * 0.15,
            radius: 0.0003,
          });
        }
      });
    };

    const toStage = (e: PointerEvent) => ({ x: e.clientX - stage.left, y: e.clientY - stage.top });

    // Rubber band: pulling further away gives less and less
    const rubber = (v: number) => (v * DRAG_REACH) / (Math.abs(v) + DRAG_REACH);
    let suppressClick = false;

    const onPointerMove = (e: PointerEvent) => {
      Object.assign(mouse, toStage(e));
      states.forEach((state, i) => {
        const drag = state.drag;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const delta = { x: e.clientX - drag.start.x, y: e.clientY - drag.start.y };
        if (!drag.active && Math.hypot(delta.x, delta.y) > DRAG_THRESHOLD) {
          drag.active = true;
          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";
          arms[i].card.current?.style.setProperty("cursor", "grabbing");
        }
        if (drag.active) drag.target = { x: drag.base.x + rubber(delta.x), y: drag.base.y + rubber(delta.y) };
      });
    };
    const onPointerLeave = () => Object.assign(mouse, { x: -9999, y: -9999 });

    const onPointerDown = (e: PointerEvent) => {
      const p = toStage(e);
      for (const state of states) {
        if (state.hit.some((f) => Math.hypot(f.x - p.x, f.y - p.y) < f.r + 4)) state.flinch = 1;
      }

      // A press on a card may become a drag once the pointer moves
      if (!desktop.matches || e.button !== 0 || !(e.target instanceof Node)) return;
      const target = e.target;
      arms.forEach((arm, i) => {
        if (!arm.card.current?.contains(target)) return;
        const { x, y } = states[i].spring;
        states[i].drag = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, base: { x, y }, target: { x, y }, active: false };
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      states.forEach((state, i) => {
        if (!state.drag || state.drag.pointerId !== e.pointerId) return;
        if (state.drag.active) {
          suppressClick = true;
          document.body.style.removeProperty("user-select");
          document.body.style.removeProperty("cursor");
          arms[i].card.current?.style.removeProperty("cursor");
        }
        state.drag = null;
      });
    };

    // A drag ending on a card must not also count as a click on what is under the pointer
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    const onLayoutChange = () => measure();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("click", onClick, true);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    document.addEventListener("pointerleave", onPointerLeave);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
      document.removeEventListener("pointerleave", onPointerLeave);
      if (liquidLayers.underwater === under) liquidLayers.underwater = null;
    };
  }, [arms]);

  return (
    <>
      <canvas ref={backRef} className="absolute inset-0 w-full h-full z-[5] pointer-events-none" />
      <canvas ref={frontRef} className="absolute inset-0 w-full h-full z-[15] pointer-events-none" />
    </>
  );
}
