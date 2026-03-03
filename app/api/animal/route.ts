import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import taxonPool from "@/data/taxon-pool.json";

export const dynamic = "force-dynamic";

async function fetchDeepNicheAnimal() {
    const taxon = taxonPool[Math.floor(Math.random() * taxonPool.length)];
    const randomPage = Math.floor(Math.random() * 13) + 3;

    const query = new URLSearchParams({
        taxon_id: String(taxon.id),
        quality_grade: "research",
        photos: "true",
        per_page: "25",
        page: String(randomPage),
        order_by: "observations_count",
        order: "asc",
    });

    try {
        const res = await fetch(`https://api.inaturalist.org/v1/observations?${query}`, {
            headers: { "User-Agent": "AnimalApp/1.0" },
            cache: "no-store",
        });
        const { results } = await res.json();
        if (!results?.length) return null;

        const obs = results[Math.floor(Math.random() * results.length)];
        const taxonId = obs.taxon.id;

        const galleryQuery = new URLSearchParams({
            taxon_id: String(taxonId),
            quality_grade: "research",
            photos: "true",
            per_page: "15",
        });

        const galleryRes = await fetch(`https://api.inaturalist.org/v1/observations?${galleryQuery}`, {
            headers: { "User-Agent": "AnimalApp/1.0" },
            cache: "no-store",
        });
        const galleryData = await galleryRes.json();

        const photos = galleryData.results
            ?.map((r: any) => r.observation_photos[0]?.photo.url.replace("square", "large"))
            .filter(Boolean) || [];

        if (photos.length < 3) return null;

        return {
            taxonId,
            scientificName: obs.taxon.name,
            commonName: obs.taxon.preferred_common_name || obs.taxon.name,
            iconicTaxon: obs.taxon.iconic_taxon_name,
            photos,
            inatUrl: `https://www.inaturalist.org/taxa/${taxonId}`,
            placeGuess: obs.place_guess || "Global",
        };
    } catch (e) {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const isRandom = searchParams.get("random") === "true";
    const today = new Date().toISOString().split("T")[0];
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
            await kv.set(key, animal, { ex: 86400 });
        } catch (e) { console.error("KV Write Error", e); }
    }

    return NextResponse.json(animal);
}