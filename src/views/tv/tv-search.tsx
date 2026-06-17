'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChannels } from '@/lib/hooks'
import { TVChannelCard } from '@/components/tv/tv-channel-card'
import { Search, Tv } from 'lucide-react'

const POPULAR_QUERIES = ['sports', 'cricket', 'news', 'football', 'movies', 'star', 'sony', 'geo']

export function TVSearch() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { channels, loading } = useChannels(debounced ? { search: debounced } : {})

  // Debounce
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 350)
    return () => window.clearTimeout(t)
  }, [query])

  // Focus the input on mount
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 120)
    return () => window.clearTimeout(t)
  }, [])

  const results = useMemo(() => channels, [channels])

  const submitQuick = (q: string) => {
    setQuery(q)
  }

  return (
    <div>
      <div className="tv-section-header" style={{ marginBottom: '1.25rem' }}>
        <div className="tv-section-title">
          <Search className="h-6 w-6" style={{ color: 'var(--primary)' }} />
          Search
        </div>
      </div>

      {/* Search input — focusable so remote can activate it, then on-screen keyboard appears */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels by name or category…"
          className="tv-focusable"
          data-tv-focus
          aria-label="Search channels"
          style={{
            width: '100%',
            padding: '1rem 1.25rem 1rem 3rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '2px solid var(--border)',
            borderRadius: '0.875rem',
            outline: 'none',
          }}
        />
        <Search
          className="h-5 w-5"
          style={{
            position: 'absolute',
            left: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted-foreground)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Quick queries */}
      {!debounced && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              fontSize: '0.9rem',
              color: 'var(--muted-foreground)',
              fontWeight: 600,
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Popular searches
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {POPULAR_QUERIES.map((q) => (
              <button
                key={q}
                className="tv-watch-stream-btn tv-focusable"
                data-tv-focus
                onClick={() => submitQuick(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {debounced && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {loading ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
            </div>
            <div style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
              for &ldquo;{debounced}&rdquo;
            </div>
          </div>

          {!loading && results.length === 0 ? (
            <div className="tv-empty">
              <Tv className="h-10 w-10" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <div className="tv-empty-title">No channels found</div>
              <div>Try a different keyword.</div>
            </div>
          ) : (
            <div className="tv-grid-channels">
              {results.map((c) => (
                <TVChannelCard key={c.id} channel={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
