import type { Metadata } from 'next'
import { Syne } from 'next/font/google'
import { Geist_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'
import Navbar from '@/components/layout/navbar';
import Slider from '@/components/layout/scrollbar';
// Display font — угловатый, технический, запоминающийся
// const syne = Syne({
//   subsets:  ['latin'],
//   variable: '--font-syne',
//   display:  'swap',
// })

const syne = localFont({
  src: '../../public/fonts/syne-v24-latin-regular.woff2',
  variable: '--font-syne',
  display: 'swap',
})

// Mono font — для данных, меток, кодов
// const geistMono = Geist_Mono({
//   subsets:  ['latin'],
//   variable: '--font-geist-mono',
//   display:  'swap',
// })

const geistMono = localFont({
  src: '../../public/fonts/geist-mono-v4-latin-regular.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title:       'Heimdallr · Node Monitor',
  description: 'Distributed access node management system',
  // Запрещаем индексацию — это приватная панель
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${geistMono.variable} font-sans antialiased bg-black text-white`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;800&display=swap" rel="stylesheet"></link>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;800&family=Space+Grotesque:wght@300;700&display=swap" rel="stylesheet"></link>
      </head>
      <body className="bg-void text-white antialiased">
        <Navbar />
        <Slider />
        {children}
      </body>
    </html>
  )
}
