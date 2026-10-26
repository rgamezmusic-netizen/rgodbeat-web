"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, ShoppingBag, UserRound, X } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { getBrowserUser } from "@/lib/auth/client";
import { createClient } from "@/lib/supabase/client";
import { RG_CHART_PATH } from "@/lib/rg/product/presentation";
import { useBackgroundPrefetch } from "@/lib/browser/prefetch";
import styles from "./Navbar.module.css";

const destinations = [
  { href: RG_CHART_PATH, label: "TOP 23" },
  { href: "/beats", label: "BEATS" },
  { href: "/studio", label: "STUDIO" },
  { href: "/services", label: "SERVICIOS" },
  { href: "/park", label: "THE PARK" },
  { href: "/about", label: "BIOGRAFÍA" },
];

export function Navbar() {
  const prefetch = useBackgroundPrefetch();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Awaited<ReturnType<typeof getBrowserUser>>>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const { openCart, itemCount } = useCart();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let mounted = true;
    let authChanged = false;
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      authChanged = true;
      if (mounted) setCurrentUser(session?.user ?? null);
    });
    // A late initial read must not restore a user after a sign-out event.
    void getBrowserUser().then(user => {
      if (mounted && !authChanged) setCurrentUser(user);
    }).catch(() => {});
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) setMobileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      menuTrigger.current?.focus();
    };
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [mobileMenuOpen]);

  const selected = (href: string) => href === RG_CHART_PATH
    ? pathname.startsWith("/ranking") : pathname === href || pathname.startsWith(`${href}/`);
  const accountHref = currentUser ? "/account" : "/login";
  const accountLabel = currentUser ? "Mi Cuenta" : "Acceso Artistas";

  return <nav ref={navRef} aria-label="Navegación principal" className={`${styles.header} ${isScrolled || mobileMenuOpen ? styles.solid : ""}`}>
    <div className={styles.bar}>
      <Link prefetch={prefetch} href="/" className={styles.brand} aria-label="RGodbeat — Inicio" onClick={() => setMobileMenuOpen(false)}>
        <Image src="/images/rgodbeat-logo.png" alt="RGodbeat" width={979} height={345}
          sizes="(min-width: 640px) 100px, 90px" loading="eager" fetchPriority="high" />
      </Link>
      <div className={styles.desktopLinks}>
        {destinations.map(({ href, label }) => <Link key={href} href={href} prefetch={href === "/park" ? false : prefetch}
          className={styles.navLink} aria-current={selected(href) ? "page" : undefined}>{label}</Link>)}
      </div>
      <div className={styles.utilities}>
        <Link href={accountHref} aria-label={accountLabel} className={`${styles.utility} ${styles.account}`}>
          <UserRound size={17} aria-hidden="true" /><span>{currentUser ? "MI CUENTA" : "ACCEDER"}</span>
        </Link>
        <button type="button" data-cart-trigger="true" onClick={() => { setMobileMenuOpen(false); openCart(); }}
          aria-label={`Abrir carrito, ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`} className={styles.utility}>
          <ShoppingBag size={17} aria-hidden="true" /><span className={styles.cartLabel}>CARRITO</span><span className={styles.count} aria-hidden="true">{itemCount}</span>
        </button>
        <button ref={menuTrigger} type="button" onClick={() => setMobileMenuOpen(open => !open)} className={`${styles.utility} ${styles.menuTrigger}`}
          aria-label="Menú principal" aria-expanded={mobileMenuOpen} aria-controls="site-mobile-menu">
          {mobileMenuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </div>
    </div>
    {mobileMenuOpen && <div id="site-mobile-menu" className={styles.mobileMenu}>
      <div className={styles.mobileLinks}>{destinations.map(({ href, label }) => <Link key={href} href={href}
        prefetch={href === "/park" ? false : prefetch} className={styles.navLink} aria-current={selected(href) ? "page" : undefined}
        onClick={() => setMobileMenuOpen(false)}><span>{label}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>)}</div>
      <Link href={accountHref} aria-label={accountLabel} className={`${styles.utility} ${styles.mobileAccount}`} onClick={() => setMobileMenuOpen(false)}>
        <UserRound size={17} aria-hidden="true" />{currentUser ? "MI CUENTA" : "ACCEDER A MI CUENTA"}
      </Link>
    </div>}
  </nav>;
}
