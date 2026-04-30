import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

type Scene = 'landing' | 'auth';
type LoadingStage = 'hero' | 'transition' | 'data' | 'ready';

interface VisualState {
  scene: Scene;
  loadingStage: LoadingStage;
  loadProgress: number; // 0..100 — эфемерный но честный на глаз прогресс
  scrollProgress: number;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;

  // Только transition остаётся покадровым
  transitionFrames: HTMLImageElement[];

  // Hero и Data — видео-элементы (живут в памяти, переиспользуются как кеш)
  videoElements: {
    hero: HTMLVideoElement | null;
    data: HTMLVideoElement | null;
  };

  // Методы
  setScene: (scene: Scene) => void;
  setLoadingStage: (stage: LoadingStage) => void;
  setLoadProgress: (progress: number) => void;
  setScrollProgress: (progress: number) => void;
  setTransitionFrames: (frames: HTMLImageElement[]) => void;
  setVideoElement: (section: 'hero' | 'data', el: HTMLVideoElement) => void;
}

export const useVisualStore = create<VisualState>() (
  subscribeWithSelector((set) => ({
    scene: 'landing',
    loadingStage: 'hero',
    loadProgress: 0,
    scrollProgress: 0,
    transitionFrames: [],
    videoElements: { hero: null, data: null },
    sessionId: typeof window !== 'undefined' ? localStorage.getItem('h_session') : null,
    setSessionId: (id) => {
      if (id) localStorage.setItem('h_session', id);
      else localStorage.removeItem('h_session');
      set({ sessionId: id });
    },

    setScene: (scene) => set({ scene }),
    setLoadingStage: (stage) => set({ loadingStage: stage }),
    setLoadProgress: (loadProgress) => set({ loadProgress }),
    setScrollProgress: (scrollProgress) => set({ scrollProgress }),
    setTransitionFrames: (frames) => set({ transitionFrames: frames }),
    setVideoElement: (section, el) =>
      set((state) => ({
        videoElements: { ...state.videoElements, [section]: el },
      })),
    })
  )
);