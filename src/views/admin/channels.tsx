'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Tv, Edit, Trash2, Search, X, Check, RefreshCw, Eye, Star, ToggleLeft, ToggleRight, Upload, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { fetchChannels, createChannel, updateChannel, deleteChannel, parseM3U, type Channel } from '@/lib/api'
import { toast } from 'sonner'

const categoryOptions = [
  { value: 'news', label: '📰 News' },
  { value: 'sports', label: '🏆 Sports' },
  { value: 'cricket', label: '🏏 Cricket' },
  { value: 'football', label: '⚽ Football' },
  { value: 'entertainment', label: '🎬 Entertainment' },
  { value: 'international', label: '🌍 International' },
]

const streamTypeOptions = [
  { value: 'm3u', label: 'M3U/HLS' },
  { value: 'iframe', label: 'iFrame' },
  { value: 'github_m3u', label: 'GitHub M3U' },
]

interface ChannelFormData {
  name: string
  logo: string
  categories: string[]  // Array of selected categories (stored as comma-separated in DB)
  streamType: string
  streamUrl: string
  githubM3uPath: string
  language: string
  country: string
  tags: string
  isFeatured: boolean
  isActive: boolean
}

const emptyForm: ChannelFormData = {
  name: '',
  logo: '',
  categories: ['entertainment'],
  streamType: 'iframe',
  streamUrl: '',
  githubM3uPath: '',
  language: '',
  country: '',
  tags: '',
  isFeatured: false,
  isActive: true,
}

/** Parse comma-separated category string into array */
function parseCategories(categoryStr: string): string[] {
  if (!categoryStr) return []
  return categoryStr.split(',').map(c => c.trim()).filter(Boolean)
}

/** Get the primary (first) category from a category string */
function getPrimaryCategory(categoryStr: string): string {
  const cats = parseCategories(categoryStr)
  return cats.length > 0 ? cats[0] : 'entertainment'
}

export function AdminChannels() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ChannelFormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  // IPTV Import state
  const [showIptvImport, setShowIptvImport] = useState(false)
  const [iptvUrl, setIptvUrl] = useState('')
  const [iptvLoading, setIptvLoading] = useState(false)
  const [iptvResults, setIptvResults] = useState<{ name: string; logo: string; group: string; url: string }[]>([])
  const [selectedIptvChannels, setSelectedIptvChannels] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Ref for scrolling to form on edit
  const formRef = useRef<HTMLDivElement>(null)

  const loadChannels = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchChannels({
        ...(filterCategory !== 'all' ? { category: filterCategory } : {}),
        ...(searchQuery ? { search: searchQuery } : {}),
        includeInactive: true,
      })
      setChannels(data)
    } catch {
      toast.error('Error', { description: 'Failed to load channels' })
    } finally {
      setLoading(false)
    }
  }, [filterCategory, searchQuery])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Validation Error', { description: 'Channel name is required' })
      return
    }

    setSaving(true)
    try {
      const data = {
        name: form.name,
        logo: form.logo,
        category: form.categories.filter(Boolean).join(','),
        streamType: form.streamType,
        streamUrl: form.streamUrl,
        githubM3uPath: form.githubM3uPath,
        language: form.language,
        country: form.country,
        tags: form.tags,
        isFeatured: form.isFeatured,
        isActive: form.isActive,
      }

      if (editingId) {
        await updateChannel(editingId, data)
        toast.success('Channel Updated', { description: `${form.name} has been updated successfully` })
      } else {
        await createChannel(data)
        toast.success('Channel Created', { description: `${form.name} has been created successfully` })
      }

      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      loadChannels()
    } catch {
      toast.error('Error', { description: 'Failed to save channel' })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (channel: Channel) => {
    setEditingId(channel.id)
    const channelCategories = parseCategories(channel.category)
    setForm({
      name: channel.name,
      logo: channel.logo,
      categories: channelCategories.length > 0 ? channelCategories : ['entertainment'],
      streamType: channel.streamType,
      streamUrl: channel.streamUrl,
      githubM3uPath: channel.githubM3uPath,
      language: channel.language,
      country: channel.country,
      tags: channel.tags,
      isFeatured: channel.isFeatured,
      isActive: channel.isActive,
    })
    setShowForm(true)
    // Scroll to form after a short delay to allow state to render
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const toggleCategory = (catValue: string) => {
    setForm(prev => {
      const cats = prev.categories.includes(catValue)
        ? prev.categories.filter(c => c !== catValue)
        : [...prev.categories, catValue]
      return { ...prev, categories: cats.length > 0 ? cats : ['entertainment'] }
    })
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteChannel(id)
      toast.success('Channel Deleted', { description: 'Channel has been removed' })
      setDeleteConfirm(null)
      loadChannels()
    } catch {
      toast.error('Error', { description: 'Failed to delete channel' })
    }
  }

  const handleToggleActive = async (channel: Channel) => {
    try {
      await updateChannel(channel.id, { isActive: !channel.isActive })
      toast.success('Channel Updated', { description: `${channel.name} is now ${!channel.isActive ? 'active' : 'inactive'}` })
      loadChannels()
    } catch {
      toast.error('Error', { description: 'Failed to update channel' })
    }
  }

  const handleToggleFeatured = async (channel: Channel) => {
    try {
      await updateChannel(channel.id, { isFeatured: !channel.isFeatured })
      toast.success('Channel Updated', { description: `${channel.name} featured status updated` })
      loadChannels()
    } catch {
      toast.error('Error', { description: 'Failed to update channel' })
    }
  }

  const handleIptvParse = async () => {
    if (!iptvUrl.trim()) return
    setIptvLoading(true)
    try {
      const result = await parseM3U(iptvUrl)
      setIptvResults(result.channels)
      setSelectedIptvChannels(new Set())
      toast.success('M3U Parsed', { description: `Found ${result.total} channels` })
    } catch {
      toast.error('Error', { description: 'Failed to parse M3U file' })
    } finally {
      setIptvLoading(false)
    }
  }

  const handleImportSelected = async () => {
    setImporting(true)
    let imported = 0
    try {
      for (const idx of selectedIptvChannels) {
        const ch = iptvResults[idx]
        if (ch) {
          try {
            await createChannel({
              name: ch.name,
              logo: ch.logo,
              category: ch.group ? `sports,${ch.group.toLowerCase()}` : 'entertainment',
              streamType: ch.url.includes('.m3u8') ? 'm3u' : 'iframe',
              streamUrl: ch.url,
            })
            imported++
          } catch {
            // skip individual errors
          }
        }
      }
      toast.success('Import Complete', { description: `Successfully imported ${imported} channels` })
      setShowIptvImport(false)
      setIptvUrl('')
      setIptvResults([])
      setSelectedIptvChannels(new Set())
      loadChannels()
    } catch {
      toast.error('Error', { description: 'Failed to import channels' })
    } finally {
      setImporting(false)
    }
  }

  const toggleIptvChannel = (idx: number) => {
    const next = new Set(selectedIptvChannels)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelectedIptvChannels(next)
  }

  const selectAllIptv = () => {
    if (selectedIptvChannels.size === iptvResults.length) {
      setSelectedIptvChannels(new Set())
    } else {
      setSelectedIptvChannels(new Set(iptvResults.map((_, i) => i)))
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All Categories</option>
            {categoryOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowIptvImport(!showIptvImport)}
            className="gap-2 btn-press"
          >
            <Github className="h-4 w-4" />
            IPTV Import
          </Button>
          <Button
            variant="outline"
            onClick={loadChannels}
            className="gap-1.5 btn-press"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => {
              setEditingId(null)
              setForm(emptyForm)
              setShowForm(!showForm)
            }}
            className="gap-2 btn-press"
          >
            <Plus className="h-4 w-4" />
            Add Channel
          </Button>
        </div>
      </div>

      {/* IPTV Import Section */}
      {showIptvImport && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold">Import from GitHub M3U</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste a GitHub raw M3U file URL. The system will parse and extract all channels.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://raw.githubusercontent.com/.../playlist.m3u"
              value={iptvUrl}
              onChange={(e) => setIptvUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleIptvParse} disabled={iptvLoading} className="btn-press gap-2">
              {iptvLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {iptvLoading ? 'Parsing...' : 'Parse'}
            </Button>
          </div>

          {/* Parsed Results */}
          {iptvResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Found {iptvResults.length} channels ({selectedIptvChannels.size} selected)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllIptv} className="text-xs">
                    {selectedIptvChannels.size === iptvResults.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <Button size="sm" onClick={handleImportSelected} disabled={importing || selectedIptvChannels.size === 0} className="gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    {importing ? 'Importing...' : `Import ${selectedIptvChannels.size}`}
                  </Button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {iptvResults.map((ch, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedIptvChannels.has(idx) ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/30 hover:bg-secondary/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIptvChannels.has(idx)}
                      onChange={() => toggleIptvChannel(idx)}
                      className="rounded"
                    />
                    {ch.logo && <img src={ch.logo} alt="" className="w-8 h-8 rounded object-contain p-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ch.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ch.group || 'No group'}</p>
                    </div>
                    <Badge variant="secondary" className="text-[9px] shrink-0">
                      {ch.url.includes('.m3u8') ? 'M3U8' : 'Other'}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Channel Form */}
      {showForm && (
        <div ref={formRef} className="bg-card rounded-2xl border border-border p-4 space-y-4 animate-fade-slide scroll-mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{editingId ? 'Edit Channel' : 'Add New Channel'}</h3>
            <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm) }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Channel Name *</label>
              <Input
                placeholder="e.g. Sony SIX"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Logo URL</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={form.logo}
                  onChange={(e) => setForm({ ...form, logo: e.target.value })}
                  className="flex-1"
                />
                {form.logo && (
                  <div className="w-9 h-9 rounded-lg border border-input bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    <img src={form.logo} alt="" className="w-full h-full object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Categories</label>
              <p className="text-[10px] text-muted-foreground mb-2">Select all categories this channel belongs to. First selected is primary.</p>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map(opt => {
                  const isSelected = form.categories.includes(opt.value)
                  const isFirst = form.categories[0] === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleCategory(opt.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        isSelected
                          ? isFirst
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-primary/15 text-primary border-primary/30'
                          : 'bg-secondary/50 text-muted-foreground border-border hover:border-primary/30'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isFirst && isSelected && <span className="text-[9px] opacity-70">(Primary)</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Stream Type</label>
              <select
                value={form.streamType}
                onChange={(e) => setForm({ ...form, streamType: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {streamTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className={form.streamType === 'github_m3u' ? 'md:col-span-1' : 'md:col-span-2'}>
              <label className="text-sm font-medium mb-1 block">Stream URL</label>
              <Input
                placeholder={form.streamType === 'iframe' ? 'iFrame HTML or URL' : form.streamType === 'm3u' ? 'M3U8/HLS stream URL' : 'Stream URL'}
                value={form.streamUrl}
                onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}
              />
            </div>
            {form.streamType === 'github_m3u' && (
              <div>
                <label className="text-sm font-medium mb-1 block">GitHub M3U Path</label>
                <Input
                  placeholder="path/to/file.m3u in repo"
                  value={form.githubM3uPath}
                  onChange={(e) => setForm({ ...form, githubM3uPath: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Language</label>
              <Input
                placeholder="e.g. English, Hindi"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Country</label>
              <Input
                placeholder="e.g. India, USA"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium mb-1 block">Tags (comma separated)</label>
              <Input
                placeholder="e.g. hd, premium, live"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-6 md:col-span-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
                <label className="text-sm font-medium">Active</label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isFeatured}
                  onCheckedChange={(checked) => setForm({ ...form, isFeatured: checked })}
                />
                <label className="text-sm font-medium">Featured</label>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm) }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="btn-press gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving...' : editingId ? 'Update Channel' : 'Create Channel'}
            </Button>
          </div>
        </div>
      )}

      {/* Channels Table */}
      {loading ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading channels...</p>
        </div>
      ) : channels.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Tv className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No channels found</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery || filterCategory !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Add your first channel or import from M3U.'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Channel</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Category</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Views</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.id} className="border-t border-border hover:bg-secondary/20 transition-colors">
                    <td className="p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                          {ch.logo ? (
                            <img src={ch.logo} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <Tv className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{ch.name}</p>
                          {ch.isFeatured && <span className="text-[9px] text-primary">★ Featured</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {parseCategories(ch.category).map((cat, i) => (
                          <Badge key={i} variant="secondary" className={`capitalize text-[10px] ${i === 0 ? 'bg-primary/10 text-primary' : ''}`}>
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-xs uppercase text-muted-foreground">{ch.streamType}</td>
                    <td className="p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleActive(ch)} className="btn-press">
                          {ch.isActive ? (
                            <ToggleRight className="h-5 w-5 text-green-500" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                        <span className={`text-xs ${ch.isActive ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {ch.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-sm">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {ch.viewCount.toLocaleString()}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleToggleFeatured(ch)}
                          className="p-1.5 rounded-md hover:bg-secondary transition-colors btn-press"
                          title={ch.isFeatured ? 'Remove from featured' : 'Add to featured'}
                        >
                          <Star className={`h-3.5 w-3.5 ${ch.isFeatured ? 'text-zeng-gold fill-zeng-gold' : 'text-muted-foreground'}`} />
                        </button>
                        <button
                          onClick={() => handleEdit(ch)}
                          className="p-1.5 rounded-md hover:bg-secondary transition-colors btn-press"
                          title="Edit channel"
                        >
                          <Edit className="h-3.5 w-3.5 text-primary" />
                        </button>
                        {deleteConfirm === ch.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(ch.id)}
                              className="px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-xs btn-press"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 rounded-md bg-secondary text-xs btn-press"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(ch.id)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors btn-press"
                            title="Delete channel"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
            Showing {channels.length} channel{channels.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
