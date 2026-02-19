"use client";

import { motion } from "framer-motion";
import gamesData from "@/data/games-data.json";
import { useEffect, useState } from "react";

export default function GamesPage() {
  const [windowSize, setWindowSize] = useState({ w: 0, h: 0 });
  // On crée un état pour stocker les positions aléatoires une seule fois au montage
  const [positions, setPositions] = useState<{x: number, y: number}[]>([]);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    };
    
    handleResize();

    // On génère les positions aléatoires
    const totalBoxes = gamesData.dailyCategories.length + 1;
    const randomPositions = Array.from({ length: totalBoxes }).map(() => ({
      // On garde une marge de sécurité (ex: entre 50px et 60% de l'écran)
      x: Math.floor(Math.random() * (window.innerWidth * 0.7)),
      y: Math.floor(Math.random() * (window.innerHeight * 0.7))
    }));
    setPositions(randomPositions);

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const allBoxes = [
    ...gamesData.dailyCategories.map(c => ({ ...c, isSpecial: false })),
    { nom: "Friendslop", isSpecial: true }
  ];

  // On attend que les positions soient générées pour éviter un saut visuel
  if (positions.length === 0) return <main className="h-screen bg-discord-dark" />;

  return (
    <main className="h-dvh bg-discord-dark overflow-hidden relative">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5 select-none">
        <h1 className="font-(family-name:--font-squidwod) text-main-yellow text-[25vw] uppercase leading-none">
          Games
        </h1>
      </div>

      <div className="absolute inset-0">
        {allBoxes.map((cat: any, index) => (
          <motion.div
            key={cat.nom}
            drag
            dragConstraints={{
              top: 0,
              left: 0,
              right: windowSize.w > 0 ? windowSize.w - (windowSize.w < 768 ? 300 : 400) : 0,
              bottom: windowSize.h > 0 ? windowSize.h - 250 : 0
            }}
            dragTransition={{ power: 0.2, timeConstant: 200 }}
            dragElastic={0.1}
            // On utilise la position aléatoire stockée
            initial={{ 
              x: positions[index]?.x ?? 100, 
              y: positions[index]?.y ?? 100 
            }}
            whileDrag={{ scale: 1.05, zIndex: 50 }}
            className={`absolute p-6 rounded-2xl border-2 shadow-2xl cursor-grab active:cursor-grabbing touch-none
              ${cat.isSpecial 
                ? "bg-main-yellow/5 border-main-yellow backdrop-blur-md w-80 md:w-100" 
                : "bg-discord-black/90 border-main-green/30 backdrop-blur-xl w-72 md:w-100"
              }`}
          >
            <h3 className={`font-black uppercase tracking-widest mb-4 
              ${cat.isSpecial ? "text-white text-2xl" : "text-main-green text-xs"}`}>
              {cat.nom}
            </h3>

            {cat.isSpecial ? (
              <div className="flex flex-wrap gap-2">
                {gamesData.friendslop.map((item: any) => (
                  <a 
                    key={item.name} 
                    href={item.url} 
                    target="_blank"
                    onPointerDown={(e) => e.stopPropagation()}
                    className="bg-white/10 px-3 py-1.5 rounded text-xs md:text-sm hover:bg-main-green hover:text-black transition-colors font-bold"
                  >
                    {item.name}
                  </a>
                ))}
              </div>
            ) : (
              <nav className="flex flex-col gap-3">
                {cat.jeux?.map((jeu: any) => (
                  <a 
                    key={jeu.name} 
                    href={jeu.url} 
                    target="_blank"
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-gray-300 hover:text-white font-bold text-sm md:text-xl transition-colors flex items-center gap-2"
                  >
                    <span className="text-main-green text-xs">●</span>
                    {jeu.name}
                  </a>
                ))}
              </nav>
            )}
          </motion.div>
        ))}
      </div>
    </main>
  );
}