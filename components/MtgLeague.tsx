"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Pirata_One } from "next/font/google";
import { motion, AnimatePresence, useMotionTemplate, useMotionValue, useSpring, useTransform } from "framer-motion";
import { X, Crown } from "lucide-react";
import type { MtgGame, MtgPlayer, MtgStanding } from "@/lib/mtg";
import { MTG_DISPLAY_NAMES, MTG_POINTS } from "@/lib/mtg";
import { PURPLE, bezier, drawArm, toFrames, type Point } from "@/components/Tentacles";

// The Commander league, hidden in the deep: type "mtg" on the homepage to dive.
// Each player is a Magic card in their own column, and the standings are a depth gauge: cards float
// higher the more points they have. Saving a game makes the winner rise and the others sink.
// The leader's card is foil; the last one is tapped, with a tentacle gripping its corner, dragging it
// down (the same person as the homepage's biggest loser).

type MtgData = {
  players: MtgPlayer[];
  games: MtgGame[];
  standings: MtgStanding[];
  canEdit: boolean;
};

// A player's colour: the homepage's glossy vinyl, plus the mana it stands for on their card
type Vinyl = { base: string; shadow: string; light: string; mana: string; parchment: string };

const SECRET = "mtg";
const POSITION_LABELS = ["1er", "2e", "3e", "4e"];

// One vinyl colour per player, by their order in MTG_PLAYER_IDS
const PLAYER_COLORS: Vinyl[] = [
  { base: "#7a2fc2", shadow: "#3a1160", light: "#a66bea", mana: "B", parchment: "#e4d9ef" },
  { base: "#1f8e42", shadow: "#0d4520", light: "#52cf76", mana: "G", parchment: "#d9eadb" },
  { base: "#f39a3a", shadow: "#a3561a", light: "#ffd29a", mana: "R", parchment: "#f3e2d0" },
  { base: "#3cc6c0", shadow: "#1d7c78", light: "#a8f1ec", mana: "U", parchment: "#d6eeec" },
];

const RANK_TITLES = ["Archimage suprême", "Second couteau", "Chair à canon", "Fond du cimetière"];
const RANK_FLAVOR = [
  "« Le trône n'a qu'une place, et elle est encore chaude. »",
  "« Presque. Toujours presque. »",
  "« Il a vu la victoire. De très loin. »",
  "« Même ses jetons l'ont abandonné. »",
];

const CARD = { width: 190, height: 266 }; // px
const ARENA_PADDING = { top: 40, bottom: 50 }; // px kept free above the leader and below the last one

const pirata = Pirata_One({ weight: "400", subsets: ["latin"] });

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Local date as YYYY-MM-DD
const todayLocal = () => new Date().toLocaleDateString("sv-SE");

export default function MtgLeague() {
  const [open, setOpen] = useState(false);

  // Listen for the secret word typed anywhere on the page (outside of inputs)
  useEffect(() => {
    let buffer = "";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;

      buffer = (buffer + e.key.toLowerCase()).slice(-SECRET.length);
      if (buffer === SECRET) {
        buffer = "";
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <AnimatePresence>{open && <MtgPanel onClose={() => setOpen(false)} />}</AnimatePresence>;
}

/* ------------------------------------------------------------------ */
/* AMBIENCE                                                            */
/* ------------------------------------------------------------------ */

// Light from the surface, slanting down and swaying slowly
function GodRays() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {[12, 34, 58, 81].map((left, i) => (
        <motion.div
          key={left}
          className="absolute -top-20 h-[75vh] w-32 origin-top"
          style={{
            left: `${left}%`,
            background: "linear-gradient(180deg, rgba(170, 225, 255, 0.13), transparent)",
            filter: "blur(14px)",
          }}
          animate={{ rotate: [16 + i * 2, 22 + i * 2, 16 + i * 2], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 9 + i * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// The dive: a burst of bubbles streaming up past the viewer as the panel opens
function DiveBubbles() {
  const [bubbles] = useState(() =>
    Array.from({ length: 46 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 4 + Math.random() * 14,
      delay: Math.random() * 0.5,
      duration: 0.9 + Math.random() * 0.8,
    }))
  );
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[95]">
      {bubbles.map((b) => (
        <motion.span
          key={b.id}
          className="absolute bottom-0 rounded-full border border-white/50"
          style={{ left: `${b.left}%`, width: b.size, height: b.size, background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5), transparent 60%)" }}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: "-110vh", opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: b.duration, delay: b.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

// A few bubbles rising off a porthole, forever
function Bubbles() {
  const [bubbles] = useState(() =>
    Array.from({ length: 4 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 50,
      size: 3 + Math.random() * 6,
      delay: Math.random() * 4,
      duration: 3 + Math.random() * 2,
    }))
  );
  return (
    <>
      {bubbles.map((b) => (
        <motion.span
          key={b.id}
          className="absolute left-1/2 top-0 rounded-full border border-white/40 pointer-events-none"
          style={{ width: b.size, height: b.size, marginLeft: b.x }}
          animate={{ y: [0, -140], x: [0, 6, -4, 3], opacity: [0, 0.7, 0] }}
          transition={{ duration: b.duration, delay: b.delay, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

// Bubbles bursting out of the save button
function BubbleBurst() {
  const [bubbles] = useState(() =>
    Array.from({ length: 28 }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const distance = 60 + Math.random() * 180;
      return { id: i, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, size: 4 + Math.random() * 10 };
    })
  );
  return (
    <div className="absolute left-1/2 top-1/2 pointer-events-none">
      {bubbles.map((b) => (
        <motion.span
          key={b.id}
          className="absolute rounded-full border border-white/70"
          style={{ width: b.size, height: b.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 1 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

// Same slab as the homepage cards: dark, crisp, with an edge tinted like whoever it belongs to
function Slab({ vinyl, className = "", children }: { vinyl: Vinyl; className?: string; children: ReactNode }) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="absolute inset-x-0 -bottom-[6px] top-[6px] rounded-[26px]"
        style={{ background: `linear-gradient(180deg, ${vinyl.base}, ${vinyl.shadow})` }}
      />
      <div className="relative h-full rounded-[26px] bg-[#141118] border border-white/[0.06] shadow-[0_40px_70px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)] p-6">
        {children}
      </div>
    </div>
  );
}

// Avatar in a glossy vinyl ring
function Porthole({ player, vinyl, size }: { player?: MtgPlayer; vinyl: Vinyl; size: number }) {
  const ring = Math.max(3, Math.round(size * 0.07));
  return (
    <span
      className="relative block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        padding: ring,
        background: `linear-gradient(145deg, ${vinyl.light}, ${vinyl.base} 45%, ${vinyl.shadow})`,
        boxShadow: "0 12px 24px -10px rgba(0,0,0,0.8)",
      }}
    >
      <span className="relative block h-full w-full rounded-full overflow-hidden bg-black/40">
        {player?.image && <Image src={player.image} alt={player.name} fill className="object-cover" sizes={`${size}px`} />}
      </span>
      {/* Glossy highlight on the ring */}
      <span
        className="absolute rounded-full pointer-events-none"
        style={{ inset: ring * 0.4, background: "radial-gradient(ellipse at 30% 18%, rgba(255,255,255,0.45), transparent 32%)" }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* THE DEPTHS                                                          */
/* ------------------------------------------------------------------ */

function ManaPip({ vinyl, size = 15 }: { vinyl: Vinyl; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-black shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        color: vinyl.shadow,
        background: `radial-gradient(circle at 35% 30%, #fff 0%, ${vinyl.light} 45%, ${vinyl.base} 100%)`,
        boxShadow: `0 0 ${size / 2}px ${vinyl.light}90, inset 0 -2px 3px rgba(0,0,0,0.35)`,
      }}
    >
      {vinyl.mana}
    </span>
  );
}

// A player's Magic card: tilts in 3D with the cursor, foil for the leader, tapped for the last one,
// can be thrown around and snaps back
function PlayerCard({
  standing,
  name,
  rank,
  vinyl,
  tapped,
  cardRef,
}: {
  standing: MtgStanding;
  name: string;
  rank: number;
  vinyl: Vinyl;
  tapped: boolean;
  cardRef?: RefObject<HTMLDivElement | null>;
}) {
  const [hovered, setHovered] = useState(false);
  const [dropRotation] = useState(() => (Math.random() - 0.5) * 40);

  // Cursor position over the card, 0..1
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [16, -16]), { stiffness: 200, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-16, 16]), { stiffness: 200, damping: 18 });
  const foilX = useTransform(mx, [0, 1], [0, 100]);
  const foilY = useTransform(my, [0, 1], [0, 100]);
  const foilPosition = useMotionTemplate`${foilX}% ${foilY}%`;
  const glareX = useTransform(mx, [0, 1], [-20, 120]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% 30%, rgba(255,255,255,0.35), transparent 45%)`;

  const isChampion = rank === 0 && standing.played > 0;
  const winRate = standing.played > 0 ? Math.round((standing.wins / standing.played) * 100) : 0;
  const bar = `linear-gradient(90deg, ${vinyl.parchment}, #fff8e8)`;

  return (
    <motion.div
      ref={cardRef}
      className="relative cursor-grab active:cursor-grabbing"
      style={{ perspective: 900 }}
      initial={{ rotate: dropRotation }}
      animate={{ rotate: tapped && !hovered ? 90 : 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 14 }}
      drag
      dragSnapToOrigin
      dragElastic={0.7}
      whileDrag={{ scale: 1.1, zIndex: 50 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => {
        setHovered(false);
        mx.set(0.5);
        my.set(0.5);
      }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - rect.left) / rect.width);
        my.set((e.clientY - rect.top) / rect.height);
      }}
    >
      <motion.div
        className="relative rounded-[14px] p-[6px] select-none"
        style={{
          width: CARD.width,
          height: CARD.height,
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          background: `linear-gradient(145deg, ${vinyl.light}, ${vinyl.shadow} 50%, ${vinyl.base})`,
          boxShadow: isChampion
            ? `0 0 40px ${vinyl.light}, 0 0 90px rgba(255,215,0,0.35), 0 24px 44px -12px rgba(0,0,0,0.8)`
            : `0 0 22px ${vinyl.light}40, 0 24px 44px -12px rgba(0,0,0,0.8)`,
        }}
        whileHover={{ scale: 1.06, y: -8 }}
      >
        <div className="relative h-full w-full rounded-[10px] overflow-hidden flex flex-col bg-[#141118]">
          {/* Name bar */}
          <div className="mx-1.5 mt-1.5 px-2 py-1 rounded-md flex items-center justify-between gap-1 border border-black/50" style={{ background: bar }}>
            <span className="text-[11px] font-black text-black truncate">{name}</span>
            <span className="flex gap-0.5">
              <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-[#cfc6b8] text-[8px] font-black text-black">
                {rank + 1}
              </span>
              <ManaPip vinyl={vinyl} />
            </span>
          </div>

          {/* Art */}
          <div className="relative mx-2 mt-1 h-[104px] overflow-hidden rounded-sm border-2 border-black/70">
            {standing.image ? (
              <Image src={standing.image} alt={name} fill className="object-cover scale-110" sizes="180px" />
            ) : (
              <div className="w-full h-full" style={{ background: vinyl.shadow }} />
            )}
            <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${vinyl.shadow}cc, transparent 60%)` }} />
            {isChampion && (
              <motion.div
                className="absolute top-1 left-1 text-yellow-300 drop-shadow-[0_0_8px_rgba(255,215,0,0.9)]"
                animate={{ rotate: [-12, 12, -12], y: [0, -3, 0] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              >
                <Crown size={22} fill="currentColor" />
              </motion.div>
            )}
          </div>

          {/* Type line */}
          <div className="mx-1.5 mt-1 px-2 py-0.5 rounded-sm border border-black/50 text-[8.5px] font-bold text-black truncate" style={{ background: bar }}>
            Planeswalker légendaire — {RANK_TITLES[rank] ?? "Figurant"}
          </div>

          {/* Text box */}
          <div className="mx-2 mt-1 mb-2 flex-1 rounded-sm p-1.5 text-[9px] leading-snug text-black/85 border border-black/30" style={{ background: vinyl.parchment }}>
            <p><b>Victoires</b> — {standing.wins} sur {standing.played} partie{standing.played > 1 ? "s" : ""}.</p>
            <p><b>Taux</b> — {winRate}% de domination.</p>
            <div className="my-1 h-px bg-black/20" />
            <p className="italic font-serif text-[8.5px] text-black/60 pr-8">{RANK_FLAVOR[rank] ?? ""}</p>
          </div>

          {/* Power / toughness box: points */}
          <div
            className="absolute bottom-1 right-1 px-2 py-0.5 rounded-md border-2 border-black/60 text-black font-black text-[15px] leading-none flex items-baseline gap-0.5"
            style={{ background: `linear-gradient(180deg, #fff8e8, ${vinyl.parchment})` }}
          >
            {standing.points}
            <span className="text-[7px] font-bold opacity-60">PTS</span>
          </div>

          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: glare }} />

          {/* Foil for the leader */}
          {isChampion && (
            <motion.div
              className="absolute inset-0 pointer-events-none mix-blend-color-dodge opacity-60"
              style={{
                backgroundImage: "linear-gradient(115deg, transparent 15%, #ff0080 30%, #ffd700 42%, #00ffd5 54%, #7a00ff 66%, transparent 82%)",
                backgroundSize: "260% 260%",
                backgroundPosition: foilPosition,
              }}
            />
          )}

          {tapped && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="rotate-[-24deg] border-4 border-red-600 text-red-600 font-black text-xl tracking-[0.2em] px-2 bg-black/40 rounded">
                ENGAGÉ
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// A purple arm rising from the bottom of the arena and gripping the last card by its bottom right corner,
// its tip curling over the card like the homepage arms. Follows the card when it untaps or is dragged.
function DrowningArm({ arena, target }: { arena: RefObject<HTMLDivElement | null>; target: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = (now - start) / 1000;
      const arenaEl = arena.current;
      const targetEl = target.current;
      if (!arenaEl || !targetEl) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const box = arenaEl.getBoundingClientRect();
      const w = Math.floor(box.width * dpr);
      const h = Math.floor(box.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);

      // Bottom right corner of the card, whatever its rotation
      const rect = targetEl.getBoundingClientRect();
      const grip = { x: rect.right - box.left - 12, y: rect.bottom - box.top - 8 };
      const sway = Math.sin(t * 0.7) * 30 + Math.sin(t * 1.3) * 12;

      // Tip: climbs the card's edge then curls outwards into a spiral
      const tip: Point[] = [];
      const curlEnd = 0.08 * (1 + Math.sin(t * 1.3) * 0.12);
      const steps = 40;
      const ds = 150 / (steps - 1);
      let theta = -0.08;
      let px = grip.x;
      let py = grip.y;
      for (let i = 0; i < steps; i++) {
        const s = i / (steps - 1);
        tip.push({ x: px, y: py, r: 12 * Math.pow(1 - s, 0.75) + 1.5 * s });
        theta += (0.002 + (curlEnd - 0.002) * s) * ds;
        px += Math.sin(theta) * ds;
        py -= Math.cos(theta) * ds;
      }

      // Body: from below the arena up to the corner
      const end = { x: grip.x, y: grip.y + 10 };
      const base = { x: grip.x + 120 + sway, y: box.height + 90 };
      const c1 = { x: base.x - sway * 0.5, y: base.y - 140 };
      const c2 = { x: end.x + 40, y: end.y + 90 };
      const body: Point[] = [];
      for (let i = 0; i < 40; i++) {
        const s = i / 39;
        const p = bezier(base, c1, c2, end, s);
        const wave = Math.sin(s * Math.PI * 3 - t * 1.8) * 8 * Math.sin(Math.PI * s);
        body.push({ x: p.x + wave, y: p.y, r: 30 + (12 - 30) * Math.pow(s, 0.8) });
      }

      drawArm(ctx, toFrames(body), PURPLE, 1, { blur: 18, y: 10 });
      drawArm(ctx, toFrames(tip), PURPLE, 1, { blur: 8, y: 5 });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [arena, target]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20" />;
}

function DepthArena({ data }: { data: MtgData }) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const loserRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(560);

  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasGames = data.games.length > 0;
  const standingsById = new Map(data.standings.map((s, rank) => [s.id, { ...s, rank }]));
  const maxPoints = Math.max(1, ...data.standings.map((s) => s.points));
  const loserId = hasGames ? data.standings.at(-1)?.id : undefined;
  const span = Math.max(0, height - ARENA_PADDING.top - ARENA_PADDING.bottom - CARD.height);

  // Depth gauge: a few ticks, labelled with the points they stand for
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div ref={arenaRef} className="relative mx-auto max-w-5xl h-[68vh] min-h-[560px]">
      {/* Surface and depth gauge */}
      <motion.div
        className="absolute inset-x-0 top-2 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(170,225,255,0.5), transparent)" }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <div className="absolute left-0 top-0 bottom-0 w-10">
        {ticks.map((tick) => (
          <div key={tick} className="absolute left-0 flex items-center gap-2" style={{ top: ARENA_PADDING.top + CARD.height / 2 + span * tick }}>
            <span className="h-px w-3 bg-white/25" />
            <span className="font-mono text-[10px] text-white/30">{hasGames ? Math.round(maxPoints * (1 - tick)) : ""}</span>
          </div>
        ))}
      </div>

      {data.players.map((player, index) => {
        const standing = standingsById.get(player.id);
        if (!standing) return null;
        const vinyl = PLAYER_COLORS[index % PLAYER_COLORS.length];
        const depth = hasGames ? 1 - standing.points / maxPoints : 0.5;
        const isLoser = player.id === loserId;

        return (
          <motion.div
            key={player.id}
            className="absolute top-0"
            style={{ left: `${((index + 0.5) / data.players.length) * 100}%`, x: "-50%" }}
            initial={{ y: height + 120 }}
            animate={{ y: ARENA_PADDING.top + span * depth }}
            transition={{ type: "spring", stiffness: 40, damping: 9, delay: 0.3 + index * 0.12 }}
          >
            <motion.div
              className="relative"
              animate={isLoser ? { y: [0, 9, 3, 11, 0] } : { y: [0, -7, 0] }}
              transition={{ duration: isLoser ? 3.2 : 4 + index * 0.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Bubbles />
              <PlayerCard
                standing={standing}
                name={MTG_DISPLAY_NAMES[index] ?? player.name}
                rank={standing.rank}
                vinyl={vinyl}
                tapped={isLoser}
                cardRef={isLoser ? loserRef : undefined}
              />
            </motion.div>
          </motion.div>
        );
      })}

      {loserId && <DrowningArm arena={arenaRef} target={loserRef} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PANEL                                                               */
/* ------------------------------------------------------------------ */

function MtgPanel({ onClose }: { onClose: () => void }) {
  const { data, mutate, isLoading } = useSWR<MtgData>("/api/mtg", fetcher);

  const [placements, setPlacements] = useState<string[]>([]);
  const [playedAt, setPlayedAt] = useState(todayLocal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);

  const players = data?.players ?? [];
  const playersById = new Map(players.map((p) => [p.id, p]));
  const vinylOf = (id: string) => PLAYER_COLORS[Math.max(0, players.findIndex((p) => p.id === id)) % PLAYER_COLORS.length];

  const togglePlacement = (id: string) => {
    setPlacements((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mtg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements, playedAt }),
      });
      if (!res.ok) throw new Error();
      setPlacements([]);
      setBurstKey((k) => k + 1);
      await mutate();
    } catch {
      setError("La partie n'a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (gameId: string) => {
    if (!confirm("Supprimer cette partie ?")) return;
    const res = await fetch(`/api/mtg?id=${gameId}`, { method: "DELETE" });
    if (res.ok) await mutate();
  };

  const canSubmit = placements.length >= 3 && placements.length <= 4 && !saving;

  return (
    <motion.div
      // The panel is part of the same water: no ink squirts when clicking around in it
      data-no-ink
      className="fixed inset-0 z-[80] overflow-y-auto overflow-x-hidden text-white"
      style={{ background: "linear-gradient(180deg, rgba(8, 34, 48, 0.8) 0%, rgba(4, 16, 26, 0.92) 45%, rgba(1, 4, 8, 0.98) 100%)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      <GodRays />
      <DiveBubbles />

      <button
        onClick={onClose}
        className="fixed top-6 right-6 z-[90] text-white/40 hover:text-white transition-colors"
        aria-label="Remonter"
      >
        <X size={22} />
      </button>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-20">
        <motion.h1
          className={`${pirata.className} text-center text-6xl text-[#e9f6ff]`}
          style={{ textShadow: "0 0 30px rgba(120, 200, 255, 0.35)" }}
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          Commander
        </motion.h1>

        {isLoading || !data ? (
          <div className="h-[56vh] flex items-center justify-center text-white/30">
            <motion.span animate={{ y: [0, -10, 0] }} transition={{ duration: 1.4, repeat: Infinity }} className="block h-3 w-3 rounded-full border border-white/50" />
          </div>
        ) : players.length === 0 ? (
          <div className="h-[56vh] flex items-center justify-center text-white/30 italic">MTG_PLAYER_IDS n&apos;est pas configuré.</div>
        ) : (
          <>
            <DepthArena data={data} />

            <motion.div
              className="grid md:grid-cols-2 gap-8 mt-10"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              {/* New game */}
              {data.canEdit && (
                <Slab vinyl={PLAYER_COLORS[0]}>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className={`${pirata.className} text-3xl`}>Nouvelle partie</h2>
                    <input
                      type="date"
                      value={playedAt}
                      onChange={(e) => setPlayedAt(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-white/30 [color-scheme:dark]"
                    />
                  </div>

                  {/* Click players in finishing order, the winner first */}
                  <div className="flex justify-around mb-6">
                    {players.map((player, index) => {
                      const position = placements.indexOf(player.id);
                      return (
                        <motion.button
                          key={player.id}
                          onClick={() => togglePlacement(player.id)}
                          whileHover={{ y: -4 }}
                          whileTap={{ scale: 0.9 }}
                          className="relative flex flex-col items-center gap-2"
                          title={MTG_DISPLAY_NAMES[index] ?? player.name}
                        >
                          <span className={position === -1 ? "opacity-50 grayscale-[0.6] transition" : "transition"}>
                            <Porthole player={player} vinyl={PLAYER_COLORS[index % PLAYER_COLORS.length]} size={56} />
                          </span>
                          <AnimatePresence>
                            {position !== -1 && (
                              <motion.span
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className="absolute -top-2 -right-2 rounded-full bg-white text-black text-[10px] font-black px-1.5 py-0.5"
                              >
                                {POSITION_LABELS[position]}
                              </motion.span>
                            )}
                          </AnimatePresence>
                          <span className="font-mono text-[11px] text-white/40">
                            {position !== -1 ? `+${MTG_POINTS[position]}` : " "}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}

                  <div className="relative">
                    <motion.button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      whileTap={canSubmit ? { scale: 0.96 } : undefined}
                      className={`${pirata.className} relative w-full py-3 rounded-full text-2xl text-white disabled:opacity-30 overflow-hidden`}
                      style={{
                        background: `linear-gradient(180deg, ${PLAYER_COLORS[0].light}, ${PLAYER_COLORS[0].base} 55%, ${PLAYER_COLORS[0].shadow})`,
                        boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35), 0 14px 30px -12px rgba(0,0,0,0.8)",
                      }}
                    >
                      {saving ? "..." : "Valider"}
                    </motion.button>
                    <AnimatePresence>{burstKey > 0 && <BubbleBurst key={burstKey} />}</AnimatePresence>
                  </div>
                </Slab>
              )}

              {/* Log of past games: faces in finishing order */}
              <Slab vinyl={PLAYER_COLORS[3]} className={data.canEdit ? "" : "md:col-span-2"}>
                <h2 className={`${pirata.className} text-3xl mb-4`}>Journal</h2>
                {data.games.length === 0 ? (
                  <p className="text-white/30 italic text-sm">Rien encore.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {data.games.map((game) => (
                      <div key={game.id} className="group flex items-center gap-4 rounded-xl px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                        <span className="font-mono text-[10px] text-white/30 w-16 shrink-0">
                          {new Date(`${game.playedAt}T00:00:00`).toLocaleDateString("fr-FR")}
                        </span>
                        <div className="flex items-center gap-2 flex-1">
                          {game.placements.map((playerId, position) => (
                            <span key={playerId} className="relative" style={{ opacity: position === 0 ? 1 : 0.55 }}>
                              <Porthole player={playersById.get(playerId)} vinyl={vinylOf(playerId)} size={position === 0 ? 34 : 26} />
                              {position === 0 && <Crown size={11} className="absolute -top-2 left-1/2 -translate-x-1/2 text-yellow-300" fill="currentColor" />}
                            </span>
                          ))}
                        </div>
                        {data.canEdit && (
                          <button
                            onClick={() => handleDelete(game.id)}
                            className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition"
                            aria-label="Supprimer"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Slab>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}
