"use client";

import { useSession, signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import BettingInterface from "@/components/betting/BettingInterface"; 
export default function BettingPage() {
    const { data: session, status } = useSession();

    return (
        <AnimatePresence mode="wait">
            {status === "loading" && (
                <motion.div
                    key="loader"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-dvh bg-[#0a0a0a] flex items-center justify-center"
                >
                    <h1 className="text-main-green font-(family-name:--font-squidwod) text-5xl animate-pulse">
                        INITIALIZING SYSTEM
                    </h1>
                </motion.div>
            )}

            {status === "unauthenticated" && (
                <motion.div
                    key="login"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="h-dvh bg-[#0a0a0a] flex items-center justify-center p-12"
                >
                    <div className="md:w-100 flex flex-col items-center"> {/* Container for the box */}
                        <div title="ACCESS_RESTRICTED" className="w-full text-center">
                            <div className="flex flex-col items-center py-10 gap-12">

                                {/* FIX: added whitespace-nowrap and adjusted tracking */}
                                <p className="text-main-green tracking-wide text-9xl font-black font-(family-name:--font-squidwod) animate-pulse whitespace-nowrap ">
                                    connexion requise
                                </p>

                                <button
                                    onClick={() => signIn("discord")}
                                    className="px-8 py-4 bg-discord-blurple hover:bg-[#4752C4] rounded-lg font-black transition-all flex flex-row items-center gap-3 shadow-[0_0_20px_rgba(88,101,242,0.4)]"
                                >
                                    {/* The SVG and text are now side-by-side */}
                                    <svg width="24" height="24" viewBox="0 0 127.14 96.36" fill="currentColor">
                                        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.06,72.06,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14h0C130.46,50.45,121.78,26.71,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                                    </svg>
                                    <span className="mt-0.5">Connexion</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {status === "authenticated" && (
                <motion.div
                    key="interface"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    className="h-full w-full"
                >
                    <BettingInterface session={session} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}