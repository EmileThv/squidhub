import { kv } from "@vercel/kv";

const TMDB_BASE = "https://api.themoviedb.org/3";
const MOVIE_TTL = 60 * 60 * 24 * 30; // Metadata barely changes, refresh monthly

// Slim version of a TMDB movie, the only fields the suggestion model needs
export type TmdbMovie = {
  id: number;
  title: string;
  year: number | null;
  genreIds: number[];
  directorIds: number[];
  castIds: number[]; // top-billed only
  voteAverage: number; // 0-10
  voteCount: number;
  posterPath: string | null;
};

type TmdbMovieResponse = {
  id: number;
  title: string;
  release_date?: string;
  genres?: { id: number }[];
  credits?: { crew?: { id: number; job: string }[]; cast?: { id: number }[] };
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
};

export type TmdbDiscoverResult = {
  id: number;
  vote_count: number;
};

// Accepts either a v3 API key or a v4 read access token in TMDB_API_KEY
async function tmdbFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) throw new Error("Missing TMDB_API_KEY");

  const isBearer = key.length > 40;
  const query = new URLSearchParams(
    Object.entries({ ...params, ...(isBearer ? {} : { api_key: key }) }).map(([k, v]) => [k, String(v)])
  );

  const res = await fetch(`${TMDB_BASE}${path}?${query}`, {
    headers: isBearer ? { Authorization: `Bearer ${key}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json();
}

// Run fn over items with at most `limit` calls in flight
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchMovie(id: number): Promise<TmdbMovie | null> {
  try {
    const raw = await tmdbFetch<TmdbMovieResponse>(`/movie/${id}`, { language: "fr-FR", append_to_response: "credits" });
    return {
      id: raw.id,
      title: raw.title,
      year: raw.release_date ? Number(raw.release_date.slice(0, 4)) : null,
      genreIds: (raw.genres ?? []).map((g) => g.id),
      directorIds: (raw.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.id),
      castIds: (raw.credits?.cast ?? []).slice(0, 5).map((c) => c.id),
      voteAverage: raw.vote_average ?? 0,
      voteCount: raw.vote_count ?? 0,
      posterPath: raw.poster_path ?? null,
    };
  } catch (e) {
    console.error(`[TMDB] movie ${id}`, e);
    return null;
  }
}

// Fetch many movies, reading and filling the KV cache in bulk
export async function getMovies(ids: number[]): Promise<Map<number, TmdbMovie>> {
  const unique = [...new Set(ids)];
  const movies = new Map<number, TmdbMovie>();
  if (unique.length === 0) return movies;

  const cached = await kv.mget<(TmdbMovie | null)[]>(...unique.map((id) => `tmdb:movie:${id}`));
  const missing: number[] = [];
  unique.forEach((id, i) => (cached[i] ? movies.set(id, cached[i]!) : missing.push(id)));

  const fetched = await mapLimit(missing, 10, fetchMovie);
  const toCache: Promise<unknown>[] = [];
  for (const movie of fetched) {
    if (!movie) continue;
    movies.set(movie.id, movie);
    toCache.push(kv.set(`tmdb:movie:${movie.id}`, movie, { ex: MOVIE_TTL }));
  }
  await Promise.all(toCache);

  return movies;
}

// Find the TMDB id of a film from its title and year (cached, 0 = not found)
export async function searchMovieId(title: string, year: number | null): Promise<number | null> {
  const cacheKey = `tmdb:search:${title.toLowerCase()}:${year ?? ""}`;
  const cached = await kv.get<number>(cacheKey);
  if (cached !== null) return cached || null;

  let id = 0;
  try {
    const search = (params: Record<string, string | number>) =>
      tmdbFetch<{ results: { id: number }[] }>("/search/movie", { query: title, ...params });

    let { results } = await search(year ? { primary_release_year: year } : {});
    if (!results.length && year) ({ results } = await search({}));
    id = results[0]?.id ?? 0;
  } catch (e) {
    console.error(`[TMDB] search "${title}" (${year})`, e);
    return null; // Don't cache failures
  }

  await kv.set(cacheKey, id, { ex: MOVIE_TTL });
  return id || null;
}

export async function discoverMovies(params: Record<string, string | number>): Promise<TmdbDiscoverResult[]> {
  const { results } = await tmdbFetch<{ results: TmdbDiscoverResult[] }>("/discover/movie", {
    include_adult: "false",
    "with_runtime.gte": 60, // skip shorts and music videos
    ...params,
  });
  return results ?? [];
}

export const posterUrl = (path: string | null) => (path ? `https://image.tmdb.org/t/p/w342${path}` : undefined);
