'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, RefreshCw, Globe, Tv, Monitor, Shield, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { fetchSettings, updateSettings, fetchChannels, fetchMatches, fetchCategories, type AppSettings, type Channel } from '@/lib/api'
import { toast } from 'sonner'

export function AdminSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Form state
  const [appName, setAppName] = useState('GenZ TV')
  const [logoUrl, setLogoUrl] = useState('')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [featuredChannelId, setFeaturedChannelId] = useState('')
  const [heroBannerText, setHeroBannerText] = useState('')
  const [defaultQuality, setDefaultQuality] = useState('auto')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [s, chs] = await Promise.all([
          fetchSettings(),
          fetchChannels({ includeInactive: true }),
        ])
        setSettings(s)
        setChannels(chs)
        setAppName(s.appName)
        setLogoUrl(s.logoUrl)
        setMaintenanceMode(s.maintenanceMode)
        setFeaturedChannelId(s.featuredChannelId)
        setHeroBannerText(s.heroBannerText)
        setDefaultQuality(s.defaultQuality)
      } catch {
        toast.error('Error', { description: 'Failed to load settings' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateSettings({
        appName,
        logoUrl,
        maintenanceMode,
        featuredChannelId,
        heroBannerText,
        defaultQuality,
      })
      setSettings(updated)
      toast.success('Settings Saved', { description: 'App settings have been updated successfully' })
    } catch {
      toast.error('Error', { description: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success('Database Seeded', { description: `Created ${data.categories} categories, ${data.channels} channels, ${data.matches} matches` })
      } else {
        toast.error('Error', { description: 'Failed to seed database' })
      }
    } catch {
      toast.error('Error', { description: 'Failed to seed database' })
    } finally {
      setSeeding(false)
    }
  }

  const handleResetData = async () => {
    if (!confirm('⚠️ This will delete ALL data and re-seed with demo data. Are you sure?')) return
    try {
      // Delete all data via API calls
      const allChannels = await fetchChannels({ includeInactive: true })
      const allMatches = await fetchMatches()
      const allCategories = await fetchCategories()

      // Delete matches
      for (const m of allMatches) {
        await fetch(`/api/matches/${m.id}`, { method: 'DELETE' })
      }
      // Delete channels
      for (const ch of allChannels) {
        await fetch(`/api/channels/${ch.id}`, { method: 'DELETE' })
      }
      // Delete categories
      for (const cat of allCategories) {
        await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
      }

      // Re-seed
      await handleSeed()
    } catch {
      toast.error('Error', { description: 'Failed to reset data' })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">App Settings</h2>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2 btn-press">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* General Settings */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">General</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">App Name</label>
            <Input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="GenZ TV"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Logo URL</label>
            <div className="flex gap-2">
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1"
              />
              {logoUrl && (
                <div className="w-9 h-9 rounded-lg border border-input bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1 block">Hero Banner Text</label>
            <Input
              value={heroBannerText}
              onChange={(e) => setHeroBannerText(e.target.value)}
              placeholder="Your premium destination for live TV..."
            />
          </div>
        </div>
      </div>

      {/* Featured Channel */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Tv className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Featured Channel</h3>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Select Featured Channel</label>
          <select
            value={featuredChannelId}
            onChange={(e) => setFeaturedChannelId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">None</option>
            {channels.filter(ch => ch.isFeatured).map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
            {channels.filter(ch => !ch.isFeatured).length > 0 && (
              <optgroup label="Other Channels">
                {channels.filter(ch => !ch.isFeatured).map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* Player Settings */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Monitor className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Player</h3>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Default Quality</label>
          <select
            value={defaultQuality}
            onChange={(e) => setDefaultQuality(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="auto">Auto</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
          </select>
        </div>
      </div>

      {/* Maintenance Mode */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Maintenance</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Maintenance Mode</p>
            <p className="text-xs text-muted-foreground">When enabled, users will see a maintenance page</p>
          </div>
          <Switch
            checked={maintenanceMode}
            onCheckedChange={setMaintenanceMode}
          />
        </div>
        {maintenanceMode && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-sm text-yellow-400">
            ⚠️ Maintenance mode is enabled. Users cannot access the app.
          </div>
        )}
      </div>

      {/* Database Management */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Database</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleSeed}
            disabled={seeding}
            className="gap-2 btn-press"
          >
            {seeding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </Button>
          <Button
            variant="outline"
            onClick={handleResetData}
            className="gap-2 btn-press border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <Database className="h-4 w-4" />
            Reset All Data
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Seed adds demo data without removing existing data. Reset deletes all data and re-seeds.
        </p>
      </div>

      {/* App Info */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="font-semibold mb-3">App Info</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p className="text-muted-foreground">Version</p>
          <p>1.0.0</p>
          <p className="text-muted-foreground">Framework</p>
          <p>Next.js 16</p>
          <p className="text-muted-foreground">Database</p>
          <p>SQLite (Prisma)</p>
          <p className="text-muted-foreground">Channels</p>
          <p>{channels.length}</p>
        </div>
      </div>
    </div>
  )
}
