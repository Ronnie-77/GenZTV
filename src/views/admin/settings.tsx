'use client'

import { useState, useEffect, useRef } from 'react'
import { Save, RefreshCw, Globe, Tv, Monitor, Shield, Download, Upload, X, FileArchive, Trash2, Megaphone, Plus, Code, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { fetchSettings, updateSettings, fetchChannels, type AppSettings, type Channel } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Ad script interface
interface AdScript {
  id: string
  name: string
  script: string
  position: 'home-banner' | 'video-below' | 'sidebar' | 'custom'
  enabled: boolean
}

export function AdminSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
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

  // Ad scripts state
  const [adScripts, setAdScripts] = useState<AdScript[]>([])
  const [editingAdScript, setEditingAdScript] = useState<string | null>(null)

  // Retry-aware settings loader — the server might be compiling on first request
  const loadSettings = async (retries = 2): Promise<AppSettings> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetchSettings()
      } catch (err) {
        if (attempt < retries) {
          // Wait a bit and retry (server might still be compiling)
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }
        throw err
      }
    }
    throw new Error('Failed after retries')
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        // Load settings and channels independently — don't let one failure block the other
        const [sResult, chsResult] = await Promise.allSettled([
          loadSettings(),
          fetchChannels({ includeInactive: true }),
        ])

        if (sResult.status === 'rejected') {
          const reason = sResult.reason instanceof Error ? sResult.reason.message : String(sResult.reason)
          console.error('[AdminSettings] Failed to load settings:', reason)
          toast.error('Failed to load settings', { description: `${reason}. Click the refresh button to try again.` })
          setLoadFailed(true)
          setLoading(false)
          return
        }

        const s = sResult.value
        setSettings(s)
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
        // Parse custom ad scripts
        try {
          const parsed = JSON.parse(s.customAdScripts || '[]')
          setAdScripts(Array.isArray(parsed) ? parsed : [])
        } catch {
          setAdScripts([])
        }
        // Extract filename from URL
        if (s.apkUrl) {
          const parts = s.apkUrl.split('/')
          setApkFileName(parts[parts.length - 1] || 'app.apk')
        }

        if (chsResult.status === 'fulfilled') {
          setChannels(chsResult.value)
        } else {
          // Channels failed to load — still allow settings to work
          console.error('Failed to load channels:', chsResult.reason)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[AdminSettings] Load error:', msg)
        toast.error('Failed to load settings', { description: `${msg}. Click the refresh button to try again.` })
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        appName,
        logoUrl,
        maintenanceMode,
        featuredChannelId,
        heroBannerText,
        defaultQuality,
        apkUrl,
        bannerAdScript: settings?.bannerAdScript || '',
        socialBarAdScript: settings?.socialBarAdScript || '',
        customAdScripts: JSON.stringify(adScripts),
        adsEnabled,
        homeAdsEnabled,
        videoAdsEnabled,
      }

      let updated: AppSettings | null = null
      let lastError: Error | null = null

      // Retry save up to 2 times (server might be compiling or temporarily unavailable)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          updated = await updateSettings(data)
          break
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          }
        }
      }

      if (!updated) {
        throw lastError || new Error('Failed to save settings')
      }

      setSettings(updated)
      // Notify AppShell to re-check maintenance mode immediately
      localStorage.setItem('zeng-settings-updated', Date.now().toString())
      window.dispatchEvent(new CustomEvent('zeng-settings-changed'))
      toast.success('Settings Saved', { description: 'App settings have been updated successfully' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[AdminSettings] Save error:', msg)
      if (msg.includes('Unauthorized') || msg.includes('401')) {
        toast.error('Session Expired', { description: 'Please log in again and try' })
      } else {
        toast.error('Error', { description: `Failed to save settings: ${msg}` })
      }
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
        xhr.withCredentials = true

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(percent)
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch {
              reject(new Error('Invalid server response'))
            }
          } else {
            // Try to parse error from server
            try {
              const data = JSON.parse(xhr.responseText)
              reject(new Error(data.error || `Upload failed (HTTP ${xhr.status})`))
            } catch {
              reject(new Error(`Upload failed (HTTP ${xhr.status})`))
            }
          }
        }

        xhr.onerror = () => reject(new Error('Network error — please check your connection'))
        xhr.onabort = () => reject(new Error('Upload was cancelled'))
        xhr.ontimeout = () => reject(new Error('Upload timed out — please try again'))
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
      const res = await fetch('/api/upload/apk', { method: 'DELETE', credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to delete')
      setApkUrl('')
      setApkFileName('')
      toast.success('APK Deleted', { description: 'The APK file has been removed' })
    } catch {
      toast.error('Error', { description: 'Failed to delete APK' })
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

  if (loadFailed) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-8 w-8 text-destructive mb-3" />
        <p className="text-sm font-medium mb-1">Failed to load settings</p>
        <p className="text-xs text-muted-foreground mb-4">The server might be busy or starting up. Please try again.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoadFailed(false)
            setLoading(true)
            // Re-trigger the load
            const reload = async () => {
              try {
                const s = await loadSettings()
                setSettings(s)
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
                try {
                  const parsed = JSON.parse(s.customAdScripts || '[]')
                  setAdScripts(Array.isArray(parsed) ? parsed : [])
                } catch {
                  setAdScripts([])
                }
                if (s.apkUrl) {
                  const parts = s.apkUrl.split('/')
                  setApkFileName(parts[parts.length - 1] || 'app.apk')
                }
                try {
                  const chs = await fetchChannels({ includeInactive: true })
                  setChannels(chs)
                } catch {}
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error'
                toast.error('Failed to load settings', { description: msg })
                setLoadFailed(true)
              } finally {
                setLoading(false)
              }
            }
            reload()
          }}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div></div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 btn-press text-xs">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* General Settings */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">General</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block text-muted-foreground">App Name</label>
            <Input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="GenZ TV"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Logo URL</label>
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
            <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Hero Banner Text</label>
            <Input
              value={heroBannerText}
              onChange={(e) => setHeroBannerText(e.target.value)}
              placeholder="Your premium destination for live TV..."
            />
          </div>
        </div>
      </div>

      {/* Featured Channel */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Tv className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Featured Channel</h3>
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Select Featured Channel</label>
          <select
            value={featuredChannelId}
            onChange={(e) => setFeaturedChannelId(e.target.value)}
            className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
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
      <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Monitor className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Player</h3>
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Default Quality</label>
          <select
            value={defaultQuality}
            onChange={(e) => setDefaultQuality(e.target.value)}
            className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
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
      <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">APK Download</h3>
        </div>

        {/* Current APK status */}
        {apkUrl ? (
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl border border-border">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center shrink-0">
              <FileArchive className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{apkFileName || 'app.apk'}</p>
              <p className="text-[10px] text-muted-foreground">APK uploaded — users can download it</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleApkDelete}
              className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
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
              <p className="text-[10px] text-muted-foreground">Upload an APK file for users to download</p>
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
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full gap-2 btn-press text-xs"
          >
            {uploading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Uploading... {uploadProgress}%
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
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
          <p className="text-[10px] text-muted-foreground">
            Upload an APK file (max 200MB). The file will be served from the server and users can download it directly.
          </p>
        </div>
      </div>

      {/* Maintenance Mode */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Maintenance</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Maintenance Mode</p>
            <p className="text-[10px] text-muted-foreground">When enabled, users will see a maintenance page</p>
          </div>
          <Switch
            checked={maintenanceMode}
            onCheckedChange={setMaintenanceMode}
          />
        </div>
        {maintenanceMode && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-600 dark:text-amber-400">
            ⚠️ Maintenance mode is enabled. Users cannot access the app.
          </div>
        )}
      </div>

      {/* Ad Controls */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Ad Controls</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newAd: AdScript = {
                id: `ad-${Date.now()}`,
                name: `Ad Script ${adScripts.length + 1}`,
                script: '',
                position: 'home-banner',
                enabled: true,
              }
              setAdScripts([...adScripts, newAd])
              setEditingAdScript(newAd.id)
            }}
            disabled={!adsEnabled}
            className="gap-1.5 text-xs h-7"
          >
            <Plus className="h-3 w-3" />
            Add Script
          </Button>
        </div>

        {/* Master Switch */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">All Ads</p>
            <p className="text-[10px] text-muted-foreground">Master switch — disables all ads when off</p>
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
              <p className="text-[10px] text-muted-foreground">Banner ads on the home page</p>
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
              <p className="text-[10px] text-muted-foreground">Ads below the video player</p>
            </div>
            <Switch
              checked={videoAdsEnabled}
              onCheckedChange={setVideoAdsEnabled}
              disabled={!adsEnabled}
            />
          </div>
        </div>

        {!adsEnabled && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-500 dark:text-red-400">
            🔴 All ads are disabled. No ads will be shown anywhere.
          </div>
        )}

        {/* Custom Ad Scripts List */}
        {adsEnabled && adScripts.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Ad Scripts</p>
            {adScripts.map((ad) => (
              <div key={ad.id} className={`rounded-xl border p-3 space-y-3 transition-all ${editingAdScript === ad.id ? 'border-primary/40 bg-primary/5' : ad.enabled ? 'border-border bg-secondary/20' : 'border-border/50 bg-secondary/10 opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Input
                      value={ad.name}
                      onChange={(e) => setAdScripts(adScripts.map(a => a.id === ad.id ? { ...a, name: e.target.value } : a))}
                      className="h-7 text-xs font-medium"
                      placeholder="Ad script name"
                    />
                  </div>
                  <select
                    value={ad.position}
                    onChange={(e) => setAdScripts(adScripts.map(a => a.id === ad.id ? { ...a, position: e.target.value as AdScript['position'] } : a))}
                    className="h-7 rounded-md border border-input bg-background px-2 text-[10px]"
                  >
                    <option value="home-banner">🏠 Home Banner</option>
                    <option value="video-below">📺 Below Video</option>
                    <option value="sidebar">📌 Sidebar</option>
                    <option value="custom">⚙️ Custom</option>
                  </select>
                  <button
                    onClick={() => setAdScripts(adScripts.map(a => a.id === ad.id ? { ...a, enabled: !a.enabled } : a))}
                    className="p-1 rounded-md hover:bg-secondary transition-colors"
                    title={ad.enabled ? 'Disable' : 'Enable'}
                  >
                    {ad.enabled ? <Eye className="h-3.5 w-3.5 text-emerald-500" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button
                    onClick={() => setEditingAdScript(editingAdScript === ad.id ? null : ad.id)}
                    className="p-1 rounded-md hover:bg-secondary transition-colors text-[10px] text-primary"
                  >
                    {editingAdScript === ad.id ? 'Done' : 'Edit'}
                  </button>
                  <button
                    onClick={() => setAdScripts(adScripts.filter(a => a.id !== ad.id))}
                    className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
                {editingAdScript === ad.id && (
                  <div className="space-y-2">
                    <textarea
                      value={ad.script}
                      onChange={(e) => setAdScripts(adScripts.map(a => a.id === ad.id ? { ...a, script: e.target.value } : a))}
                      placeholder="Paste your ad script (HTML/JavaScript) here..."
                      className="w-full h-32 rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono resize-y"
                    />
                    <p className="text-[10px] text-muted-foreground">Paste the full ad script including &lt;script&gt; tags. Supports HTML, JavaScript, and iframe embeds.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {adsEnabled && adScripts.length === 0 && (
          <div className="text-center py-4 border-t border-border">
            <Code className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No custom ad scripts yet</p>
            <p className="text-[10px] text-muted-foreground">Click "Add Script" to add your first ad script</p>
          </div>
        )}
      </div>

      {/* App Info */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <h3 className="text-sm font-semibold mb-3">App Info</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
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
