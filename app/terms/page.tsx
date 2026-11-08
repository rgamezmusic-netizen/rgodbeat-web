import { Navbar, Footer } from "@/components/layout";

export const metadata = {
  title: "Términos del Servicio | RGODBEAT",
  description: "Términos y condiciones de uso de la plataforma RGODBEAT y RGODBEAT Studio.",
};

export default function TermsPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-transparent text-white selection:bg-purple-500/30 selection:text-white">
      <Navbar />
      <main className="relative z-10 flex-1 px-4 pt-32 pb-20 sm:px-6 sm:pt-36 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-white/10 bg-black/40 p-6 sm:p-10 backdrop-blur-md">
          <header className="border-b border-white/10 pb-6">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
              Términos del Servicio
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Última actualización: Noviembre 2026 · RGODBEAT
            </p>
          </header>

          <section className="space-y-4 text-sm leading-relaxed text-zinc-300">
            <h2 className="text-xl font-bold text-white">1. Aceptación de los Términos</h2>
            <p>
              Al acceder o utilizar los servicios de <strong>RGODBEAT</strong> (https://www.rgodbeat.com) o su estación de trabajo de audio digital RGODBEAT Studio, aceptas cumplir con estos Términos del Servicio y todas las leyes aplicables.
            </p>

            <h2 className="text-xl font-bold text-white">2. Uso de la Plataforma y Licencias de Beats</h2>
            <p>
              Los ritmos e instrumentales disponibles en RGODBEAT están sujetos a sus respectivos acuerdos de licencia (Licencia Estándar, Premium o Exclusiva). El usuario debe poseer o contar con los derechos legítimos de las voces y letras que graba o publica a través de la plataforma.
            </p>

            <h2 className="text-xl font-bold text-white">3. Publicación en YouTube</h2>
            <p>
              La funcionalidad de exportación a YouTube permite a los artistas participar en el ranking y ecosistema de recompensas de RGODBEAT. Al solicitar la subida de un video, el artista declara y garantiza que el contenido no infringe derechos de autor ni normas comunitarias de YouTube.
            </p>

            <h2 className="text-xl font-bold text-white">4. Limitación de Responsabilidad</h2>
            <p>
              RGODBEAT no se hace responsable por reclamos de terceros derivados de contenido cargado indebidamente por los usuarios sin las licencias o permisos correspondientes.
            </p>

            <h2 className="text-xl font-bold text-white">5. Contacto</h2>
            <p>
              Para cualquier consulta legal o de soporte, comunícate con nosotros a través de: <strong>gamezinmusic@gmail.com</strong>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

