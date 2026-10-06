import { normalizeBeatGenre } from './beatMoodSuggestions';

const DESCRIPTIONS_BY_GENRE: Record<string, string[]> = {
  trap: [
    'Beat de trap para barras con actitud, un flow contundente y una historia sin filtros.',
    'Una base de trap para combinar versos personales con un estribillo melódico.',
    'Trap para contar tu camino, tus ambiciones y todo lo que dejaste atrás.',
  ],
  drill: [
    'Beat de drill para un delivery directo, barras afiladas y un mensaje con carácter.',
    'Una base de drill para contar historias de la calle con tu propia voz.',
    'Drill para jugar con las pausas del flow y construir un estribillo contundente.',
  ],
  rnb: [
    'Beat de R&B para melodías íntimas, confesiones y una interpretación llena de sentimiento.',
    'Una base de R&B para cantar sobre el amor, la distancia y lo que quedó por decir.',
    'R&B para explorar armonías vocales y convertir una historia personal en canción.',
  ],
  reggaeton: [
    'Beat de reggaetón para un coro pegajoso, un flow suelto y una canción para bailar.',
    'Una base de reggaetón para historias de deseo, encuentros y noches que se recuerdan.',
    'Reggaetón para combinar versos melódicos con un estribillo que invite a cantar.',
  ],
  afrobeat: [
    'Beat de afrobeat para un flow relajado, melodías cantables y una canción con movimiento.',
    'Una base de afrobeat para cantar sobre conexión, buenos momentos y dejarse llevar.',
    'Afrobeat para jugar con frases vocales rítmicas y construir un coro que se quede contigo.',
  ],
  house: [
    'Beat de house para una voz que conecte con la pista de baile y un estribillo fácil de recordar.',
    'Una base de house para frases vocales breves, repetición y una canción que invite a moverse.',
    'House para convertir una idea sencilla en un hook que acompañe toda la noche.',
  ],
  hiphop: [
    'Beat de hip hop para contar historias con barras claras y un flow con personalidad.',
    'Una base de hip hop para letras introspectivas, experiencias reales y un mensaje propio.',
    'Hip hop para jugar con las rimas y dar protagonismo a tu forma de decir las cosas.',
  ],
  pop: [
    'Beat de pop para melodías memorables y un estribillo que invite a cantar desde la primera escucha.',
    'Una base de pop para transformar una historia de amor en una canción cercana.',
    'Pop para expresar lo que sientes con versos sencillos y un coro que conecte.',
  ],
  country: [
    'Beat de country para contar historias de vida, raíces y caminos recorridos.',
    'Una base de country para cantar sobre el amor, la nostalgia y el lugar al que quieres volver.',
    'Country para una letra honesta, una interpretación cercana y un estribillo con historia.',
  ],
};

export function getBeatDescriptionSuggestions(genre: string | undefined, genreName?: string): string[] {
  const canonical = normalizeBeatGenre(genre);
  if (DESCRIPTIONS_BY_GENRE[canonical]) return DESCRIPTIONS_BY_GENRE[canonical];
  const label = genreName?.trim() || genre?.trim();
  if (!label) return [];
  return [
    `Beat de ${label} para desarrollar tu propia historia y encontrar un flow con personalidad.`,
    `Una base de ${label} para crear melodías vocales y un estribillo que conecte.`,
    `${label} para convertir una idea personal en una canción con tu sello.`,
  ];
}
