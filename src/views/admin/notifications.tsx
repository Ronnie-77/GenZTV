'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  Send,
  Plus,
  Trash2,
  Pencil,
  X,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Tv,
  Sparkles,
  Megaphone,
  Zap,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/api'

/**
 * AdminNotifications
 *
 * Admin management UI for the in-app bell notifications (the dropdown that
 * appears when site visitors click the bell icon in the top nav).
 *
 * This is SEPARATE from the "Notices" admin page (which manages popup/push
 * site-entry modals). These notifications:
 *   - Appear in every visitor's bell dropdown (not a modal).
 *   - Optionally also fire a web push to subscribed users.
 *   - Track "read" state per-browser (visitor doesn't need an account).
 *
 * New channels added via the Channels admin page automatically create a
 * "channel" type notification here — admins can also create manual
 * "update"/"feature"/"notice" notifications.
 */

type NotifType = 'channel' | 'update' | 'feature' | 'notice'

interface AdminNotificationItem {
  id: string
  type: string
  title: string
  body: string
  url: string
  imageUrl: string
  isActive: boolean
  sendPush: boolean
  pushSent: boolean
  createdAt: string
  updatedAt: string
}

const TYPE_META: Record<
  NotifType,
  { label: string; icon: typeof Bell; color: string; desc: string }
> = {
  channel: {
    label: 'Channel',
    icon: Tv,
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    desc: 'New channel added — auto-created when admin adds a channel',
  },
  update: {
    label: 'Update',
    icon: Zap,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    desc: 'Site update or improvement announcement',
  },
  feature: {
    label: 'Feature',
    icon: Sparkles,
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
    desc: 'New feature announcement',
  },
  notice: {
    label: 'Notice',
    icon: Megaphone,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    desc: 'General short notice / announcement',
  },
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

function asNotifType(t: string): NotifType {
  if (t === 'channel' || t === 'update' || t === 'feature' || t === 'notice') return t
  return 'notice'
}

export function AdminNotifications() {
  const [items, setItems] = useState<AdminNotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [fType, setFType] = useState<NotifType>('notice')
  const [fTitle, setFTitle] = useState('')
  const [fBody, setFBody] = useState('')
  const [fUrl, setFUrl] = useState('')
  const [fImage, setFImage] = useState('')
  const [fActive, setFActive] = useState(true)
  const [fSendPush, setFSendPush] = useState(false)

  const resetForm = useCallback(() => {
    setFType('notice')
    setFTitle('')
    setFBody('')
    setFUrl('')
    setFImage('')
    setFActive(true)
    setFSendPush(false)
    setEditingId(null)
    setShowForm(false)
  }, [])

  const loadItems = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminFetch('/api/notifications/admin')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to load notifications', { description: msg })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const handleSave = async () => {
    if (!fTitle.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        type: fType,
        title: fTitle.trim(),
        body: fBody.trim(),
        url: fUrl.trim(),
        imageUrl: fImage.trim(),
        isActive: fActive,
        sendPush: fSendPush,
      }

      if (editingId) {
        const res = await adminFetch(`/api/notifications/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        toast.success('Notification updated', {
          description: data.pushResult
            ? `Push sent to ${data.pushResult.sent} subscriber${data.pushResult.sent === 1 ? '' : 's'}`
            : undefined,
        })
      } else {
        const res = await adminFetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        toast.success('Notification created', {
          description: data.pushResult
            ? `Push sent to ${data.pushResult.sent} subscriber${data.pushResult.sent === 1 ? '' : 's'}`
            : undefined,
        })
      }
      resetForm()
      loadItems()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to save notification', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification? This cannot be undone.')) return
    try {
      const res = await adminFetch(`/api/notifications/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success('Notification deleted')
      loadItems()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to delete', { description: msg })
    }
  }

  const handleToggleActive = async (item: AdminNotificationItem) => {
    try {
      const res = await adminFetch(`/api/notifications/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success(item.isActive ? 'Notification hidden' : 'Notification shown')
      loadItems()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to update', { description: msg })
    }
  }

  const handleResendPush = async (item: AdminNotificationItem) => {
    try {
      const res = await adminFetch(`/api/notifications/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resendPush: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      toast.success('Push re-sent', {
        description: data.pushResult
          ? `Sent to ${data.pushResult.sent} subscriber${data.pushResult.sent === 1 ? '' : 's'}`
          : 'No subscribers',
      })
      loadItems()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to resend push', { description: msg })
    }
  }

  const handleEdit = (item: AdminNotificationItem) => {
    setEditingId(item.id)
    setFType(asNotifType(item.type))
    setFTitle(item.title)
    setFBody(item.body)
    setFUrl(item.url)
    setFImage(item.imageUrl)
    setFActive(item.isActive)
    setFSendPush(item.sendPush)
    setShowForm(true)
    // Scroll to form
    setTimeout(() => {
      document.getElementById('notif-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            In-app bell notifications shown to all visitors. New channels auto-create a notification here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadItems} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          {!showForm && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true) }}>
              <Plus className="h-4 w-4" />
              New Notification
            </Button>
          )}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div id="notif-form-top" className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? 'Edit Notification' : 'Create Notification'}
            </h2>
            <Button variant="ghost" size="icon" onClick={resetForm} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
              Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(TYPE_META) as NotifType[]).map((t) => {
                const meta = TYPE_META[t]
                const Icon = meta.icon
                const active = fType === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFType(t)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-secondary/50'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className={cn('text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                      {meta.label}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">{TYPE_META[fType].desc}</p>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="e.g. New channel: Sports Max HD"
              maxLength={200}
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Body
            </label>
            <Textarea
              value={fBody}
              onChange={(e) => setFBody(e.target.value)}
              placeholder="Short message shown in the bell dropdown (max 1000 chars)"
              maxLength={1000}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">{fBody.length}/1000</p>
          </div>

          {/* URL + Image */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Click URL (optional)
              </label>
              <Input
                value={fUrl}
                onChange={(e) => setFUrl(e.target.value)}
                placeholder="#/channel/<id> or https://..."
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use #/channel/&lt;id&gt; to open a channel, or any https URL.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Image URL (optional)
              </label>
              <Input
                value={fImage}
                onChange={(e) => setFImage(e.target.value)}
                placeholder="https://... or channel logo URL"
                maxLength={500}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={fActive} onCheckedChange={setFActive} />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={fSendPush} onCheckedChange={setFSendPush} />
              <span className="text-sm flex items-center gap-1">
                <Send className="h-3.5 w-3.5" />
                Also send web push
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !fTitle.trim()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingId ? 'Save Changes' : 'Create Notification'}
            </Button>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <div className="w-14 h-14 mx-auto rounded-full bg-secondary flex items-center justify-center mb-3">
            <Bell className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create one above, or add a channel — it auto-creates a notification.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const meta = TYPE_META[asNotifType(item.type)]
            const Icon = meta.icon
            return (
              <div
                key={item.id}
                className={cn(
                  'bg-card border rounded-lg p-4 flex items-start gap-3',
                  item.isActive ? 'border-border' : 'border-border/50 opacity-60'
                )}
              >
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border', meta.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className={cn('text-xs', meta.color)}>
                      {meta.label}
                    </Badge>
                    {!item.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Hidden
                      </Badge>
                    )}
                    {item.sendPush && (
                      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        {item.pushSent ? 'Push sent' : 'Push pending'}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatRelative(item.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  {item.body && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.body}</p>
                  )}
                  {item.url && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono truncate">→ {item.url}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {item.sendPush && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleResendPush(item)}
                      title="Resend push"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleToggleActive(item)}
                    title={item.isActive ? 'Hide' : 'Show'}
                  >
                    {item.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(item)}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(item.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info note */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <div>
          <p className="font-medium text-foreground mb-1">How visitors see these</p>
          <p>
            Active notifications appear in every visitor&apos;s top-nav bell dropdown. The bell
            shows an unread-count badge, and a short &quot;ding&quot; sound plays when a new
            notification arrives. Visitors click the bell to view the list, and &quot;Mark all
            read&quot; to clear the badge.
          </p>
        </div>
      </div>
    </div>
  )
}
