import type { ServiceInfo } from "@/types";

// Advertised inquiry rates, separate from checkout products.
export const STUDIO_SERVICES: ServiceInfo[] = [
  {
    id: "custom-production", title: "Producción musical", category: "Producción completa",
    description: "Producción original desde cero, desarrollada alrededor de tu voz, tu visión artística y la dirección de tu proyecto.",
    turnaround: "5–7 días hábiles", price: 250, regularPrice: 350, billing: "project", delivery: "Stems multipista en WAV",
    features: ["Composición original de melodías y baterías", "Stems multipista en WAV", "Asesoría de arreglos y revisiones", "Derechos de lanzamiento comercial según el acuerdo"],
  },
  {
    id: "mixing-mastering", title: "Mix y master", category: "Mezcla y mastering",
    description: "Mezcla y mastering para dar claridad, profundidad y presencia a tu música. Podemos trabajar a distancia si no estás en Austin.",
    turnaround: "3–5 días hábiles", price: 150, regularPrice: 200, billing: "project", delivery: "Versiones instrumental y a capela",
    features: ["Afinación y alineación vocal", "Ecualización y profundidad espacial", "Preparación del master para plataformas de streaming", "Versiones instrumental y a capela"],
  },
  {
    id: "artist-development", title: "Desarrollo artístico", category: "The Park Residency",
    description: "Programa The Park Residency: acompañamiento creativo para definir tu sonido, organizar un EP y preparar la dirección de tus próximos lanzamientos.",
    turnaround: "Programa mensual", price: 400, regularPrice: 600, billing: "monthly", delivery: "Sesiones de estrategia y plan de lanzamiento",
    features: ["Sesiones privadas de estrategia semanales", "Revisión y feedback de tu catálogo", "Acceso prioritario a producción", "Hoja de ruta para preparar tus lanzamientos"],
  },
  {
    id: "custom-sound-design", title: "Producción audiovisual", category: "Proyectos a medida",
    description: "Música y diseño sonoro para campañas, cortometrajes y piezas audiovisuales, con un alcance definido para cada proyecto.",
    turnaround: "Calendario por proyecto", price: 500, billing: "project", delivery: "Stems y cue sheet del proyecto",
    features: ["Diseño sonoro y Foley a medida", "Entrega de stems y cue sheet", "Derechos de sincronización y difusión según el acuerdo", "Planificación de entregas por hitos"],
  },
];

export const ARTIST_DEVELOPMENT = STUDIO_SERVICES.find(service => service.id === "artist-development")!;

export function formatServicePrice(service: ServiceInfo) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(service.price);
  return service.billing === "monthly" ? `${amount} USD / mes` : `Desde ${amount} USD`;
}

export function serviceInquiryMessage(service: ServiceInfo) {
  return `Hola, me interesa ${service.title.toLowerCase()}.\n\nReferencia publicada: ${formatServicePrice(service)}.\nQuisiera confirmar el alcance y recibir una cotización para mi proyecto.\n\nMi proyecto:\nMi ubicación:\nFecha deseada:\n`;
}
