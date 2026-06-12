'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchChannels, syncDuloChannels, getDuloSyncStatus, deleteDuloChannels, type Channel } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tv, RefreshCw, Download, Trash2, Eye, ToggleLeft, ToggleRight, Star, Edit, Search, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { updateChannel, deleteChannel } from '@/lib/api'
import { toast } from 'sonner'

export function AdminDulo() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{ count: number; lastUpdated: string | null } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const loadChannels = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchChannels({
        source: 'dulo',
        includeInactive: true,
        ...(filterCategory !== 'all' ? { category: filterCategory } : {}),
        ...(searchQuery ? { search: searchQuery } : {}),
      })
      setChannels(data)
    } catch {
      toast.error('Error', { description: 'Failed to load Dulo TV channels' })
    } finally {
      setLoading(false)
    }
  }, [filterCategory, searchQuery])

  const loadSyncStatus = useCallback(async () => {
    try {
      const status = await getDuloSyncStatus()
      setSyncStatus(status)
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    loadChannels()
    loadSyncStatus()
  }, [loadChannels, loadSyncStatus])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncDuloChannels()
      if (result.success) {
        toast.success('Sync Complete', {
          description: `${result.total} channels: ${result.created} new, ${result.updated} updated, ${result.skipped} unchanged`,
          duration: 5000,
        })
      } else {
        toast.warning('Sync Unavailable', {
          description: 'Could not reach dulo.tv API. Channels are already imported. Try again later to check for updates.',
          duration: 7000,
        })
      }
      loadChannels()
      loadSyncStatus()
    } catch {
      toast.error('Sync Failed', { description: 'Could not sync from dulo.tv API. Make sure the server can reach dulo.tv' })
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteAll = async () => {
    try {
      const result = await deleteDuloChannels()
      toast.success('Channels Deleted', { description: `Removed ${result.deleted} Dulo TV channels` })
      setDeleteConfirm(false)
      loadChannels()
      loadSyncStatus()
    } catch {
      toast.error('Error', { description: 'Failed to delete Dulo TV channels' })
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

  const handleDeleteSingle = async (id: string) => {
    try {
      await deleteChannel(id)
      toast.success('Channel Deleted', { description: 'Channel has been removed' })
      loadChannels()
    } catch {
      toast.error('Error', { description: 'Failed to delete channel' })
    }
  }

  const categoryOptions = [
    { value: 'all', label: 'All' },
    { value: 'sports', label: '🏆 Sports' },
    { value: 'entertainment', label: '🎬 Entertainment' },
    { value: 'news', label: '📰 News' },
    { value: 'movies', label: '🎥 Movies' },
    { value: 'documentary', label: '🌍 Documentary' },
    { value: 'kids', label: '👶 Kids' },
  ]

  const categoryColors: Record<string, string> = {
    sports: 'bg-emerald-500/10 text-emerald-600',
    entertainment: 'bg-pink-500/10 text-pink-600',
    news: 'bg-purple-500/10 text-purple-600',
    movies: 'bg-amber-500/10 text-amber-600',
    documentary: 'bg-teal-500/10 text-teal-600',
    kids: 'bg-sky-500/10 text-sky-600',
  }

  const lastUpdated = syncStatus?.lastUpdated
    ? new Date(syncStatus.lastUpdated).toLocaleString()
    : 'Never'

  return (
    <div className="space-y-4">
      {/* Sync Header */}
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Tv className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Dulo TV Sync</h3>
              <p className="text-xs text-muted-foreground">
                {syncStatus ? `${syncStatus.count} channels synced` : 'Loading...'} • Last sync: {lastUpdated}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="gap-2 btn-press bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0"
            >
              {syncing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
            {deleteConfirm ? (
              <div className="flex gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                  className="text-xs"
                >
                  Confirm Delete All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirm(true)}
                className="text-destructive hover:text-destructive gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete All
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Dulo TV channels..."
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
          {categoryOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="icon"
          onClick={loadChannels}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Channels List */}
      {loading ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading Dulo TV channels...</p>
        </div>
      ) : channels.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Tv className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No Dulo TV channels</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click &quot;Sync Now&quot; to import channels from dulo.tv
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
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Country</th>
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
                            <img src={ch.logo} alt="" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          ) : (
                            <Tv className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[200px]">{ch.name}</p>
                          {ch.isFeatured && <span className="text-[9px] text-primary">★ Featured</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-sm">
                      <Badge variant="secondary" className={`text-xs capitalize ${categoryColors[ch.category] || ''}`}>
                        {ch.category}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{ch.country || '—'}</td>
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
                          onClick={() => handleDeleteSingle(ch.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors btn-press"
                          title="Delete channel"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
            Showing {channels.length} Dulo TV channel{channels.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
