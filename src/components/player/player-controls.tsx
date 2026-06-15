'use client'

import { useRef, useState, useEffect } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  AlertCircle,
  RefreshCw,
  Settings,
  ChevronRight,
  Lock,
  Unlock,
  Gauge,
  Maximize2,
  Camera,
  Headphones,
  Subtitles,
  ZoomIn,
  Scan,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { QualityLevel, HlsStats, AudioTrack, SubtitleTrack } from './hls-player'

// Playback speed options (VLC-like)
const PLAYBACK_SPEEDS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 1.75, label: '1.75x' },
  { value: 2, label: '2x' },
]

// Aspect ratio options
const ASPECT_MODES = [
  { value: 'fit' as const, label: 'Fit (Default)' },
  { value: 'stretch' as const, label: 'Stretch' },
  { value: 'crop' as const, label: 'Crop / Fill' },
  { value: '16:9' as const, label: '16:9' },
  { value: '4:3' as const, label: '4:3' },
]

// Zoom options
const ZOOM_OPTIONS = [
  { value: 1, label: '100%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 0, label: 'Fit' },
]

type AspectMode = 'fit' | 'stretch' | 'crop' | '16:9' | '4:3'

// Settings page types
type SettingsPage = 'main' | 'quality' | 'speed' | 'aspect' | 'stats' | 'audio' | 'subtitles' | 'zoom'

interface PlayerControlsProps {
  isPlaying: boolean
  onTogglePlay: () => void
  volume: number
  onVolumeChange: (vol: number) => void
  isMuted: boolean
  onToggleMute: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onTogglePiP?: () => void
  onToggleControlsVisibility?: () => void
  title?: string
  isLive?: boolean
  isBehindLive?: boolean
  onBackToLive?: () => void
  isLoading?: boolean
  hasError?: boolean
  errorMessage?: string
  onRetry?: () => void
  visible: boolean
  onControlsBusy?: (busy: boolean) => void
  // HLS quality controls
  qualityLevels?: QualityLevel[]
  currentQuality?: number
  onQualityChange?: (level: number) => void
  hlsStats?: HlsStats | null
  // VLC-like controls
  playbackRate?: number
  onPlaybackRateChange?: (rate: number) => void
  aspectMode?: AspectMode
  onAspectModeChange?: (mode: AspectMode) => void
  // Iframe mode — simplified controls
  isIframe?: boolean
  // Iframe touch lock (mobile) — blocks ad clicks
  iframeTouchLocked?: boolean
  onToggleIframeTouchLock?: () => void
  // New VLC-like features
  onScreenshot?: () => void
  canSeek?: boolean
  // Audio tracks
  audioTracks?: AudioTrack[]
  currentAudioTrack?: number
  onAudioTrackChange?: (trackId: number) => void
  // Subtitle tracks
  subtitleTracks?: SubtitleTrack[]
  currentSubtitleTrack?: number
  onSubtitleTrackChange?: (trackId: number) => void
  // Zoom
  zoomLevel?: number
  onZoomChange?: (level: number) => void
  // Deinterlace
  deinterlace?: boolean
  onDeinterlaceChange?: (enabled: boolean) => void
  showDeinterlace?: boolean
}

function formatBandwidth(bps: number): string {
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`
  return `${bps} bps`
}

// ── Reusable settings sub-page header ──
function SettingsSubHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors border-b border-white/[0.06] cursor-pointer"
    >
      <ChevronRight className="h-3.5 w-3.5 rotate-180" />
      <span className="font-medium">{label}</span>
    </button>
  )
}

// ── Reusable settings option button ──
function SettingsOption({ label, active, subLabel, onClick }: { label: string; active: boolean; subLabel?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-6 py-2 text-[13px] transition-colors cursor-pointer ${
        active ? 'text-primary font-medium' : 'text-white/80 hover:bg-white/[0.08]'
      }`}
    >
      {label}
      {subLabel && <span className="text-white/30 text-[11px] ml-1.5">{subLabel}</span>}
    </button>
  )
}

export function PlayerControls({
  isPlaying,
  onTogglePlay,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
  onTogglePiP,
  onToggleControlsVisibility,
  title,
  isLive,
  isBehindLive,
  onBackToLive,
  isLoading,
  hasError,
  errorMessage,
  onRetry,
  visible,
  onControlsBusy,
  qualityLevels = [],
  currentQuality = -1,
  onQualityChange,
  hlsStats,
  playbackRate = 1,
  onPlaybackRateChange,
  aspectMode = 'fit',
  onAspectModeChange,
  isIframe = false,
  iframeTouchLocked = false,
  onToggleIframeTouchLock,
  // New features
  onScreenshot,
  canSeek = true,
  audioTracks = [],
  currentAudioTrack = -1,
  onAudioTrackChange,
  subtitleTracks = [],
  currentSubtitleTrack = -1,
  onSubtitleTrackChange,
  zoomLevel = 1,
  onZoomChange,
  deinterlace = false,
  onDeinterlaceChange,
  showDeinterlace = false,
}: PlayerControlsProps) {
  // Single click / double click detection
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickCountRef = useRef(0)

  // YouTube-style settings menu state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('main')

  // Effective settings visibility — auto-close when controls hide
  const effectiveSettingsOpen = visible && settingsOpen

  // Notify parent when settings is open so controls don't auto-hide
  useEffect(() => {
    onControlsBusy?.(settingsOpen)
  }, [settingsOpen, onControlsBusy])

  const handleContainerClick = () => {
    // Single click toggles controls visibility
    // Double click toggles fullscreen
    clickCountRef.current += 1

    if (clickCountRef.current === 1) {
      clickTimerRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) {
          // Single click — toggle controls visibility
          if (visible) {
            onControlsBusy?.(false)
          }
          // Parent will handle showing controls
          onToggleControlsVisibility?.()
        }
        clickCountRef.current = 0
      }, 250)
    } else if (clickCountRef.current >= 2) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
      clickCountRef.current = 0
      onToggleFullscreen()
    }
  }

  const hasQualityLevels = qualityLevels.length > 0
  const hasAudioTracks = audioTracks.length > 1
  const hasSubtitleTracks = subtitleTracks.length > 0

  // Short quality label for display (just resolution without bitrate)
  const currentQualityShort = currentQuality === -1
    ? 'Auto'
    : qualityLevels.find(q => q.index === currentQuality)?.label.split(' · ')[0] || 'Auto'

  // Speed label
  const speedLabel = playbackRate === 1 ? 'Normal' : `${playbackRate}x`

  // Aspect label
  const aspectLabel = ASPECT_MODES.find(a => a.value === aspectMode)?.label || 'Fit'

  // Audio track label
  const audioLabel = currentAudioTrack === -1
    ? 'Default'
    : audioTracks.find(t => t.id === currentAudioTrack)?.name || 'Default'

  // Subtitle label
  const subtitleLabel = currentSubtitleTrack === -1
    ? 'Off'
    : subtitleTracks.find(t => t.id === currentSubtitleTrack)?.name || 'Off'

  // Zoom label
  const zoomLabel = ZOOM_OPTIONS.find(z => z.value === zoomLevel)?.label || `${Math.round(zoomLevel * 100)}%`

  // ── Settings menu content (shared between iframe & normal mode) ──
  const renderSettingsContent = (compact = false) => (
    <>
      {/* Main settings page */}
      {settingsPage === 'main' && (
        <div className="py-1">
          {/* Quality row */}
          {hasQualityLevels && (
            <button
              onClick={() => setSettingsPage('quality')}
              className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <span>Quality</span>
              <div className="flex items-center gap-1 text-white/50">
                <span className="text-[12px]">{currentQualityShort}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          )}

          {/* Playback speed */}
          <button
            onClick={() => setSettingsPage('speed')}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-white/60" />
              <span>Speed</span>
            </div>
            <div className="flex items-center gap-1 text-white/50">
              <span className="text-[12px]">{speedLabel}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>

          {/* Aspect ratio */}
          <button
            onClick={() => setSettingsPage('aspect')}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Maximize2 className="h-3.5 w-3.5 text-white/60" />
              <span>Aspect</span>
            </div>
            <div className="flex items-center gap-1 text-white/50">
              <span className="text-[12px]">{aspectLabel}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>

          {/* Audio tracks */}
          {hasAudioTracks && (
            <button
              onClick={() => setSettingsPage('audio')}
              className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Headphones className="h-3.5 w-3.5 text-white/60" />
                <span>Audio</span>
              </div>
              <div className="flex items-center gap-1 text-white/50">
                <span className="text-[12px]">{audioLabel}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          )}

          {/* Subtitle tracks */}
          {hasSubtitleTracks && (
            <button
              onClick={() => setSettingsPage('subtitles')}
              className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Subtitles className="h-3.5 w-3.5 text-white/60" />
                <span>Subtitles</span>
              </div>
              <div className="flex items-center gap-1 text-white/50">
                <span className="text-[12px]">{subtitleLabel}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          )}

          {/* Zoom */}
          <button
            onClick={() => setSettingsPage('zoom')}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ZoomIn className="h-3.5 w-3.5 text-white/60" />
              <span>Zoom</span>
            </div>
            <div className="flex items-center gap-1 text-white/50">
              <span className="text-[12px]">{zoomLabel}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </button>

          {/* Deinterlace toggle */}
          {showDeinterlace && (
            <button
              onClick={() => onDeinterlaceChange?.(!deinterlace)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Scan className="h-3.5 w-3.5 text-white/60" />
                <span>Deinterlace</span>
              </div>
              <span className={`text-[12px] font-medium ${deinterlace ? 'text-primary' : 'text-white/40'}`}>
                {deinterlace ? 'On' : 'Off'}
              </span>
            </button>
          )}

          {/* Stats for nerds */}
          {hlsStats && (
            <button
              onClick={() => setSettingsPage('stats')}
              className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <span>Stats for nerds</span>
              <ChevronRight className="h-3.5 w-3.5 text-white/50" />
            </button>
          )}
        </div>
      )}

      {/* Quality sub-page */}
      {settingsPage === 'quality' && hasQualityLevels && (
        <div>
          <SettingsSubHeader label="Quality" onBack={() => setSettingsPage('main')} />
          <div className="py-1 max-h-56 overflow-y-auto">
            <SettingsOption
              label="Auto"
              active={currentQuality === -1}
              subLabel={currentQuality === -1 ? '(Adaptive)' : undefined}
              onClick={() => { onQualityChange?.(-1); setSettingsOpen(false); setSettingsPage('main') }}
            />
            {[...qualityLevels].reverse().map((level) => {
              const shortLabel = level.label.split(' · ')[0]
              return (
                <SettingsOption
                  key={level.index}
                  label={shortLabel}
                  active={currentQuality === level.index}
                  subLabel={`${(level.bitrate / 1000000).toFixed(1)}Mbps`}
                  onClick={() => { onQualityChange?.(level.index); setSettingsOpen(false); setSettingsPage('main') }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Speed sub-page */}
      {settingsPage === 'speed' && (
        <div>
          <SettingsSubHeader label="Playback Speed" onBack={() => setSettingsPage('main')} />
          <div className="py-1 max-h-64 overflow-y-auto">
            {PLAYBACK_SPEEDS.map((speed) => (
              <SettingsOption
                key={speed.value}
                label={speed.label}
                active={playbackRate === speed.value}
                subLabel={speed.value === 1 && playbackRate !== 1 ? '(Default)' : undefined}
                onClick={() => { onPlaybackRateChange?.(speed.value); setSettingsOpen(false); setSettingsPage('main') }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Aspect ratio sub-page */}
      {settingsPage === 'aspect' && (
        <div>
          <SettingsSubHeader label="Aspect Ratio" onBack={() => setSettingsPage('main')} />
          <div className="py-1">
            {ASPECT_MODES.map((mode) => (
              <SettingsOption
                key={mode.value}
                label={mode.label}
                active={aspectMode === mode.value}
                onClick={() => { onAspectModeChange?.(mode.value); setSettingsOpen(false); setSettingsPage('main') }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Audio track sub-page */}
      {settingsPage === 'audio' && hasAudioTracks && (
        <div>
          <SettingsSubHeader label="Audio Track" onBack={() => setSettingsPage('main')} />
          <div className="py-1 max-h-64 overflow-y-auto">
            {audioTracks.map((track) => (
              <SettingsOption
                key={track.id}
                label={track.name}
                active={currentAudioTrack === track.id}
                subLabel={track.lang && track.lang !== track.name ? track.lang : undefined}
                onClick={() => { onAudioTrackChange?.(track.id); setSettingsOpen(false); setSettingsPage('main') }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Subtitle track sub-page */}
      {settingsPage === 'subtitles' && hasSubtitleTracks && (
        <div>
          <SettingsSubHeader label="Subtitles" onBack={() => setSettingsPage('main')} />
          <div className="py-1 max-h-64 overflow-y-auto">
            <SettingsOption
              label="Off"
              active={currentSubtitleTrack === -1}
              onClick={() => { onSubtitleTrackChange?.(-1); setSettingsOpen(false); setSettingsPage('main') }}
            />
            {subtitleTracks.map((track) => (
              <SettingsOption
                key={track.id}
                label={track.name}
                active={currentSubtitleTrack === track.id}
                subLabel={track.lang && track.lang !== track.name ? track.lang : undefined}
                onClick={() => { onSubtitleTrackChange?.(track.id); setSettingsOpen(false); setSettingsPage('main') }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Zoom sub-page */}
      {settingsPage === 'zoom' && (
        <div>
          <SettingsSubHeader label="Zoom" onBack={() => setSettingsPage('main')} />
          <div className="py-1">
            {ZOOM_OPTIONS.map((opt) => (
              <SettingsOption
                key={opt.value}
                label={opt.label}
                active={zoomLevel === opt.value}
                onClick={() => { onZoomChange?.(opt.value); setSettingsOpen(false); setSettingsPage('main') }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stats for nerds sub-page */}
      {settingsPage === 'stats' && hlsStats && (
        <div>
          <SettingsSubHeader label="Stats for nerds" onBack={() => setSettingsPage('main')} />
          <div className="px-4 py-2.5 text-[11px] text-white/60 space-y-1.5">
            <div className="flex justify-between">
              <span>Bandwidth</span>
              <span className="text-white/90 font-medium">{formatBandwidth(hlsStats.bandwidth)}</span>
            </div>
            <div className="flex justify-between">
              <span>Buffer Health</span>
              <span className={`font-medium ${hlsStats.bufferLength < 2 ? 'text-yellow-400' : 'text-green-400'}`}>
                {hlsStats.bufferLength.toFixed(1)}s
              </span>
            </div>
            <div className="flex justify-between">
              <span>Dropped Frames</span>
              <span className={`font-medium ${hlsStats.droppedFrames > 10 ? 'text-red-400' : 'text-white/90'}`}>
                {hlsStats.droppedFrames}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Current Quality</span>
              <span className="text-white/90 font-medium">{currentQualityShort}</span>
            </div>
            <div className="flex justify-between">
              <span>ABR Mode</span>
              <span className="text-white/90 font-medium">{hlsStats.autoLevelEnabled ? 'Auto' : 'Manual'}</span>
            </div>
            <div className="flex justify-between">
              <span>Speed</span>
              <span className="text-white/90 font-medium">{speedLabel}</span>
            </div>
            {hasAudioTracks && (
              <div className="flex justify-between">
                <span>Audio</span>
                <span className="text-white/90 font-medium">{audioLabel}</span>
              </div>
            )}
            {hasSubtitleTracks && (
              <div className="flex justify-between">
                <span>Subtitles</span>
                <span className="text-white/90 font-medium">{subtitleLabel}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )

  // ── Iframe Mode: Minimal Controls with auto-hide ──
  if (isIframe) {
    return (
      <>
        {/* Controls overlay — fades in/out based on visibility */}
        <div
          className={`absolute inset-0 z-10 transition-opacity duration-300 pointer-events-none ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* YouTube-style settings popup */}
          {effectiveSettingsOpen && (
            <div
              className="absolute bottom-[52px] right-2 w-56 bg-[#121212]/95 backdrop-blur-md rounded-lg overflow-hidden shadow-2xl border border-white/[0.08] animate-in fade-in-0 slide-in-from-bottom-1 duration-150 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {renderSettingsContent(true)}
            </div>
          )}

          {/* Title + live indicator bar at top */}
          <div
            className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent px-3 pt-2.5 pb-6 pointer-events-none"
          >
            <div className="flex items-center gap-2">
              <p className="text-white text-[13px] font-medium truncate">{title}</p>
              {isLive && (
                <span className="flex items-center gap-1 text-[10px] text-red-400 font-semibold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
          </div>

          {/* Control bar at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1">
              {iframeTouchLocked && onToggleIframeTouchLock && (
                <button
                  onClick={onToggleIframeTouchLock}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-1.5"
                  title="Unlock player to interact with video (e.g. unmute)"
                >
                  <Unlock className="h-4 w-4 text-amber-400" />
                  <span className="text-[11px] text-amber-400 font-medium">Unlock</span>
                </button>
              )}
              {!iframeTouchLocked && onToggleIframeTouchLock && (
                <button
                  onClick={onToggleIframeTouchLock}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-1.5"
                  title="Lock player to block ads"
                >
                  <Lock className="h-4 w-4 text-green-400" />
                  <span className="text-[11px] text-green-400 font-medium">Lock</span>
                </button>
              )}
              <div className="flex-1" />
              {onTogglePiP && 'pictureInPictureEnabled' in document && (
                <button
                  onClick={onTogglePiP}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  title="Picture in Picture"
                >
                  <PictureInPicture2 className="h-5 w-5 text-white" />
                </button>
              )}
              <button
                onClick={onToggleFullscreen}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize className="h-5 w-5 text-white" />
                ) : (
                  <Maximize className="h-5 w-5 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error overlay */}
        {hasError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 pointer-events-auto">
            <div className="flex flex-col items-center gap-2 max-w-xs text-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-white text-sm">{errorMessage || 'Stream error'}</p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Normal (HLS) Mode: Full Controls with VLC-like features ──
  return (
    <div
      className={`absolute inset-0 z-10 transition-opacity duration-300 ${
        visible ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'
      }`}
      onClick={(e) => {
        if (effectiveSettingsOpen) {
          setSettingsOpen(false)
          setSettingsPage('main')
          e.stopPropagation()
          return
        }
        e.stopPropagation()
        handleContainerClick()
      }}
    >
      {/* Top gradient + title */}
      <div
        className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent px-3 pt-2.5 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-white text-[13px] font-medium truncate">{title}</p>
      </div>

      {/* Center play/pause button */}
      <div className="absolute inset-0 flex items-center justify-center">
        {hasError ? (
          <div className="flex flex-col items-center gap-2 max-w-xs text-center">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-white text-sm">{errorMessage || 'Stream error'}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} className="gap-1">
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePlay() }}
            className="p-2 rounded-full bg-black/40 hover:bg-black/60 transition-all btn-press cursor-pointer opacity-0 group-hover:opacity-100"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="h-6 w-6 text-white ml-0.5" />
            )}
          </button>
        )}
      </div>

      {/* Bottom controls bar */}
      <div
        className="absolute bottom-0 left-0 right-0 player-controls-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* YouTube-style settings popup */}
        {effectiveSettingsOpen && (
          <div
            className="absolute bottom-[52px] right-2 w-56 bg-[#121212]/95 backdrop-blur-md rounded-lg overflow-hidden shadow-2xl border border-white/[0.08] animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSettingsContent()}
          </div>
        )}

        {/* Progress / info row */}
        <div className="flex items-center gap-2 mb-1.5 px-3">
          {isLive && !isBehindLive && (
            <span className="flex items-center gap-1.5 text-[11px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold leading-none">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-live-pulse" />
              LIVE
            </span>
          )}
          {isLive && isBehindLive && (
            <button
              onClick={(e) => { e.stopPropagation(); onBackToLive?.() }}
              className="flex items-center gap-1.5 text-[11px] bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded font-bold leading-none transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
              BACK TO LIVE
            </button>
          )}
          {hlsStats && hlsStats.bufferLength < 2 && hlsStats.bufferLength >= 0 && (
            <span className="text-[10px] text-yellow-400/80">&#9888; Buffering</span>
          )}
          {/* Speed indicator when not 1x */}
          {playbackRate !== 1 && (
            <span className="text-[10px] text-white/60 bg-white/10 px-1.5 py-0.5 rounded font-medium">
              {playbackRate}x
            </span>
          )}
          {/* Zoom indicator when zoomed */}
          {zoomLevel !== 1 && (
            <span className="text-[10px] text-white/60 bg-white/10 px-1.5 py-0.5 rounded font-medium">
              {zoomLabel}
            </span>
          )}
        </div>

        {/* Main control buttons */}
        <div className="flex items-center gap-0.5 px-1">
          {/* Play/Pause */}
          <button
            onClick={onTogglePlay}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 text-white" />
            ) : (
              <Play className="h-5 w-5 text-white" />
            )}
          </button>

          {/* Volume */}
          <div className="flex items-center">
            <button
              onClick={onToggleMute}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5 text-white" />
              ) : (
                <Volume2 className="h-5 w-5 text-white" />
              )}
            </button>
            <div className="w-16 sm:w-20 ml-0.5">
              <Slider
                value={[isMuted ? 0 : volume * 100]}
                max={100}
                step={1}
                onValueChange={(val) => onVolumeChange(val[0] / 100)}
                className="cursor-pointer [&_[data-slot=slider-track]]:bg-white/20 [&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:shadow-none"
              />
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Screenshot button */}
          {onScreenshot && (
            <button
              onClick={onScreenshot}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Screenshot (Shift+S)"
            >
              <Camera className="h-4.5 w-4.5 text-white" />
            </button>
          )}

          {/* Subtitle toggle button */}
          {hasSubtitleTracks && (
            <button
              onClick={() => {
                // Toggle: if off → first track, if on → off
                if (currentSubtitleTrack === -1) {
                  onSubtitleTrackChange?.(0)
                } else {
                  onSubtitleTrackChange?.(-1)
                }
              }}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${currentSubtitleTrack >= 0 ? 'bg-white/20' : ''}`}
              title={currentSubtitleTrack >= 0 ? 'Subtitles On — Click to turn off' : 'Subtitles Off — Click to turn on'}
            >
              <Subtitles className={`h-4.5 w-4.5 ${currentSubtitleTrack >= 0 ? 'text-primary' : 'text-white'}`} />
            </button>
          )}

          {/* Settings gear — YouTube style */}
          <button
            onClick={() => {
              setSettingsOpen(!settingsOpen)
              setSettingsPage('main')
            }}
            className={`p-1.5 rounded-full hover:bg-white/10 transition-all ${effectiveSettingsOpen ? 'rotate-45' : ''}`}
            title="Settings"
          >
            <Settings className="h-5 w-5 text-white" />
          </button>

          {/* PiP */}
          {onTogglePiP && 'pictureInPictureEnabled' in document && (
            <button
              onClick={onTogglePiP}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Picture in Picture"
            >
              <PictureInPicture2 className="h-5 w-5 text-white" />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="h-5 w-5 text-white" />
            ) : (
              <Maximize className="h-5 w-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
