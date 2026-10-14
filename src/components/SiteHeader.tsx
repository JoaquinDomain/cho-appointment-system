'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, House, ShieldCheck, LogIn } from 'lucide-react'

const LINK_CLASS =
  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-semibold text-ink hover:bg-soft hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'

export default function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative z-40 bg-white border-b border-line">
      <div className="w-full px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Image
            src="/cho-logo.png"
            alt=""
            aria-hidden="true"
            width={44}
            height={44}
            className="w-9 sm:w-11 h-auto shrink-0"
          />
          <span className="min-w-0 leading-tight text-left">
            <span className="block text-[13px] sm:text-[15px] font-bold text-navy truncate">
              City Health Office
            </span>
            <span className="block text-[11px] sm:text-xs text-muted">Bacolod City</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-haspopup="menu"
          className="shrink-0 w-11 h-11 -mr-1.5 inline-flex items-center justify-center rounded-xl text-navy hover:bg-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-navy/20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-4 sm:right-6 top-full z-50 mt-2 w-60 bg-white border border-line rounded-2xl shadow-xl shadow-navy/10 p-2 animate-fade-up"
          >
            <Link href="/" role="menuitem" className={LINK_CLASS} onClick={() => setOpen(false)}>
              <House className="w-4 h-4 text-brand" />
              Home
            </Link>
            <Link
              href="/privacy-policy"
              role="menuitem"
              className={LINK_CLASS}
              onClick={() => setOpen(false)}
            >
              <ShieldCheck className="w-4 h-4 text-brand" />
              Privacy Policy
            </Link>
            <Link
              href="/admin"
              role="menuitem"
              className={LINK_CLASS}
              onClick={() => setOpen(false)}
            >
              <LogIn className="w-4 h-4 text-brand" />
              CHO Staff Login
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
