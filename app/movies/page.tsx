"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const GENRES = [
    { id: 28, name: "Action" },
    { id: 35, name: "Comedy" },
    { id: 18, name: "Drama" },
    { id: 27, name: "Horror" },
    { id: 878, name: "Sci-Fi" },
    { id: 10749, name: "Romance" },
    { id: 53, name: "Thriller" },
    { id: 16, name: "Animation" },
    { id: 99, name: "Documentary" },
    { id: 14, name: "Fantasy" },
];

type Player = {
    id: string;
    name: string;
    image: string;
};

type SuggestedMovie = {
    title: string;
    year: number;
    predictedScore: number;
    posterUrl?: string;
};

export default function SuggestPage() {
    const { data: session } = useSession();

    const [players, setPlayers] = useState<Player[]>([]);
    const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

    // Form state
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [targetRating, setTargetRating] = useState<number>(3.5);

    // Results state
    const [suggestions, setSuggestions] = useState<SuggestedMovie[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Letterboxd onboarding state
    const [hasLetterboxd, setHasLetterboxd] = useState<boolean | null>(null);
    const [letterboxdInput, setLetterboxdInput] = useState("");
    const [letterboxdSaving, setLetterboxdSaving] = useState(false);
    const [letterboxdError, setLetterboxdError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const res = await fetch("/api/users");
                const data = await res.json();
                setPlayers(data);
                setStatus("authenticated");
            } catch (err) {
                console.error("Failed to fetch players:", err);
                setStatus(session ? "authenticated" : "unauthenticated");
            }
        };

        const checkLetterboxd = async () => {
            try {
                const res = await fetch("/api/users/me");
                const data = await res.json();
                setHasLetterboxd(!!data.letterboxd);
            } catch (err) {
                console.error("Failed to fetch current user profile:", err);
                setHasLetterboxd(false);
            }
        };

        if (session) {
            fetchPlayers();
            checkLetterboxd();
        } else {
            setStatus("unauthenticated");
        }
    }, [session]);

    const handleLetterboxdSave = async () => {
        if (!letterboxdInput.trim()) {
            setLetterboxdError("Please enter a username.");
            return;
        }
        setLetterboxdSaving(true);
        setLetterboxdError(null);
        try {
            const res = await fetch("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ letterboxd: letterboxdInput.trim() }),
            });
            if (!res.ok) throw new Error();
            setHasLetterboxd(true);
        } catch {
            setLetterboxdError("Failed to save username. Try again.");
        } finally {
            setLetterboxdSaving(false);
        }
    };

    const togglePlayer = (id: string) => {
        setSelectedPlayers((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
        );
    };

    const toggleGenre = (id: number) => {
        setSelectedGenres((prev) => {
            if (prev.includes(id)) return prev.filter((g) => g !== id);
            if (prev.length >= 2) return prev;
            return [...prev, id];
        });
    };

    const handleSubmit = async () => {
        if (selectedPlayers.length === 0) {
            setError("Select at least one player.");
            return;
        }
        if (selectedGenres.length === 0) {
            setError("Select at least one genre.");
            return;
        }

        setError(null);
        setLoading(true);
        setSuggestions([]);

        try {
            const res = await fetch("/api/suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    playerIds: selectedPlayers,
                    genreIds: selectedGenres,
                    targetRating,
                }),
            });

            if (!res.ok) throw new Error("Suggestion API failed");

            const data = await res.json();
            setSuggestions(data.suggestions);
        } catch (err) {
            console.error(err);
            setError("Something went wrong fetching suggestions.");
        } finally {
            setLoading(false);
        }
    };

    if (status === "unauthenticated") {
        return <p className="text-white p-8">You need to be logged in.</p>;
    }

    if (hasLetterboxd === false) {
        return (
            <div className="min-h-screen bg-discord-black text-white flex items-center justify-center p-8">
                <div className="w-full max-w-md flex flex-col gap-4">
                    <h1 className="text-3xl font-bold text-center">DeepSquik</h1>
                    <p className="text-white/60 text-center text-sm">
                        Entrez votre pseudo Letterboxd pour que DeepSquik puisse connaitre vos gouts ( et tout envoyer au Mossad évidemment ).
                    </p>
                    <input
                        type="text"
                        placeholder="your-letterboxd-username"
                        value={letterboxdInput}
                        onChange={(e) => setLetterboxdInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLetterboxdSave()}
                        className="w-full bg-white/5 border border-main-yellow/30 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-main-yellow transition-colors"
                    />
                    {letterboxdError && (
                        <p className="text-red-400 text-sm">{letterboxdError}</p>
                    )}
                    <button
                        onClick={handleLetterboxdSave}
                        disabled={letterboxdSaving}
                        className="w-full py-3 bg-main-green rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {letterboxdSaving ? "Saving..." : "Save username"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-discord-black text-white p-8 max-w-2xl mx-auto">
            <div className="flex flex-wrap justify-center">
                <h1 className="text-3xl font-bold mb-8">Squid A.I.</h1>
            </div>

            {/* Step 1 — Who's watching */}
            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">Who's watching?</h2>
                <div className="flex flex-wrap gap-2">
                    {players.map((player) => (
                        <button
                            key={player.id}
                            onClick={() => togglePlayer(player.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${selectedPlayers.includes(player.id)
                                ? "bg-main-green border-main-yellow"
                                : "border-main-yellow/20 hover:border-main-yellow/50"
                                }`}
                        >
                            <img
                                src={player.image}
                                alt={player.name}
                                className="w-6 h-6 rounded-full"
                            />
                            <span className="text-sm">{player.name}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* Step 2 — Genre picker */}
            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">Genres</h2>
                <div className="flex flex-wrap gap-2">
                    {GENRES.map((genre) => (
                        <button
                            key={genre.id}
                            onClick={() => toggleGenre(genre.id)}
                            className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedGenres.includes(genre.id)
                                ? "bg-main-green border-main-green text-black"
                                : "border-white/20 hover:border-white/50"
                                }`}
                        >
                            {genre.name}
                        </button>
                    ))}
                </div>
            </section>

            {/* Step 3 — Target rating */}
            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">
                    Target rating: <span className="text-main-yellow">{targetRating.toFixed(1)} / 5</span>
                </h2>
                <input
                    type="range"
                    min={0.5}
                    max={5}
                    step={0.5}
                    value={targetRating}
                    onChange={(e) => setTargetRating(parseFloat(e.target.value))}
                    className="w-full accent-main-yellow"
                />
                <div className="flex justify-between text-xs text-white/40 mt-1">
                    <span>0.5</span>
                    <span>5.0</span>
                </div>
            </section>

            {/* Submit */}
            {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
            <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-3 bg-main-green rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {loading ? "Finding movies..." : "Suggest movies"}
            </button>

            {/* Results */}
            {suggestions.length > 0 && (
                <section className="mt-10">
                    <h2 className="text-xl font-semibold mb-4">Suggestions</h2>
                    <div className="flex flex-col gap-4">
                        {suggestions.map((movie, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10"
                            >
                                {movie.posterUrl && (
                                    <img
                                        src={movie.posterUrl}
                                        alt={movie.title}
                                        className="w-14 h-20 object-cover rounded"
                                    />
                                )}
                                <div>
                                    <p className="font-semibold">{movie.title}</p>
                                    <p className="text-sm text-white/50">{movie.year}</p>
                                    <p className="text-sm text-main-yellow mt-1">
                                        Predicted: {movie.predictedScore.toFixed(2)} / 5
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}