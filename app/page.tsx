// app/page.tsx
import Leaderboard from "@/components/Leaderboard";
import FilmCard from "@/components/FilmCard";
import Image from "next/image";

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <main className="relative h-dvh w-screen bg-discord-black text-white overflow-hidden flex justify-center items-center pt-20 md:pt-32">
      
      {/* Global Background Image */}
      <div className="absolute inset-0 z-0">
        <Image 
          src="/images/bannerv3.png" 
          alt="Background" 
          fill 
          priority
          className="object-cover opacity-75"
        />
        
      </div>

      {/* Increased gap and ensured items are centered horizontally but pushed up vertically */}
      <div className="relative z-10 w-full px-6 md:px-16 lg:px-24 flex flex-col md:flex-row justify-center items-start gap-50">
        
        {/* Bloc Classement */}
        <div className="bg-discord-black/50 backdrop-blur-xl rounded-4xl h-100 md:h-115 w-full md:w-155 flex flex-col border border-white/10 shadow-2xl hover:border-main-green/50 transition-all group shrink-0 relative overflow-hidden">
           <Leaderboard />
        </div>

        {/* Bloc Film */}
        <div className="bg-discord-black/50 backdrop-blur-xl rounded-4xl h-100 md:h-115 w-full md:w-155 flex flex-col border border-white/10 shadow-2xl hover:border-main-green/50 transition-all group shrink-0 relative overflow-hidden">
          <FilmCard />
        </div>

      </div>
    </main>
  );
}