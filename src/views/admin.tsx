'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Shield, Lock, Eye, EyeOff, LogOut, Zap, AlertCircle, Loader2, Fingerprint, Clock, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AdminDashboard } from '@/views/admin/dashboard'
import { AdminChannels } from '@/views/admin/channels'
import { AdminMatches } from '@/views/admin/matches'
import { AdminCategories } from '@/views/admin/categories'
import { AdminSettings } from '@/views/admin/settings'

const adminTabs = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: '📊' },
  { id: 'channels' as const, label: 'Channels', icon: '📺' },
  { id: 'matches' as const, label: 'Matches', icon: '🏆' },
  { id: 'categories' as const, label: 'Categories', icon: '📁' },
  { id: 'settings' as const, label: 'Settings', icon: '⚙️' },
]

export function AdminPage() {
  const { isAdminAuth, setIsAdminAuth, adminPage, setAdminPage } = useAppStore()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [currentTime, setCurrentTime] = useState('')

  // Update clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Check server-side session on mount
  const verifySession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/verify')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          setIsAdminAuth(true)
        }
      }
    } catch {
      // Network error — ignore
    } finally {
      setVerifying(false)
    }
  }, [setIsAdminAuth])

  useEffect(() => {
    verifySession()
  }, [verifySession])

  // Auto-logout on session expiry - listen for 401s from API calls
  useEffect(() => {
    if (!isAdminAuth) return

    const handleApiError = (event: CustomEvent) => {
      if (event.detail?.status === 401) {
        setIsAdminAuth(false)
      }
    }

    window.addEventListener('admin:unauthorized' as string, handleApiError as EventListener)
    return () => window.removeEventListener('admin:unauthorized' as string, handleApiError as EventListener)
  }, [isAdminAuth, setIsAdminAuth])

  const handleLogin = async () => {
    if (!password.trim()) {
      setError('Please enter the admin password')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setIsAdminAuth(true)
        setPassword('')
        setError('')
        setFailedAttempts(0)
      } else {
        setFailedAttempts(prev => prev + 1)
        setShakeKey(prev => prev + 1)
        if (failedAttempts >= 4) {
          setError('Too many failed attempts. Please wait before trying again.')
        } else {
          setError(data.error || 'Invalid password. Try again.')
        }
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore network errors on logout
    }
    setIsAdminAuth(false)
  }

  // Loading state — verifying session
  if (verifying) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Loader2 className="h-3 w-3 animate-spin text-primary-foreground" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Verifying session...</p>
        </div>
      </div>
    )
  }

  // Login screen
  if (!isAdminAuth) {
    const isRateLimited = failedAttempts >= 5

    return (
      <div className="flex items-center justify-center min-h-[80vh] p-4">
        <div className="w-full max-w-[380px]">
          {/* Header with brand */}
          <div className="text-center mb-8">
            {/* Animated logo */}
            <div className="relative mx-auto w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/30 via-primary/15 to-primary/5 animate-pulse" />
              <div className="absolute inset-1 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center backdrop-blur-sm">
                <Zap className="h-10 w-10 text-primary" />
              </div>
              {/* Glow effect */}
              <div className="absolute -inset-2 rounded-3xl bg-primary/5 blur-xl" />
            </div>
            <h1 className="text-3xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">GenZ</span>
              <span className="text-muted-foreground font-light"> TV</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">Admin Control Panel</p>
          </div>

          {/* Login Card */}
          <div
            key={shakeKey}
            className="rounded-2xl border border-border/80 bg-card/95 backdrop-blur-sm p-6 shadow-2xl shadow-black/10 animate-fade-slide"
          >
            {/* Card header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                <Fingerprint className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight">Secure Login</h2>
                <p className="text-[11px] text-muted-foreground">Authenticate to access admin panel</p>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mb-5" />

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter admin password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && !isRateLimited && handleLogin()}
                    className="pl-9 pr-10 h-12 text-sm border-border/80 focus:border-primary/50 transition-all"
                    autoFocus
                    disabled={loading || isRateLimited}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2.5 text-destructive text-xs bg-destructive/10 border border-destructive/20 px-3.5 py-2.5 rounded-xl">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* Rate limit warning */}
              {isRateLimited && (
                <div className="text-center text-xs text-muted-foreground bg-secondary/50 px-3 py-2 rounded-lg">
                  Too many failed attempts. Please refresh the page and try again later.
                </div>
              )}

              {/* Login button */}
              <Button
                onClick={handleLogin}
                disabled={loading || !password.trim() || isRateLimited}
                className="w-full h-12 btn-press font-bold gap-2.5 text-sm rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    Access Dashboard
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {/* Session info */}
            <div className="mt-5 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Secure connection</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>Session: 24h</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 space-y-2">
            <p className="text-[10px] text-muted-foreground">
              Protected by server-side authentication • httpOnly cookies
            </p>
            {currentTime && (
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {currentTime}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Admin panel
  const renderAdminContent = () => {
    switch (adminPage) {
      case 'dashboard':
        return <AdminDashboard />
      case 'channels':
        return <AdminChannels />
      case 'matches':
        return <AdminMatches />
      case 'categories':
        return <AdminCategories />
      case 'settings':
        return <AdminSettings />
      default:
        return <AdminDashboard />
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-[10px] text-muted-foreground">Authenticated session active</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </Button>
      </div>

      {/* Admin Tabs */}
      <div className="flex gap-2 overflow-x-auto scroll-row pb-2">
        {adminTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAdminPage(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all btn-press ${
              adminPage === tab.id
                ? 'bg-foreground text-background'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {renderAdminContent()}
    </div>
  )
}
