"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Waves, Compass, Locate, Target, ChevronLeft, ChevronRight, Home, Loader2 } from 'lucide-react';

type Animal = {
    scientificName: string;
    commonName: string | null;
    iconicTaxon: string;
    placeGuess: string;
    photos: string[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function FractalSonarDisplay() {
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);

    // This is our "Frequency". Changing this forces SWR to fetch.
    const [sonarKey, setSonarKey] = useState("/api/animal");

    // SWR now watches sonarKey. When sonarKey changes, isValidating becomes true.
    const { data, isValidating } = useSWR<Animal>(sonarKey, fetcher, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false
    });

    const photos = data?.photos ?? [];

    // Triggered by the Big Button
    const handleDailySync = () => {
        setIndex(0);
        setSonarKey(`/api/animal?sync=${Date.now()}`); // Force new Daily fetch
        setOpen(true);
    };

    // Triggered by the Footer Button
    const handleRandomPing = () => {
        setIndex(0);
        setSonarKey(`/api/animal?random=true&ping=${Date.now()}`); // Force new Random fetch
    };

    const telemetry = useMemo(() => {
        const taxon = data?.iconicTaxon?.toLowerCase() || "";
        if (["mollusca", "actinopterygii", "amphibia"].some(t => taxon.includes(t)))
            return { label: "BENTHIC_SIGNAL", color: "text-blue-400", bg: "bg-blue-500/20" };
        return { label: "SURFACE_SIGNAL", color: "text-emerald-400", bg: "bg-emerald-500/20" };
    }, [data]);

    return (
        <>
            <style>{`
                .fractal-grid {
                    background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0);
                    background-size: 24px 24px;
                }
                .bubble-glow {
                    background: radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%);
                }
                .glass-card {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
            `}</style>

            {/* ONGLET VERTICAL / ANIMAL DU JOUR */}
            <AnimatePresence>
                {!open && (
                    <motion.button
                        initial={{ x: 80, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 80, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        whileHover={{ x: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleDailySync}
                        className="fixed z-[70] right-0 top-1/2 -translate-y-1/2 
            h-48 w-12 
            bg-slate-900 border border-sky-400/40 backdrop-blur-xl
            shadow-[-10px_0_40px_rgba(56,189,248,0.2)]
            flex items-center justify-center"
                    >
                        <div className="absolute inset-0 border border-sky-400/20" />

                        {isValidating ? (
                            <Loader2 className="text-sky-400 animate-spin" size={18} />
                        ) : (
                            <span className="text-[10px] tracking-[0.3em] text-sky-400 font-bold uppercase rotate-90 whitespace-nowrap">
                                Animal du jour
                            </span>
                        )}
                    </motion.button>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {open && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setOpen(false)}
                            className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-md"
                        />

                        <motion.aside
                            initial={{ x: "100%", skewX: 2 }}
                            animate={{ x: 0, skewX: 0 }}
                            exit={{ x: "100%", skewX: -2 }}
                            transition={{ type: "spring", damping: 28, stiffness: 200 }}
                            className="fixed right-0 top-0 z-50 h-full w-[95vw] md:w-100 bg-[#010414] flex flex-col border-l border-white/10 overflow-hidden shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
                        >
                            <div className="absolute inset-0 fractal-grid pointer-events-none opacity-30" />
                            <div className="absolute -top-[10%] -right-[10%] w-[70%] h-[50%] bubble-glow rounded-full blur-3xl pointer-events-none opacity-50" />

                            {/* Viewport */}
                            <div className="relative flex-1 m-5 rounded-[2rem] overflow-hidden group border border-white/5 bg-slate-900/40">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={sonarKey + index}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.4 }}
                                        className="h-full w-full"
                                    >
                                        {photos[index] ? (
                                            <Image src={photos[index]} alt="subject" fill className="object-cover" priority />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center bg-slate-950">
                                                <Loader2 className="text-sky-500/20 animate-spin" size={48} />
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>

                                <div className="absolute inset-x-4 bottom-6 z-30 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setIndex((index - 1 + photos.length) % photos.length)} className="h-12 w-12 rounded-full glass-card flex items-center justify-center text-white">
                                        <ChevronLeft size={20} />
                                    </button>
                                    <button onClick={() => setIndex((index + 1) % photos.length)} className="h-12 w-12 rounded-full glass-card flex items-center justify-center text-white">
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Signal Info */}
                            <div className="px-8 z-30">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className={`text-[10px] font-black tracking-[0.3em] ${telemetry.color}`}>
                                        {isValidating ? "SYNCING..." : telemetry.label}
                                    </span>
                                    <div className="h-[1px] flex-1 bg-white/5" />
                                </div>
                                <motion.h2
                                    key={data?.commonName}
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="text-5xl font-extralight text-white tracking-tighter leading-tight mb-2"
                                >
                                    {data?.commonName || "Receiving..."}
                                </motion.h2>
                                <p className="text-xs font-medium text-sky-400/40 uppercase tracking-widest">{data?.scientificName}</p>
                            </div>

                            {/* Control Footer */}
                            <footer className="p-8 grid grid-cols-2 gap-8 relative z-30 mt-auto">
                                <div className="space-y-5">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 text-white/20 text-[9px] uppercase tracking-widest"><Locate size={10} /> Origin</div>
                                        <p className="text-[11px] text-white/70 font-light truncate">{data?.placeGuess || "---"}</p>
                                    </div>

                                    <button
                                        disabled={isValidating}
                                        onClick={handleRandomPing}
                                        className="w-full py-3.5 rounded-full border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-sky-400/30 transition-all disabled:opacity-30 group"
                                    >
                                        <span className="flex items-center justify-center gap-2 text-[10px] font-bold text-sky-100 tracking-[0.2em] uppercase">
                                            <Compass size={14} className={isValidating ? 'animate-spin' : 'group-hover:rotate-45 transition-transform'} />
                                            New Ping
                                        </span>
                                    </button>
                                </div>

                                <div className="flex flex-col justify-between items-end">
                                    <div className="glass-card rounded-[1.5rem] p-4 w-full flex flex-col items-center gap-3">
                                        <Target size={14} className="text-sky-500/50" />
                                        <div className="flex gap-1.5 items-end h-8">
                                            {[0.5, 0.8, 0.3, 0.9, 0.6].map((h, i) => (
                                                <motion.div
                                                    key={i}
                                                    animate={{ height: isValidating ? ["20%", "100%", "20%"] : [`${h * 100}%`, `${h * 40}%`, `${h * 100}%`] }}
                                                    transition={{ repeat: Infinity, duration: isValidating ? 0.4 : 2, delay: i * 0.1 }}
                                                    className="w-1 bg-sky-400/30 rounded-full"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => setOpen(false)} className="text-[9px] text-white/20 hover:text-red-400 transition-colors uppercase tracking-[0.5em] pt-4">
                                        [ Disconnect ]
                                    </button>
                                </div>
                            </footer>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}