import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

const TAXON_POOL = [
  "Mollusca",       // Nudibranchs, Octopuses, rare Snails
  "Arachnida",      // Jumping spiders, Scorpions, Whip spiders
  "Amphibia",       // Caecilians, Glass frogs, rare Newts
  "Reptilia",       // Leaf-tailed geckos, Blind snakes
  "Actinopterygii", // Deep-sea fish, Pipefish, Blennies
  "Insecta",        // Orchid mantises, Jewel beetles, Leaf insects
  "Cnidaria",       // Sea anemones, Siphonophores, Corals
  "Echinodermata",  // Brittle stars, Sea cucumbers, Crinoids
  "Myriapoda",      // Bioluminescent millipedes, Centipedes
  "Annelida"        // Polychaete worms, Christmas tree worms
];

async function fetchDeepNicheAnimal() {
  const taxon = TAXON_POOL[Math.floor(Math.random() * TAXON_POOL.length)];
  
  // We skip the first 2 pages (the "popular" stuff) and look between pages 3-15
  const randomPage = Math.floor(Math.random() * 13) + 3;

  const query = new URLSearchParams({
    iconic_taxa: taxon,
    quality_grade: "research",
    photos: "true",
    per_page: "25",
    page: String(randomPage),
    order_by: "observations_count", // Sorting by count and then picking from the bottom of the list
    order: "asc" 
  });

  try {
    const res = await fetch(`https://api.inaturalist.org/v1/observations?${query}`, {
      headers: { "User-Agent": "AnimalApp/1.0" },
      cache: 'no-store'
    });
    
    const { results } = await res.json();
    if (!results?.length) return null;

    // Pick a random species from our niche result set
    const obs = results[Math.floor(Math.random() * results.length)];
    const taxonId = obs.taxon.id;

    // STEP 2: Fetch a gallery of UNIQUE observations of this species
    const galleryQuery = new URLSearchParams({
        taxon_id: String(taxonId),
        quality_grade: "research",
        photos: "true",
        per_page: "15",
    });

    const galleryRes = await fetch(`https://api.inaturalist.org/v1/observations?${galleryQuery}`, {
        headers: { "User-Agent": "AnimalApp/1.0" },
        cache: 'no-store'
    });
    
    const galleryData = await galleryRes.json();
    
    // Extract one high-res photo from different observations
    const photos = galleryData.results
      ?.map((r: any) => r.observation_photos[0]?.photo.url.replace("square", "large"))
      .filter(Boolean) || [];

    if (photos.length < 3) return null;

    return {
      taxonId,
      scientificName: obs.taxon.name,
      commonName: obs.taxon.preferred_common_name || obs.taxon.name,
      iconicTaxon: obs.taxon.iconic_taxon_name,
      photos: photos,
      inatUrl: `https://www.inaturalist.org/taxa/${taxonId}`,
      placeGuess: obs.place_guess || "Global"
    };
  } catch (e) {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isRandom = searchParams.get("random") === "true";
  
  const today = new Date().toISOString().split('T')[0];
  const key = `deep_niche_v2:${today}`;

  if (!isRandom) {
    try {
      const cached = await kv.get(key);
      if (cached) return NextResponse.json(cached);
    } catch (e) { console.error("KV Read Error", e); }
  }

  let animal = null;
  for (let i = 0; i < 6; i++) {
    animal = await fetchDeepNicheAnimal();
    if (animal) break;
  }

  if (!animal) return NextResponse.json({ error: "Niche species not found" }, { status: 404 });

  if (!isRandom) {
    try {
      // Expires at the end of the day
      await kv.set(key, animal, { ex: 86400 });
    } catch (e) { console.error("KV Write Error", e); }
  }

  return NextResponse.json(animal);
}