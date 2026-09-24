import React from "react";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Hero } from "@/components/home/Hero";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { BeatCard, CategoryCard } from "@/components/beats";
import { AtmosphericBackground } from "@/components/atmosphere";
import { TheParkSection } from "@/components/home/TheParkSection";
import { ServicesSection } from "@/components/home/ServicesSection";
import { AboutSection } from "@/components/home/AboutSection";
import { CtaSection } from "@/components/home/CtaSection";
import { FLOW_CATEGORIES } from "@/lib/mock-data";
import { getFeaturedBeats } from "@/lib/data/beats";
import { Beat } from "@/types";

export const revalidate = 60; // Cache on edge CDN for fast initial page load (revalidates every 60s)

export default async function HomePage() {
  let featuredBeats: Beat[] = [];

  try {
    featuredBeats = await getFeaturedBeats(6);
  } catch (err: any) {
    console.error("[HomePage] Error loading featured beats from Supabase:", err.message);
  }

  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      {/* Reusable Cinematic Atmospheric Background with Procedural Stars */}
      <AtmosphericBackground theme="default" intensity="high" enableStars={true} starDensity="high" animate={true} />

      {/* Top Sticky Navigation */}
      <Navbar />

      {/* Main Hero Header */}
      <Hero />

      {/* 01. Featured Beats Section */}
      <section id="beats" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <SectionHeading
          tag="CATALOG // LATEST WORKS"
          title="Latest Releases"
          description="High-definition studio instrumentals engineered for streaming dominance and vocal presence. All licenses include instant secure master downloads."
          action={
            <Link href="/beats">
              <Button variant="outline" size="sm">
                VIEW FULL DISCOGRAPHY →
              </Button>
            </Link>
          }
        />

        {/* Beats Grid */}
        {featuredBeats.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {featuredBeats.map((beat) => (
              <BeatCard key={beat.id} beat={beat} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center rounded-2xl border border-white/[0.06] bg-[#0c0c12]">
            <p className="text-zinc-500 font-mono text-sm">
              Connecting to live discography...
            </p>
          </div>
        )}
      </section>

      {/* 02. Explore By Flow Section */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#0a0a0f] border-t border-white/[0.06] w-full">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            tag="CURATED SOUNDS // GENRES"
            title="Explore By Flow"
            description="Find the exact atmospheric cadence and tempo pocket tailored for your next record."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FLOW_CATEGORIES.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </div>
      </section>

      {/* 03. The Park (Mentorship & Community) */}
      <TheParkSection />

      {/* 04. Studio Services */}
      <ServicesSection />

      {/* 05. About Rafael Gámez (RGODBEAT) */}
      <AboutSection />

      {/* 06. Final Commercial Licensing CTA */}
      <CtaSection />

      {/* Footer */}
      <Footer />
    </div>
  );
}
