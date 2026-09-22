import { Beat, LicenseOption, CategoryInfo, ServiceInfo } from "@/types";

export const LICENSE_OPTIONS: LicenseOption[] = [
  {
    id: "mp3",
    slug: "mp3",
    name: "Standard MP3",
    price: 29,
    format: "Untagged High-Quality MP3 (320kbps)",
    features: [
      "Untagged stereo audio file",
      "Up to 100,000 audio streams",
      "Distribution on Spotify & Apple Music",
      "1 Non-monetized music video",
    ],
  },
  {
    id: "wav",
    slug: "wav",
    name: "Premium WAV",
    price: 49,
    format: "Uncompressed 24-Bit Master WAV + MP3",
    features: [
      "Master studio WAV file (24-bit/48kHz)",
      "Up to 500,000 audio streams",
      "2 Commercial music videos",
      "Monetized YouTube streaming allowed",
    ],
    recommended: true,
  },
  {
    id: "stems",
    slug: "stems",
    name: "Trackout Stems",
    price: 99,
    format: "Separated Multitrack WAV Stems + Master WAV",
    features: [
      "All individual drum, synth, bass & vocal stems",
      "Perfect for professional studio mixing & vocal tuning",
      "Up to 1,000,000 audio streams",
      "Radio broadcasting rights included",
    ],
  },
  {
    id: "unlimited",
    slug: "unlimited",
    name: "Unlimited License",
    price: 199,
    format: "Full Master WAV + All Stems (No Caps)",
    features: [
      "Unlimited commercial audio streams",
      "Unlimited physical & digital sales",
      "Unlimited music videos & radio airplay",
      "For-profit live performance rights",
    ],
  },
  {
    id: "exclusive",
    slug: "exclusive",
    name: "Exclusive Rights",
    price: 499,
    format: "Full Ownership Transfer & Master Copyright",
    features: [
      "Sole ownership transferred directly to you",
      "Beat permanently removed from store",
      "Unlimited sync, streaming & physical distribution",
      "Official signed contract agreement",
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

export const STUDIO_SERVICES: ServiceInfo[] = [
  {
    id: "custom-production",
    title: "Music Production",
    category: "Full Production",
    description: "Tailored full-scale record production from scratch designed strictly around your vocal texture, artistic vision, and delivery.",
    turnaround: "5-7 business days",
    startingPrice: "$350",
    features: [
      "Original melody & drum composition",
      "Full multitrack stems (WAV 24-bit)",
      "Arrangement consulting & revisions",
      "Commercial release rights",
    ],
  },
  {
    id: "mixing-mastering",
    title: "Mixing & Mastering",
    category: "Post-Production",
    description: "Industry-grade sonic engineering that provides three-dimensional separation, punch, vocal presence, and streaming platform loudness.",
    turnaround: "3-5 business days",
    startingPrice: "$180",
    features: [
      "Precision vocal tuning & alignment",
      "Analog-modeled spatial depth & EQ",
      "Spotify & Apple Music loudness compliance",
      "Includes instrumental & acapella passes",
    ],
  },
  {
    id: "artist-development",
    title: "Artist Development",
    category: "Mentorship & Strategy",
    description: "One-on-one executive creative direction to identify your sonic pocket, curate cohesive EP tracklists, and elevate your market profile.",
    turnaround: "Monthly program",
    startingPrice: "$600 / mo",
    features: [
      "Weekly private strategic sessions",
      "Full catalog audit & feedback",
      "Priority production access",
      "Direct release readiness roadmap",
    ],
  },
  {
    id: "custom-sound-design",
    title: "Custom Production",
    category: "Exclusive Projects",
    description: "Specialized scoring, sync licensing beds, and unique sound design for ad campaigns, short films, and high-impact branded media.",
    turnaround: "Custom timeline",
    startingPrice: "$500",
    features: [
      "Bespoke sound design & Foley",
      "Direct stem delivery with cue sheets",
      "Unlimited sync & broadcast rights",
      "Expedited milestone delivery",
    ],
  },
];
