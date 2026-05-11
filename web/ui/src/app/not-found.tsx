// app/not-found.tsx
'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useVisualStore } from '@/store/use-visual-store';
import { MediaManager } from '@/lib/media-manager';

export default function NotFound() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Проверяем, нет ли уже готового видео в глобальном сторе
  const cachedVideo = useVisualStore((s) => s.videoElements.hero);

  useEffect(() => {
    if (cachedVideo && videoRef.current) {
      // Если видео уже есть в памяти, подменяем источник или копируем состояние
      videoRef.current.src = cachedVideo.src;
    } else {
      // Иначе инициализируем менеджер и берем URL
      const mgr = new MediaManager();
      // getVideoUrl возвращает либо динамический путь, либо FALLBACK
      const url = mgr.getVideoUrl('hero', '1080'); 
      if (videoRef.current) {
        videoRef.current.src = url;
      }
    }
  }, [cachedVideo]);

  return (
    <main className="relative min-h-screen w-full flex items-center justify-center overflow-hidden">
      {/* ─── Video Orchestrator Background ──────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover opacity-40 grayscale"
          style={{ filter: 'contrast(1.2) brightness(0.8)' }}
        />
        {/* Градиентный маскировщик для мягкого входа в интерфейс */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
      </div>

      {/* ─── Content Layer ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center">
        <h1 className="text-[12vw] font-syne font-bold tracking-tighter text-white/40 leading-none">
          404
        </h1>
        
        <div className="flex flex-col items-center gap-2 -mt-4">
          <span className="text-[10px] font-geist-mono tracking-[0.4em] uppercase text-white/61">
            Sector not found
          </span>
          <div className="h-px w-12 bg-white/42 my-4" />
          <Link 
            href="/"
            className="group relative px-8 py-3 overflow-hidden rounded-full border border-white/10 transition-all hover:border-white/30"
          >
            <span className="relative z-10 text-[9px] font-syne uppercase tracking-[0.2em] text-white/78 group-hover:text-white">
              Go to Home
            </span>
            <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </Link>
        </div>
      </div>

    </main>
  );
}