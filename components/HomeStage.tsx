"use client";

import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import Tentacles, { GREEN, PURPLE, type TentaclePalette, type TentacleSpec } from "@/components/Tentacles";

// The two homepage cards, each carried up out of the water by a tentacle.
// The tentacles move the cards (rise, sway, jolts), so the cards have no animation of their own.
export default function HomeStage({ left, right }: { left: ReactNode; right?: ReactNode }) {
  const leftAnchor = useRef<HTMLDivElement>(null);
  const leftCard = useRef<HTMLDivElement>(null);
  const rightAnchor = useRef<HTMLDivElement>(null);
  const rightCard = useRef<HTMLDivElement>(null);

  const arms = useMemo<TentacleSpec[]>(
    () => [
      { anchor: leftAnchor, card: leftCard, palette: PURPLE, side: -1, grip: 0.04, tilt: -1.6, phase: 0 },
      { anchor: rightAnchor, card: rightCard, palette: GREEN, side: 1, grip: 0.96, tilt: 1.2, phase: 2.7 },
    ],
    []
  );

  return (
    <>
      <div className="relative z-10 w-full px-6 md:px-12 flex flex-col md:flex-row justify-center items-start gap-10 lg:gap-24">
        <HeldCard anchorRef={leftAnchor} cardRef={leftCard} palette={PURPLE}>
          {left}
        </HeldCard>
        <HeldCard anchorRef={rightAnchor} cardRef={rightCard} palette={GREEN}>
          {right}
        </HeldCard>
      </div>
      <Tentacles arms={arms} />
    </>
  );
}

function HeldCard({
  anchorRef,
  cardRef,
  palette,
  children,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  cardRef: RefObject<HTMLDivElement | null>;
  palette: TentaclePalette;
  children?: ReactNode;
}) {
  return (
    // The anchor keeps the card's resting place in the layout, the card inside is moved by its arm.
    // On desktop it starts below the water until its arm lifts it.
    <div ref={anchorRef} className="relative w-full md:w-[min(38rem,44vw)] h-100 md:h-115 shrink-0">
      <div
        ref={cardRef}
        data-no-ink
        className="absolute inset-0 will-change-transform select-none md:cursor-grab"
        style={{ transform: "translateY(650px)" }}
        // Native image drag would steal the pointer from the card drag
        onDragStart={(e) => e.preventDefault()}
      >
        {/* Slab edge, tinted like the arm holding it */}
        <div
          className="absolute inset-x-0 -bottom-[6px] top-[6px] rounded-[26px]"
          style={{ background: `linear-gradient(180deg, ${palette.base}, ${palette.shadow})` }}
        />
        <div className="relative h-full flex flex-col rounded-[26px] overflow-hidden bg-[#141118] border border-white/[0.06] shadow-[0_40px_70px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)]">
          {children}
        </div>
      </div>
    </div>
  );
}
