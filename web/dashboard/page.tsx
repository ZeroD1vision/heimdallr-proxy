'use client'
// app/page.tsx
// Точка входа. Управляет состоянием аутентификации и видео-секциями.
// Всё выше auth gate — только видео и минимальный UI.

import { useCallback, useEffect, useState } from 'react'
import { tokenStore } from '@/lib/api'
import { useVideoBackground } from '@/hooks/useVideoBackground'
import VideoBackground from '@/components/VideoBackground'
import AuthGate from '@/components/AuthGate'
import Dashboard from '@/components/Dashboard'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hydrated,        setHydrated]        = useState(false)

  const { videoRef, currentSection, setSection, progress } = useVideoBackground('hero')

  // Избегаем hydration mismatch: localStorage недоступен на сервере
  useEffect(() => {
    setHydrated(true)
    const token = tokenStore.get()
    if (token) {
      setIsAuthenticated(true)
      setSection('data')
    }
  }, [setSection])

  const handleAuthenticated = useCallback(() => {
    setIsAuthenticated(true)
    setSection('transition')
    // После transition → data
    setTimeout(() => setSection('data'), 8_000)
  }, [setSection])

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false)
    setSection('hero')
  }, [setSection])

  // До hydration — пустой экран (нет flash несовпадения разметки)
  if (!hydrated) {
    return (
      <>
        <VideoBackground ref={videoRef} section={currentSection} />
        <div className="flex min-h-screen items-center justify-center">
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse-slow"
            style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <VideoBackground ref={videoRef} section={currentSection} />

      {isAuthenticated ? (
        <Dashboard
          setSection={setSection}
          onLogout={handleLogout}
          videoProgress={progress}
          currentSection={currentSection}
        />
      ) : (
        <AuthGate onAuthenticated={handleAuthenticated} />
      )}
    </>
  )
}
