"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2 } from "lucide-react";
import type { MtgGame, MtgPlayer, MtgStanding } from "@/lib/mtg";
import { MTG_POINTS } from "@/lib/mtg";

type MtgData = {
    players: MtgPlayer[];
    games: MtgGame[];
    standings: MtgStanding[];
    canEdit: boolean;
};

const SECRET = "mtg";
const POSITION_LABELS = ["1er", "2e", "3e", "4e"];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Local date as YYYY-MM-DD
const todayLocal = () => new Date().toLocaleDateString("sv-SE");

function Avatar({ player, size = 32 }: { player?: MtgPlayer; size?: number }) {
    return (
        <div
            className="relative rounded-full overflow-hidden border border-white/10 shrink-0"
            style={{ width: size, height: size }}
        >
            {player?.image ? (
                <Image src={player.image} alt={player.name} fill className="object-cover" sizes={`${size}px`} />
            ) : (
                <div className="w-full h-full bg-main-green/20 flex items-center justify-center text-xs">?</div>
            )}
        </div>
    );
}

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

function MtgPanel({ onClose }: { onClose: () => void }) {
    const { data, mutate, isLoading } = useSWR<MtgData>("/api/mtg", fetcher);

    const [placements, setPlacements] = useState<string[]>([]);
    const [playedAt, setPlayedAt] = useState(todayLocal);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const playersById = new Map((data?.players ?? []).map((p) => [p.id, p]));

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
            await mutate();
        } catch {
            setError("Impossible d'enregistrer la partie.");
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
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", damping: 26, stiffness: 260 }}
                className="fixed z-[90] inset-x-4 top-[8vh] mx-auto max-w-2xl max-h-[84vh] overflow-y-auto bg-discord-black border border-white/10 rounded-3xl shadow-2xl text-white p-6"
            >
                {/* Header */}
                <div className="flex justify-between items-end mb-4 border-b border-white/10 pb-2">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-main-yellow">
                        Commander
                    </h3>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {isLoading || !data ? (
                    <div className="h-40 flex items-center justify-center opacity-40 text-sm italic">Chargement...</div>
                ) : data.players.length === 0 ? (
                    <div className="h-40 flex items-center justify-center opacity-40 text-sm italic">
                        Aucun joueur configuré (MTG_PLAYER_IDS).
                    </div>
                ) : (
                    <>
                        {/* Standings */}
                        <div className="flex flex-col gap-3 mb-8">
                            {data.standings.map((player, index) => (
                                <div
                                    key={player.id}
                                    className="flex justify-between items-center bg-white/5 p-2 rounded-xl border border-white/5"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`
                                            w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold shadow-lg shrink-0
                                            ${index === 0 ? "bg-yellow-400 text-black" :
                                                index === 1 ? "bg-gray-300 text-black" :
                                                    index === 2 ? "bg-orange-600 text-white" : "bg-discord-black text-white border border-white/20"}
                                        `}>
                                            {index + 1}
                                        </div>
                                        <Avatar player={player} />
                                        <span className="text-sm font-bold truncate">{player.name}</span>
                                    </div>

                                    <div className="flex items-center gap-5 text-right">
                                        <div className="hidden sm:block">
                                            <span className="block font-mono text-sm text-white/70">
                                                {player.wins} / {player.played}
                                            </span>
                                            <span className="text-[10px] uppercase text-white/30 font-bold tracking-wider">
                                                {player.played > 0 ? `${Math.round((player.wins / player.played) * 100)}% win` : "Victoires"}
                                            </span>
                                        </div>
                                        <div className="w-14">
                                            <span className="block font-mono font-black text-main-green text-sm">{player.points}</span>
                                            <span className="text-[10px] uppercase text-white/30 font-bold tracking-wider">Points</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* New game form */}
                        {data.canEdit && (
                            <div className="mb-8 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-sm font-black uppercase tracking-widest text-main-yellow">Nouvelle partie</h4>
                                    <input
                                        type="date"
                                        value={playedAt}
                                        onChange={(e) => setPlayedAt(e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-main-yellow"
                                    />
                                </div>

                                <p className="text-xs text-white/40 mb-3">
                                    Clique les joueurs dans l&apos;ordre d&apos;arrivée, le gagnant en premier ({MTG_POINTS.slice(0, 3).join(" / ")} pts).
                                </p>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {data.players.map((player) => {
                                        const position = placements.indexOf(player.id);
                                        const selected = position !== -1;
                                        return (
                                            <button
                                                key={player.id}
                                                onClick={() => togglePlacement(player.id)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${selected
                                                    ? "bg-main-green border-main-yellow"
                                                    : "border-main-yellow/20 hover:border-main-yellow/50"
                                                    }`}
                                            >
                                                {selected && (
                                                    <span className="text-[10px] font-black text-main-yellow bg-black/40 rounded px-1">
                                                        {POSITION_LABELS[position]}
                                                    </span>
                                                )}
                                                <Avatar player={player} size={24} />
                                                <span className="text-sm">{player.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

                                <button
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    className="w-full py-2.5 bg-main-green rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-30"
                                >
                                    {saving ? "Enregistrement..." : "Enregistrer la partie"}
                                </button>
                            </div>
                        )}

                        {/* History */}
                        <h4 className="text-sm font-black uppercase tracking-widest text-white/40 mb-3">Historique</h4>
                        {data.games.length === 0 ? (
                            <div className="py-6 text-center opacity-40 text-sm italic">Aucune partie pour l&apos;instant.</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {data.games.map((game) => (
                                    <div
                                        key={game.id}
                                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/5 border border-white/5"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-[10px] font-mono text-white/30 shrink-0">
                                                {new Date(`${game.playedAt}T00:00:00`).toLocaleDateString("fr-FR")}
                                            </span>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {game.placements.map((playerId, position) => (
                                                    <span
                                                        key={playerId}
                                                        className={`text-xs ${position === 0 ? "text-main-yellow font-black" : "text-white/60"}`}
                                                    >
                                                        {POSITION_LABELS[position]} {playersById.get(playerId)?.name ?? "?"}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        {data.canEdit && (
                                            <button
                                                onClick={() => handleDelete(game.id)}
                                                className="text-white/20 hover:text-red-400 transition-colors shrink-0"
                                                title="Supprimer"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </motion.div>
        </>
    );
}
