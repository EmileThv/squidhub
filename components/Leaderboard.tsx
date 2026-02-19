import { getLeaderboard } from "@/lib/leaderboard";
import Image from "next/image";

export default async function Leaderboard() {
  const topPlayers = await getLeaderboard();

  return (
    <div className="w-full h-full flex flex-col px-6 py-4">
      {/* Header */}
      <div className="flex justify-between items-end mb-4 border-b border-white/10 pb-2">
        <h3 className="text-xl font-black uppercase tracking-tighter text-main-yellow">
          Classement
        </h3>
        <span className="text-xs uppercase tracking-widest text-main-green font-bold opacity-80">
          Podium
        </span>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3 w-full">
        {topPlayers.length > 0 ? (
          topPlayers.map((player, index) => (
            <div 
              key={player.id} 
              className="group flex justify-between items-center bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/10 hover:border-main-green/30 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                {/* Rank Badge */}
                <div className={`
                  w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold shadow-lg
                  ${index === 0 ? 'bg-yellow-400 text-black' : 
                    index === 1 ? 'bg-gray-300 text-black' : 
                    index === 2 ? 'bg-orange-600 text-white' : 'bg-discord-black text-white border border-white/20'}
                `}>
                  {index + 1}
                </div>

                {/* Avatar & Name */}
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/10">
                    {player.image ? (
                      <Image 
                        src={player.image} 
                        alt={player.name}
                        fill
                        className="object-cover"
                        sizes="32px"
                      />
                    ) : (
                      <div className="w-full h-full bg-main-green/20 flex items-center justify-center text-xs">?</div>
                    )}
                  </div>
                  <span className="text-sm font-bold text-white truncate max-w-25 md:max-w-35">
                    {player.name}
                  </span>
                </div>
              </div>

              {/* Credits */}
              <div className="text-right">
                <span className="block font-mono font-black text-main-green text-sm group-hover:scale-105 transition-transform">
                  {player.credits.toLocaleString()}
                </span>
                <span className="text-[10px] uppercase text-white/30 font-bold tracking-wider">Credits</span>
              </div>
            </div>
          ))
        ) : (
          <div className="h-40 flex items-center justify-center opacity-40 text-sm italic">
            En attente de joueurs...
          </div>
        )}
      </div>
    </div>
  );
} 