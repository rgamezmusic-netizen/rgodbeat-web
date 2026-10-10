import React from "react";
import { Navbar, Footer } from "@/components/layout";
import { Hero } from "@/components/home/Hero";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryCard } from "@/components/beats/CategoryCard";
import { TheParkSection } from "@/components/home/TheParkSection";
import { ServicesSection } from "@/components/home/ServicesSection";
import { AboutSection } from "@/components/home/AboutSection";
import { AppDownloadBanner } from "@/components/home/AppDownloadBanner";
import { CtaSection } from "@/components/home/CtaSection";
import { FLOW_CATEGORIES } from "@/lib/mock-data";

function ExploreByFlow() {
  return (
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#0a0a0f] border-t border-white/[0.06] w-full">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            tag="CURATED SOUNDS // GENRES"
            title="Explore By Flow"
            description="Find the exact atmospheric cadence and tempo pocket tailored for your next record."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FLOW_CATEGORIES.map((category) => (
              <CategoryCard key={category.id} category={category} showCount={false} />
            ))}
          </div>
        </div>
      </section>

  );
}

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      <Navbar />
      <Hero />
      <ExploreByFlow />

      {/* 03. The Park (Mentorship & Community) */}
      <TheParkSection />

      {/* 04. Studio Services */}
      <ServicesSection />

      {/* 05. About Rafael Gámez (RGODBEAT) */}
      <AboutSection />

      {/* 06. Android App Installer Banner */}
      <AppDownloadBanner />

      {/* 07. Final Commercial Licensing CTA */}
      <CtaSection />

      {/* Footer */}
      <Footer />
    </div>
  );
}
