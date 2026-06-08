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
  Loader2,
  AlertCircle,
  RefreshCw,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { QualityLevel, HlsStats } from './hls-player'

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
  onRetry?: () => void
  visible: boolean
  onControlsBusy?: (busy: boolean) => void
  // HLS quality controls
  qualityLevels?: QualityLevel[]
  currentQuality?: number
  onQualityChange?: (level: number) => void
  hlsStats?: HlsStats | null
}

function formatBandwidth(bps: number): string {
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`
  return `${bps} bps`
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
  onRetry,
  visible,
  onControlsBusy,
  qualityLevels = [],
  currentQuality = -1,
  onQualityChange,
  hlsStats,
}: PlayerControlsProps) {
  // Single click / double click detection
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickCountRef = useRef(0)

  // YouTube-style settings menu state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'main' | 'quality' | 'stats'>('main')

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

  // Short quality label for display (just resolution without bitrate)
  const currentQualityShort = currentQuality === -1
    ? 'Auto'
    : qualityLevels.find(q => q.index === currentQuality)?.label.split(' · ')[0] || 'Auto'

  return (
    <div
      className={`absolute inset-0 z-10 transition-opacity duration-300 ${
        visible ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'
      }`}
      onClick={(e) => {
        // Don't toggle play when settings is open
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

      {/* Center play/pause button — smaller, YouTube-style */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isLoading ? (
          <div className="p-2.5 rounded-full bg-black/50 glass">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        ) : hasError ? (
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-white text-sm">Stream error</p>
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

      {/* Bottom controls bar — YouTube style */}
      <div
        className="absolute bottom-0 left-0 right-0 player-controls-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* YouTube-style settings popup — positioned right above the buttons row */}
        {effectiveSettingsOpen && (
          <div
            className="absolute bottom-[52px] right-2 w-56 bg-[#121212]/95 backdrop-blur-md rounded-lg overflow-hidden shadow-2xl border border-white/[0.08] animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
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
                {/* Back header */}
                <button
                  onClick={() => setSettingsPage('main')}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors border-b border-white/[0.06] cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                  <span className="font-medium">Quality</span>
                </button>
                <div className="py-1 max-h-56 overflow-y-auto">
                  {/* Auto option */}
                  <button
                    onClick={() => {
                      onQualityChange?.(-1)
                      setSettingsOpen(false)
                      setSettingsPage('main')
                    }}
                    className={`w-full text-left px-6 py-2 text-[13px] transition-colors cursor-pointer ${
                      currentQuality === -1
                        ? 'text-primary font-medium'
                        : 'text-white/80 hover:bg-white/[0.08]'
                    }`}
                  >
                    Auto
                    {currentQuality === -1 && (
                      <span className="text-white/40 text-[11px] ml-1.5">(Adaptive)</span>
                    )}
                  </button>
                  {/* Quality levels sorted high → low */}
                  {[...qualityLevels].reverse().map((level) => {
                    const shortLabel = level.label.split(' · ')[0]
                    return (
                      <button
                        key={level.index}
                        onClick={() => {
                          onQualityChange?.(level.index)
                          setSettingsOpen(false)
                          setSettingsPage('main')
                        }}
                        className={`w-full text-left px-6 py-2 text-[13px] transition-colors cursor-pointer ${
                          currentQuality === level.index
                            ? 'text-primary font-medium'
                            : 'text-white/80 hover:bg-white/[0.08]'
                        }`}
                      >
                        {shortLabel}
                        <span className="text-white/30 text-[11px] ml-1.5">
                          {(level.bitrate / 1000000).toFixed(1)}Mbps
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Stats for nerds sub-page */}
            {settingsPage === 'stats' && hlsStats && (
              <div>
                <button
                  onClick={() => setSettingsPage('main')}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.08] transition-colors border-b border-white/[0.06] cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                  <span className="font-medium">Stats for nerds</span>
                </button>
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
                </div>
              </div>
            )}
          </div>
        )}

        {/* Control bar */}
        <div className="bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-5">
          {/* Progress / info row */}
          <div className="flex items-center gap-2 mb-1.5">
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
            {/* Stream health — compact */}
            {hlsStats && hlsStats.bufferLength < 2 && hlsStats.bufferLength >= 0 && (
              <span className="text-[10px] text-yellow-400/80">⚠ Buffering</span>
            )}
          </div>

          {/* Main control buttons — YouTube layout */}
          <div className="flex items-center gap-1">
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
              {/* Volume slider — always visible, compact width */}
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

            {/* Settings gear — YouTube style */}
            {(hasQualityLevels || hlsStats) && (
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
            )}

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
    </div>
  )
}
