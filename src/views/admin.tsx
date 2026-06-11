'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Shield, Lock, Eye, EyeOff, LogOut, Zap, AlertCircle, Loader2 } from 'lucide-react'
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
      } else {
        setError(data.error || 'Invalid password. Try again.')
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
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying session...</p>
        </div>
      </div>
    )
  }

  // Login screen
  if (!isAdminAuth) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-4">
        <div className="w-full max-w-sm">
          {/* Logo & Brand */}
          <div className="text-center mb-8">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center mb-4 shadow-lg shadow-primary/5">
              <Zap className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-foreground">GenZ</span>
              <span className="text-muted-foreground"> TV</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Admin Control Panel</p>
          </div>

          {/* Login Card */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Admin Access</h2>
                <p className="text-[11px] text-muted-foreground">Enter password to continue</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
                  className="pl-9 pr-10 h-11"
                  autoFocus
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handleLogin}
                disabled={loading || !password.trim()}
                className="w-full h-11 btn-press font-semibold gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Login
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Footer hint */}
          <p className="text-center text-[10px] text-muted-foreground mt-4">
            Secure login • Session expires after 24 hours
          </p>
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
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-destructive hover:text-destructive gap-2"
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
