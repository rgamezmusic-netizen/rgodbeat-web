"use client";

import React, { createContext, useContext, useState } from "react";
import { Beat } from "@/types";

interface PlayerContextType {
  currentBeat: Beat | null;
  isPlaying: boolean;
  progress: number; // 0 to 100
  currentTime: string;
  duration: string;
  volume: number; // 0 to 1
  playBeat: (beat: Beat) => void;
  pauseBeat: () => void;
  togglePlay: (beat?: Beat) => void;
  seek: (percent: number) => void;
  setVolume: (vol: number) => void;
  closePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(28); // Realistic visual initial progress
  const [currentTime, setCurrentTime] = useState("0:52");
  const [volume, setVolumeState] = useState(0.85);

  const playBeat = (beat: Beat) => {
    if (currentBeat?.id === beat.id) {
      setIsPlaying(true);
    } else {
      setCurrentBeat(beat);
      setIsPlaying(true);
      setProgress(15);
      setCurrentTime("0:28");
    }
  };

  const pauseBeat = () => {
    setIsPlaying(false);
  };

  const togglePlay = (beat?: Beat) => {
    if (beat && (!currentBeat || currentBeat.id !== beat.id)) {
      playBeat(beat);
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  const seek = (percent: number) => {
    setProgress(percent);
    // Visual time calculation based on mock duration (e.g., 3:00)
    const totalSecs = 180;
    const currentSecs = Math.floor((percent / 100) * totalSecs);
    const mins = Math.floor(currentSecs / 60);
    const secs = currentSecs % 60;
    setCurrentTime(`${mins}:${secs < 10 ? "0" : ""}${secs}`);
  };

  const setVolume = (vol: number) => {
    setVolumeState(Math.max(0, Math.min(1, vol)));
  };

  const closePlayer = () => {
    setIsPlaying(false);
    setCurrentBeat(null);
  };

  return (
    <PlayerContext.Provider
      value={{
        currentBeat,
        isPlaying,
        progress,
        currentTime,
        duration: currentBeat?.duration || "3:00",
        volume,
        playBeat,
        pauseBeat,
        togglePlay,
        seek,
        setVolume,
        closePlayer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
