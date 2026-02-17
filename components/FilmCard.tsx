// components/FilmCard.tsx
import Image from "next/image";
import filmData from "@/data/featured-film.json";
import { kv } from "@vercel/kv";

interface ViewerProfile {
    id: string;
    grade: number;
    name: string;
    image: string | null;
}

export default async function FilmCard() {
    const { title, realisateur, poster, watchedBy = [] } = filmData;

    // 1. Fetch all profiles in one go (Optimization)
    const profileKeys = watchedBy.map((v) => `user:profile:${v.id}`);
    const profilesRaw = watchedBy.length > 0 ? await kv.mget<any[]>(...profileKeys) : [];

    const viewerProfiles: ViewerProfile[] = watchedBy.map((v, index) => {
        const profile = profilesRaw[index] || {};
        return {
            id: v.id,
            grade: v.grade,
            name: profile.name ?? `Joueur ${v.id.slice(-4)}`,
            image: profile.image ?? null,
        };
    });

    // 2. Calculate Automatic Average
    const averageRating = viewerProfiles.length > 0
        ? viewerProfiles.reduce((acc, curr) => acc + curr.grade, 0) / viewerProfiles.length
        : 0;

    // 3. Star Percentage Calculation (for the clipping effect)
    // We multiply by 20 because 1 star = 20% of the 5-star width
    const starPercentage = (averageRating / 5) * 100;

    return (
        <div className="w-full h-full flex flex-col p-6 relative group overflow-hidden">
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-500">
                <Image src={poster} alt="" fill className="object-cover blur-xl" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
                {/* Header - UNTOUCHED */}
                <div className="flex justify-between items-end mb-4 border-b border-white/10 pb-2">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-main-yellow">
                        Film du Moment
                    </h3>
                    <span className="text-xs uppercase tracking-widest text-main-green font-bold opacity-80">
                        Recommandé
                    </span>
                </div>

                <div className="flex gap-6 flex-1 items-start py-4 overflow-hidden">
                    <div className="relative w-32 h-48 md:w-48 md:h-72 rounded-xl overflow-hidden shadow-2xl border border-white/10 shrink-0 group-hover:scale-105 transition-transform duration-500">
                        <Image src={poster} alt={title} fill className="object-cover" sizes="(max-width: 768px) 128px, 192px" />
                    </div>

                    <div className="flex flex-col h-full gap-6 flex-1 min-w-0">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-xl md:text-3xl font-black leading-tight text-white uppercase drop-shadow-[0_0_15px_rgba(34,176,78,0.4)] italic break-words">
                                {title}
                            </h4>
                            <p className="text-[10px] text-white/40 uppercase font-bold tracking-[0.2em]">
                                {realisateur}
                            </p>
                        </div>

                        {/* Automatic Rating & Partial Stars */}
                        <div className="flex flex-col gap-1">
                            <p className="text-[9px] text-white/30 uppercase font-bold tracking-[0.2em]">
                                Note Moyenne ({viewerProfiles.length})
                            </p>
                            <div className="flex items-center gap-3">
                                {/* Star Container */}
                                <div className="relative flex text-xl leading-none">
                                    {/* Gray Background Stars */}
                                    <div className="flex text-white/10 select-none">
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                    </div>
                                    {/* Yellow Foreground Stars (Clipped) */}
                                    <div
                                        className="absolute top-0 left-0 flex text-main-yellow overflow-hidden whitespace-nowrap transition-all duration-700 select-none"
                                        style={{ width: `${starPercentage}%` }}
                                    >
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                        <span className="w-[1ch] text-center mx-[2px]">★</span>
                                    </div>
                                </div>
                                <span className="font-mono font-bold text-main-yellow pt-0.5">
                                    {averageRating.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col flex-1 min-h-0 pt-4 border-t border-white/5">
                            <p className="text-[9px] text-white/30 uppercase font-bold tracking-[0.2em] mb-3">
                                Visionné par
                            </p>
                            <div className="flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                                {viewerProfiles.map((viewer) => (
                                    <div key={viewer.id} className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <div className="relative w-6 h-6 rounded-md overflow-hidden bg-main-green/20 shrink-0 border border-white/10">
                                                {viewer.image && <Image src={viewer.image} alt={viewer.name} fill className="object-cover" />}
                                            </div>
                                            <span className="text-[11px] font-bold text-white/70 truncate uppercase">{viewer.name}</span>
                                        </div>
                                        <span className="font-mono text-[10px] font-black text-main-green bg-main-green/10 px-2 py-0.5 rounded border border-main-green/20">
                                            {viewer.grade}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}