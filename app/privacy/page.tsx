import { Navbar, Footer } from "@/components/layout";

export const metadata = {
  title: "Política de Privacidad | RGODBEAT",
  description: "Política de privacidad y tratamiento de datos de la plataforma RGODBEAT y RGODBEAT Studio.",
};

export default function PrivacyPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-transparent text-white selection:bg-purple-500/30 selection:text-white">
      <Navbar />
      <main className="relative z-10 flex-1 px-4 pt-32 pb-20 sm:px-6 sm:pt-36 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-white/10 bg-black/40 p-6 sm:p-10 backdrop-blur-md">
          <header className="border-b border-white/10 pb-6">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
              Política de Privacidad
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Última actualización: Noviembre 2026 · RGODBEAT
            </p>
          </header>

          <section className="space-y-4 text-sm leading-relaxed text-zinc-300">
            <h2 className="text-xl font-bold text-white">1. Información General</h2>
            <p>
              En <strong>RGODBEAT</strong> (accesible desde https://www.rgodbeat.com), respetamos y protegemos la privacidad de nuestros usuarios y artistas. Esta Política de Privacidad describe cómo recopilamos, utilizamos y protegemos la información personal cuando utilizas nuestra plataforma y herramientas de producción musical.
            </p>

            <h2 className="text-xl font-bold text-white">2. Datos que Recopilamos</h2>
            <p>
              Recopilamos únicamente la información necesaria para el funcionamiento de los servicios:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li>Datos de cuenta: correo electrónico y nombre de usuario o nombre artístico.</li>
              <li>Grabaciones y proyectos musicales procesados en el DAW RGodbeat Studio.</li>
              <li>Datos de transacciones y licencias de beats adquiridas.</li>
            </ul>

            <h2 className="text-xl font-bold text-white">3. Integración con Servicios de Google y YouTube</h2>
            <p>
              RGODBEAT Studio utiliza las APIs de Google y YouTube para permitir a los usuarios autorizados exportar y publicar sus canciones producidas directamente en el canal oficial de RGODBEAT.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li>El acceso a YouTube se utiliza exclusivamente para subir el video musical con el consentimiento explícito del artista.</li>
              <li>No compartimos, vendemos ni transferimos tokens de autenticación de Google a terceros.</li>
              <li>Los usuarios pueden revocar el acceso de la aplicación en cualquier momento a través de la configuración de seguridad de su cuenta de Google.</li>
            </ul>

            <h2 className="text-xl font-bold text-white">4. Almacenamiento y Seguridad</h2>
            <p>
              Implementamos medidas de seguridad estándar de la industria, incluyendo cifrado en tránsito (HTTPS/TLS) y cifrado en reposo para credenciales y proyectos musicales.
            </p>

            <h2 className="text-xl font-bold text-white">5. Contacto</h2>
            <p>
              Si tienes preguntas sobre esta política o sobre el tratamiento de tus datos, puedes contactarnos a través del correo oficial de asistencia: <strong>gamezinmusic@gmail.com</strong>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

