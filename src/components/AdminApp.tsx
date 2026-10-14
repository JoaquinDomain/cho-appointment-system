'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ShieldCheck, QrCode, LayoutDashboard, LogOut, ArrowLeft } from 'lucide-react'
import AdminDashboard from '@/components/AdminDashboard'
import SiteQRPoster from '@/components/SiteQRPoster'

export default function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPoster, setShowPoster] = useState(false)

  // Session lives in an httpOnly cookie issued by /api/admin/login (MySQL-backed).
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/me', { credentials: 'same-origin' })
      .then((res) => {
        if (!cancelled) setIsAuthenticated(res.ok)
      })
      .catch(() => {
        if (!cancelled) setIsAuthenticated(false)
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? 'Failed to login.')
      }
      setIsAuthenticated(true)
    } catch (error) {
      console.error('Login error:', error)
      setError(error instanceof Error ? error.message : 'Failed to login. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    setIsAuthenticated(false)
    setEmail('')
    setPassword('')
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-navy via-hero to-navy flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/80" role="status" aria-label="Checking session" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-navy via-hero to-navy flex items-center justify-center p-4 overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-40" aria-hidden="true" />
        <div className="relative bg-white rounded-3xl shadow-2xl shadow-navy/30 p-6 sm:p-8 max-w-md w-full border border-line animate-fade-up">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink transition-colors mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-md px-1 py-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-brand flex items-center justify-center mb-4 shadow-lg shadow-brand/30">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy mb-1">CHO Admin Portal</h1>
            <p className="text-muted text-sm">City Health Office &middot; Bacolod City</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-[13px] font-semibold text-navy mb-1.5">Email</label>
              <input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-xl text-ink placeholder:text-faint bg-white outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20 text-base"
                placeholder="admin@cho.gov.ph"
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-[13px] font-semibold text-navy mb-1.5">Password</label>
              <input
                id="admin-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-xl text-ink placeholder:text-faint bg-white outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20 text-base"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-danger-surface border border-danger/30 rounded-xl" role="alert">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3.5 min-h-[48px] bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors disabled:bg-disabled disabled:text-disabled-text disabled:cursor-not-allowed font-bold text-base shadow-md shadow-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  Logging in…
                </span>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <ul className="mt-6 grid grid-cols-3 gap-2 text-center">
            {[
              { icon: QrCode, label: 'QR check-in' },
              { icon: LayoutDashboard, label: 'Daily quotas' },
              { icon: ShieldCheck, label: 'Records' },
            ].map(f => (
              <li key={f.label} className="rounded-xl bg-page border border-line px-2 py-2.5">
                <f.icon className="w-4 h-4 mx-auto text-brand" />
                <p className="text-[11px] font-semibold text-muted mt-1">{f.label}</p>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-center text-xs text-faint">
            Authorized CHO staff only
          </p>
          <p className="mt-1.5 text-center text-xs">
            <Link
              href="/privacy-policy"
              className="text-faint hover:text-muted underline-offset-2 hover:underline"
            >
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page">
      <div className="bg-navy text-white px-4 sm:px-6 py-3 sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight">CHO Admin Portal</h1>
              <p className="text-[11px] text-white/60 leading-tight">City Health Office &middot; Bacolod City</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPoster(!showPoster)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {showPoster ? <LayoutDashboard className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
              {showPoster ? 'Dashboard' : 'QR Poster'}
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 text-white text-sm font-medium rounded-xl hover:bg-white/20 transition-colors border border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {showPoster ? <SiteQRPoster /> : <AdminDashboard />}
    </div>
  )
}
