import { kv } from "@vercel/kv";
import { mapLimit, searchMovieId } from "@/lib/tmdb";

// Letterboxd has no public API and puts every paginated page behind a Cloudflare challenge,
// so we only read what is openly served: the RSS feed (~50 latest diary entries, with TMDB ids)
// and the first page of /films/ (72 latest films, matched to TMDB by title + year).

const RATINGS_TTL = 60 * 60 * 12;
const HEADERS = { "User-Agent": "SquidHub/1.0 (+https://coubehfeur.vercel.app)" };

export type LetterboxdRating = {
  tmdbId: number;
  rating: number; // 0.5 - 5
};

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) {
      console.warn(`[Letterboxd] ${url} -> ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error(`[Letterboxd] ${url}`, e);
    return null;
  }
}

async function fromRss(username: string): Promise<LetterboxdRating[]> {
  const xml = await fetchText(`https://letterboxd.com/${username}/rss/`);
  if (!xml) return [];

  const ratings: LetterboxdRating[] = [];
  for (const item of xml.split("<item>").slice(1)) {
    const rating = item.match(/<letterboxd:memberRating>([\d.]+)</)?.[1];
    const tmdbId = item.match(/<tmdb:movieId>(\d+)</)?.[1];
    if (rating && tmdbId) ratings.push({ tmdbId: Number(tmdbId), rating: Number(rating) });
  }
  return ratings;
}

async function fromFilmsGrid(username: string): Promise<LetterboxdRating[]> {
  const html = await fetchText(`https://letterboxd.com/${username}/films/`);
  if (!html) return [];

  const rated: { title: string; year: number | null; rating: number }[] = [];
  for (const item of html.split('<li class="griditem">').slice(1)) {
    const name = item.match(/data-item-name="([^"]+)"/)?.[1];
    const stars = item.match(/\brated-(\d+)\b/)?.[1];
    if (!name || !stars) continue;

    const decoded = decodeEntities(name);
    const yearMatch = decoded.match(/^(.*) \((\d{4})\)$/);
    rated.push({
      title: yearMatch ? yearMatch[1] : decoded,
      year: yearMatch ? Number(yearMatch[2]) : null,
      rating: Number(stars) / 2,
    });
  }

  const ids = await mapLimit(rated, 4, (film) => searchMovieId(film.title, film.year));
  return rated.flatMap((film, i) => (ids[i] ? [{ tmdbId: ids[i]!, rating: film.rating }] : []));
}

// Latest ratings of a Letterboxd user, one per film, cached for a few hours
export async function getLetterboxdRatings(username: string): Promise<LetterboxdRating[]> {
  const slug = username.trim().toLowerCase();
  const cacheKey = `letterboxd:ratings:${slug}`;

  const cached = await kv.get<LetterboxdRating[]>(cacheKey);
  if (cached) return cached;

  const [rss, grid] = await Promise.all([fromRss(slug), fromFilmsGrid(slug)]);

  // RSS first: it is newest-first and carries exact TMDB ids, so it wins on duplicates
  const byFilm = new Map<number, LetterboxdRating>();
  for (const r of [...rss, ...grid]) if (!byFilm.has(r.tmdbId)) byFilm.set(r.tmdbId, r);
  const ratings = [...byFilm.values()];

  // Don't cache an empty result: it is more likely a block than a user with no ratings
  if (ratings.length > 0) await kv.set(cacheKey, ratings, { ex: RATINGS_TTL });
  return ratings;
}
