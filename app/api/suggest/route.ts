import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { auth } from "@/auth";
import { getLetterboxdRatings } from "@/lib/letterboxd";
import { discoverMovies, getMovies, posterUrl } from "@/lib/tmdb";
import { buildProfile, groupScore, predictRating } from "@/lib/suggest";

export const dynamic = "force-dynamic";
// First run for a new user scrapes Letterboxd and fills the TMDB cache, which can take a while
export const maxDuration = 60;

const MAX_CANDIDATES = 120;
const MAX_SUGGESTIONS = 10;

type Profile = { id: string; name?: string; letterboxd?: string };

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  let body: { playerIds?: unknown; genreIds?: unknown; targetRating?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { playerIds, genreIds, targetRating } = body;
  if (
    !Array.isArray(playerIds) || playerIds.length === 0 || playerIds.length > 10 ||
    !playerIds.every((id) => typeof id === "string") ||
    !Array.isArray(genreIds) || genreIds.length === 0 || genreIds.length > 2 ||
    !genreIds.every((id) => Number.isInteger(id)) ||
    typeof targetRating !== "number" || targetRating < 0.5 || targetRating > 5
  ) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  try {
    // 1. Ratings of every selected player who linked a Letterboxd account
    const profiles = await kv.mget<(Profile | null)[]>(...playerIds.map((id) => `user:profile:${id}`));
    const viewers = await Promise.all(
      profiles.map(async (profile, i) => {
        const ratings = profile?.letterboxd ? await getLetterboxdRatings(profile.letterboxd) : [];
        return { id: playerIds[i] as string, name: profile?.name ?? "?", ratings };
      })
    );

    const withData = viewers.filter((v) => v.ratings.length > 0);
    const skipped = viewers.filter((v) => v.ratings.length === 0).map((v) => v.name);
    if (withData.length === 0) {
      return NextResponse.json(
        { error: "Aucune note Letterboxd trouvée pour les joueurs sélectionnés.", skipped },
        { status: 422 }
      );
    }

    // 2. Candidates in the chosen genres: popular ones, acclaimed ones and infamous ones,
    //    so there is something close to any target rating
    const genres = genreIds.join(","); // comma = all genres must match
    const pools = await Promise.all([
      ...[1, 2, 3].map((page) => discoverMovies({ with_genres: genres, sort_by: "popularity.desc", "vote_count.gte": 200, page })),
      ...[1, 2].map((page) => discoverMovies({ with_genres: genres, sort_by: "vote_average.desc", "vote_count.gte": 500, page })),
      discoverMovies({ with_genres: genres, sort_by: "vote_average.asc", "vote_count.gte": 200, page: 1 }),
    ]);

    const seen = new Set(withData.flatMap((v) => v.ratings.map((r) => r.tmdbId)));
    const candidateIds = [...new Set(pools.flat().map((m) => m.id))]
      .filter((id) => !seen.has(id))
      .slice(0, MAX_CANDIDATES);

    // 3. Metadata for everything we rate or score
    const movies = await getMovies([...seen, ...candidateIds]);

    // 4. Predict each viewer's rating, then the group's
    const tastes = withData.map((v) => ({ id: v.id, profile: buildProfile(v.ratings, movies) }));

    const scored = candidateIds.flatMap((id) => {
      const movie = movies.get(id);
      if (!movie) return [];
      const perPlayer = tastes.map((t) => ({ id: t.id, score: predictRating(t.profile, movie) }));
      return [{ movie, perPlayer, score: groupScore(perPlayer.map((p) => p.score)) }];
    });

    const suggestions = scored
      .sort((a, b) => Math.abs(a.score - targetRating) - Math.abs(b.score - targetRating) || b.movie.voteCount - a.movie.voteCount)
      .slice(0, MAX_SUGGESTIONS)
      .map(({ movie, perPlayer, score }) => ({
        tmdbId: movie.id,
        title: movie.title,
        year: movie.year,
        predictedScore: score,
        posterUrl: posterUrl(movie.posterPath),
        perPlayer,
      }));

    return NextResponse.json({
      suggestions,
      players: tastes.map((t) => ({ id: t.id, ratingsCount: t.profile.sampleSize })),
      skipped,
    });
  } catch (e) {
    console.error("SUGGEST_ERROR:", e);
    return NextResponse.json({ error: "Erreur pendant la recherche de films." }, { status: 500 });
  }
}
