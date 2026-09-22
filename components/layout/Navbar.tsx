"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/contexts/CartContext";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { openCart, itemCount } = useCart();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-[#08080a]/90 backdrop-blur-xl border-b border-white/[0.08] py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          : "bg-transparent py-5 sm:py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="font-extrabold text-lg sm:text-xl tracking-[0.22em] text-white group-hover:text-purple-300 transition-colors">
            RGODBEAT
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
        </Link>

        {/* Center Primary Navigation */}
        <div className="hidden md:flex items-center gap-9 text-[13px] font-medium tracking-[0.14em] text-zinc-300">
          <Link
            href="/beats"
            className="hover:text-white transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[1px] after:bg-purple-400 hover:after:w-full after:transition-all after:duration-200"
          >
            BEATS
          </Link>
          <a
            href="/#services"
            className="hover:text-white transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[1px] after:bg-purple-400 hover:after:w-full after:transition-all after:duration-200"
          >
            SERVICES
          </a>
          <a
            href="/#the-park"
            className="hover:text-white transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[1px] after:bg-purple-400 hover:after:w-full after:transition-all after:duration-200 flex items-center gap-1.5"
          >
            <span>THE PARK</span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              STUDIO
            </span>
          </a>
          <a
            href="/#about"
            className="hover:text-white transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[1px] after:bg-purple-400 hover:after:w-full after:transition-all after:duration-200"
          >
            ABOUT
          </a>
        </div>

        {/* Right Side Utility Actions */}
        <div className="hidden sm:flex items-center gap-3 md:gap-3.5">
          {/* Search Trigger */}
          <Link
            href="/beats"
            aria-label="Search Beats"
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-colors cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </Link>

          {/* Account Button */}
          <Button variant="ghost" size="sm" className="text-zinc-300 hover:text-white">
            <svg
              className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="hidden md:inline tracking-wider">ACCOUNT</span>
          </Button>

          {/* Cart Button */}
          <Button
            type="button"
            onClick={openCart}
            variant="secondary"
            size="sm"
            className="relative group cursor-pointer"
          >
            <svg
              className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span className="tracking-wider">CART</span>
            <span
              className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full border transition-colors ${
                itemCount > 0
                  ? "bg-purple-500 text-white border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                  : "bg-white/[0.08] text-zinc-200 border border-white/10"
              }`}
            >
              {itemCount}
            </span>
          </Button>
        </div>

        {/* Mobile Menu Hamburger Trigger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-zinc-300 hover:text-white focus:outline-none cursor-pointer"
          aria-label="Toggle mobile menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {mobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-white/10 bg-[#08080a]/98 backdrop-blur-2xl px-6 py-8 space-y-6">
          <div className="flex flex-col gap-5 text-sm tracking-[0.18em] font-medium text-zinc-300">
            <Link
              href="/beats"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-white py-1 transition-colors flex items-center justify-between border-b border-white/[0.04] pb-2"
            >
              <span>BEATS</span>
              <span className="text-purple-400 text-xs font-mono font-bold">SHOP →</span>
            </Link>
            <a
              href="/#services"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-white py-1 transition-colors flex items-center justify-between border-b border-white/[0.04] pb-2"
            >
              <span>SERVICES</span>
              <span className="text-zinc-600 text-xs">02</span>
            </a>
            <a
              href="/#the-park"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-white py-1 transition-colors flex items-center justify-between border-b border-white/[0.04] pb-2"
            >
              <span>THE PARK</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                STUDIO
              </span>
            </a>
            <a
              href="/#about"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-white py-1 transition-colors flex items-center justify-between pb-2"
            >
              <span>ABOUT</span>
              <span className="text-zinc-600 text-xs">04</span>
            </a>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="md"
              className="w-full justify-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              ACCOUNT
            </Button>
            <Button
              variant="primary"
              size="md"
              className="w-full justify-center"
              onClick={() => {
                setMobileMenuOpen(false);
                openCart();
              }}
            >
              CART ({itemCount})
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
