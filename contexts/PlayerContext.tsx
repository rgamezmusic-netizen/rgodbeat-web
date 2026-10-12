"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from "react";
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

type PlayerState = Omit<PlayerContextType, "progress" | "currentTime" | "duration">;
type PlayerTimeline = Pick<PlayerContextType, "progress" | "currentTime" | "duration">;
const PlayerStateContext = createContext<PlayerState | undefined>(undefined);
const PlayerTimelineContext = createContext<PlayerTimeline | undefined>(undefined);
const initialVolume = 0.85;

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState("0:00");
  const [duration, setDuration] = useState("0:00");
  const [volume, setVolumeState] = useState(initialVolume);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedBeatId = useRef<string | null>(null);
  const playRequestId = useRef(0);

  // Initialize persistent HTML5 Audio element once on mount
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.volume = initialVolume;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (!audio.duration || isNaN(audio.duration)) return;
      const cur = audio.currentTime;
      const dur = audio.duration;
      setProgress((cur / dur) * 100);
      setCurrentTime(formatTime(cur));
      setDuration(formatTime(dur));
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(formatTime(audio.duration));
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime("0:00");
    };

    const handleError = (e: Event) => {
      console.warn("[BeatPlayer] Audio playback encountered an issue:", e);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audioRef.current = null;
    };
  }, []);

  const startAudio = useCallback((audio: HTMLAudioElement) => {
    const requestId = ++playRequestId.current;
    // Request buffering only after the user chooses audio. Keep the same media
    // element and let its native buffer survive navigation and pause/resume.
    audio.preload = "auto";
    audio.play().catch((err) => {
      if (requestId !== playRequestId.current || audioRef.current !== audio) return;
      setIsPlaying(false);
      console.warn("[BeatPlayer] Play error:", err);
    });
  }, []);

  const playBeat = useCallback((beat: Beat) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Resolve robust public preview URL with Supabase fallback
    const resolvedUrl =
      beat.previewAudioUrl ||
      `https://wrcdapajrsuqgpbfadff.supabase.co/storage/v1/object/public/rgodbeat-public/previews/${beat.id}/preview.mp3`;

    if (selectedBeatId.current === beat.id && audio.getAttribute("src")) {
      startAudio(audio);
    } else {
      selectedBeatId.current = beat.id;
      setCurrentBeat(beat);
      setProgress(0);
      setCurrentTime("0:00");
      setDuration(beat.duration || "0:00");

      audio.src = resolvedUrl;
      startAudio(audio);
    }
  }, [startAudio]);

  const pauseBeat = useCallback(() => {
    ++playRequestId.current;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const togglePlay = useCallback((beat?: Beat) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (beat && selectedBeatId.current !== beat.id) {
      playBeat(beat);
    } else {
      if (audio.paused) {
        if (selectedBeatId.current) startAudio(audio);
      } else {
        ++playRequestId.current;
        audio.pause();
        setIsPlaying(false);
      }
    }
  }, [playBeat, startAudio]);

  const seek = useCallback((percent: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const clampedPercent = Math.max(0, Math.min(100, percent));
    setProgress(clampedPercent);

    if (audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = (clampedPercent / 100) * audio.duration;
      setCurrentTime(formatTime(audio.currentTime));
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const closePlayer = useCallback(() => {
    ++playRequestId.current;
    selectedBeatId.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setIsPlaying(false);
    setCurrentBeat(null);
    setProgress(0);
    setCurrentTime("0:00");
    setDuration("0:00");
  }, []);

  // Cards and backgrounds only subscribe to playback changes, not every tick.
  const state = useMemo(() => ({
    currentBeat, isPlaying, volume, playBeat, pauseBeat, togglePlay, seek, setVolume, closePlayer,
  }), [currentBeat, isPlaying, volume, playBeat, pauseBeat, togglePlay, seek, setVolume, closePlayer]);
  const timeline = useMemo(() => ({ progress, currentTime, duration }), [progress, currentTime, duration]);

  return <PlayerStateContext.Provider value={state}>
    <PlayerTimelineContext.Provider value={timeline}>{children}</PlayerTimelineContext.Provider>
  </PlayerStateContext.Provider>;
}

export function usePlayerState() {
  const context = useOptionalPlayerState();
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}

export function useOptionalPlayerState() {
  return useContext(PlayerStateContext);
}

export function usePlayer(): PlayerContextType {
  const state = usePlayerState();
  const timeline = useContext(PlayerTimelineContext);
  if (!timeline) throw new Error("usePlayer must be used within a PlayerProvider");
  return { ...state, ...timeline };
}
