"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { initiateResolution } from "@/app/actions/resolve-bet";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ActiveBetsOverlay() {
    const { data: session } = useSession();
    const [resolvingBet, setResolvingBet] = useState<string | null>(null);

    // SWR gère tout : le cache, le polling, et la pause si l'onglet est caché
    const { data: activeBets, mutate } = useSWR(
        session?.user?.id ? `/api/bets/active?userId=${session.user.id}` : null,
        fetcher,
        {
            refreshInterval: 15000, // On check toutes les 15s (économise ton Vercel)
            revalidateOnFocus: true, // Re-check dès que tu reviens sur l'onglet
            dedupingInterval: 5000,  // Évite les requêtes doublons
        }
    );

    const handleResolve = async (bet: any, choice: "SELF" | "OPPONENT") => {
        const winnerId = choice === "SELF" ? session?.user?.id : (bet.senderId === session?.user?.id ? bet.receiverId : bet.senderId);

        try {
            await initiateResolution(bet, winnerId!, session?.user?.id!);
            setResolvingBet(null);
            // "mutate" force SWR à rafraîchir les données immédiatement après l'action
            mutate();
        } catch (error) {
            console.error("Erreur de résolution:", error);
        }
    };

    if (!activeBets || activeBets.length === 0) return null;

    return (
        <div className="fixed bottom-6 left-6 z-[200] flex flex-col gap-4 pointer-events-none">
            <AnimatePresence>
                {activeBets.map((bet: any) => (
                    <motion.div
                        key={bet.id}
                        initial={{ x: -100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -100, opacity: 0 }}
                        className="pointer-events-auto bg-[#050505] border-l-4 border-main-yellow p-4 rounded-r-lg shadow-[10px_10px_30px_rgba(0,0,0,0.5)] border min-w-[280px]"
                    >
                        {/* --- ACTUAL BET CONTENT --- */}
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] text-main-yellow font-black uppercase tracking-tighter">
                                Pari Actif
                            </span>
                            <span className="text-[10px] text-white/30 font-mono">
                                #{bet.id.slice(-4)}
                            </span>
                        </div>

                        <h3 className="text-white font-black text-lg leading-tight uppercase truncate">
                            {bet.title || "OPERATIONAL_BET"}
                        </h3>

                        <div className="flex items-center gap-3 mt-2 py-2 border-y border-white/5">
                            <div className="flex flex-col">
                                <span className="text-[8px] text-white/40 uppercase font-bold">Stake</span>
                                <span className="text-sm font-black text-white">
                                    {bet.amount} <span className="text-main-yellow text-[10px]">CR</span>
                                </span>
                            </div>

                            <div className="h-6 w-[1px] bg-white/10" />

                            <div className="flex flex-col">
                                <span className="text-[8px] text-white/40 uppercase font-bold">Adversaire</span>
                                <span className="text-sm font-black text-red-500 uppercase truncate max-w-[120px]">
                                    {bet.senderId === session?.user?.id ? bet.receiverName : bet.senderName}
                                </span>
                            </div>
                        </div>
                        {/* --- END CONTENT --- */}

                        <div className="mt-4">
                            {resolvingBet === bet.id ? (
                                <div className="flex flex-col gap-2">
                                    <p className="text-[12px] text-main-yellow text-center font-mono font-black animate-pulse tracking-[0.2em]">
                                        QUI GAGNE ?
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleResolve(bet, "SELF")}
                                            className="flex-1 bg-main-green hover:bg-green-400 text-black text-[9px] font-black py-2 rounded uppercase transition-colors"
                                        >
                                            Moi
                                        </button>
                                        <button
                                            onClick={() => handleResolve(bet, "OPPONENT")}
                                            className="flex-1 bg-red-600 hover:bg-red-500 text-white text-[9px] font-black py-2 rounded uppercase transition-colors"
                                        >
                                            L'autre
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setResolvingBet(null)}
                                        className="text-[8px] text-white/20 hover:text-white/50 uppercase font-bold mt-1"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setResolvingBet(bet.id)}
                                    className="w-full bg-white/5 border border-white/10 text-white text-[9px] font-black py-2 rounded uppercase hover:bg-main-yellow hover:text-black transition-all group flex items-center justify-center gap-2"
                                >
                                    <span className="w-1.5 h-1.5 bg-main-yellow rounded-full animate-ping group-hover:bg-black" />
                                    Terminer le pari
                                </button>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}