import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { DEFAULT_THEME, themeInitScript } from '@/lib/theme/constants'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shopee Affiliate Report',
  description: 'Track and manage Shopee affiliate commission',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-theme={DEFAULT_THEME}>
      <head>
        {/* Blocking, pre-paint: overrides data-theme from localStorage to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.className} bg-page text-ink min-h-screen`}>
        <ThemeProvider>
          <ToastProvider>
            <nav className="border-b border-line px-6 py-4 flex items-center gap-6">
              <Link href="/" className="text-lg font-bold text-accent">
                📊 Shopee Affiliate
              </Link>
              <Link href="/" className="text-sm text-muted hover:text-ink">Reports</Link>
              <Link href="/clients" className="text-sm text-muted hover:text-ink">Clients</Link>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </nav>
            <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
