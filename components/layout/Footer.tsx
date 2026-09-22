import React from "react";

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
            <div className="pt-2 text-[11px] font-mono text-zinc-500">
              Austin, TX • Global Delivery
            </div>
          </div>

          {/* Column 1: Music & Beats */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-white tracking-wider uppercase font-semibold">
              CATALOG
            </div>
            <ul className="space-y-2 text-zinc-400">
              <li><a href="/beats" className="hover:text-white transition-colors">All Beats</a></li>
              <li><a href="/beats?genre=trap" className="hover:text-white transition-colors">Trap Beats</a></li>
              <li><a href="/beats?genre=reggaeton" className="hover:text-white transition-colors">Reggaeton Beats</a></li>
              <li><a href="/beats?genre=rnb" className="hover:text-white transition-colors">R&B / Soul</a></li>
              <li><a href="/beats?genre=afrobeat" className="hover:text-white transition-colors">Afrobeat</a></li>
            </ul>
          </div>

          {/* Column 2: Studio & Park */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-white tracking-wider uppercase font-semibold">
              SERVICES
            </div>
            <ul className="space-y-2 text-zinc-400">
              <li><a href="/#services" className="hover:text-white transition-colors">Custom Production</a></li>
              <li><a href="/#services" className="hover:text-white transition-colors">Mixing & Mastering</a></li>
              <li><a href="/#services" className="hover:text-white transition-colors">Artist Development</a></li>
              <li><a href="/#the-park" className="hover:text-white transition-colors">The Park Residency</a></li>
              <li><a href="/#about" className="hover:text-white transition-colors">Producer Biography</a></li>
            </ul>
          </div>

          {/* Column 3: Connect & Socials */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] text-white tracking-wider uppercase font-semibold">
              CONNECT
            </div>
            <ul className="space-y-2 text-zinc-400">
              <li>
                <a href="https://www.instagram.com/rgodbeat/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Instagram
                </a>
              </li>
              <li>
                <a href="https://open.spotify.com/intl-es/artist/5alBtZYlDSCtuCx31K7c3n" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Spotify
                </a>
              </li>
              <li>
                <a href="https://www.youtube.com/@RafaLary" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  YouTube
                </a>
              </li>
              <li>
                <a href="https://www.tiktok.com/@rgodbeat" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  TikTok
                </a>
              </li>
              <li>
                <a href="https://soundcloud.com/rafael-gamez-443960876" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  SoundCloud
                </a>
              </li>
              <li>
                <a href="https://discord.gg/p7mxUXW8A" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Discord (The Park)
                </a>
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
