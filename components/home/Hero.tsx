import Link from "next/link";
import { HeroPadField } from "@/components/home/HeroPadField";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className="relative min-h-[92vh] flex flex-col justify-center pt-32 sm:pt-36 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <HeroPadField />

      <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center">
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-extrabold tracking-[-0.035em] leading-[0.94] text-white uppercase max-w-4xl select-none">
          YOUR SOUND.
          <br />
          <span className="bg-gradient-to-b from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            YOUR SIGNATURE.
          </span>
        </h1>

        <nav className={`${styles.actions} mt-9 sm:mt-11`} aria-label="Explorar RGODBEAT">
          <Link className={styles.actionPad} href="/ranking" aria-label="Top 23">
            <span className={styles.padLight} aria-hidden="true" />
            <span className={styles.actionLabel}>TOP 23</span>
          </Link>
          <Link className={styles.actionPad} href="/beats" aria-label="Catálogo">
            <span className={styles.padLight} aria-hidden="true" />
            <span className={styles.actionLabel}>CATÁLOGO</span>
          </Link>
        </nav>
      </div>
    </section>
  );
}
