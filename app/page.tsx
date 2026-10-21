import Leaderboard from "@/components/Leaderboard";
import MtgLeague from "@/components/MtgLeague";
import LiquidBackground from "@/components/LiquidBackground";
import Squids from "@/components/Squids";
import HomeStage from "@/components/HomeStage";
import BiggestLoser from "@/components/BiggestLoser";

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <main className="relative h-dvh w-screen bg-discord-black text-white overflow-hidden flex justify-center items-start pt-10 md:pt-[7vh]">

      {/* Liquid background with squids swimming in it: stir with the mouse, click for squid ink */}
      <LiquidBackground />
      <Squids />

      {/* Cards held up out of the water by tentacles, with room below for the arms */}
      <HomeStage left={<Leaderboard />} right={<BiggestLoser />} />

      <MtgLeague />
    </main>
  );
}
