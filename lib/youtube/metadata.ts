type StudioVideoDetails = {
  artistName: string;
  beatTitle: string;
  beatGenre?: string;
  beatBpm?: number;
  beatKey?: string;
};

const clean = (value: string, limit = 80) => value.replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const hashtag = (value: string) => value.replace(/[^\p{L}\p{N}_]/gu, '');

/** Shared by the preview and upload so automatic metadata stays identical. */
export function studioVideoMetadata(input: StudioVideoDetails) {
  const artist = clean(input.artistName);
  const beat = clean(input.beatTitle);
  const genre = clean(input.beatGenre || '', 40);
  const key = clean(input.beatKey || '', 24);
  const suffix = ' | TOP 23 Prod RGodbeat';
  const heading = [beat, artist].filter(Boolean).join(' x ');
  const title = `${heading.slice(0, 100 - suffix.length).trimEnd()}${suffix}`;
  const hashtags = [...new Set(['RGodbeat', 'RGodbeatStudio', 'Top23', 'RG', genre, artist, beat].map(hashtag).filter(Boolean))];
  const description = [
    `${heading} | Prod RGodbeat`,
    '',
    artist ? `Artista: ${artist}` : '',
    beat ? `Beat: ${beat}` : '',
    'Producción: RGodbeat',
    'Grabado con RGodbeat Studio.',
    genre ? `Género: ${genre}` : '',
    input.beatBpm ? `Tempo: ${input.beatBpm} BPM` : '',
    key ? `Tonalidad: ${key}` : '',
    '',
    'RG TOP 23 — Tracks, artistas y beats.',
    'Cada temporada dura 14 días. El rendimiento verificado de las publicaciones y sus hitos ayudan a mover el ranking.',
    'Los tres primeros artistas compiten por Premium y una parte del premio disponible en RG, según las reglas de la temporada.',
    'Ranking y premios: https://www.rgodbeat.com/ranking/season',
    '',
    'Graba y publica: https://www.rgodbeat.com/studio',
    'Catálogo de beats: https://www.rgodbeat.com/beats',
    'Web oficial: https://www.rgodbeat.com',
    '',
    hashtags.map(tag => `#${tag}`).join(' '),
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n');
  const tags = [...new Set(['RGODBEAT', 'RGodbeat Studio', 'TOP 23', 'RG', genre, artist, beat,
    input.beatBpm ? `${input.beatBpm} BPM` : '', key].map(value => clean(value, 60)).filter(Boolean))];
  return { title, description, tags, categoryId: '10', defaultLanguage: 'es' };
}
