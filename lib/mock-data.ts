import { Beat, LicenseOption, CategoryInfo } from "@/types";

export const LICENSE_OPTIONS: LicenseOption[] = [
  {
    id: "mp3",
    slug: "mp3",
    name: "MP3",
    price: 29,
    format: "MP3 (320 kbps)",
    features: [
      "Licencia no exclusiva",
      "MP3 320 kbps",
    ],
  },
  {
    id: "wav",
    slug: "wav",
    name: "WAV",
    price: 49,
    format: "MP3 320 kbps + WAV 16-bit / 44.1 kHz",
    features: [
      "Licencia no exclusiva",
      "MP3 320 kbps",
      "WAV 16-bit / 44.1 kHz",
    ],
    recommended: true,
  },
  {
    id: "unlimited",
    slug: "unlimited",
    name: "UNLIMITED",
    price: 199,
    format: "MP3 + WAV + stems bajo solicitud",
    features: [
      "Licencia no exclusiva",
      "MP3",
      "WAV",
      "Acceso a stems agrupados bajo solicitud",
    ],
  },
  {
    id: "exclusive",
    slug: "exclusive",
    name: "EXCLUSIVE",
    price: 499,
    format: "Derechos exclusivos + masters completos",
    features: [
      "Licencia exclusiva",
      "MP3",
      "WAV",
      "Acceso a stems agrupados bajo solicitud",
    ],
  },
];

export const MOCK_BEATS: Beat[] = [
  {
    id: "a4c1b253-0fc4-42c4-9f17-b96e03115b23",
    slug: "divina",
    title: "DIVINA",
    genre: "reggaeton",
    mood: "Dark",
    bpm: 95,
    key: "Am",
    duration: "2:47",
    price: 29,
    cover: "https://wrcdapajrsuqgpbfadff.supabase.co/storage/v1/object/public/rgodbeat-public/covers/a4c1b253-0fc4-42c4-9f17-b96e03115b23/cover.png",
    previewAudioUrl: "https://wrcdapajrsuqgpbfadff.supabase.co/storage/v1/object/public/rgodbeat-public/previews/a4c1b253-0fc4-42c4-9f17-b96e03115b23/preview.mp3",
    featured: true,
    published: true,
    createdAt: "2026-09-20",
    tags: ["Reggaeton", "Melodic", "Dark", "Sensual", "95 BPM"],
    regularPricing: { mp3: 29, wav: 49, stems: 99, unlimited: 199, exclusive: 499 },
    pricing: { mp3: 29, wav: 49, stems: 99, unlimited: 199, exclusive: 499 },
  },
];

export const FEATURED_BEATS = MOCK_BEATS.slice(0, 6);

export const FLOW_CATEGORIES: CategoryInfo[] = [
  {
    id: "trap",
    title: "TRAP",
    tagline: "Cinematic tension, distorted low-end & cutting hi-hats",
    bpmRange: "130 – 160 BPM",
    count: 24,
    accentColor: "from-purple-600/30 to-zinc-950",
  },
  {
    id: "rnb",
    title: "R&B / SOUL",
    tagline: "Velvet chords, introspective night moods & vocal spaces",
    bpmRange: "75 – 105 BPM",
    count: 18,
    accentColor: "from-violet-700/30 to-zinc-950",
  },
  {
    id: "reggaeton",
    title: "REGGAETON",
    tagline: "Futuristic swing, dembow syncopation & urban club pulse",
    bpmRange: "90 – 102 BPM",
    count: 32,
    accentColor: "from-blue-600/30 to-zinc-950",
  },
  {
    id: "afrobeat",
    title: "AFRO",
    tagline: "Sun-soaked acoustic grooves, log drums & rhythmic swing",
    bpmRange: "100 – 116 BPM",
    count: 15,
    accentColor: "from-amber-600/20 to-zinc-950",
  },
  {
    id: "house",
    title: "HOUSE",
    tagline: "Hypnotic 4x4 pulses, rolling bass & late-night underground drive",
    bpmRange: "122 – 128 BPM",
    count: 12,
    accentColor: "from-cyan-600/25 to-zinc-950",
  },
  {
    id: "hiphop",
    title: "HIP-HOP",
    tagline: "Hard-hitting boom bap, soulful chops & organic rhythm textures",
    bpmRange: "84 – 98 BPM",
    count: 21,
    accentColor: "from-indigo-600/30 to-zinc-950",
  },
];

// Keep compatibility for any existing service imports.
export { STUDIO_SERVICES } from "./data/services";
