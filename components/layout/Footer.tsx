import React from "react";
import Link from 'next/link';
import { SocialLink } from './SocialLink';
import { ContactButton } from '@/components/contact/ContactProvider';

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#070709] text-zinc-400 text-xs pt-16 pb-24 sm:pb-28 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 pb-16 border-b border-white/[0.06]">
          {/* Brand Info Column */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-[0.2em] text-white">
                RGODBEAT
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            </div>
            <p className="text-zinc-500 text-xs max-w-sm leading-relaxed">
              Premium independent music production house founded by Rafael Gámez. 
              Modern instrumentals, multi-track licensing, and creative direction for worldwide artists.
            </p>
            <div className="pt-2 text-[11px] font-mono text-zinc-500 space-y-1">
              <div>Austin, TX • Global Delivery</div>
              <div className="pt-1">
                <span className="text-zinc-400">Contacto Directo: </span>
                <ContactButton subject="Consulta de proyecto" variant="ghost" size="sm" className="px-0 text-purple-400">Correo o WhatsApp</ContactButton>
              </div>
            </div>
          </div>

          {/* Column 1: Music & Beats */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-white tracking-wider uppercase font-semibold">
              CATALOG
            </div>
            <ul className="space-y-2 text-zinc-400">
              <li><Link href="/beats" className="hover:text-white transition-colors">All Beats</Link></li>
              <li><Link href="/beats?genre=trap" className="hover:text-white transition-colors">Trap Beats</Link></li>
              <li><Link href="/beats?genre=reggaeton" className="hover:text-white transition-colors">Reggaeton Beats</Link></li>
              <li><Link href="/beats?genre=rnb" className="hover:text-white transition-colors">R&B / Soul</Link></li>
              <li><Link href="/beats?genre=afrobeat" className="hover:text-white transition-colors">Afrobeat</Link></li>
              <li className="pt-1">
                <Link href="/download" className="text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1.5">
                  <span>App Android (.apk)</span>
                  <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">
                    OFICIAL
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Studio & Park */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-white tracking-wider uppercase font-semibold">
              SERVICES
            </div>
            <ul className="space-y-2 text-zinc-400">
              <li><Link href="/#services" className="hover:text-white transition-colors">Custom Production</Link></li>
              <li><Link href="/#services" className="hover:text-white transition-colors">Mixing & Mastering</Link></li>
              <li><Link href="/services#artist-development" className="hover:text-white transition-colors">Desarrollo artístico / The Park</Link></li>
              <li><Link href="/#about" className="hover:text-white transition-colors">Producer Biography</Link></li>
            </ul>
          </div>

          {/* Column 3: Connect & Socials */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-white tracking-wider uppercase font-semibold">
              CONNECT
            </div>
            <ul className="space-y-2 text-zinc-400">
              <li>
                <SocialLink service="instagram" className="hover:text-white transition-colors">
                  Instagram
                </SocialLink>
              </li>
              <li>
                <SocialLink service="spotify" className="hover:text-white transition-colors">
                  Spotify
                </SocialLink>
              </li>
              <li>
                <SocialLink service="youtube" className="hover:text-white transition-colors">
                  YouTube
                </SocialLink>
              </li>
              <li>
                <SocialLink service="tiktok" className="hover:text-white transition-colors">
                  TikTok
                </SocialLink>
              </li>
              <li>
                <SocialLink service="soundcloud" className="hover:text-white transition-colors">
                  SoundCloud
                </SocialLink>
              </li>
              <li>
                <SocialLink service="discord" className="hover:text-white transition-colors">
                  Discord (The Park)
                </SocialLink>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-mono text-zinc-500">
          <div>
            &copy; {new Date().getFullYear()} RGODBEAT. All Rights Reserved.
          </div>
          <div className="flex items-center gap-6 text-zinc-500">
            <span>Licensing Terms</span>
            <span>Privacy Policy</span>
            <span className="text-purple-400/80">RGODBEAT 2.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
