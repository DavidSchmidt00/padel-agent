import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import usePresets from '../hooks/usePresets'

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6]

function formatDayLabel(dateStr, lang) {
  // T12:00:00 avoids DST midnight-shift issues when parsing local dates
  const d = new Date(dateStr + 'T12:00:00')
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(d)
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  return `${weekday} ${day}.${month}`
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addDays(dateStr, days) {
  // T12:00:00 avoids DST midnight-shift issues when parsing local dates
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function FindMode({ region, profile, initialParams, onParamsConsumed }) {
  const { t, i18n } = useTranslation()

  const [clubs, setClubs] = useState(
    profile?.preferred_club_slug
      ? [{ slug: profile.preferred_club_slug, name: profile.preferred_club_name || profile.preferred_club_slug }]
      : []
  )
  const [clubInput, setClubInput] = useState('')
  const [clubOptions, setClubOptions] = useState([])
  const [clubSearching, setClubSearching] = useState(false)
  const clubDebounceRef = useRef(null)
  const containerRef = useRef(null)
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo] = useState(addDays(todayStr(), 6))
  const [duration, setDuration] = useState('')
  const [courtType, setCourtType] = useState('')
  const [windows, setWindows] = useState([
    { days: [0, 1, 2, 3, 4], start: '18:00', end: '22:00' },
  ])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [formExpanded, setFormExpanded] = useState(true)
  const [voteMode, setVoteMode] = useState(false)
  const [selected, setSelected] = useState({})
  const [voteUrl, setVoteUrl] = useState(null)
  const [voteLoading, setVoteLoading] = useState(false)
  const [voteError, setVoteError] = useState(null)
  const [voteCopied, setVoteCopied] = useState(false)
  const [expandedTimes, setExpandedTimes] = useState({})
  const { presets, savePreset, deletePreset } = usePresets()
  const [newPresetName, setNewPresetName] = useState('')
  const [showSavePreset, setShowSavePreset] = useState(false)
  const presetInputRef = useRef(null)
  const consumedParamsRef = useRef(null)

  useEffect(() => {
    if (showSavePreset && presetInputRef.current) {
      presetInputRef.current.focus()
    }
  }, [showSavePreset])

  useEffect(() => {
    if (!initialParams || consumedParamsRef.current === initialParams) return
    consumedParamsRef.current = initialParams

    if (initialParams.club_slug) {
      setClubs([{ slug: initialParams.club_slug, name: initialParams.club_name || initialParams.club_slug }])
    }

    // Ensure date range is always valid: derive missing bound, clamp if inverted
    let resolvedFrom = dateFrom
    let resolvedTo = null
    if (initialParams.date_from || initialParams.date_to) {
      resolvedFrom = initialParams.date_from ?? dateFrom
      resolvedTo =
        initialParams.date_to && initialParams.date_to >= resolvedFrom
          ? initialParams.date_to
          : addDays(resolvedFrom, 6)
      if (initialParams.date_from) setDateFrom(resolvedFrom)
      setDateTo(resolvedTo)
    }

    if (initialParams.duration) setDuration(String(initialParams.duration))
    if (initialParams.court_type) setCourtType(initialParams.court_type)

    // Update time window: apply time bounds and derive selected days from the date range
    const hasDate = initialParams.date_from || initialParams.date_to
    const hasTime = initialParams.time_from || initialParams.time_to
    if (hasDate || hasTime) {
      const daysInRange = []
      if (hasDate && resolvedTo) {
        // Convert date range to weekday indices (0=Mon … 6=Sun)
        const cur = new Date(resolvedFrom + 'T12:00:00')
        const end = new Date(resolvedTo + 'T12:00:00')
        while (cur <= end) {
          const d = (cur.getDay() + 6) % 7
          if (!daysInRange.includes(d)) daysInRange.push(d)
          cur.setDate(cur.getDate() + 1)
        }
        daysInRange.sort((a, b) => a - b)
      }
      setWindows((prev) =>
        prev.map((w, i) => {
          if (i !== 0) return w
          return {
            ...w,
            ...(daysInRange.length > 0 ? { days: daysInRange } : {}),
            ...(initialParams.time_from ? { start: initialParams.time_from } : {}),
            ...(initialParams.time_to ? { end: initialParams.time_to } : {}),
          }
        })
      )
    }
    onParamsConsumed?.()
  }, [initialParams, onParamsConsumed, dateFrom])
  function handleSavePreset() {
    if (!newPresetName.trim()) return
    const today = new Date(todayStr() + 'T12:00:00')
    const from = new Date(dateFrom + 'T12:00:00')
    const to = new Date(dateTo + 'T12:00:00')
    const offsetFrom = Math.round((from - today) / (1000 * 60 * 60 * 24))
    const offsetTo = Math.round((to - today) / (1000 * 60 * 60 * 24))

    savePreset(newPresetName, {
      clubs,
      duration,
      courtType,
      windows,
      offsetFrom,
      offsetTo
    })
    setNewPresetName('')
  }

  function handleLoadPreset(settings) {
    if (!settings) return
    if (settings.clubs) setClubs(settings.clubs)
    else if (settings.clubSlug) setClubs([{ slug: settings.clubSlug, name: settings.clubName || settings.clubSlug }])
    setDuration(settings.duration || '')
    setCourtType(settings.courtType || '')
    setWindows(settings.windows || [])

    const currentToday = todayStr()
    if (settings.offsetFrom !== undefined) {
      setDateFrom(addDays(currentToday, settings.offsetFrom))
    }
    if (settings.offsetTo !== undefined) {
      setDateTo(addDays(currentToday, settings.offsetTo))
    }
  }

  function getSearchSummary() {
    const clubsLabel = clubs.map((c) => c.name).join(', ') || '—'
    const dateRange = `${formatShortDate(dateFrom)} – ${formatShortDate(dateTo)}`
    const windowTexts = windows
      .map((w) => {
        const days = w.days.map((d) => t(`findMode.days.${d}`)).join(' ')
        return `${days} ${w.start}–${w.end}`
      })
      .join(', ')
    return `${clubsLabel} · ${dateRange} · ${windowTexts}`
  }

  function handleClubInputChange(val) {
    setClubInput(val)
    setClubOptions([])
    if (clubDebounceRef.current) clearTimeout(clubDebounceRef.current)
    if (val.length < 2) return
    clubDebounceRef.current = setTimeout(async () => {
      setClubSearching(true)
      try {
        const res = await fetch(`/api/clubs?q=${encodeURIComponent(val)}`)
        if (res.ok) setClubOptions(await res.json())
      } catch {
        // ignore transient search errors
      } finally {
        setClubSearching(false)
      }
    }, 300)
  }

  function selectClub(club) {
    if (!clubs.find((c) => c.slug === club.slug)) {
      setClubs((prev) => [...prev, { slug: club.slug, name: club.name }])
    }
    setClubInput('')
    setClubOptions([])
  }

  function removeClub(slug) {
    setClubs((prev) => prev.filter((c) => c.slug !== slug))
  }

  function handleDateFromChange(val) {
    setDateFrom(val)
    const maxTo = addDays(val, 13)
    if (dateTo > maxTo) setDateTo(maxTo)
    if (dateTo < val) setDateTo(val)
  }

  function addWindow() {
    setWindows((prev) => [...prev, { days: [], start: '18:00', end: '22:00' }])
  }

  function removeWindow(idx) {
    setWindows((prev) => prev.filter((_, i) => i !== idx))
  }

  function toggleDay(winIdx, day) {
    setWindows((prev) =>
      prev.map((w, i) => {
        if (i !== winIdx) return w
        const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day]
        return { ...w, days }
      })
    )
  }

  function updateWindowTime(winIdx, field, val) {
    setWindows((prev) =>
      prev.map((w, i) => (i === winIdx ? { ...w, [field]: val } : w))
    )
  }

  function handleClearSearch() {
    setClubs(
      profile?.preferred_club_slug
        ? [{ slug: profile.preferred_club_slug, name: profile.preferred_club_name || profile.preferred_club_slug }]
        : []
    )
    setClubInput('')
    setClubOptions([])
    setDateFrom(todayStr())
    setDateTo(addDays(todayStr(), 6))
    setDuration('')
    setCourtType('')
    setWindows([{ days: [0, 1, 2, 3, 4], start: '18:00', end: '22:00' }])
    setResults(null)
    setSummary(null)
    setError(null)
    setExpandedTimes({})
    setFormExpanded(true)
  }
  async function handleSearch(e) {
    e.preventDefault()
    if (clubs.length === 0) {
      setError(t('findMode.club_not_selected'))
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)
    setSummary(null)
    setExpandedTimes({})

    try {
      const body = {
        club_slugs: clubs.map((c) => c.slug),
        club_names: clubs.map((c) => c.name),
        date_from: dateFrom,
        date_to: dateTo,
        time_windows: windows,
        timezone: region?.timezone || undefined,
        language: region?.language || undefined,
        country: region?.country || undefined,
      }
      if (duration) body.duration = parseInt(duration, 10)
      if (courtType) body.court_type = courtType

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.detail || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setResults(data.results)
      setSummary({ count: data.total_count, days: data.dates_checked })
      setFormExpanded(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenVoteMode() {
    setSelected({})
    setVoteUrl(null)
    setVoteError(null)
    setVoteCopied(false)
    setVoteMode(true)
  }

  function selectAll(val) {
    setSelected(prev => Object.fromEntries(Object.keys(prev).map(k => [k, val])))
  }

  async function handleCreateVote() {
    const chosenSlots = results.filter((_, i) => selected[i])
    if (chosenSlots.length === 0) {
      setVoteError(t('vote.no_slots_selected'))
      return
    }
    setVoteLoading(true)
    setVoteError(null)
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: chosenSlots }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const shareUrl = `${window.location.origin}/vote/${data.vote_id}`
      setVoteUrl(shareUrl)
      await navigator.clipboard.writeText(shareUrl).catch(() => {})
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setVoteError(t('vote.error'))
    } finally {
      setVoteLoading(false)
    }
  }

  function handleCopyVoteUrl() {
    navigator.clipboard.writeText(voteUrl).catch(() => {})
    setVoteCopied(true)
    setTimeout(() => setVoteCopied(false), 2000)
  }

  function toggleTimeGroup(date, time) {
    const key = `${date}|${time}`
    setExpandedTimes(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Group results by date → time, keeping flat index for vote selection
  const grouped = results
    ? results.reduce((acc, slot, idx) => {
      if (!acc[slot.date]) acc[slot.date] = {}
      if (!acc[slot.date][slot.local_time]) acc[slot.date][slot.local_time] = []
      acc[slot.date][slot.local_time].push({ ...slot, _idx: idx })
      return acc
    }, {})
    : null

  return (
    <div className="find-mode-root">
      {/* Collapsed summary bar — outside scroll area so it never scrolls away */}
      {!formExpanded && (
        <div className="find-filter-bar-outer">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
            <button className="find-filter-summary-bar" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }} onClick={() => setFormExpanded(true)}>
              <span className="find-filter-summary-text">{getSearchSummary()}</span>
              <span className="find-filter-edit-label">{t('findMode.edit_search')} ✏️</span>
            </button>
            <button
              type="button"
              className="clear-chat-btn"
              onClick={handleClearSearch}
              title={t('findMode.clear_search', { defaultValue: 'Clear search' })}
            >
              🗑️
            </button>
          </div>
        </div>
      )}

    <div className="find-container" ref={containerRef}>
      {/* Expandable form */}
      {formExpanded && (
        <form className="find-form" onSubmit={handleSearch}>
          {/* Club search autocomplete — multi-select */}
          <div className="find-field">
            <label>{t('findMode.club_label')}</label>
            {clubs.length > 0 && (
              <div className="find-club-chips">
                {clubs.map((c) => (
                  <span key={c.slug} className="find-club-chip">
                    {c.name}
                    <button type="button" className="find-club-chip-remove" onClick={() => removeClub(c.slug)} aria-label={`Remove ${c.name}`}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="find-club-wrap">
              <input
                type="text"
                value={clubInput}
                onChange={(e) => handleClubInputChange(e.target.value)}
                onBlur={() => setTimeout(() => setClubOptions([]), 150)}
                placeholder={t('findMode.club_placeholder')}
                autoComplete="off"
              />
              {clubSearching && <span className="find-club-spinner">{t('findMode.club_searching')}</span>}
              {clubOptions.length > 0 && (
                <ul className="find-club-dropdown">
                  {clubOptions.map((c) => (
                    <li key={c.slug} onMouseDown={() => selectClub(c)}>
                      {c.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Date range */}
          <div className="find-field">
            <label>{t('findMode.date_from')}</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {[
                { label: t('findMode.next_7_days', { defaultValue: 'Next 7 days' }), days: 6 },
                { label: t('findMode.next_2_weeks', { defaultValue: 'Next 2 weeks' }), days: 13 },
                { label: t('findMode.next_month', { defaultValue: 'Next month' }), days: 29 },
              ].map(({ label, days }) => {
                const today = todayStr()
                const end = addDays(today, days)
                const active = dateFrom === today && dateTo === end
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => { setDateFrom(today); setDateTo(end) }}
                    className="suggestion-chip"
                    style={active ? { background: 'var(--accent-subtle)', borderColor: 'rgba(6,182,212,0.4)', color: 'var(--accent)' } : {}}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="find-field--row" style={{ margin: 0 }}>
              <div className="find-field" style={{ gap: 0 }}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  required
                />
              </div>
              <div className="find-field" style={{ gap: 0 }}>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Duration + Court type */}
          <div className="find-field--row">
            <div className="find-field">
              <label>{t('findMode.duration')}</label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="">{t('findMode.any_duration')}</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
                <option value="120">120 min</option>
              </select>
            </div>
            <div className="find-field">
              <label>{t('findMode.court_type')}</label>
              <select value={courtType} onChange={(e) => setCourtType(e.target.value)}>
                <option value="">{t('findMode.any_court')}</option>
                <option value="SINGLE">{t('findMode.single')}</option>
                <option value="DOUBLE">{t('findMode.double')}</option>
              </select>
            </div>
          </div>

          {/* Time windows */}
          <div className="find-field">
            <label>{t('findMode.time_windows')}</label>
            {windows.map((w, idx) => (
              <div key={idx} className="find-window">
                <div className="find-window-days">
                  {DAY_KEYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={`day-btn${w.days.includes(day) ? ' active' : ''}`}
                      onClick={() => toggleDay(idx, day)}
                    >
                      {t(`findMode.days.${day}`)}
                    </button>
                  ))}
                </div>
                <div className="find-window-times">
                  <span>{t('findMode.from_time')}</span>
                  <input
                    type="time"
                    value={w.start}
                    onChange={(e) => updateWindowTime(idx, 'start', e.target.value)}
                  />
                  <span>{t('findMode.to_time')}</span>
                  <input
                    type="time"
                    value={w.end}
                    onChange={(e) => updateWindowTime(idx, 'end', e.target.value)}
                  />
                  {windows.length > 1 && (
                    <button type="button" className="find-remove-btn" onClick={() => removeWindow(idx)}>
                      {t('findMode.remove_window')}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="find-add-btn" onClick={addWindow}>
              {t('findMode.add_window')}
            </button>
          </div>

          {/* Bottom action row: Search + Save preset */}
          <div className={`find-preset-save-row${showSavePreset ? ' find-preset-save-row--active' : ''}`}>
            <input
              ref={presetInputRef}
              type="text"
              placeholder={t('findMode.save_preset_prompt')}
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (newPresetName.trim()) { handleSavePreset(); setShowSavePreset(false) }
                } else if (e.key === 'Escape') {
                  setNewPresetName(''); setShowSavePreset(false)
                }
              }}
              className="find-preset-name-input"
            />
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSavePreset(); setShowSavePreset(false) }}
              disabled={!newPresetName.trim()}
              className="find-icon-btn find-icon-btn--accent"
            >
              ✓
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setNewPresetName(''); setShowSavePreset(false) }}
              className="find-icon-btn"
            >
              ✕
            </button>
          </div>
          <div className={`find-search-row${showSavePreset ? ' find-search-row--hidden' : ''}`}>
            <button type="submit" className="find-submit find-submit--flex" disabled={loading}>
              {loading ? t('findMode.searching') : t('findMode.search_btn')}
            </button>
            <button
              type="button"
              onClick={() => setShowSavePreset(true)}
              title={t('findMode.save_preset_btn')}
              className="find-secondary-btn"
            >
              {t('findMode.save_preset_short')}
            </button>
          </div>

          {/* Preset pills */}
          {presets.length > 0 && !showSavePreset && (
            <div className="find-preset-pills">
              {presets.map(p => (
                <div key={p.id} className="find-club-chip">
                  <span className="find-club-chip-label" onClick={() => handleLoadPreset(p.settings)}>
                    {p.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deletePreset(p.id) }}
                    className="find-club-chip-remove"
                    title={t('findMode.delete_preset')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {error && <div className="find-error">{error}</div>}

      {results !== null && (
        <div className="find-results">
          {summary && summary.count > 0 && (
            <p className="find-summary">
              {t('findMode.results_summary', { count: summary.count, days: summary.days })}
            </p>
          )}

          {results.length > 0 && !voteMode && (
            <button type="button" className="find-vote-start-btn" onClick={handleOpenVoteMode}>
              {t('vote.start_btn')}
            </button>
          )}

          {results.length === 0 ? (
            <p className="find-no-results">{t('findMode.no_results')}</p>
          ) : (
            Object.entries(grouped).map(([date, timeGroups]) => (
              <div key={date} className="find-date-group">
                <div className="find-date-label">{formatDayLabel(date, region?.language || i18n.language)}</div>
                {Object.entries(timeGroups).map(([time, slots]) => {
                  const key = `${date}|${time}`
                  const isExpanded = !!expandedTimes[key]
                  const visibleSlots = (isExpanded || voteMode) ? slots : [slots[0]]
                  const hiddenCount = slots.length - 1
                  return (
                    <div key={time} className="find-time-group">
                      <div className="find-time-header">
                        <span className="find-time-header-time">{time}</span>
                      </div>
                      {visibleSlots.map((slot) => {
                        const isSelected = !!selected[slot._idx]
                        return (
                          <div
                            key={slot._idx}
                            className={`find-slot find-slot--indented${voteMode ? ' find-slot--voteable' : ''}${voteMode && isSelected ? ' find-slot--selected' : ''}`}
                            onClick={voteMode ? () => setSelected(prev => ({ ...prev, [slot._idx]: !prev[slot._idx] })) : undefined}
                          >
                            {voteMode && (
                              <span className={`find-slot-check${isSelected ? ' find-slot-check--on' : ''}`} aria-hidden="true">
                                {isSelected ? '✓' : ''}
                              </span>
                            )}
                            <span className="find-slot-court">{slot.court}</span>
                            {!voteMode && clubs.length > 1 && slot.club_name && (
                              <span className="find-slot-club">{slot.club_name}</span>
                            )}
                            <span className="find-slot-meta">{slot.duration} min</span>
                            <span className="find-slot-price">{slot.price}</span>
                            {!voteMode && (
                              <a href={slot.booking_link} target="_blank" rel="noopener noreferrer" className="find-book-btn">
                                {t('findMode.book_btn')}
                              </a>
                            )}
                          </div>
                        )
                      })}
                      {!voteMode && hiddenCount > 0 && (
                        <button type="button" className="find-time-more" onClick={() => toggleTimeGroup(date, time)}>
                          {isExpanded
                            ? t('findMode.show_less', { defaultValue: 'Show less' })
                            : t('findMode.show_more_courts', { count: hiddenCount, defaultValue: `+${hiddenCount} more` })}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>

    {voteMode && (
      <div className="vote-footer">
        {voteUrl ? (
          <div className="vote-footer-share">
            <span className="vote-footer-share-label">{t('vote.share_label')}</span>
            <div className="vote-footer-share-row">
              <code className="vote-footer-url">{voteUrl}</code>
              <button className="vote-footer-copy-btn" onClick={handleCopyVoteUrl}>
                {voteCopied ? t('vote.copied') : t('vote.copy_btn')}
              </button>
            </div>
            <button type="button" className="vote-footer-cancel" onClick={() => { setVoteMode(false); setVoteUrl(null) }}>
              {t('vote.close_btn')}
            </button>
          </div>
        ) : (
          <div className="vote-footer-select">
            <div className="vote-footer-top">
              <span className="vote-footer-hint">{t('vote.select_title')}</span>
              <div className="vote-footer-pills">
                <button type="button" className="vote-pill" onClick={() => selectAll(true)}>{t('vote.select_all')}</button>
                <button type="button" className="vote-pill" onClick={() => selectAll(false)}>{t('vote.select_none')}</button>
              </div>
            </div>
            <div className="vote-footer-bottom">
              <span className="vote-footer-count">
                {Object.values(selected).filter(Boolean).length} / {results.length} {t('vote.selected', { defaultValue: 'selected' })}
              </span>
              {voteError && <span className="vote-footer-error">{voteError}</span>}
              <div className="vote-footer-btns">
                <button type="button" className="vote-footer-cancel" onClick={() => setVoteMode(false)}>
                  {t('vote.close_btn')}
                </button>
                <button type="button" className="vote-footer-create" onClick={handleCreateVote} disabled={voteLoading}>
                  {voteLoading ? t('vote.creating') : t('vote.create_btn')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  )
}
