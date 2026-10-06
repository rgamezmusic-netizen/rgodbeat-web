"use client";

import { getBeatDescriptionSuggestions } from '@/lib/data/beatDescriptionSuggestions';

interface Props {
  genre?: string;
  genreName?: string;
  description: string;
  onSelect: (description: string) => void;
}

export function BeatDescriptionSuggestions({ genre, genreName, description, onSelect }: Props) {
  const suggestions = getBeatDescriptionSuggestions(genre, genreName);
  if (!suggestions.length) return null;

  return (
    <div className="mt-2 space-y-2" aria-label="Ideas de descripción según el género">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        Ideas de descripción{genreName ? ` · ${genreName}` : ''}
      </p>
      <div className="grid gap-1.5">
        {suggestions.map(suggestion => (
          <button
            key={suggestion}
            type="button"
            aria-pressed={description.trim() === suggestion}
            onClick={() => onSelect(suggestion)}
            className={`rounded-lg border px-3 py-2 text-left text-xs leading-relaxed transition-colors ${
              description.trim() === suggestion
                ? 'border-purple-400/60 bg-purple-500/15 text-purple-200'
                : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-purple-400/40 hover:text-white'
            }`}
          >
            {suggestion}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-zinc-500">Toca una idea para usarla y editarla.</p>
    </div>
  );
}
