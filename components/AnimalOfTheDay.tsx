"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Animal = {
    scientificName: string;
    commonName: string | null;
    iconicTaxon: string;
    placeGuess: string;
    photos: string[];
    inatUrl: string;
    env: string
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());


// Glitch text effect hook
function useGlitch(active: boolean) {
    const [glitched, setGlitched] = useState(false);
    useEffect(() => {
        if (!active) return;
        const fire = () => {
            setGlitched(true);
            setTimeout(() => setGlitched(false), 120 + Math.random() * 80);
        };
        const id = setInterval(fire, 2200 + Math.random() * 3000);
        return () => clearInterval(id);
    }, [active]);
    return glitched;
}

const CHARS = "▓▒░█▄▀■□◆◇※§¶†‡";
function ScrambleText({ text, active }: { text: string; active: boolean }) {
    const [display, setDisplay] = useState(text);
    useEffect(() => {
        if (!active) { setDisplay(text); return; }
        let frame = 0;
        const max = 8;
        const id = setInterval(() => {
            if (frame >= max) { setDisplay(text); clearInterval(id); return; }
            setDisplay(
                text.split("").map((c, i) =>
                    i < frame ? c : (c === " " ? " " : CHARS[Math.floor(Math.random() * CHARS.length)])
                ).join("")
            );
            frame++;
        }, 40);
        return () => clearInterval(id);
    }, [text, active]);
    return <span>{display}</span>;
}

// Noise canvas overlay
function NoiseOverlay() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        let raf: number;
        const draw = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            if (canvas.width === 0 || canvas.height === 0) {
                raf = requestAnimationFrame(draw);
                return;
            }
            const imageData = ctx.createImageData(canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const v = Math.random() * 40;
                data[i] = data[i + 1] = data[i + 2] = v;
                data[i + 3] = Math.random() * 28;
            }
            ctx.putImageData(imageData, 0, 0);
            raf = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(raf);
    }, []);
    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20 mix-blend-overlay opacity-60" />;
}

// Animated breathing orb
function Orb({ color, size, x, y, delay }: { color: string; size: number; x: string; y: string; delay: number }) {
    return (
        <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{ width: size, height: size, left: x, top: y, background: color, filter: "blur(80px)" }}
            animate={{ scale: [1, 1.3, 0.9, 1.2, 1], opacity: [0.15, 0.3, 0.1, 0.25, 0.15] }}
            transition={{ duration: 8, repeat: Infinity, delay, ease: "easeInOut" }}
        />
    );
}



export default function FractalSonarDisplay() {
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);
    const [sonarKey, setSonarKey] = useState("/api/animal");
    const glitchActive = useGlitch(open);
    const [zoomed, setZoomed] = useState(false)


    const { data, isValidating } = useSWR<Animal>(sonarKey, fetcher, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
    });

    const photos = data?.photos ?? [];

    useEffect(() => {
        if (!open || photos.length === 0) return;
        const id = setInterval(() => {
            setIndex(i => (i + 1) % photos.length);
        }, 10000);
        return () => clearInterval(id);
    }, [open, photos.length]);


    useEffect(() => {
        photos.forEach(url => {
            const img = new window.Image();
            img.src = url;
        });
    }, [photos]);

    const handleDailySync = () => {
        setIndex(0);
        setSonarKey(`/api/animal?sync=${Date.now()}`);
        setOpen(true);
    };

    const handleRandomPing = () => {
        setIndex(0);
        setSonarKey(`/api/animal?random=true&ping=${Date.now()}`);
    };

    const taxonMood = useMemo(() => {
        switch (data?.env) {
            case "MARIN": return { label: "Spécimen marin", accent: "#22B04E", glow: "rgba(34,176,78,0.75)" };
            case "AERIEN": return { label: "Spécimen aérien", accent: "#FEC80C", glow: "rgba(254,200,12,0.75)" };
            case "INSECTE": return { label: "Spécimen insecte", accent: "#FEC80C", glow: "rgba(254,200,12,0.75)" };
            default: return { label: "Spécimen terrestre", accent: "#22B04E", glow: "rgba(34,176,78,0.75)" };
        }
    }, [data?.env]);

    // Cursor tracking for the panel
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const rotateX = useSpring(useTransform(mouseY, [0, 600], [1, -1]), { stiffness: 100, damping: 30 });
    const rotateY = useSpring(useTransform(mouseX, [0, 400], [-1, 1]), { stiffness: 100, damping: 30 });

    return (
        <>
            <style>{`
                @keyframes scanline {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100vh); }
                }
                .scanline-sweep::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to bottom, transparent 40%, rgba(255,255,255,0.015) 50%, transparent 60%);
                    animation: scanline 6s linear infinite;
                    pointer-events: none;
                }
                @keyframes flicker {
                    0%, 95%, 100% { opacity: 1; }
                    96% { opacity: 0.7; }
                    97% { opacity: 1; }
                    98% { opacity: 0.5; }
                    99% { opacity: 0.9; }
                }
                .flicker { animation: flicker 7s infinite; }
                .stamp-border {
                    background-image:
                        repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 5px),
                        repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 5px);
                }
                .ink-smear {
                    position: relative;
                }
                .ink-smear::before {
                    content: attr(data-text);
                    position: absolute;
                    left: 2px;
                    top: 0;
                    color: rgba(251,146,60,0.25);
                    filter: blur(3px);
                    pointer-events: none;
                }
                .tab-glyph {
                    writing-mode: vertical-rl;
                    text-orientation: mixed;
                }
            `}</style>

            {/* ONGLET LATÉRAL */}
            <AnimatePresence>
                {!open && (
                    <motion.button
                        initial={{ x: 80, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 80, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 280, damping: 24 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={handleDailySync}
                        className="fixed z-[70] right-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center"
                        style={{
                            width: 24,
                            height: "70vh",
                            background: "#0d0b09",
                            backgroundImage: `radial-gradient(circle at 20% 30%, ${taxonMood.accent}25 1.5px, transparent 1.5px),
                                                    radial-gradient(circle at 70% 60%, ${taxonMood.accent}20 1.5px, transparent 1.5px),
                                                    radial-gradient(circle at 45% 80%, rgba(255,255,255,0.12) 1.5px, transparent 1.5px),
                                                    radial-gradient(circle at 85% 20%, rgba(255,255,255,0.10) 1.5px, transparent 1.5px),
                                                    radial-gradient(circle at 55% 45%, ${taxonMood.accent}15 1px, transparent 1px),
                                                    radial-gradient(circle at 10% 70%, rgba(255,255,255,0.08) 1px, transparent 1px)`,
                            backgroundSize: "6px 6px",
                            borderRadius: "14px 0 0 14px",
                            borderTop: `5px solid ${taxonMood.accent}50`,
                            borderBottom: `5px solid ${taxonMood.accent}50`,
                            borderLeft: `5px solid ${taxonMood.accent}50`,
                            borderRight: "none",
                            boxShadow: `-6px 0 40px ${taxonMood.accent}70`,
                            cursor: "pointer",
                        }}
                    >


                        {/* Vertical text centered */}
                        {isValidating ? (
                            <motion.span
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                style={{ color: "#22B04E", fontSize: 18 }}
                            >◈</motion.span>
                        ) : (
                            <div style={{
                                writingMode: "vertical-rl",
                                transform: "rotate(180deg)",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 8,
                            }}>
                                <span className="text-[12px] font-black tracking-[0.4em] uppercase flicker" style={{ color: taxonMood.accent }}>
                                    Specimen du jour — {taxonMood.label}
                                </span>

                            </div>
                        )}
                    </motion.button>
                )}
            </AnimatePresence>

            {/* PANNEAU PRINCIPAL */}
            <AnimatePresence>
                {open && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            onClick={() => setOpen(false)}
                            className="fixed inset-0 z-40"
                            style={{ background: "radial-gradient(ellipse at right, rgba(10,6,4,0.97) 0%, rgba(5,3,2,0.92) 100%)", backdropFilter: "blur(4px)" }}
                        />

                        <motion.aside
                            initial={{ x: "110%", skewY: 1 }}
                            animate={{ x: 0, skewY: 0 }}
                            exit={{ x: "110%", skewY: -1 }}
                            transition={{ type: "spring", damping: 30, stiffness: 220 }}
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                mouseX.set(e.clientX - rect.left);
                                mouseY.set(e.clientY - rect.top);
                            }}
                            className="fixed right-0 top-0 z-50 h-full w-[95vw] md:w-[420px] flex flex-col scanline-sweep"
                            style={{
                                background: "#0a0705",
                                backgroundImage: `
        radial-gradient(circle at 20% 15%, ${taxonMood.accent}20 1.5px, transparent 1.5px),
        radial-gradient(circle at 70% 40%, ${taxonMood.accent}15 1.5px, transparent 1.5px),
        radial-gradient(circle at 40% 75%, rgba(255,255,255,0.08) 1.5px, transparent 1.5px),
        radial-gradient(circle at 85% 65%, rgba(255,255,255,0.06) 1.5px, transparent 1.5px),
        radial-gradient(circle at 55% 90%, ${taxonMood.accent}12 1px, transparent 1px)
    `,
                                borderLeft: "1px solid rgba(255,255,255,0.06)"
                            }}
                        >
                            {/* Layered ambience */}
                            <NoiseOverlay />

                            <div className="absolute inset-0 pointer-events-none z-0 stamp-border opacity-40" />
                            <Orb color="rgba(251,146,60,0.6)" size={300} x="20%" y="-10%" delay={0} />
                            <Orb color="rgba(120,60,180,0.5)" size={250} x="50%" y="50%" delay={3} />
                            <Orb color="rgba(60,180,120,0.4)" size={200} x="-10%" y="70%" delay={6} />

                            {/* Top status bar */}
                            <div className="relative z-30 flex items-center justify-between px-6 pt-5 pb-0">
                                <div className="flex items-center gap-3">
                                    <motion.div
                                        animate={{ opacity: isValidating ? [1, 0, 1] : [0.4, 1, 0.4] }}
                                        transition={{ duration: isValidating ? 0.3 : 2, repeat: Infinity }}
                                        className="w-2 h-2 rounded-full"
                                        style={{ background: isValidating ? "#fb923c" : taxonMood.accent }}
                                    />
                                    <span className="text-[9px] tracking-[0.5em] uppercase font-bold flicker"
                                        style={{ color: "rgba(255,255,255,0.25)" }}>
                                        {isValidating ? "chargement..." : "SquidZoo"}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setOpen(false)}
                                    className="text-[9px] tracking-[0.4em] uppercase transition-colors hover:text-red-400"
                                    style={{ color: "red" }}
                                >
                                    ✕ fermer
                                </button>
                            </div>

                            {/* IMAGE VIEWPORT */}
                            <div className="relative mx-5 mt-4 flex-1 overflow-hidden group"
                                onClick={() => setZoomed(true)}
                                style={{ borderRadius: "4px 4px 0 0", minHeight: 0, cursor: "zoom-in" }}>



                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={sonarKey + index}
                                        initial={{ opacity: 0, scale: 1.04 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.97 }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                        className="absolute inset-0"
                                    >
                                        {photos[index] ? (
                                            <Image
                                                src={photos[index]}
                                                alt="spécimen"
                                                fill
                                                className="object-cover"
                                                priority
                                                style={{ filter: "contrast(1.05) saturate(0.92)" }}
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center" style={{ background: "#080604" }}>
                                                <motion.div
                                                    animate={{ rotate: [0, 360], scale: [1, 1.2, 1] }}
                                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                                    className="text-4xl opacity-20"
                                                    style={{ color: taxonMood.accent }}
                                                >◈</motion.div>
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>

                                {/* Subtle vignette — doesn't obscure */}
                                <div className="absolute inset-0 pointer-events-none z-10"
                                    style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(10,7,5,0.55) 100%)" }} />

                                {/* Photo counter + nav */}
                                {photos.length > 1 && (
                                    <div className="absolute inset-x-4 bottom-4 z-30 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            onClick={(e) => { e.stopPropagation(); setIndex((index - 1 + photos.length) % photos.length); }}
                                            className="h-10 w-10 flex items-center justify-center"
                                            style={{ background: "rgba(10,7,5,0.7)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
                                        >
                                            <ChevronLeft size={18} color={taxonMood.accent} />
                                        </motion.button>

                                        <div className="flex gap-1.5 items-center">
                                            {photos.map((_, i) => (
                                                <motion.button
                                                    key={i}
                                                    onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                                                    animate={{ width: i === index ? 20 : 6, opacity: i === index ? 1 : 0.35 }}
                                                    transition={{ duration: 0.3 }}
                                                    className="h-[3px] rounded-full"
                                                    style={{ background: i === index ? taxonMood.accent : "rgba(255,255,255,0.5)" }}
                                                />
                                            ))}
                                        </div>

                                        <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            onClick={(e) => { e.stopPropagation(); setIndex((index + 1) % photos.length); }}
                                            className="h-10 w-10 flex items-center justify-center"
                                            style={{ background: "rgba(10,7,5,0.7)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
                                        >
                                            <ChevronRight size={18} color={taxonMood.accent} />
                                        </motion.button>
                                    </div>
                                )}

                                {/* Taxon stamp */}
                                <AnimatePresence>
                                    {!isValidating && data && (
                                        <motion.div
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ delay: 0.3 }}
                                            className="absolute top-6 right-4 z-20 px-2 py-1"
                                            style={{ border: `1px solid ${taxonMood.accent}40`, background: "rgba(10,7,5,0.75)", backdropFilter: "blur(6px)" }}
                                        >
                                            <span className="text-[8px] font-black tracking-[0.35em] uppercase" style={{ color: taxonMood.accent }}>
                                                {taxonMood.label}
                                            </span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>


                            {/* NOM + INFO */}
                            <div className="relative z-30 px-7 pt-3 pb-0">
                                <motion.div
                                    className="mb-1"
                                    animate={glitchActive ? { x: [0, -3, 2, 0], skewX: [0, -2, 1, 0] } : {}}
                                    transition={{ duration: 0.12 }}
                                >
                                    <h2
                                        className="font-black uppercase leading-none ink-smear"
                                        data-text={data?.commonName || "Réception..."}
                                        style={{
                                            fontSize: "clamp(2rem, 7vw, 3.2rem)",
                                            color: "#f5f0e8",
                                            letterSpacing: "-0.02em",
                                            textShadow: `0 0 40px ${taxonMood.accent}60`,
                                        }}
                                    >
                                        <ScrambleText text={data?.commonName || "Réception..."} active={isValidating} />
                                    </h2>
                                </motion.div>

                                <p className="text-xs italic font-light tracking-widest mt-1"
                                    style={{ color: "rgba(255,255,255,0.28)" }}>
                                    {data?.scientificName || "—"}
                                </p>

                                {/* Divider */}
                                <div className="mt-3 flex items-center gap-3">
                                    <div className="h-[1px] flex-1" style={{ background: `linear-gradient(to right, ${taxonMood.accent}60, transparent)` }} />
                                    <motion.span
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{ duration: 3, repeat: Infinity }}
                                        className="text-xs"
                                        style={{ color: taxonMood.accent }}
                                    >✦</motion.span>
                                    <div className="h-[1px] flex-1" style={{ background: "rgba(255,255,255,0.05)" }} />
                                </div>
                            </div>

                            {/* FOOTER CONTROLS */}
                            <footer className="relative z-30 px-7 py-5 mt-auto">
                                <div className="flex items-start justify-between gap-4 mb-5">
                                    {/* Origin */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[8px] tracking-[0.5em] uppercase mb-1.5 font-bold"
                                            style={{ color: "rgba(255,255,255,0.2)" }}>
                                            ◌ origine
                                        </div>
                                        <p className="text-xs font-light truncate" style={{ color: "rgba(255,255,255,0.6)" }}>
                                            {data?.placeGuess || "— inconnu —"}
                                        </p>
                                    </div>

                                    <a href={data?.inatUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-3 py-2"
                                        style={{
                                            border: `1px solid ${taxonMood.accent}30`,
                                            borderRadius: 8,
                                            background: "rgba(255,255,255,0.02)",
                                            textDecoration: "none",
                                        }}
                                    >
                                        <div className="flex gap-[3px] items-end h-8">
                                            {[0.4, 0.9, 0.5, 1, 0.6, 0.8, 0.3, 0.7, 0.5, 0.9].map((h, i) => (
                                                <motion.div
                                                    key={i}
                                                    animate={{
                                                        height: isValidating ? ["15%", "95%", "15%"] : [`${h * 100}%`, `${h * 30}%`, `${h * 100}%`]
                                                    }}
                                                    transition={{ repeat: Infinity, duration: isValidating ? 0.35 : 2.5, delay: i * 0.08, ease: "easeInOut" }}
                                                    className="w-[2px] rounded-full"
                                                    style={{ background: i % 2 === 0 ? taxonMood.accent : "rgba(255,255,255,0.15)" }}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-[9px] font-black tracking-[0.4em] uppercase flicker"
                                            style={{ color: taxonMood.accent }}>
                                            archives
                                        </span>
                                    </a>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-3">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97, skewX: -1 }}
                                        disabled={isValidating}
                                        onClick={handleRandomPing}
                                        className="flex-1 py-3.5 text-[10px] font-black tracking-[0.4em] uppercase disabled:opacity-30 transition-all relative overflow-hidden group"
                                        style={{
                                            border: `1px solid ${taxonMood.accent}50`,
                                            background: `${taxonMood.glow}`,
                                            color: taxonMood.accent,
                                        }}
                                    >
                                        <motion.div
                                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ background: `linear-gradient(135deg, ${taxonMood.accent}15, transparent)` }}
                                        />
                                        <span className="relative z-10">
                                            {isValidating ? "⟳ scan..." : "⟳ Explorer"}
                                        </span>
                                    </motion.button>

                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97, skewX: 1 }}
                                        onClick={handleDailySync}
                                        className="flex-1 py-3.5 text-[10px] font-black tracking-[0.4em] uppercase relative overflow-hidden group"
                                        style={{
                                            background: taxonMood.accent,
                                            color: "#0a0705",
                                            border: "none",
                                        }}
                                    >
                                        <motion.div
                                            className="absolute inset-0"
                                            animate={{ x: ["-100%", "200%"] }}
                                            transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
                                            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)", width: "40%" }}
                                        />
                                        <span className="relative z-10">Specimen du jour</span>
                                    </motion.button>
                                </div>
                            </footer>
                        </motion.aside>
                        <AnimatePresence>
                            {zoomed && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setZoomed(false)}
                                    className="fixed inset-0 z-60 flex items-center justify-center"
                                    style={{ background: "rgba(5,3,2,0.92)", backdropFilter: "blur(8px)", cursor: "zoom-out" }}
                                >
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.9, opacity: 0 }}
                                        transition={{ type: "spring", damping: 24, stiffness: 200 }}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ position: "relative", width: "80vw", height: "80vh", borderRadius: 16, overflow: "hidden" }}
                                    >
                                        <Image src={photos[index]} alt="spécimen" fill className="object-contain" priority />

                                        {photos.length > 1 && (
                                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center">
                                                <div className="flex justify-between w-full px-8">
                                                    <motion.button whileTap={{ scale: 0.9 }}
                                                        onClick={() => setIndex((index - 1 + photos.length) % photos.length)}
                                                        className="h-14 w-14 flex items-center justify-center"
                                                        style={{ background: "rgba(10,7,5,0.8)", border: `1px solid ${taxonMood.accent}60`, backdropFilter: "blur(8px)", borderRadius: 12 }}
                                                    >
                                                        <ChevronLeft size={28} color={taxonMood.accent} />
                                                    </motion.button>
                                                    <motion.button whileTap={{ scale: 0.9 }}
                                                        onClick={() => setIndex((index + 1) % photos.length)}
                                                        className="h-14 w-14 flex items-center justify-center"
                                                        style={{ background: "rgba(10,7,5,0.8)", border: `1px solid ${taxonMood.accent}60`, backdropFilter: "blur(8px)", borderRadius: 12 }}
                                                    >
                                                        <ChevronRight size={28} color={taxonMood.accent} />
                                                    </motion.button>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}