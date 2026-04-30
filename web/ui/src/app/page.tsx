'use client';
/**
 * app/page.tsx — Frame-sequence landing page
 *
 * Вместо video scrubbing используем PNG/JPG кадры загруженные в Image() объекты.
 * ctx.drawImage() на уже декодированный битмап = 0ms задержки, идеальная плавность.
 *
 * АРХИТЕКТУРА:
 *   - hero:       121 кадр, зацикленный автоплей ~25fps через rAF
 *   - transition: 192 кадра, индекс = Math.round(scrollProgress × 191)
 *   - data:       192 кадра, зацикленный автоплей ~25fps через rAF
 *
 * ЗАГРУЗКА:
 *   Все кадры грузятся параллельно на mount через Promise.all.
 *   Пока грузятся — canvas показывает анимированную заглушку.
 *   Когда загрузились — переключаемся на кадры.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { initGlobalLoading } from '@/lib/visual-orchestrator';
import { useVisualStore } from '@/store/use-visual-store';

// ── Конфиг кадров ─────────────────────────────────────────────────────────────
const HERO_FRAMES = 121;
const TRANSITION_FRAMES = 192;
const DATA_FRAMES = 192;

const framePath = (section: 'hero' | 'transition' | 'data', n: number) =>
  `/assets/frames/${section}/frame_${String(n).padStart(4, '0')}.jpg`;

// ── Scroll зоны ───────────────────────────────────────────────────────────────
const HERO_VH = 1.0;
const TRANS_VH = 4.0;
const DATA_VH = 1.0;

// ── Инерция ───────────────────────────────────────────────────────────────────
const INERTIA_DECAY = 0.2; // 0.88 = плавно, 0.92 = дольше плывёт

interface Particle {
  x: number;
  y: number;
  sz: number;
  vy: number;
  vx: number;
  hue: number;
  bright: number;
}

const FEATURES = [
  {
    n: '01',
    t: 'DPI Shield',
    d: 'VLESS+Reality+gRPC — трафик неотличим от HTTPS/2 потоков',
  },
  {
    n: '02',
    t: 'Bifrost Bot',
    d: 'Полный контроль ноды через Telegram — ключи, статусы, live stats',
  },
  {
    n: '03',
    t: 'Gjallarhorn',
    d: 'Real-time дашборд с 30s коллектором и историческими графиками',
  },
  {
    n: '04',
    t: 'Zero Weight',
    d: '8 МБ Go бинарь · SQLite · работает в 768 МБ RAM',
  },
  {
    n: '05',
    t: 'Yggdrasil API',
    d: 'Echo REST · gRPC к Xray-core · async goroutine collector',
  },
  {
    n: '06',
    t: 'Armored 2FA',
    d: 'OTP через Telegram → JWT — timing-safe, brute-force resistant',
  },
];

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroUIRef = useRef<HTMLDivElement>(null);
  const dataUIRef = useRef<HTMLDivElement>(null);

  // Загруженные кадры
  const heroFrames = useRef<HTMLImageElement[]>([]);
  const transFrames = useRef<HTMLImageElement[]>([]);
  const dataFrames = useRef<HTMLImageElement[]>([]);
  const framesReady = useRef(false);

  // Прогресс загрузки для индикатора
  // const [loadProgress, setLoadProgress] = useState(0);
  // const [loaded, setLoaded] = useState(false);

  const loadProgress = useVisualStore((s) => s.loadProgress);
  const loaded = useVisualStore((s) => s.loadingStage === 'ready');

  // Scroll / phase state
  const phase = useRef<'hero' | 'transition' | 'data'>('hero');
  const transP = useRef(0); // 0..1 прогресс transition
  const heroP = useRef(0); // текущий кадр hero (float для плавного инкремента)
  const dataP = useRef(0); // текущий кадр data
  const hintRef = useRef<HTMLDivElement>(null);
  const chevronRefs = useRef<(SVGSVGElement | null)[]>([null, null, null]);

  // Инерция
  const velocity = useRef(0);
  const lastScrollY = useRef(0);
  const inertiaRaf = useRef(0);
  const scrollDir = useRef<'down' | 'up'>('down');

  const pendY = useRef(0);
  const rafPend = useRef(false);
  const lastT = useRef(0);
  const pts = useRef<Particle[]>([]);
  const geo = useRef({ W: 0, H: 0, heroHold: 0, transLen: 0 });

  // ── Setup ──────────────────────────────────────────────────────────────────
  const setup = useCallback(() => {
    const W = window.innerWidth,
      H = window.innerHeight;
    const heroHold = H * HERO_VH,
      transLen = H * TRANS_VH;
    geo.current = { W, H, heroHold, transLen };
    if (rootRef.current)
      rootRef.current.style.height = heroHold + transLen + H * DATA_VH + 'px';
    const c = canvasRef.current;
    if (c) {
      c.width = W;
      c.height = H;
    }
    const p: Particle[] = [];
    for (let i = 0; i < 280; i++)
      p.push({
        x: Math.random() * W,
        y: Math.random() * H,
        sz: Math.random() * 1.6 + 0.2,
        vy: -(Math.random() * 0.024 + 0.006),
        vx: (Math.random() - 0.5) * 0.007,
        hue: Math.random() * 55 + 15,
        bright: Math.random() * 0.55 + 0.4,
      });
    pts.current = p;
  }, []);

  // ── Загрузка кадров ────────────────────────────────────────────────────────
  // const loadFrames = useCallback(async () => {
  //   const total = HERO_FRAMES + TRANSITION_FRAMES + DATA_FRAMES;
  //   let done = 0;

  //   const load = (src: string): Promise<HTMLImageElement> =>
  //     new Promise((res) => {
  //       const img = new Image();
  //       img.onload = () => {
  //         done++;
  //         setLoadProgress(Math.round((done / total) * 100));
  //         res(img);
  //       };
  //       img.onerror = () => {
  //         done++;
  //         res(img);
  //       }; // пропускаем битые кадры
  //       img.src = src;
  //     });

  //   // Загружаем параллельно батчами по 20 чтобы не вешать сеть
  //   const batch = async (srcs: string[]): Promise<HTMLImageElement[]> => {
  //     const results: HTMLImageElement[] = [];
  //     for (let i = 0; i < srcs.length; i += 20) {
  //       const chunk = srcs.slice(i, i + 20);
  //       results.push(...(await Promise.all(chunk.map(load))));
  //     }
  //     return results;
  //   };

  //   const [h, t, d] = await Promise.all([
  //     batch(
  //       Array.from({ length: HERO_FRAMES }, (_, i) => framePath('hero', i + 1))
  //     ),
  //     batch(
  //       Array.from({ length: TRANSITION_FRAMES }, (_, i) =>
  //         framePath('transition', i + 1)
  //       )
  //     ),
  //     batch(
  //       Array.from({ length: DATA_FRAMES }, (_, i) => framePath('data', i + 1))
  //     ),
  //   ]);

  //   heroFrames.current = h;
  //   transFrames.current = t;
  //   dataFrames.current = d;
  //   framesReady.current = true;
  //   setLoaded(true);
  // }, []);

  const snapActive = useRef(false);

  // ── Auto Snap ───────────────────────────────────────────────────────────
  const autoSnap = useCallback((heroHold: number, transLen: number) => {
    if (snapActive.current) return; // уже тянем, не запускаем повторно
    snapActive.current = true;
    cancelAnimationFrame(inertiaRaf.current); // убиваем инерцию перед snap

    const target = heroHold + transLen; // конечная позиция = начало data секции
    const duration = 4000; // ms на дотяжку

    const start = window.scrollY;
    const startTime = performance.now();

    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t); // ease-in-out quad

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = ease(progress);

      window.scrollTo(0, start + (target - start) * eased);

      if (progress < 1) {
        if (scrollDir.current === 'up') {
          snapActive.current = false;
          return;
        }
        requestAnimationFrame(tick);
      } else {
        snapActive.current = false;
      }
    };

    requestAnimationFrame(tick);
  }, []);

  const updateHint = (t: number) => {
    const el = hintRef.current;
    if (!el) return;
    const rise = t < 0.72 ? t / 0.72 : 1;
    const fly = t > 0.72 ? (t - 0.72) / 0.28 : 0;

    if (t <= 0) {
      // Idle — на месте
      chevronRefs.current.forEach((r) => {
        if (!r) return;
        r.style.animationDuration = '2s';
        r.style.transform = 'translateY(0)';
        r.style.opacity = '1';
        r.querySelector('polyline')?.setAttribute(
          'stroke',
          'rgb(255, 255, 255)'
        );
      });
      const span = el.querySelector('span');
      if (span) {
        span.style.letterSpacing = '.44em';
        span.style.opacity = '1';
      }
      el.style.transform = 'translateX(-50%) translateY(0px)';
      el.style.opacity = '1';
      el.style.letterSpacing = '.44em';
      el.style.scale = '1';
    } else if (t < 0.72) {
      // Tension — тянется вверх пропорционально прогрессу
      chevronRefs.current.forEach((r, i) => {
        if (!r) return;
        // Ускоряем анимацию и увеличиваем яркость пропорционально
        const speed = 1 - rise * 0.6; // от 1s до 0.4s
        const bright = 0.3 + rise * 0.5;
        r.style.animationDuration = `${speed}s`;
        r.querySelector('polyline')?.setAttribute(
          'stroke',
          `rgba(255,255,255,${bright})`
        );
        // Смещаем вниз пропорционально индексу — эффект растяжения
        // Раздвигаем в стороны + вниз — эффект расхождения
        const side = (i - 1) * rise * 12; // левый летит влево, правый вправо, средний на месте
        r.style.transform = `translateX(${side}px) translateY(${rise * (i + 1) * 4}px) scaleX(${1 + rise * 0.3})`;
        r.style.opacity = String(0.3 + rise * 0.6);
      });
      const yUp = rise * 350; // px вверх от низа
      const sc = 1 + rise * 0.3; // лёгкое растяжение
      const op = 1 - rise * 0.2; // чуть тускнеет

      el.style.transform = `translateX(-50%) translateY(-${yUp}px)`;
      el.style.opacity = String(op);
      el.style.scale = `${sc}`;
      const span = el.querySelector('span');
      if (span) {
        span.style.letterSpacing = `${0.44 + rise * 1.2}em`;
        span.style.opacity = String(1 + rise * 0.6);
      }
    } else {
      // Release — улетает вверх и исчезает
      chevronRefs.current.forEach((r) => {
        if (!r) return;
        r.style.opacity = String(Math.max(0, 1 - fly * 3));
      });
      const yUp = 350 + fly * 300;
      const op = Math.max(0, 0.7 - fly * 1.4);

      el.style.transform = `translateX(-50%) translateY(-${yUp}px)`;
      el.style.opacity = String(op);
    }
  };
  // ── Apply scroll ───────────────────────────────────────────────────────────
  const applyScroll = useCallback((y: number) => {
    const { H, heroHold, transLen } = geo.current;

    const totalScroll = heroHold + transLen + H * DATA_VH;
    useVisualStore.getState().setScrollProgress(y / totalScroll);

    let hA = 1,
      dA = 0;

    if (scrollDir.current === 'up') {
      snapActive.current = false;
    }
    if (y < heroHold) {
      const { videoElements } = useVisualStore.getState();
      if (videoElements.hero?.paused) videoElements.hero.play().catch(() => {});
      phase.current = 'hero';
      transP.current = 0;
      updateHint(0);
      const fs = heroHold * 0.85;
      hA = y < fs ? 1 : 1 - (y - fs) / (heroHold * 8.2);
      dA = 0;
      if (videoElements.data && !videoElements.data.paused) videoElements.data.pause();
    } else if (y < heroHold + transLen) {
      const t = (y - heroHold) / transLen;
      // Автодотяжка: после точки разрыва (t > 0) берём управление на себя
      if (t > 0 && t < 1.0 && scrollDir.current === 'down') {
        autoSnap(heroHold, transLen);
      }
      phase.current = 'transition';
      transP.current = t;
      updateHint(t);
      hA = 0;
      dA = t > 0.75 ? (t - 0.75) / 0.25 : 0;
    } else {
      phase.current = 'data';
      transP.current = 1;
      hA = 0;
      dA = 1;
      const { videoElements } = useVisualStore.getState();
      if (videoElements.data?.paused) videoElements.data.play().catch(() => {});
      if (videoElements.hero && !videoElements.hero.paused) videoElements.hero.pause();
    }

    const hu = heroUIRef.current,
      du = dataUIRef.current;
    if (hu) hu.style.opacity = String(Math.max(0, Math.min(1, hA)));
    if (du) du.style.opacity = String(Math.max(0, Math.min(1, dA)));
  }, []);

  // ── Инерция ────────────────────────────────────────────────────────────────
  const runInertia = useCallback(() => {
    if (Math.abs(velocity.current) < 0.8) return;
    velocity.current *= INERTIA_DECAY;
    window.scrollBy(0, velocity.current);
    inertiaRaf.current = requestAnimationFrame(runInertia);
  }, []);

  // ── Render loop ────────────────────────────────────────────────────────────
  const render = useCallback((ts: number) => {
    const dt = Math.min(50, ts - lastT.current);
    lastT.current = ts;
    const c = canvasRef.current;
    if (!c) {
      requestAnimationFrame(render);
      return;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      requestAnimationFrame(render);
      return;
    }
    const { W, H } = geo.current,
      p = pts.current;

    // Advance particles
    for (const pt of p) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.y < -4) {
        pt.y = H + 4;
        pt.x = Math.random() * W;
      }
      if (pt.x < 0) pt.x = W;
      if (pt.x > W) pt.x = 0;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#00000a';
    ctx.fillRect(0, 0, W, H);

    const ph = phase.current,
      tp = transP.current;

    // if (useVisualStore.getState().loadingStage === 'ready') {
    //   // ── FRAME MODE ──────────────────────────────────────────────────────
    //   if (ph === 'hero') {
    //     // Зацикленный hero: инкремент ~25fps
    //     heroP.current += dt * 0.025;
    //     const idx = Math.floor(heroP.current % HERO_FRAMES);
    //     const img = heroFrames.current[idx];
    //     if (img?.complete) ctx.drawImage(img, 0, 0, W, H);
    //   } else if (ph === 'transition') {
    //     // Скраб по scroll position
    //     const idx = Math.min(
    //       Math.round(tp * (TRANSITION_FRAMES - 1)),
    //       TRANSITION_FRAMES - 1
    //     );
    //     const img = transFrames.current[idx];
    //     if (img?.complete) ctx.drawImage(img, 0, 0, W, H);

    //     // Ambient particles поверх
    //     particles(ctx, W, H, 0.25, p);
    //   } else {
    //     // Зацикленный data
    //     dataP.current += dt * 0.025;
    //     const idx = Math.floor(dataP.current % DATA_FRAMES);
    //     const img = dataFrames.current[idx];
    //     if (img?.complete) ctx.drawImage(img, 0, 0, W, H);
    //   }
    // } else {
    //   // ── FALLBACK: canvas заглушка пока кадры грузятся ──────────────────
    //   if (ph === 'hero' || (ph === 'transition' && tp < 0.5)) {
    //     chromatic(ctx, W, H, 1, ts);
    //     particles(ctx, W, H, 1, p);
    //     horizLine(ctx, W, H, 1, ts);
    //   } else {
    //     grid(ctx, W, H, 1, ts);
    //     chromatic(ctx, W, H, 0.38, ts);
    //     particles(ctx, W, H, 0.44, p);
    //     horizLine(ctx, W, H, 1.1, ts);
    //   }
    // }

    if (useVisualStore.getState().loadingStage === 'ready') {
      const { videoElements, transitionFrames } = useVisualStore.getState();

      if (ph === 'hero') {
        const vid = videoElements.hero;
        if (vid && vid.readyState >= 2) ctx.drawImage(vid, 0, 0, W, H);
      } else if (ph === 'transition') {
        const idx = Math.min(Math.round(tp * (TRANSITION_FRAMES - 1)), TRANSITION_FRAMES - 1);
        const img = transitionFrames[idx];  // ← из стора, не из локального ref
        if (img?.complete) ctx.drawImage(img, 0, 0, W, H);
        particles(ctx, W, H, 0.25, p);
      } else {
        const vid = videoElements.data;
        if (vid && vid.readyState >= 2) ctx.drawImage(vid, 0, 0, W, H);
      }
    }

    // Горизонтальный градиент сверху/снизу
    const tg = ctx.createLinearGradient(0, 0, 0, H);
    tg.addColorStop(0, 'rgba(0,0,10,0.55)');
    tg.addColorStop(0.12, 'transparent');
    tg.addColorStop(0.88, 'transparent');
    tg.addColorStop(1, 'rgba(0,0,10,0.65)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(render);
  }, []);

  // ── Mount ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setup();
    applyScroll(window.scrollY);
    requestAnimationFrame(render);
    initGlobalLoading();

    const onScroll = () => {
      // Инерция
      const currentY = window.scrollY;
      const diff = currentY - lastScrollY.current;
      velocity.current = diff;
      scrollDir.current =
        diff > 0 ? 'down' : diff < 0 ? 'up' : scrollDir.current;
      lastScrollY.current = currentY;

      pendY.current = window.scrollY;
      if (!rafPend.current) {
        rafPend.current = true;
        requestAnimationFrame(() => {
          rafPend.current = false;
          applyScroll(pendY.current);
        });
      }
    };

    const onScrollEnd = () => {
      cancelAnimationFrame(inertiaRaf.current);
      runInertia();
    };
    const onWheel = (e: WheelEvent) => {
      if (snapActive.current) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (snapActive.current) e.preventDefault();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onScrollEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('resize', setup);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
      window.removeEventListener('resize', setup);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onTouchMove);
      cancelAnimationFrame(inertiaRaf.current);
    };
  }, [setup, applyScroll, render, runInertia]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100dvh',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {/* Canvas — единственный визуальный слой */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Загрузчик — виден пока кадры не готовы */}
        {!loaded && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 30,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: 180,
                height: 1,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: loadProgress + '%',
                  background:
                    'linear-gradient(90deg,rgba(0,255,136,.4),#00ff88)',
                  transition: 'width 0.1s linear',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-geist-mono,monospace)',
                fontSize: 9,
                letterSpacing: '.38em',
                color: 'rgba(255,255,255,.2)',
                textTransform: 'uppercase',
              }}
            >
              {loadProgress}%
            </span>
          </div>
        )}

        {/* ── HERO UI ── */}
        <div
          ref={heroUIRef}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            pointerEvents: 'none',
            opacity: 1,
            willChange: 'opacity',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-geist-mono,monospace)',
                fontSize: 10,
                letterSpacing: '.46em',
                color: 'rgba(251, 255, 0, 0.64)',
                textTransform: 'uppercase',
                marginBottom: 22,
                animation: 'slideUp .9s ease both',
              }}
            >
              Distributed Proxy Infrastructure
            </p>
            <h1
              style={{
                fontFamily: 'var(--font-syne,sans-serif)',
                fontSize: 'clamp(62px,10.5vw,148px)',
                fontWeight: 800,
                lineHeight: 0.87,
                letterSpacing: '-.026em',
                color: '#fff',
                textTransform: 'uppercase',
                marginBottom: 28,
                textShadow:
                  '3px 0 0 rgba(0,255,136,.16),-3px 0 0 rgba(56,189,248,.11)',
                animation: 'slideUp .9s ease .1s both',
              }}
            >
              NODE
              <br />
              ACCESS
              <br />
              LAYER
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-geist-mono,monospace)',
                fontSize: 11,
                letterSpacing: '.26em',
                color: 'rgba(255, 255, 255, 0.8)',
                textTransform: 'uppercase',
                marginBottom: 40,
                animation: 'slideUp .9s ease .2s both',
              }}
            >
              VLESS · Reality · gRPC · NRWX
            </p>
            <a
              href="/dashboard"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 30px',
                border: '1px solid rgba(255, 221, 0, 0.26)',
                borderRadius: 2,
                fontFamily: 'var(--font-geist-mono,monospace)',
                fontSize: 11,
                letterSpacing: '.26em',
                color: '#ffee00',
                textTransform: 'uppercase',
                textDecoration: 'none',
                background: 'rgba(255, 255, 0, 0.11)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                animation: 'slideUp .9s ease .3s both',
              }}
            >
              Enter Portal →
            </a>
          </div>
        </div>

        {/* Scroll hint — три шеврона */}
        <div
          ref={hintRef}
          style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            opacity: 1,
            willChange: 'transform, opacity',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-geist-mono,monospace)',
              fontSize: 9,
              letterSpacing: '.44em',
              color: 'rgb(255, 255, 255)',
              textTransform: 'uppercase',
              marginBottom: 6,
              transition: 'letter-spacing 0.3s ease',
            }}
          >
            Scroll
          </span>
          {[0, 1, 2].map((i) => (
            <svg
              key={i}
              width="18"
              height="10"
              viewBox="0 0 18 10"
              fill="none"
              style={{
                opacity: 0.25 + i * 0.15,
                animation: `chevronFloat 2.4s ease-in-out ${i * 0.18}s infinite`,
                transform: `translateY(${i * 2}px)`,
              }}
            >
              <polyline
                points="1,1 9,9 17,1"
                stroke="rgb(255, 255, 255)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>

        {/* ── DATA UI ── */}
        <div
          ref={dataUIRef}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            opacity: 0,
            pointerEvents: 'none',
            willChange: 'opacity',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '64px 36px 52px',
            gap: 40,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontFamily: 'var(--font-geist-mono,monospace)',
                fontSize: 10,
                letterSpacing: '.44em',
                color: 'rgba(56, 191, 248, 0.81)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              System Architecture
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-syne,sans-serif)',
                fontSize: 'clamp(32px,4.5vw,60px)',
                fontWeight: 800,
                letterSpacing: '-.025em',
                textTransform: 'uppercase',
                color: '#fff',
                textShadow:
                  '2px 0 0 rgba(56,189,248,.1),-2px 0 0 rgba(0,255,136,.08)',
              }}
            >
              Capabilities
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 8,
              width: '100%',
              maxWidth: 900,
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: '17px 19px',
                  border: '1px solid rgba(255,255,255,.065)',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,.03)',
                  backdropFilter: 'blur(18px)',
                  WebkitBackdropFilter: 'blur(18px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  pointerEvents: 'auto',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono,monospace)',
                    fontSize: 9,
                    letterSpacing: '.3em',
                    color: 'rgba(255,255,255,.17)',
                  }}
                >
                  {f.n}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-syne,sans-serif)',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,.8)',
                  }}
                >
                  {f.t}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono,monospace)',
                    fontSize: 10,
                    lineHeight: 1.55,
                    color: 'rgba(255,255,255,.26)',
                    fontStyle: 'italic',
                    marginTop: 2,
                  }}
                >
                  {f.d}
                </span>
              </div>
            ))}
          </div>

          <a
            href="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 36px',
              background: '#009dff',
              color: '#000',
              fontFamily: 'var(--font-geist-mono,monospace)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '.22em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              borderRadius: 2,
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
          >
            Request Access →
          </a>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 24,
            zIndex: 20,
            fontSize: 18,
            color: 'rgba(255,255,255,.42)',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          ✦
        </div>
      </div>
    </div>
  );
}

// ── Canvas fallback drawing (пока кадры грузятся) ─────────────────────────────
function chromatic(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  a: number,
  ts: number
) {
  if (a < 0.03) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const cy = H * 0.5,
    r = W * 0.38;
  const spec: Array<[number, number, number]> = [
    [0, 100, 66],
    [28, 100, 70],
    [54, 100, 72],
    [128, 95, 62],
    [184, 100, 64],
    [215, 100, 64],
    [258, 82, 59],
    [295, 88, 62],
  ];
  const side = (bx: number) => {
    for (let i = 0; i < spec.length; i++) {
      const [h, s, l] = spec[i],
        ang = (i / spec.length) * Math.PI + ts * 0.00012;
      const ox = Math.cos(ang) * r * 0.22,
        oy = Math.sin(ang) * r * 0.28;
      const rr = r * (0.68 + 0.14 * Math.sin(ts * 0.00038 + i));
      const g = ctx.createRadialGradient(
        bx + ox,
        cy + oy,
        0,
        bx + ox,
        cy + oy,
        rr
      );
      const hh = (h + ts * 0.004) % 360;
      g.addColorStop(0, `hsla(${hh},${s}%,${l}%,${a * 0.19})`);
      g.addColorStop(0.45, `hsla(${(hh + 28) % 360},${s}%,${l}%,${a * 0.08})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const cg = ctx.createRadialGradient(bx, cy, 0, bx, cy, r * 0.22);
    cg.addColorStop(0, `rgba(255,255,255,${a * 0.2})`);
    cg.addColorStop(1, 'transparent');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);
  };
  side(-W * 0.07);
  side(W * 1.07);
  ctx.restore();
}
function particles(
  ctx: CanvasRenderingContext2D,
  W: number,
  _H: number,
  a: number,
  pts: Particle[]
) {
  if (a < 0.04) return;
  ctx.save();
  for (const p of pts) {
    const cd = Math.abs(p.x / W - 0.5) * 2;
    if (cd < 0.13) continue;
    const ef = Math.min(1, (cd - 0.13) / 0.15);
    ctx.globalAlpha = a * p.bright * ef * 0.65;
    ctx.fillStyle = `hsl(${p.hue},62%,82%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.sz, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}
function horizLine(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  a: number,
  ts: number
) {
  if (a < 0.04) return;
  const cy = H * 0.5,
    pp = 0.7 + Math.sin(ts * 0.0025) * 0.3;
  ctx.save();
  const lg = ctx.createLinearGradient(0, cy, W, cy);
  lg.addColorStop(0, 'transparent');
  lg.addColorStop(0.1, `rgba(255,255,255,${a * 0.38 * pp})`);
  lg.addColorStop(0.5, `rgba(255,255,255,${a * 0.82 * pp})`);
  lg.addColorStop(0.9, `rgba(255,255,255,${a * 0.38 * pp})`);
  lg.addColorStop(1, 'transparent');
  ctx.strokeStyle = lg;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(W, cy);
  ctx.stroke();
  ctx.restore();
}
function grid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  a: number,
  ts: number
) {
  if (a < 0.02) return;
  const cx = W * 0.5,
    cy = H * 0.5,
    breathe = Math.sin(ts * 0.0008) * 0.013;
  ctx.save();
  ctx.strokeStyle = `rgba(188,208,242,${a * 0.2})`;
  ctx.lineWidth = 0.6;
  for (let i = 0; i <= 24; i++) {
    const ny = ((i / 24) * H - cy) / cy;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 5) {
      const nx = (x - cx) / cx,
        bulge = (1 - Math.abs(ny)) * nx * nx * 0.4;
      const yd = cy + ny * cy * (1 + bulge + breathe);
      x === 0 ? ctx.moveTo(x, yd) : ctx.lineTo(x, yd);
    }
    ctx.stroke();
  }
  for (let i = 0; i <= 18; i++) {
    const nx = ((i / 18) * W - cx) / cx;
    ctx.beginPath();
    for (let y = 0; y <= H; y += 5) {
      const ny = (y - cy) / cy,
        xd = cx + nx * (1 - Math.abs(ny) * 0.58 + breathe) * cx;
      y === 0 ? ctx.moveTo(xd, y) : ctx.lineTo(xd, y);
    }
    ctx.stroke();
  }
  const lg = ctx.createLinearGradient(0, cy, W, cy);
  lg.addColorStop(0, 'transparent');
  lg.addColorStop(0.1, `rgba(220,235,255,${a * 0.58})`);
  lg.addColorStop(0.5, `rgba(255,255,255,${a})`);
  lg.addColorStop(0.9, `rgba(220,235,255,${a * 0.58})`);
  lg.addColorStop(1, 'transparent');
  ctx.strokeStyle = lg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(W, cy);
  ctx.stroke();
  const sl = ctx.createLinearGradient(0, cy - 24, 0, cy + 24);
  sl.addColorStop(0, 'transparent');
  sl.addColorStop(0.5, `rgba(200,220,255,${a * 0.06})`);
  sl.addColorStop(1, 'transparent');
  ctx.fillStyle = sl;
  ctx.fillRect(0, cy - 24, W, 48);
  ctx.restore();
}
