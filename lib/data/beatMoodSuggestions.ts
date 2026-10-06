const MOODS_BY_GENRE: Record<string, string[]> = {
  trap: ['Dark', 'Melodic', 'Aggressive', 'Energetic'],
  drill: ['Dark', 'Aggressive', 'Epic', 'Melodic'],
  rnb: ['Soulful', 'Romantic', 'Chill', 'Melodic'],
  reggaeton: ['Energetic', 'Romantic', 'Melodic', 'Chill'],
  afrobeat: ['Energetic', 'Chill', 'Melodic', 'Soulful'],
  house: ['Energetic', 'Chill', 'Atmospheric', 'Epic'],
  hiphop: ['Dark', 'Soulful', 'Aggressive', 'Chill'],
  pop: ['Energetic', 'Melodic', 'Romantic', 'Epic'],
  country: ['Chill', 'Romantic', 'Soulful', 'Atmospheric'],
};

const MOODS = ['Dark', 'Melodic', 'Energetic', 'Atmospheric', 'Aggressive', 'Chill', 'Romantic', 'Epic', 'Soulful'];

export function normalizeBeatGenre(genre: string | undefined): string {
  const key = (genre || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return key === 'rb' || key === 'rbsoul' || key === 'rhythmandblues' ? 'rnb'
    : key === 'hiphoprap' || key === 'rap' ? 'hiphop' : key;
}

export function getBeatMoodSuggestions(genre: string | undefined): string[] {
  const canonical = normalizeBeatGenre(genre);
  return MOODS_BY_GENRE[canonical] || MOODS.slice(0, 4);
}
