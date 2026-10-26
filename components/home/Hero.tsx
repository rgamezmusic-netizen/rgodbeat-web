import Link from "next/link";
import { ArrowUpRight, Disc3 } from "lucide-react";
import { RG_CHART_PATH } from "@/lib/rg/product/presentation";
import { InstallStudioButton } from "@/components/home/InstallStudioButton";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className="relative min-h-[92vh] flex flex-col justify-center pt-32 sm:pt-36 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="relative z-10 w-full max-w-4xl mx-auto text-center flex flex-col items-center">
        <h1 className={`${styles.headline} font-extrabold tracking-[-0.035em] leading-[0.94] text-white uppercase max-w-4xl select-none`}>
          YOUR SOUND.
          <br />
          <span className="bg-gradient-to-b from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            YOUR SIGNATURE.
          </span>
        </h1>

        <nav className={styles.actions} aria-label="Explorar RGODBEAT">
          <Link
            href={RG_CHART_PATH}
            className={`${styles.action} ${styles.topActionButton}`}
          >
            <span>TOP 23</span><ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link
            href="/beats"
            className={`${styles.action} ${styles.catalogActionButton}`}
          >
            <Disc3 size={18} aria-hidden="true" /><span>CATÁLOGO</span>
          </Link>
          <InstallStudioButton />
        </nav>
      </div>
    </section>
  );
}
