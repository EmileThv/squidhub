"use client";

import { Menu, Wallet, Gamepad2 } from 'lucide-react';
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";

import { useCredits } from "@/app/providers/CreditsProvider";


export default function Navbar() {
    const { data: session, status } = useSession();
    const { credits } = useCredits();
    return (
        <nav className="flex items-center justify-between px-4 md:px-6 py-4 bg-discord-black text-white border-b border-white/10">

            {/* GAUCHE : Logo PNG */}
            <a href="/" className="flex items-center min-w-fit md:w-100 cursor-pointer group">
                <div className="relative h-10 w-32 md:h-14 md:w-48 drop-shadow-[0_0_15px_rgba(34,176,78,0.4)] transition-transform group-hover:scale-105">
                    <Image
                        src="/images/logo_site.png"
                        alt="SquidHub Logo"
                        fill
                        className="object-contain object-left"
                        priority
                    />
                </div>
            </a>

            {/* CENTRE : Navigation */}
            <div className="flex items-center justify-center flex-1">
                <div className="flex items-center gap-6 md:gap-0">
                    <a href="/games" className="flex items-center text-main-yellow hover:text-main-green justify-center gap-2 transition font-bold text-lg md:w-30">
                        <Gamepad2 size={24} />
                        <span className="hidden md:inline">Jeux</span>
                    </a>
                    <a href="/bets" className="flex items-center justify-center gap-2 text-main-yellow hover:text-main-green transition font-bold text-lg md:w-30">
                        <Wallet size={24} />
                        <span className="hidden md:inline">Pari</span>
                    </a>
                    <button className="flex items-center justify-center gap-2 text-main-yellow hover:text-main-green transition font-bold text-lg md:w-30 cursor-pointer">
                        <Menu size={24} />
                        <span className="hidden md:inline">Profils</span>
                    </button>
                </div>
            </div>

            {/* DROITE : Login & Crédits */}
            <div className="flex justify-end items-center gap-3 min-w-fit md:w-100">
                {status === "loading" ? (
                    <div className="h-10 w-10 rounded-full bg-white/5 animate-pulse" />
                ) : session ? (
                    <div className="flex items-center gap-3 animate-in fade-in duration-300">
                        {/* Crédits KV */}
                        <div className="hidden sm:flex flex-col items-end border-r border-white/10 pr-3">
                            <span className="text-[10px] font-bold text-main-yellow uppercase tracking-widest opacity-70">Solde</span>
                            <span className="text-main-green font-mono font-bold text-lg leading-none">
                                {/* @ts-ignore */}
                                {credits?.toLocaleString() || "0"} <span className="text-[10px] ml-0.5">CR</span>
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="hidden lg:flex flex-col items-end">
                                <span className="text-sm font-bold text-white">
                                    {session.user?.name}
                                </span>
                                <button
                                    onClick={() => signOut()}
                                    className="text-[9px] uppercase text-white/40 hover:text-red-400 transition cursor-pointer"
                                >
                                    Déconnexion
                                </button>
                            </div>
                            <img
                                src={session.user?.image || ""}
                                alt="Avatar"
                                className="w-10 h-10 rounded-full border-2 border-main-green shadow-[0_0_10px_rgba(34,176,78,0.3)]"
                            />
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => signIn("discord")}
                        className="bg-discord-blurple hover:drop-shadow-[0_0_5px_rgba(254,200,12,0.6)] px-4 py-2.5 rounded-md font-semibold flex items-center gap-3 transition-all active:scale-95 shadow-md cursor-pointer"
                    >
                        {/* SVG Discord */}
                        <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
                            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.06,72.06,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14h0C130.46,50.45,121.78,26.71,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                        </svg>
                        <span className="hidden md:inline">Connexion</span>
                    </button>
                )}
            </div>
        </nav>
    );
}