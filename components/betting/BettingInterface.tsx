    "use client";

    import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
    import { motion, AnimatePresence } from "framer-motion";
    import { signIn } from "next-auth/react";
    import { createBet } from "@/app/actions/bet";
    import { useCredits } from "@/app/providers/CreditsProvider";
    import Jack from "./Jack";
    import Spinner from "./Spinner";

    // Types
    interface Point {
        x: number;
        y: number;
    }

    interface Connection {
        from: string;
        to: string;
        id: string;
    }

    interface Player {
        id: string;
        name: string;
        image?: string;
    }

    interface ActiveCable {
        from: string;
        startPos: Point;
    }

    function Module({ title, children }: { title: string; children: React.ReactNode }) {
        return (
            <div className="border-2 border-white/10 rounded-lg bg-black/40 backdrop-blur-sm p-3 shadow-lg hover:border-white/20 transition-colors ">
                <div className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-3 border-b border-white/5 pb-2">
                    {title}
                </div>
                {children}
            </div>
        );
    }

    export default function BettingInterface({ session }: { session: any }) {
        // State
        const [connections, setConnections] = useState<Connection[]>([]);
        const [activeCable, setActiveCable] = useState<ActiveCable | null>(null);
        const [portPositions, setPortPositions] = useState<Record<string, Point>>({});
        const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
        const [betAmount, setBetAmount] = useState(100);
        const [betTitle, setBetTitle] = useState("NOUVEAU PARI");
        const [isSubmitted, setIsSubmitted] = useState(false);
        const [players, setPlayers] = useState<Player[]>([]);
        const [status, setStatus] = useState("loading");
        const [showConfirmation, setShowConfirmation] = useState(false);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isSuccess, setIsSuccess] = useState(false);
        const {credits} = useCredits(); 

        const containerRef = useRef<HTMLDivElement>(null);

        // Load players
        useEffect(() => {
            const fetchPlayers = async () => {
                try {
                    const res = await fetch("/api/users");
                    const data = await res.json();
                    setPlayers(data);
                    setStatus("authenticated");
                } catch (error) {
                    console.error("Failed to fetch players:", error);
                    setStatus(session ? "authenticated" : "unauthenticated");
                }
            };

            if (session) {
                fetchPlayers();
            } else {
                setStatus("unauthenticated");
            }
        }, [session]);
        // 1. Storage for elements
        const portsRef = useRef<Record<string, HTMLDivElement | null>>({});

        // 2. Collection
        const collectPort = (id: string, el: HTMLDivElement | null) => {
            portsRef.current[id] = el;
        };

        // 3. Updated measurement including Scroll
        const updatePortPositions = () => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const scrollY = containerRef.current.scrollTop; // Track vertical scroll
            const newPositions: Record<string, Point> = {};

            Object.entries(portsRef.current).forEach(([id, el]) => {
                if (el) {
                    const rect = el.getBoundingClientRect();
                    newPositions[id] = {
                        x: rect.left - containerRect.left + rect.width / 2,
                        y: rect.top - containerRect.top + rect.height / 2 + scrollY,
                    };
                }
            });
            setPortPositions(newPositions);
        };

        // 4. Trigger update on Resize AND Scroll
        useLayoutEffect(() => {
            const update = () => requestAnimationFrame(updatePortPositions);
            const timer = setTimeout(update, 100);

            window.addEventListener("resize", update);
            const mainEl = containerRef.current;
            if (mainEl) mainEl.addEventListener("scroll", update);

            return () => {
                clearTimeout(timer);
                window.removeEventListener("resize", update);
                if (mainEl) mainEl.removeEventListener("scroll", update);
            };
        }, [players, status, connections]);



        // Logic functions
        const isPathComplete = () => {
            const hasSource = connections.some(c => c.from === "source-out" && c.to === "trans-in-a");
            const hasOpponent = connections.some(c =>
                players.some(p => p.id === c.from) && c.to === "trans-in-b"
            );
            const hasEncoderIn = connections.some(c => c.from === "trans-out" && c.to === "label-in");
            const hasFinalChain = connections.some(c => c.from === "label-out" && c.to === "exec-in");
            return hasSource && hasOpponent && hasEncoderIn && hasFinalChain;
        };

        const isWireLive = (from: string, to: string) => {
            if (!isPathComplete()) return false;
            // Connected player to calculator
            const isSourcePath = from === "source-out" && to === "trans-in-a";
            // Opponent to calculator
            const isOpponentPath = players.some(p => p.id === from) && to === "trans-in-b";
            // Calculator to labeler
            const isTransformerPath = from === "trans-out" && to === "label-in";
            // Labeler to encoder
            const isEncoderPath = from === "label-out" && to === "exec-in";

            return isSourcePath || isOpponentPath || isTransformerPath || isEncoderPath;
        };

        const getConnectedPlayer = () => {
            const conn = connections.find(c => c.to === "trans-in-b");
            if (!conn) return "UNKNOWN";
            const player = players.find(p => p.id === conn.from);
            return player ? player.name.toUpperCase() : "UNKNOWN";
        };

        const statusMessage = isPathComplete()
            ? `Bet from ${session?.user?.name || "YOU"} to ${getConnectedPlayer()} for ${betAmount} CR as "${betTitle}"`
            : "Circuit Incomplete";

        // 4. INTERACTION HANDLERS
        const handleJackClick = (id: string) => {
            if (isPathComplete()) return;

            // Check if the clicked ID belongs to a player
            const isPlayerPort = players.some(p => p.id === id);

            if (!activeCable) {
                // 1. If it's a player port, remove ANY existing player-to-transformer connection
                if (isPlayerPort) {
                    setConnections(prev => prev.filter(c => !players.some(p => p.id === c.from)));
                } else {
                    // 2. For non-player ports, just remove the wire from this specific jack
                    setConnections(prev => prev.filter(c => c.from !== id));
                }

                if (portPositions[id]) {
                    setActiveCable({ from: id, startPos: portPositions[id] });
                }
            } else {
                if (activeCable.from !== id) {
                    const isActiveSourceAPlayer = players.some(p => p.id === activeCable.from);

                    setConnections((prev) => {
                        let filtered = prev;

                        if (isActiveSourceAPlayer) {
                            // If moving a player wire, clear all other player wires first
                            filtered = filtered.filter(c => !players.some(p => p.id === c.from));
                        } else {
                            // Otherwise, just clear the specific "from" and "to" jacks
                            filtered = filtered.filter(c => c.to !== id && c.from !== activeCable.from);
                        }

                        return [
                            ...filtered,
                            { from: activeCable.from, to: id, id: Math.random().toString() }
                        ];
                    });
                }
                setActiveCable(null);
            }
        };

        const deleteConnection = (e: React.MouseEvent, id: string) => {
            e.preventDefault();
            setConnections((prev) => prev.filter(c => c.id !== id));
        };

        const handleLeverRelease = (e: any, info: any) => {
            // Si le levier est tiré vers le bas et le circuit est complet
            if (isPathComplete() && info.point.y > 60) {
                setShowConfirmation(true);
            }
        };

        const drawCable = (start: Point, end: Point) => {
            if (!start || !end) return "";

            // The vertical distance between the two points
            const deltaY = Math.abs(start.y - end.y);
            // The horizontal distance
            const deltaX = Math.abs(start.x - end.x);

            // Calculate a dynamic "sag" or tension
            // If points are close, sag is small. If far, sag increases.
            const sag = Math.min(deltaY, 100) + (deltaX * 0.2);

            // Control Point 1: Slightly below the start point
            const cp1x = start.x;
            const cp1y = start.y + sag;

            // Control Point 2: Slightly below the end point
            const cp2x = end.x;
            const cp2y = end.y + sag;

            return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;
        };


        return (
            <main
                ref={containerRef}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (activeCable) setActiveCable(null);
                }}
                onMouseMove={(e) => {
                    if (!containerRef.current) return;
                    const rect = containerRef.current.getBoundingClientRect();
                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                className="min-h-dvh h-screen bg-[#0a0a0a] text-white overflow-hidden relative font-mono p-4 md:p-8 select-none flex items-start justify-center"
            >
                {/*BACKGROUND TEXT */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
                    <h1 className={`text-[30vw] font-(family-name:--font-squidwod) font-black tracking-tighter transition-colors duration-700 opacity-10 select-none ${isPathComplete() ? 'text-main-yellow drop-shadow-[0_0_15px_rgba(254,200,12,0.6)]' : 'text-main-green'}`}>
                        GAMBLING
                    </h1>
                </div>



                <div className="flex flex-col xl:grid xl:grid-cols-4 gap-4 xl:gap-8 w-full max-w-375 z-20 relative py-6 items-start">

                    {/* LEFT: POWER SOURCE */}
                    <div className="flex justify-center">
                        <Module title="SOURCE UNIT">
                            <div className="flex flex-col items-center py-6 gap-8">
                                <div className="relative">
                                    <div className="w-24 h-24 rounded-full border-4 border-main-green/20 overflow-hidden shadow-[0_0_20px_rgba(34,197,94,0.1)] bg-black/40 flex items-center justify-center">
                                        {session?.user?.image ? (
                                            <img
                                                src={session.user.image}
                                                alt="Avatar"
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-discord-blurple/20 animate-pulse">
                                                <span className="text-main-green text-[8px] font-black">SCAN...</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`absolute bottom-0 right-1 w-6 h-6 border-4 border-[#121212] rounded-full shadow-sm ${session ? 'bg-[#23a559]' : 'bg-gray-600'}`} />
                                </div>

                                <Jack id="source-out" onRegistered={collectPort} onClick={handleJackClick} active={activeCable?.from === "source-out"} />

                                <div className="text-center">
                                    <p className="text-xs text-main-green font-bold tracking-tighter italic truncate max-w-30">
                                        {session?.user?.name || "GUEST_USER"}
                                    </p>
                                    <p className="text-sm text-white font-black">{credits?.toLocaleString() || "0"} CR</p>
                                </div>
                            </div>
                        </Module>
                    </div>

                    {/* CENTER: LOGIC MODULES */}
                    <div className="col-span-2 space-y-16">
                        <div className="grid grid-cols-2 gap-6">
                            <Module title="BET SELECTOR">
                                <div className="flex flex-col items-center py-2 gap-6">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-[8px] font-black text-main-yellow tracking-widest">SUM_OUT</span>
                                        <Jack id="trans-out" onRegistered={collectPort} onClick={handleJackClick} active={activeCable?.from === "trans-out"} activeColor="#F2C80C" />
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setBetAmount(p => Math.max(0, p - 100))}
                                            className="w-12 h-12 rounded-full bg-discord-black border-2 border-white/5 hover:border-main-yellow hover:text-main-yellow transition-all font-black text-2xl flex items-center justify-center shadow-lg"
                                        >-</button>

                                        <div className="bg-black text-main-yellow text-4xl px-4 py-2 rounded-lg border-2 border-main-yellow/20 font-black shadow-[inset_0_0_15px_rgba(254,200,12,0.1)] min-w-30 text-center">
                                            {betAmount}
                                        </div>

                                        <button
                                            onClick={() => setBetAmount(p => p + 100)}
                                            className="w-12 h-12 rounded-full bg-discord-black border-2 border-white/5 hover:border-main-yellow hover:text-main-yellow transition-all font-black text-2xl flex items-center justify-center shadow-lg"
                                        >+</button>
                                    </div>

                                    <div className="flex justify-around w-full px-4 border-t border-white/5 pt-4">
                                        <div className="flex flex-col items-center gap-1">
                                            <Jack id="trans-in-a" onRegistered={collectPort} onClick={handleJackClick} active={activeCable?.from === "trans-in-a"} />
                                            <span className="text-[8px] font-black text-white/30 uppercase">In_SELF</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <Jack id="trans-in-b" onRegistered={collectPort} onClick={handleJackClick} active={activeCable?.from === "trans-in-b"} />
                                            <span className="text-[8px] font-black text-white/30 uppercase">In_OPP</span>
                                        </div>
                                    </div>
                                </div>
                            </Module>

                            <Module title="TITLE ENCODER">
                                <div className="flex flex-col items-center justify-center h-full gap-6 px-4">
                                    <input
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-black tracking-widest uppercase text-blue-300 focus:outline-none focus:border-blue-500 transition-colors text-center"
                                        placeholder="INPUT NAME..."
                                        value={betTitle}
                                        onChange={(e) => setBetTitle(e.target.value)}
                                    />
                                    <div className="flex gap-6 w-full justify-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[8px] font-black text-white/30 uppercase">Title_IN</span>
                                            <Jack id="label-in" onRegistered={collectPort} onClick={handleJackClick} active={activeCable?.from === "label-in"} />
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[8px] font-black text-white/30 uppercase">Title_OUT</span>
                                            <Jack id="label-out" onRegistered={collectPort} onClick={handleJackClick} active={activeCable?.from === "label-out"} />
                                        </div>
                                    </div>
                                </div>
                            </Module>
                        </div>

                        <Module title="DISTRIBUTION NODES (CONNECTED_USERS)">
                            <div className="grid grid-cols-5 gap-3 py-4 px-4">
                                {players
                                    .filter((p) => p.id !== session?.user?.id && p.name !== session?.user?.name)
                                    .map((player) => (
                                        <div key={player.id} className="flex flex-col items-center gap-2">
                                            {/* Avatar du joueur */}
                                            <div className="w-10 h-10 rounded-full border-2 border-white/5 overflow-hidden bg-black/40 shadow-lg">
                                                {player.image ? (
                                                    <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-main-green/10" />
                                                )}
                                            </div>

                                            <span className="text-[8px] opacity-40 font-bold truncate max-w-15 uppercase tracking-tighter text-center">
                                                {player.name}
                                            </span>

                                            <Jack
                                                id={player.id}
                                                onRegistered={collectPort}
                                                onClick={handleJackClick}
                                                active={activeCable?.from === player.id}
                                            />
                                        </div>
                                    ))}
                            </div>
                        </Module>
                    </div>

                    {/* RIGHT: EXECUTION */}
                    <div className="flex justify-center">
                        <Module title="FINAL BREAKER">
                            <div className="flex flex-col items-center py-8 gap-6">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-[8px] font-black text-white/30 uppercase">Confirm_IN</span>
                                    <Jack id="exec-in" onRegistered={collectPort} onClick={handleJackClick} active={activeCable?.from === "exec-in"} />
                                </div>
                                <div className="w-16 h-40 bg-black/60 rounded-xl p-2 border border-white/10 relative shadow-inner">
                                    <motion.div
                                        drag="y"
                                        dragSnapToOrigin
                                        dragConstraints={{ top: 0, bottom: 104 }}
                                        dragElastic={0}
                                        onDragEnd={handleLeverRelease}
                                        className={`w-full h-10 rounded-lg cursor-grab active:cursor-grabbing flex items-center justify-center transition-colors duration-300 ${isPathComplete() ? "bg-main-yellow shadow-[0_0_25px_#F2C80C]" : "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                                            }`}
                                    >
                                        <div className="w-1/2 h-1 bg-white/30 rounded" />
                                    </motion.div>
                                </div>

                                <div className="text-center px-2">
                                    <span className={`text-[10px] font-black uppercase transition-colors block leading-tight ${isPathComplete() ? "text-main-yellow animate-pulse" : "text-red-500"
                                        }`}>
                                        {statusMessage}
                                    </span>
                                    {isPathComplete() && (
                                        <span className="text-[8px] text-main-yellow/50 mt-3 block tracking-tighter">
                                            (Right-click any wire to edit circuit)
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Module>
                    </div>
                </div>

                {/* CABLE LAYER */}
                <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full">
                    <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {connections.map((conn) => {
                        const isLive = isWireLive(conn.from, conn.to);
                        return (
                            <motion.path
                                key={conn.id}
                                d={drawCable(portPositions[conn.from], portPositions[conn.to])}
                                className="pointer-events-auto cursor-pointer"
                                fill="none"
                                onContextMenu={(e) => deleteConnection(e, conn.id)}
                                // Only apply the expensive filter if the wire is live
                                filter={isLive ? "url(#glow)" : undefined}
                                stroke={isLive ? "#F2C80C" : "#22B04E"}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={isLive ? 6 : 4}
                                animate={{
                                    stroke: isLive ? "#F2C80C" : "#22B04E",
                                    strokeWidth: isLive ? 6 : 4,
                                }}
                                transition={{ duration: 0.3 }}
                            />
                        );
                    })}

                    {activeCable && (
                        <path
                            d={drawCable(activeCable.startPos, mousePos)}
                            stroke="#444"
                            strokeWidth="3"
                            strokeDasharray="10 5"
                            fill="none"
                            className="opacity-70"
                            strokeLinecap="round"
                        />
                    )}
                </svg>
                <AnimatePresence>
                    {showConfirmation && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-100 bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                className="md:w-100 border-2 border-main-yellow bg-[#050505] p-8 rounded-lg shadow-[0_0_50px_rgba(242,200,12,0.15)] text-center relative"
                            >
                                {/* Titre du Pari */}
                                <h2 className="text-main-yellow font-(family-name:--font-squidwod) text-6xl mb-6 tracking-widest uppercase">
                                    {betTitle || "DEMO_BET"}
                                </h2>

                                {/* Résumé du Duel */}
                                <div className="flex items-center justify-center gap-6 py-6 border-y border-white/5 mb-8">
                                    <div className="text-main-green font-black text-lg uppercase">
                                        {session?.user?.name || "YOU"}
                                    </div>
                                    <div className="text-white/20 text-xs font-black animate-pulse">VS</div>
                                    <div className="text-red-500 font-black text-lg uppercase">
                                        {getConnectedPlayer()}
                                    </div>
                                </div>

                                {/* Montant */}
                                <div className="text-5xl font-black text-white mb-10">
                                    {betAmount} <span className="text-main-yellow text-sm tracking-widest uppercase">cr</span>
                                </div>

                                {/* Boutons d'Action */}
                                {/* Boutons d'Action */}
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => {
                                            setShowConfirmation(false);
                                            setConnections([]); // Reset wires if declined
                                        }}
                                        className="flex-1 py-4 border border-white/10 hover:bg-white/5 transition-colors font-black text-[10px] uppercase tracking-[0.2em]"
                                    >
                                        ANNULER
                                    </button>

                                    {/* REPLACE THIS WHOLE CONFIRM BUTTON */}
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: isSubmitting ? 1 : 0.96 }}
                                        animate={
                                            isSuccess
                                                ? { scale: [1, 1.06, 1], boxShadow: "0 0 25px rgba(242,200,12,0.45)" } // success pop
                                                : { scale: 1 }
                                        }
                                        transition={{ duration: 0.25 }}
                                        disabled={isSubmitting || isSuccess}
                                        aria-busy={isSubmitting ? "true" : "false"}
                                        onClick={async () => {
                                            const conn = connections.find(c => c.to === "trans-in-b");
                                            if (!conn) return;

                                            setIsSubmitting(true);
                                            try {
                                                await createBet(conn.from, betAmount, betTitle);

                                                // Success flash & short hold so the user SEES it
                                                setIsSuccess(true);

                                                // Optional: also change the label-out cable color briefly (kept simple here)
                                                setTimeout(() => {
                                                    setIsSuccess(false);
                                                    setShowConfirmation(false);
                                                    setConnections([]);
                                                    setIsSubmitted(true);
                                                    setTimeout(() => setIsSubmitted(false), 1500);
                                                }, 1200);
                                            } catch (err) {
                                                console.error("Bet failed:", err);
                                                // Optional: show an error toast / border-red flash
                                            } finally {
                                                setIsSubmitting(false);
                                            }
                                        }}
                                        className={[
                                            "flex-1 py-4 rounded relative overflow-hidden",
                                            "font-black text-[10px] uppercase tracking-[0.2em]",
                                            "transition-colors",
                                            isSuccess
                                                ? "bg-green-400 text-black shadow-[0_0_24px_rgba(74,222,128,0.35)]"
                                                : "bg-main-yellow text-black hover:bg-yellow-400 shadow-[0_0_20px_rgba(242,200,12,0.3)]",
                                            (isSubmitting || isSuccess) ? "opacity-90 cursor-not-allowed" : ""
                                        ].join(" ")}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            {isSubmitting && <Spinner size={14} color="#111" />}
                                            <span>
                                                {isSuccess ? "ENVOYÉ" : isSubmitting ? "ENVOI EN COURS..." : "CONFIRMER"}
                                            </span>
                                        </div>

                                        {/* Subtle progress bar at the bottom during submit */}
                                        {isSubmitting && (
                                            <motion.div
                                                layoutId="confirmProgressBar"
                                                className="absolute left-0 bottom-0 h-0.5 bg-black/40"
                                                initial={{ width: "0%" }}
                                                animate={{ width: "100%" }}
                                                transition={{ duration: 0.9, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                                            />
                                        )}
                                    </motion.button>
                                </div>

                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        );
    }

