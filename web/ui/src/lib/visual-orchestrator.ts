import { useVisualStore } from '@/store/use-visual-store';
import { use } from 'react';

// ── Конфиг ────────────────────────────────────────────────────────────────────
const TRANSITION_FRAMES = 192;
const FRAME_PATH = (n: number) =>
  `/assets/frames/transition/frame_${String(n).padStart(4, '0')}.jpg`;

// Выбираем качество видео по connection (если API доступен)
function videoPath(section: 'hero' | 'data'): string {
  const conn = (navigator as any).connection;
  const slow = conn && (conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === '3g');
  const res = slow ? '720' : '720'; // На самом деле на 4к просто все лагает дико так что пока что 720
  return `/assets/videos/${res}/${section}_section_animation_${res}.mp4`;
}

// Создаем кэш вне функции, чтобы он никогда не пересоздавался
const videoCache: Record<string, HTMLVideoElement> = {};
// ── loadVideo ─────────────────────────────────────────────────────────────────
// Грузим видео и трекаем прогресс через buffered API
function loadVideo(
  section: 'hero' | 'data',
  onProgress: (pct: number) => void
): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(`vid-cache-${section}`) as HTMLVideoElement;
    if (existing) {
      onProgress(1);
      return resolve(existing);
    }

    const video = document.createElement('video');
    video.id = `vid-cache-${section}`;
    video.src = videoPath(section);
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    video.onprogress = () => {
      if (video.duration && video.buffered.length > 0) {
        const buffered = video.buffered.end(video.buffered.length - 1);
        onProgress(Math.min(buffered / video.duration, 1));
      }
    };

    video.oncanplaythrough = () => resolve(video);

    // Fallback: если браузер не стреляет canplaythrough (редко но бывает)
    video.onloadeddata = () => {
      if (video.readyState >= 3) resolve(video);
    };

    video.onerror = () => reject(new Error(`Failed to load video: ${section}`));
    video.load();
  });
}

// ── loadTransitionFrames ───────────────────────────────────────────────────────
// Батч по 20 — не вешаем сеть, трекаем каждый кадр
function loadTransitionFrames(
  onProgress: (pct: number) => void
): Promise<HTMLImageElement[]> {
  const total = TRANSITION_FRAMES;
  let done = 0;

  const loadOne = (src: string): Promise<HTMLImageElement> =>
    new Promise((res) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        done++;
        onProgress(done / total);
        res(img);
      };
      img.src = src;
    });

  const srcs = Array.from({ length: total }, (_, i) => FRAME_PATH(i + 1));

  return (async () => {
    const results: HTMLImageElement[] = [];
    for (let i = 0; i < srcs.length; i += 20) {
      results.push(...(await Promise.all(srcs.slice(i, i + 20).map(loadOne))));
    }
    return results;
  })();
}

// ── initGlobalLoading ─────────────────────────────────────────────────────────
// Главная точка входа — вызывается один раз при монтировании приложения
// Если видео/кадры уже в сторе (возврат с /auth) — пропускаем загрузку
export async function initGlobalLoading() {
  const store = useVisualStore.getState();

  // Кеш-проверка: если всё уже загружено — ничего не делаем
  if (
    store.videoElements.hero &&
    store.videoElements.data &&
    store.transitionFrames.length > 0
  ) {
    store.setLoadingStage('ready');
    store.setLoadProgress(100);
    return;
  }

  // Веса для суммарного прогресса: hero 25% + transition 55% + data 20%
  // Потом подкрутим под реальные размеры файлов
  const W = { hero: 0.25, transition: 0.55, data: 0.20 };
  let heroP = 0, transP = 0, dataP = 0;

  const pushProgress = () => {
    const total = heroP * W.hero + transP * W.transition + dataP * W.data;
    store.setLoadProgress(Math.round(total * 100));
  };

  // ── Фаза 1: Hero видео ────────────────────────────────────────────────────
  store.setLoadingStage('hero');
  let heroVideo = store.videoElements.hero;

  // Если hero уже кешировано — пропускаем
  // Браузер (низший уровень) — качает байты видео и постоянно дергает событие onprogress.
  // loadVideo (средний уровень) — ловит эти байты, пересчитывает их в проценты и вызывает ту функцию, которую в него передали под именем onProgress.
  // Стрелочная функция (p) => { ... } (...) принимает процент p и тут же пинает pushProgress().
  // pushProgress() (высший уровень) — собирает данные от всех видео сразу, суммирует их и говорит Zustand-стору обновить прогресс бар.
  if (!store.videoElements.hero) {
    heroVideo = await loadVideo('hero', (p) => {
      heroP = p;
      pushProgress();
    });
    store.setVideoElement('hero', heroVideo);
  }
  heroP = 1;
  pushProgress();

  // ── Фаза 2: Transition кадры ──────────────────────────────────────────────
  store.setLoadingStage('transition');

  if (store.transitionFrames.length === 0) {
    const frames = await loadTransitionFrames((p) => {
      transP = p;
      pushProgress();
    });
    store.setTransitionFrames(frames);
  }
  transP = 1;
  pushProgress();

  // ── Фаза 3: Data видео ────────────────────────────────────────────────────
  store.setLoadingStage('data');

  if (!store.videoElements.data) {
    const dataVideo = await loadVideo('data', (p) => {
      dataP = p;
      pushProgress();
    });
    store.setVideoElement('data', dataVideo);
  }
  dataP = 1;
  pushProgress();

  // ── Готово ────────────────────────────────────────────────────────────────
  store.setLoadingStage('ready');
  store.setLoadProgress(100);

  if (heroVideo) {
    heroVideo.play().catch(() => {});
  }
}