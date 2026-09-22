"use client";

import React from "react";

export const SOCIAL_LINKS = [
  {
    name: "Instagram",
    url: "https://www.instagram.com/rgodbeat/",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    name: "TikTok",
    url: "https://www.tiktok.com/@rgodbeat",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
      </svg>
    ),
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com/@RafaLary",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
      </svg>
    ),
  },
  {
    name: "Spotify",
    url: "https://open.spotify.com/intl-es/artist/5alBtZYlDSCtuCx31K7c3n?si=rmQJrwFrRkyBkRQBWRy0eQ",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 11.5c3.5-1.5 8-1.5 10 .5" />
        <path d="M9 15c2.5-1 6-1 8 .5" />
        <path d="M10 18c2-.5 4-.5 5 .5" />
      </svg>
    ),
  },
  {
    name: "SoundCloud",
    url: "https://soundcloud.com/rafael-gamez-443960876",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M11.56 8.87V17h9.5c1.62 0 2.94-1.31 2.94-2.93 0-1.58-1.25-2.86-2.81-2.93a4.42 4.42 0 0 0-4.32-3.48c-.61 0-1.2.13-1.74.37-.53-1.12-1.68-1.9-3.02-1.9-.19 0-.37.02-.55.06v2.68zm-2.06 1.48v6.65h1.03V10.2c-.34.04-.69.09-1.03.15zm-2.06.67v5.98h1.03v-6.13c-.34.04-.69.1-1.03.15zm-2.06 1.05v4.93h1.03v-5.07c-.34.04-.69.09-1.03.14zm-2.06 1.54v3.39h1.03v-3.52c-.34.04-.69.09-1.03.13zm-2.06 1.58v1.81h1.03v-1.92c-.34.03-.69.07-1.03.11z"/>
      </svg>
    ),
  },
  {
    name: "Discord",
    url: "https://discord.gg/p7mxUXW8A",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

export function SocialSidebar() {
  return (
    <aside
      className="hidden xl:flex fixed left-5 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-5 p-3 rounded-2xl bg-[#08080a]/60 backdrop-blur-md border border-white/[0.05] shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-purple-500/30"
      aria-label="Social Media Links"
    >
      <div
        className="font-extrabold text-[10px] tracking-[0.28em] text-purple-400 select-none opacity-80 hover:opacity-100 transition-opacity cursor-default [writing-mode:vertical-lr] rotate-180 mb-2 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]"
      >
        RGODBEAT
      </div>

      <div className="w-4 h-[1px] bg-white/10 mb-1" />

      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.name}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.name}
          title={link.name}
          className="text-zinc-400 hover:text-purple-300 hover:scale-125 hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] transition-all duration-200 p-1"
        >
          {link.icon}
        </a>
      ))}
    </aside>
  );
}
