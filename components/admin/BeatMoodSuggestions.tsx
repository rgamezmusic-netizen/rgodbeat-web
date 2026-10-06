"use client";

import { getBeatMoodSuggestions } from "@/lib/data/beatMoodSuggestions";

interface BeatMoodSuggestionsProps {
  genre: string | undefined;
  mood: string;
  onSelect: (mood: string) => void;
}

export function BeatMoodSuggestions({ genre, mood, onSelect }: BeatMoodSuggestionsProps) {
  const suggestions = getBeatMoodSuggestions(genre);

  return (
    <div className="mt-2 space-y-1.5" aria-label="Ideas de mood según el género">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Ideas para este género</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            aria-pressed={mood.toLowerCase() === suggestion.toLowerCase()}
            onClick={() => onSelect(suggestion)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              mood.toLowerCase() === suggestion.toLowerCase()
                ? 'border-purple-400/60 bg-purple-500/15 text-purple-200'
                : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-purple-400/40 hover:text-white'
            }`}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
