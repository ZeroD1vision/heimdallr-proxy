'use client';
import { useEffect, useRef } from 'react';
import { useVisualStore } from '@/store/use-visual-store';

export default function BackgroundPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null); // Реф для канваса, на котором рисуем видео-фон
  const rafRef = useRef<number>(); // Реф для ID requestAnimationFrame

  // Все данные из стора через ref => не требуются ререндеры
  const stateRef = useRef(useVisualStore.getState());

  // При монтировании подписываемся на изменения стора и обновляем ref с данными
  useEffect(() => {
    const unsub = useVisualStore.subscribe((s) => {
      stateRef.current = s;
    });
    return unsub;
  }, []);

  // При монтировании получаем размер канваса и запускаем цикл отрисовки
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
        // Auth — отдельное видео для страниц авторизации
        const vid = videoElements.auth;

        if (vid && vid.readyState >= 2) source = vid;
      } else {
        // Landing — логика по зонам скролла (идентично page.tsx логике): 
        // первые 15% — hero видео, 15-85% — transition покадрово для скролла, после 85% — data видео
        if (scrollProgress <= 0.15) {
          const vid = videoElements.hero;
          if (vid && vid.readyState >= 2) source = vid;
        } else if (scrollProgress > 0.15 && scrollProgress < 0.85) {
          // Transition — покадровая анимация, кадр выбирается в зависимости от scrollProgress
          if (transitionFrames.length > 0) {
            const idx = Math.round(scrollProgress * (transitionFrames.length - 1));
            source = transitionFrames[Math.min(idx, transitionFrames.length - 1)];
          }
        } else {
          // Data — видео для нижней части лендинга
          const vid = videoElements.data;
          if (vid && vid.readyState >= 2) source = vid;
        }
      }

      if (source) {
        // Если в источнике (видео или картинка) не пусто, рисуем, заполняя весь экран
        // Для ресайзинга при отрисовке используем формулу масштабирования с сохранением пропорций:
        // scale = max(W / srcW, H / srcH)
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