import { Button } from "@/components/ui/Button";
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

        <nav className="mt-9 sm:mt-11 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row" aria-label="Explorar RGODBEAT">
          <Button
            href="/ranking"
            variant="primary"
            size="lg"
            className="w-full sm:w-auto"
          >
            TOP 23
          </Button>
          <Button
            href="/beats"
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
          >
            CATÁLOGO
          </Button>
        </nav>
      </div>
    </section>
  );
}
