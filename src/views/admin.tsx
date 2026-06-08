'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Shield, Lock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AdminDashboard } from '@/views/admin/dashboard'
import { AdminChannels } from '@/views/admin/channels'
import { AdminMatches } from '@/views/admin/matches'
import { AdminCategories } from '@/views/admin/categories'
import { AdminSettings } from '@/views/admin/settings'

const ADMIN_PASSWORD = 'Ronnie77'

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
  const [error, setError] = useState('')

  // Check sessionStorage for existing auth
  if (typeof window !== 'undefined' && !isAdminAuth) {
    const sessionAuth = sessionStorage.getItem('zeng-admin-auth')
    if (sessionAuth === 'true') {
      setIsAdminAuth(true)
    }
  }

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAdminAuth(true)
      sessionStorage.setItem('zeng-admin-auth', 'true')
      setError('')
    } else {
      setError('Incorrect password. Try again.')
    }
  }

  // Login screen
  if (!isAdminAuth) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Admin Access</h2>
            <p className="text-sm text-muted-foreground mt-1">Enter password to access admin panel</p>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="pl-9"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleLogin} className="w-full btn-press">
              Login
            </Button>
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
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsAdminAuth(false)
            sessionStorage.removeItem('zeng-admin-auth')
          }}
          className="text-destructive hover:text-destructive"
        >
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
