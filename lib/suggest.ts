import type { TmdbMovie } from "@/lib/tmdb";
import type { LetterboxdRating } from "@/lib/letterboxd";

// Home-made rating predictor.
// 1. Baseline: the TMDB average (on a 0-5 scale), calibrated to the user with a shrunk linear fit,
//    so a harsh critic or someone who loves crowd-pleasers is handled.
// 2. Affinities: the user's average residual (rating - baseline) for each genre, director,
//    top-billed actor and decade, shrunk towards 0 so one film doesn't make a taste.

const SLOPE_PRIOR_WEIGHT = 1.5; // pulls the slope towards 1 when the user has few ratings
const AFFINITY_SHRINK = 3; // a feature needs ~3 films before its affinity counts fully
const FEATURE_WEIGHTS = { g: 0.8, d: 1, c: 0.5, y: 0.4 } as const;

type FeatureKind = keyof typeof FEATURE_WEIGHTS;

export type TasteProfile = {
  meanRating: number;
  meanTmdb: number;
  slope: number;
  affinities: Map<string, number>;
  sampleSize: number;
};

const tmdbScore = (movie: TmdbMovie) => movie.voteAverage / 2;

function features(movie: TmdbMovie): [FeatureKind, string][] {
  return [
    ...movie.genreIds.map((id) => ["g", `g:${id}`] as [FeatureKind, string]),
    ...movie.directorIds.map((id) => ["d", `d:${id}`] as [FeatureKind, string]),
    ...movie.castIds.map((id) => ["c", `c:${id}`] as [FeatureKind, string]),
    ...(movie.year ? [["y", `y:${Math.floor(movie.year / 10) * 10}`] as [FeatureKind, string]] : []),
  ];
}

const baseline = (profile: TasteProfile, movie: TmdbMovie) =>
  profile.meanRating + profile.slope * (tmdbScore(movie) - profile.meanTmdb);

export function buildProfile(ratings: LetterboxdRating[], movies: Map<number, TmdbMovie>): TasteProfile {
  const samples = ratings.flatMap((r) => {
    const movie = movies.get(r.tmdbId);
    return movie && movie.voteCount > 0 ? [{ movie, rating: r.rating, x: tmdbScore(movie) }] : [];
  });

  const n = samples.length;
  const meanRating = n ? samples.reduce((s, p) => s + p.rating, 0) / n : 3.5;
  const meanTmdb = n ? samples.reduce((s, p) => s + p.x, 0) / n : 3.5;

  let sxx = 0;
  let sxy = 0;
  for (const p of samples) {
    sxx += (p.x - meanTmdb) ** 2;
    sxy += (p.x - meanTmdb) * (p.rating - meanRating);
  }
  const slope = Math.min(2, Math.max(0.2, (sxy + SLOPE_PRIOR_WEIGHT) / (sxx + SLOPE_PRIOR_WEIGHT)));

  const profile: TasteProfile = { meanRating, meanTmdb, slope, affinities: new Map(), sampleSize: n };

  const sums = new Map<string, { total: number; count: number }>();
  for (const p of samples) {
    const residual = p.rating - baseline(profile, p.movie);
    for (const [, key] of features(p.movie)) {
      const entry = sums.get(key) ?? { total: 0, count: 0 };
      entry.total += residual;
      entry.count += 1;
      sums.set(key, entry);
    }
  }
  for (const [key, { total, count }] of sums) {
    profile.affinities.set(key, total / (count + AFFINITY_SHRINK));
  }

  return profile;
}

export function predictRating(profile: TasteProfile, movie: TmdbMovie): number {
  // Average the affinities within each kind so a film with 5 actors doesn't outweigh its director
  const byKind = new Map<FeatureKind, number[]>();
  for (const [kind, key] of features(movie)) {
    byKind.set(kind, [...(byKind.get(kind) ?? []), profile.affinities.get(key) ?? 0]);
  }

  let adjustment = 0;
  for (const [kind, values] of byKind) {
    adjustment += FEATURE_WEIGHTS[kind] * (values.reduce((s, v) => s + v, 0) / values.length);
  }

  return Math.min(5, Math.max(0.5, baseline(profile, movie) + adjustment));
}

// Group score: the average prediction, lowered a bit when the group disagrees
export function groupScore(predictions: number[]): number {
  const mean = predictions.reduce((s, p) => s + p, 0) / predictions.length;
  const variance = predictions.reduce((s, p) => s + (p - mean) ** 2, 0) / predictions.length;
  return mean - 0.3 * Math.sqrt(variance);
}
