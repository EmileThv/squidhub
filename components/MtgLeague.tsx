"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import {
    motion,
    AnimatePresence,
    useAnimationControls,
    useMotionTemplate,
    useMotionValue,
    useSpring,
    useTransform,
} from "framer-motion";
import { X, Crown, Flame, Skull } from "lucide-react";
import type { MtgGame, MtgPlayer, MtgStanding } from "@/lib/mtg";
import { MTG_POINTS } from "@/lib/mtg";

type MtgData = {
    players: MtgPlayer[];
    games: MtgGame[];
    standings: MtgStanding[];
    canEdit: boolean;
};

type Mana = { key: string; color: string; dark: string; parchment: string };

const SECRET = "mtg";
const POSITION_LABELS = ["1er", "2e", "3e", "4e"];

// One colour identity per player, assigned by their order in MTG_PLAYER_IDS
const MANA: Mana[] = [
    { key: "W", color: "#F8E7B9", dark: "#9c8752", parchment: "#f4ecd6" },
    { key: "U", color: "#3E9BE0", dark: "#123f6b", parchment: "#dbe8f2" },
    { key: "B", color: "#A88BC4", dark: "#2a1838", parchment: "#ddd5e2" },
    { key: "R", color: "#EE5A3B", dark: "#6e1a0e", parchment: "#f3ddd3" },
    { key: "G", color: "#3DBB6A", dark: "#123f22", parchment: "#d9eadb" },
];

const RANK_TITLES = ["Archimage suprême", "Second couteau", "Chair à canon", "Fond du cimetière"];
const RANK_FLAVOR = [
    "« Le trône n'a qu'une place, et elle est encore chaude. »",
    "« Presque. Toujours presque. »",
    "« Il a vu la victoire. De très loin. »",
    "« Même ses jetons l'ont abandonné. »",
];
const HEADER_FLAVOR = [
    "Que la pioche vous soit favorable.",
    "Ici, les amitiés meurent au tour 6.",
    "Personne ne se souvient du deuxième.",
    "Le sel coule plus que le mana.",
    "« Je passe. » — dernières paroles célèbres",
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Local date as YYYY-MM-DD
const todayLocal = () => new Date().toLocaleDateString("sv-SE");

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

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

    return (
        <AnimatePresence>
            {open && <MtgPanel onClose={() => setOpen(false)} />}
        </AnimatePresence>
    );
}

/* ------------------------------------------------------------------ */
/* AMBIENCE                                                            */
/* ------------------------------------------------------------------ */

function ManaPip({ mana, size = 18, label }: { mana: Mana; size?: number; label?: string }) {
    return (
        <span
            className="inline-flex items-center justify-center rounded-full font-black shrink-0"
            style={{
                width: size,
                height: size,
                fontSize: size * 0.5,
                color: mana.dark,
                background: `radial-gradient(circle at 35% 30%, #fff 0%, ${mana.color} 45%, ${mana.dark} 100%)`,
                boxShadow: `0 0 ${size / 2}px ${mana.color}90, inset 0 -2px 3px rgba(0,0,0,0.35)`,
            }}
        >
            {label ?? mana.key}
        </span>
    );
}

// Mana motes drifting up behind everything
function FloatingMotes() {
    const [motes] = useState(() =>
        Array.from({ length: 34 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            size: 3 + Math.random() * 7,
            mana: pick(MANA),
            duration: 9 + Math.random() * 14,
            delay: -Math.random() * 20,
            drift: (Math.random() - 0.5) * 120,
        }))
    );

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
            {motes.map((m) => (
                <motion.div
                    key={m.id}
                    className="absolute rounded-full"
                    style={{
                        left: `${m.left}%`,
                        bottom: -20,
                        width: m.size,
                        height: m.size,
                        background: m.mana.color,
                        boxShadow: `0 0 ${m.size * 2}px ${m.mana.color}`,
                    }}
                    animate={{ y: [0, -1200], x: [0, m.drift], opacity: [0, 0.9, 0.9, 0] }}
                    transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, ease: "linear" }}
                />
            ))}
        </div>
    );
}

// Five orbs spiral in and collide into a flash when the panel opens
function SummoningCircle() {
    return (
        <motion.div
            className="fixed inset-0 z-[95] pointer-events-none flex items-center justify-center"
            exit={{ opacity: 0 }}
        >
            <motion.div
                className="relative"
                animate={{ rotate: [0, 540] }}
                transition={{ duration: 1.1, ease: "easeIn" }}
            >
                {MANA.map((mana, i) => {
                    const angle = (i / MANA.length) * Math.PI * 2 - Math.PI / 2;
                    const x = Math.cos(angle) * 180;
                    const y = Math.sin(angle) * 180;
                    return (
                        <motion.div
                            key={mana.key}
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                            initial={{ x, y, scale: 0 }}
                            animate={{ x: [x, x, 0], y: [y, y, 0], scale: [0, 1.4, 0.4] }}
                            transition={{ duration: 1.1, times: [0, 0.35, 1], ease: "easeInOut" }}
                        >
                            <ManaPip mana={mana} size={54} />
                        </motion.div>
                    );
                })}
            </motion.div>
            <motion.div
                className="absolute inset-0"
                style={{ background: "radial-gradient(circle, #fff 0%, #ffe9a8 30%, transparent 70%)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 1, 0] }}
                transition={{ duration: 1.5, times: [0, 0.68, 0.76, 1] }}
            />
        </motion.div>
    );
}

// Particles thrown out of the resolve button
function ManaBurst() {
    const [particles] = useState(() =>
        Array.from({ length: 46 }, (_, i) => {
            const angle = Math.random() * Math.PI * 2;
            const distance = 120 + Math.random() * 320;
            return {
                id: i,
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                size: 5 + Math.random() * 10,
                mana: pick(MANA),
                rotate: Math.random() * 720,
            };
        })
    );

    return (
        <div className="absolute left-1/2 top-1/2 pointer-events-none z-50">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-sm"
                    style={{
                        width: p.size,
                        height: p.size,
                        background: p.mana.color,
                        boxShadow: `0 0 12px ${p.mana.color}`,
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.2, rotate: p.rotate }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                />
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* PLAYER CARD                                                         */
/* ------------------------------------------------------------------ */

function PlayerCard({
    standing,
    rank,
    mana,
    tapped,
    delay,
}: {
    standing: MtgStanding;
    rank: number;
    mana: Mana;
    tapped: boolean;
    delay: number;
}) {
    const [hovered, setHovered] = useState(false);
    const [dealt, setDealt] = useState(false);
    const [dealRotation] = useState(() => (Math.random() - 0.5) * 60);

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

    return (
        <motion.div
            className="relative cursor-grab active:cursor-grabbing"
            style={{ perspective: 900, marginInline: tapped ? 44 : 0 }}
            initial={{ y: -700, rotate: dealRotation, opacity: 0 }}
            animate={{
                y: 0,
                opacity: 1,
                rotate: tapped && !hovered ? 90 : 0,
            }}
            transition={{
                y: { type: "spring", stiffness: 120, damping: 14, delay },
                opacity: { duration: 0.2, delay },
                rotate: { type: "spring", stiffness: 160, damping: 14, delay: dealt ? 0 : delay },
            }}
            onAnimationComplete={() => setDealt(true)}
            drag
            dragSnapToOrigin
            dragElastic={0.7}
            whileDrag={{ scale: 1.12, zIndex: 50 }}
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
                className="relative w-[190px] h-[266px] rounded-[14px] p-[6px] select-none"
                style={{
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                    background: `linear-gradient(145deg, ${mana.color}, ${mana.dark} 50%, ${mana.color})`,
                    boxShadow: isChampion
                        ? `0 0 40px ${mana.color}, 0 0 90px rgba(255,215,0,0.45), 0 20px 40px rgba(0,0,0,0.6)`
                        : `0 0 24px ${mana.color}55, 0 20px 40px rgba(0,0,0,0.6)`,
                }}
                whileHover={{ scale: 1.07, y: -10 }}
            >
                <div className="relative h-full w-full rounded-[10px] overflow-hidden flex flex-col bg-[#14110f]">
                    {/* Name bar */}
                    <div
                        className="mx-1.5 mt-1.5 px-2 py-1 rounded-md flex items-center justify-between gap-1 border border-black/50"
                        style={{ background: `linear-gradient(90deg, ${mana.parchment}, #fff8e8)` }}
                    >
                        <span className="text-[11px] font-black text-black truncate">{standing.name}</span>
                        <span className="flex gap-0.5">
                            <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-[#cfc6b8] text-[8px] font-black text-black">
                                {rank + 1}
                            </span>
                            <ManaPip mana={mana} size={15} />
                        </span>
                    </div>

                    {/* Art */}
                    <div className="relative mx-2 mt-1 h-[104px] overflow-hidden rounded-sm border-2 border-black/70">
                        {standing.image ? (
                            <Image src={standing.image} alt={standing.name} fill className="object-cover scale-110" sizes="180px" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: mana.dark }}>?</div>
                        )}
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${mana.dark}cc, transparent 60%)` }} />
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
                    <div
                        className="mx-1.5 mt-1 px-2 py-0.5 rounded-sm border border-black/50 text-[8.5px] font-bold text-black truncate"
                        style={{ background: `linear-gradient(90deg, ${mana.parchment}, #fff8e8)` }}
                    >
                        Planeswalker légendaire — {RANK_TITLES[rank] ?? "Figurant"}
                    </div>

                    {/* Text box */}
                    <div
                        className="mx-2 mt-1 mb-2 flex-1 rounded-sm p-1.5 text-[9px] leading-snug text-black/85 border border-black/30"
                        style={{ background: mana.parchment }}
                    >
                        <p><b>Victoires</b> — {standing.wins} sur {standing.played} partie{standing.played > 1 ? "s" : ""}.</p>
                        <p><b>Taux</b> — {winRate}% de domination.</p>
                        <div className="my-1 h-px bg-black/20" />
                        <p className="italic font-serif text-[8.5px] text-black/60 pr-8">{RANK_FLAVOR[rank] ?? ""}</p>
                    </div>

                    {/* Power / toughness box: points */}
                    <div
                        className="absolute bottom-1 right-1 px-2 py-0.5 rounded-md border-2 border-black/60 text-black font-black text-[15px] leading-none flex items-baseline gap-0.5"
                        style={{ background: `linear-gradient(180deg, #fff8e8, ${mana.parchment})` }}
                    >
                        {standing.points}
                        <span className="text-[7px] font-bold opacity-60">PTS</span>
                    </div>

                    {/* Glare */}
                    <motion.div className="absolute inset-0 pointer-events-none" style={{ background: glare }} />

                    {/* Foil for the champion */}
                    {isChampion && (
                        <motion.div
                            className="absolute inset-0 pointer-events-none mix-blend-color-dodge opacity-60"
                            style={{
                                backgroundImage:
                                    "linear-gradient(115deg, transparent 15%, #ff0080 30%, #ffd700 42%, #00ffd5 54%, #7a00ff 66%, transparent 82%)",
                                backgroundSize: "260% 260%",
                                backgroundPosition: foilPosition,
                            }}
                        />
                    )}

                    {/* Tapped stamp */}
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

/* ------------------------------------------------------------------ */
/* PANEL                                                               */
/* ------------------------------------------------------------------ */

function MtgPanel({ onClose }: { onClose: () => void }) {
    const { data, mutate, isLoading } = useSWR<MtgData>("/api/mtg", fetcher);

    const [summoning, setSummoning] = useState(true);
    const [flavor] = useState(() => pick(HEADER_FLAVOR));
    const [placements, setPlacements] = useState<string[]>([]);
    const [playedAt, setPlayedAt] = useState(todayLocal);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [burstKey, setBurstKey] = useState(0);
    const shake = useAnimationControls();

    useEffect(() => {
        const id = setTimeout(() => setSummoning(false), 1100);
        return () => clearTimeout(id);
    }, []);

    const players = data?.players ?? [];
    const playersById = new Map(players.map((p) => [p.id, p]));
    const manaById = new Map(players.map((p, i) => [p.id, MANA[i % MANA.length]]));
    const manaOf = (id: string) => manaById.get(id) ?? MANA[0];

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
            shake.start({ x: [0, -18, 16, -12, 9, -5, 0], rotate: [0, -0.6, 0.5, -0.3, 0], transition: { duration: 0.55 } });
            await mutate();
        } catch {
            setError("Contresort ! La partie n'a pas pu être enregistrée.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (gameId: string) => {
        if (!confirm("Exiler cette partie ? Elle sera retirée du classement.")) return;
        const res = await fetch(`/api/mtg?id=${gameId}`, { method: "DELETE" });
        if (res.ok) await mutate();
    };

    const canSubmit = placements.length >= 3 && placements.length <= 4 && !saving;
    const hasGames = (data?.games.length ?? 0) > 0;
    const revealDelay = 0.9;

    return (
        <motion.div
            className="fixed inset-0 z-[80] overflow-y-auto overflow-x-hidden text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.08, filter: "blur(12px)" }}
            transition={{ duration: 0.35 }}
            style={{ background: "radial-gradient(ellipse at 50% 30%, #241433 0%, #0b0610 55%, #040205 100%)" }}
        >
            {/* Spinning mana wheel */}
            <motion.div
                className="fixed pointer-events-none rounded-full"
                style={{
                    left: "50%",
                    top: "40%",
                    x: "-50%",
                    y: "-50%",
                    width: "150vmax",
                    height: "150vmax",
                    background: `conic-gradient(${MANA.map((m) => m.color).join(", ")}, ${MANA[0].color})`,
                    filter: "blur(90px)",
                    opacity: 0.13,
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            />
            <FloatingMotes />

            <AnimatePresence>{summoning && <SummoningCircle />}</AnimatePresence>

            <button
                onClick={onClose}
                className="fixed top-6 right-6 z-[90] flex items-center gap-2 text-[10px] font-black tracking-[0.3em] uppercase text-white/40 hover:text-red-400 transition-colors"
            >
                Concéder <X size={18} />
            </button>

            <motion.div animate={shake} className="relative z-10 max-w-6xl mx-auto px-6 pt-14 pb-24">
                {/* Header */}
                <motion.header
                    className="text-center mb-12"
                    initial={{ opacity: 0, scale: 0.6, filter: "blur(20px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    transition={{ delay: revealDelay, type: "spring", stiffness: 140, damping: 16 }}
                >
                    <div className="flex justify-center gap-2 mb-4">
                        {MANA.map((mana, i) => (
                            <motion.span
                                key={mana.key}
                                animate={{ y: [0, -8, 0] }}
                                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                            >
                                <ManaPip mana={mana} size={26} />
                            </motion.span>
                        ))}
                    </div>
                    <motion.h1
                        className="text-5xl md:text-7xl font-black uppercase leading-none bg-clip-text text-transparent"
                        style={{
                            fontFamily: "var(--font-squidwod)",
                            backgroundImage: `linear-gradient(90deg, ${MANA.map((m) => m.color).join(", ")}, ${MANA[0].color})`,
                            backgroundSize: "300% 100%",
                            filter: "drop-shadow(0 0 24px rgba(168,139,196,0.5))",
                        }}
                        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    >
                        Table de Commandement
                    </motion.h1>
                    <p className="mt-3 italic font-serif text-white/45">{flavor}</p>
                </motion.header>

                {isLoading || !data ? (
                    <div className="h-60 flex flex-col items-center justify-center gap-4 text-white/40 italic">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="flex gap-1">
                            {MANA.map((mana) => <ManaPip key={mana.key} mana={mana} size={14} />)}
                        </motion.div>
                        Mélange du deck...
                    </div>
                ) : players.length === 0 ? (
                    <div className="h-60 flex items-center justify-center text-white/40 italic">
                        Aucun planeswalker configuré (MTG_PLAYER_IDS).
                    </div>
                ) : (
                    <>
                        {/* The battlefield: one card per player */}
                        <section className="flex flex-wrap justify-center items-center gap-8 min-h-[300px] mb-20">
                            {data.standings.map((standing, rank) => (
                                <PlayerCard
                                    key={standing.id}
                                    standing={standing}
                                    rank={rank}
                                    mana={manaOf(standing.id)}
                                    tapped={hasGames && rank === data.standings.length - 1}
                                    delay={revealDelay + 0.15 + rank * 0.14}
                                />
                            ))}
                        </section>

                        {/* The stack: new game form */}
                        {data.canEdit && (
                            <motion.section
                                className="relative mb-20 mx-auto max-w-3xl rounded-3xl p-[2px] overflow-hidden"
                                initial={{ opacity: 0, y: 60 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: revealDelay + 0.7 }}
                            >
                                {/* Rotating mana border */}
                                <motion.div
                                    className="absolute pointer-events-none"
                                    style={{
                                        left: "50%",
                                        top: "50%",
                                        x: "-50%",
                                        y: "-50%",
                                        width: "200%",
                                        aspectRatio: "1",
                                        background: `conic-gradient(${MANA.map((m) => m.color).join(", ")}, ${MANA[0].color})`,
                                    }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                                />
                                <div className="relative rounded-[22px] bg-[#0d0912]/95 p-6">
                                    <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
                                        <h2 className="text-2xl font-black uppercase tracking-tight" style={{ fontFamily: "var(--font-squidwod)" }}>
                                            La Pile
                                        </h2>
                                        <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                                            Tour du
                                            <input
                                                type="date"
                                                value={playedAt}
                                                onChange={(e) => setPlayedAt(e.target.value)}
                                                className="bg-white/5 border border-white/15 rounded-lg px-2 py-1 text-xs text-white normal-case tracking-normal focus:outline-none focus:border-main-yellow [color-scheme:dark]"
                                            />
                                        </label>
                                    </div>
                                    <p className="text-xs text-white/40 mb-6">
                                        Empile les joueurs dans l&apos;ordre d&apos;arrivée — le gagnant en premier.
                                    </p>

                                    {/* Player tokens */}
                                    <div className="flex flex-wrap justify-center gap-5 mb-6">
                                        {players.map((player) => {
                                            const mana = manaOf(player.id);
                                            const position = placements.indexOf(player.id);
                                            const onStack = position !== -1;
                                            return (
                                                <motion.button
                                                    key={player.id}
                                                    onClick={() => togglePlacement(player.id)}
                                                    whileHover={{ scale: 1.12, rotate: -4 }}
                                                    whileTap={{ scale: 0.85 }}
                                                    animate={{ opacity: onStack ? 0.35 : 1, y: onStack ? 6 : 0 }}
                                                    className="flex flex-col items-center gap-1.5"
                                                >
                                                    <span
                                                        className="relative w-16 h-16 rounded-full overflow-hidden"
                                                        style={{ boxShadow: `0 0 0 3px ${mana.color}, 0 0 22px ${mana.color}` }}
                                                    >
                                                        {player.image && <Image src={player.image} alt={player.name} fill className="object-cover" sizes="64px" />}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-white/80">{player.name}</span>
                                                </motion.button>
                                            );
                                        })}
                                    </div>

                                    {/* Stack slots */}
                                    <div className="grid grid-cols-4 gap-3 mb-6">
                                        {[0, 1, 2, 3].map((slot) => {
                                            const playerId = placements[slot];
                                            const player = playerId ? playersById.get(playerId) : undefined;
                                            const mana = playerId ? manaOf(playerId) : undefined;
                                            return (
                                                <div
                                                    key={slot}
                                                    className="relative h-24 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center"
                                                >
                                                    <span className="absolute top-1 left-2 text-[9px] font-black tracking-widest text-white/25">
                                                        {POSITION_LABELS[slot]}
                                                    </span>
                                                    <AnimatePresence>
                                                        {player && mana && (
                                                            <motion.button
                                                                key={player.id}
                                                                onClick={() => togglePlacement(player.id)}
                                                                initial={{ y: -120, rotate: -25, opacity: 0, scale: 1.4 }}
                                                                animate={{ y: 0, rotate: slot % 2 ? 3 : -3, opacity: 1, scale: 1 }}
                                                                exit={{ y: 60, rotate: 30, opacity: 0 }}
                                                                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                                                                className="absolute inset-1 rounded-lg flex flex-col items-center justify-center gap-1 border border-black/40"
                                                                style={{
                                                                    background: `linear-gradient(160deg, ${mana.color}, ${mana.dark})`,
                                                                    boxShadow: `0 0 18px ${mana.color}80`,
                                                                }}
                                                            >
                                                                <span className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-black/50">
                                                                    {player.image && <Image src={player.image} alt={player.name} fill className="object-cover" sizes="36px" />}
                                                                </span>
                                                                <span className="text-[10px] font-black text-black/80 truncate max-w-full px-1">{player.name}</span>
                                                                <span className="absolute top-1 right-1.5 text-[10px] font-black text-black/70">
                                                                    +{MTG_POINTS[slot]}
                                                                </span>
                                                            </motion.button>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}

                                    {/* Resolve */}
                                    <div className="relative">
                                        <motion.button
                                            onClick={handleSubmit}
                                            disabled={!canSubmit}
                                            whileHover={canSubmit ? { scale: 1.03 } : undefined}
                                            whileTap={canSubmit ? { scale: 0.95 } : undefined}
                                            animate={canSubmit ? { boxShadow: ["0 0 0px #FEC80C", "0 0 36px #FEC80C", "0 0 0px #FEC80C"] } : { boxShadow: "0 0 0px #FEC80C" }}
                                            transition={{ boxShadow: { duration: 1.6, repeat: Infinity } }}
                                            className="w-full py-4 rounded-xl font-black uppercase tracking-[0.35em] text-sm bg-gradient-to-r from-main-yellow via-orange-500 to-red-600 text-black disabled:opacity-25 disabled:grayscale"
                                        >
                                            {saving ? "Résolution..." : "Résoudre la pile"}
                                        </motion.button>
                                        <AnimatePresence>{burstKey > 0 && <ManaBurst key={burstKey} />}</AnimatePresence>
                                    </div>
                                </div>
                            </motion.section>
                        )}

                        {/* The graveyard: game history */}
                        <motion.section
                            className="mx-auto max-w-3xl"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: revealDelay + 0.9 }}
                        >
                            <h2 className="flex items-center justify-center gap-3 text-xl font-black uppercase tracking-[0.3em] text-white/50 mb-6">
                                <Skull size={18} /> Cimetière <Skull size={18} />
                            </h2>

                            {data.games.length === 0 ? (
                                <p className="text-center italic font-serif text-white/30">
                                    Le cimetière est vide. Pour l&apos;instant.
                                </p>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {data.games.map((game, index) => (
                                        <motion.div
                                            key={game.id}
                                            initial={{ opacity: 0, x: index % 2 ? 60 : -60 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: revealDelay + 1 + Math.min(index, 12) * 0.05 }}
                                            whileHover={{ scale: 1.02, rotate: 0 }}
                                            style={{ rotate: index % 2 ? 0.8 : -0.8 }}
                                            className="group flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-gradient-to-r from-white/[0.07] to-white/[0.02] border border-white/10 backdrop-blur-sm"
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <span className="text-[10px] font-mono text-white/30 shrink-0 w-16">
                                                    {new Date(`${game.playedAt}T00:00:00`).toLocaleDateString("fr-FR")}
                                                </span>
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    {game.placements.map((playerId, position) => {
                                                        const player = playersById.get(playerId);
                                                        const mana = manaOf(playerId);
                                                        return (
                                                            <span
                                                                key={playerId}
                                                                className={`flex items-center gap-1.5 text-xs ${position === 0 ? "font-black" : "text-white/50"}`}
                                                                style={position === 0 ? { color: mana.color, textShadow: `0 0 12px ${mana.color}` } : undefined}
                                                            >
                                                                {position === 0 ? <Crown size={13} fill="currentColor" /> : <span className="text-[9px] text-white/30">{POSITION_LABELS[position]}</span>}
                                                                {player?.name ?? "?"}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {data.canEdit && (
                                                <button
                                                    onClick={() => handleDelete(game.id)}
                                                    className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-red-400 hover:drop-shadow-[0_0_8px_rgba(248,113,113,0.9)] transition-all shrink-0"
                                                    title="Exiler"
                                                >
                                                    <Flame size={14} /> Exiler
                                                </button>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.section>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}
