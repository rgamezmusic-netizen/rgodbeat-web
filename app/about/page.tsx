import { Navbar, Footer } from "@/components/layout";
import { AboutSection } from "@/components/home/AboutSection";
import { BIOGRAPHY } from "@/lib/data/biography";

export const metadata = {
  title: "Rafael Gámez | RGodbeat",
  description: BIOGRAPHY.paragraphs[0],
};

export default function AboutPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-transparent text-white selection:bg-purple-500/30 selection:text-white">
      <Navbar />
      <main className="relative z-10 flex-1 pt-32 sm:pt-36">
        <AboutSection standalone />
      </main>
      <Footer />
    </div>
  );
}
