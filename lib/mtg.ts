// Shared between the /api/mtg route and the MtgLeague panel — no server-only imports here

// Points by finishing position: 1st, 2nd, 3rd, 4th
export const MTG_POINTS = [3, 1, 0, 0];

export type MtgGame = {
  id: string;
  playedAt: string; // YYYY-MM-DD
  placements: string[]; // player ids, winner first
  enteredBy: string;
  createdAt: number;
};

export type MtgPlayer = {
  id: string;
  name: string;
  image: string | null;
};

export type MtgStanding = MtgPlayer & {
  points: number;
  wins: number;
  played: number;
};

// Ranked by points, then wins, then fewest games played
export function computeStandings(players: MtgPlayer[], games: MtgGame[]): MtgStanding[] {
  const standings = new Map<string, MtgStanding>(
    players.map((p) => [p.id, { ...p, points: 0, wins: 0, played: 0 }])
  );

  for (const game of games) {
    game.placements.forEach((playerId, position) => {
      const standing = standings.get(playerId);
      if (!standing) return;
      standing.points += MTG_POINTS[position] ?? 0;
      standing.played += 1;
      if (position === 0) standing.wins += 1;
    });
  }

  return [...standings.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.played - b.played
  );
}
