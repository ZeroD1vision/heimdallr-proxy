'use client';
import { useEffect, useRef } from 'react';
import { useVisualStore } from '@/store/use-visual-store';

const TRANSITION_FRAMES = 192;

export default function BackgroundPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  // Все данные из стора через ref — zero re-renders
  const stateRef = useRef(useVisualStore.getState());

  useEffect(() => {
    const unsub = useVisualStore.subscribe((s) => {
      stateRef.current = s;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const { scene, scrollProgress, loadingStage, transitionFrames, videoElements } = stateRef.current;
      const W = canvas.width, H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // Пока не загрузились — ничего не рисуем (page.tsx рисует свой fallback canvas)
      if (loadingStage !== 'ready') {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      if (scene === 'landing') { rafRef.current = requestAnimationFrame(draw); return; }

      let source: HTMLImageElement | HTMLVideoElement | null = null;

      if (scene === 'auth') {
        // Auth — всегда data видео
        const vid = videoElements.data;

        if (vid && vid.readyState >= 2) source = vid;
      } else {
        // Landing — логика по зонам скролла (идентично page.tsx логике)
        if (scrollProgress <= 0.15) {
          const vid = videoElements.hero;
          if (vid && vid.readyState >= 2) source = vid;
        } else if (scrollProgress > 0.15 && scrollProgress < 0.85) {
          // Transition — покадровый скраб
          if (transitionFrames.length > 0) {
            const idx = Math.round(scrollProgress * (transitionFrames.length - 1));
            source = transitionFrames[Math.min(idx, transitionFrames.length - 1)];
          }
        } else {
          const vid = videoElements.data;
          if (vid && vid.readyState >= 2) source = vid;
        }
      }

      if (source) {
        // Cover-fit: сохраняем aspect ratio
        const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
        const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
        if (srcW > 0 && srcH > 0) {
          const scale = Math.max(W / srcW, H / srcH);
          const x = (W - srcW * scale) / 2;
          const y = (H - srcH * scale) / 2;
          ctx.drawImage(source, x, y, srcW * scale, srcH * scale);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}