import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { ToastProvider } from '@/components/ui/Toast'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shopee Affiliate Report',
  description: 'Track and manage Shopee affiliate commission',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <ToastProvider>
          <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-orange-400 hover:text-orange-300">
              📊 Shopee Affiliate
            </Link>
            <Link href="/" className="text-sm text-gray-400 hover:text-white">Reports</Link>
            <Link href="/clients" className="text-sm text-gray-400 hover:text-white">Clients</Link>
          </nav>
          <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  )
}
