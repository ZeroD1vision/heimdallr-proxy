'use client';
import { useEffect } from 'react';
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