'use client';
import { useEffect, useRef } from 'react';
import { useVisualStore } from '@/store/use-visual-store';
import { initGlobalLoading } from '@/lib/visual-orchestrator';
import BackgroundPlayer from '@/components/layout/background-player';

export default function ClientShell() {
  useEffect(() => {
    initGlobalLoading();
  }, []);

  return (
    <>
      <BackgroundPlayer />
    </>
  );
}