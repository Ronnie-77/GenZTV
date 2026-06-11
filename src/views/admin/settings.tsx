'use client'

import { useState, useEffect, useRef } from 'react'
import { Settings, Save, RefreshCw, Globe, Tv, Monitor, Shield, Database, Download, Upload, X, FileArchive, Trash2, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { fetchSettings, updateSettings, fetchChannels, fetchMatches, fetchCategories, type AppSettings, type Channel } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function AdminSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [appName, setAppName] = useState('GenZ TV')
  const [logoUrl, setLogoUrl] = useState('')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [featuredChannelId, setFeaturedChannelId] = useState('')
  const [heroBannerText, setHeroBannerText] = useState('')
  const [defaultQuality, setDefaultQuality] = useState('auto')
  const [apkUrl, setApkUrl] = useState('')
  const [apkFileName, setApkFileName] = useState('')
  const [adsEnabled, setAdsEnabled] = useState(true)
  const [homeAdsEnabled, setHomeAdsEnabled] = useState(true)
  const [videoAdsEnabled, setVideoAdsEnabled] = useState(true)

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
        setApkUrl(s.apkUrl || '')
        setAdsEnabled(s.adsEnabled ?? true)
        setHomeAdsEnabled(s.homeAdsEnabled ?? true)
        setVideoAdsEnabled(s.videoAdsEnabled ?? true)
        // Extract filename from URL
        if (s.apkUrl) {
          const parts = s.apkUrl.split('/')
          setApkFileName(parts[parts.length - 1] || 'app.apk')
        }
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
        apkUrl,
        adsEnabled,
        homeAdsEnabled,
        videoAdsEnabled,
      })
      setSettings(updated)
      toast.success('Settings Saved', { description: 'App settings have been updated successfully' })
    } catch {
      toast.error('Error', { description: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleApkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.apk')) {
      toast.error('Invalid File', { description: 'Please select an APK file' })
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('apk', file)

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<{ success: boolean; apkUrl: string; fileName: string; size: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload/apk')

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(percent)
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'))
          }
        }

        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(formData)
      })

      setApkUrl(result.apkUrl)
      setApkFileName(file.name)
      toast.success('APK Uploaded', { description: `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) uploaded successfully` })
    } catch (err) {
      toast.error('Upload Failed', { description: err instanceof Error ? err.message : 'Failed to upload APK' })
    } finally {
      setUploading(false)
      setUploadProgress(0)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleApkDelete = async () => {
    if (!confirm('Are you sure you want to delete the uploaded APK?')) return

    try {
      const res = await fetch('/api/upload/apk', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setApkUrl('')
      setApkFileName('')
      toast.success('APK Deleted', { description: 'The APK file has been removed' })
    } catch {
      toast.error('Error', { description: 'Failed to delete APK' })
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

      {/* APK Upload */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">APK Download</h3>
        </div>

        {/* Current APK status */}
        {apkUrl ? (
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl border border-border">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center shrink-0">
              <FileArchive className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{apkFileName || 'app.apk'}</p>
              <p className="text-xs text-muted-foreground">APK uploaded — users can download it</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleApkDelete}
              className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl border border-border border-dashed">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-muted-foreground">No APK uploaded</p>
              <p className="text-xs text-muted-foreground">Upload an APK file for users to download</p>
            </div>
          </div>
        )}

        {/* Upload button + progress */}
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".apk"
            onChange={handleApkUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full gap-2 btn-press"
          >
            {uploading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Uploading... {uploadProgress}%
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {apkUrl ? 'Replace APK' : 'Upload APK File'}
              </>
            )}
          </Button>
          {uploading && (
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Upload an APK file (max 200MB). The file will be served from the server and users can download it directly.
          </p>
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

      {/* Ad Controls */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Ad Controls</h3>
        </div>

        {/* Master Switch */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">All Ads</p>
            <p className="text-xs text-muted-foreground">Master switch — disables all ads when off</p>
          </div>
          <Switch
            checked={adsEnabled}
            onCheckedChange={(checked) => {
              setAdsEnabled(checked)
              if (!checked) {
                setHomeAdsEnabled(false)
                setVideoAdsEnabled(false)
              } else {
                setHomeAdsEnabled(true)
                setVideoAdsEnabled(true)
              }
            }}
          />
        </div>

        <div className={cn(!adsEnabled && 'opacity-50 pointer-events-none')}>
          {/* Home Page Ads */}
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">Home Page Ads</p>
              <p className="text-xs text-muted-foreground">Banner ads on the home page</p>
            </div>
            <Switch
              checked={homeAdsEnabled}
              onCheckedChange={setHomeAdsEnabled}
              disabled={!adsEnabled}
            />
          </div>

          {/* Video Page Ads */}
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">Video Page Ads</p>
              <p className="text-xs text-muted-foreground">Ads below the video player</p>
            </div>
            <Switch
              checked={videoAdsEnabled}
              onCheckedChange={setVideoAdsEnabled}
              disabled={!adsEnabled}
            />
          </div>
        </div>

        {!adsEnabled && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
            🔴 All ads are disabled. No ads will be shown anywhere.
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
