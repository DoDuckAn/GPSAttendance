'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useState } from 'react';

const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/rooms', label: 'Rooms' },
  { href: '/admin/logs', label: 'Logs' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/algorithm-test', label: '🧪 Algo Test' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Admin Navigation */}
      <nav className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/admin" className="font-bold text-gray-900 dark:text-white text-base shrink-0">
              🔬 Admin Panel
            </Link>

            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-1">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="hidden sm:block text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                ← Client View
              </Link>
              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="sm:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200"
                aria-label="Toggle navigation menu"
              >
                {menuOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="sm:hidden border-t border-gray-100 dark:border-gray-800 py-2 space-y-0.5">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 active:bg-gray-100"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 rounded-md text-sm font-medium text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-800"
              >
                ← Client View
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">{children}</main>
    </div>
  );
}
