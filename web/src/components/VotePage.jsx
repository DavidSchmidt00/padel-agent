import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { voteDateRangeLabel } from '../utils/voteLabel'

function formatDate(iso) {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

function weekday(iso, locale) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short' })
}

function threshold(courtType) {
  return courtType === 'SINGLE' ? 2 : 4
}

const LS_KEY = (voteId) => `vote-${voteId}`

export default function VotePage({ voteId, onVoteVisited, isActive }) {
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [voterName, setVoterName] = useState('')
  const [pendingVotes, setPendingVotes] = useState({})
  const [submittedVotes, setSubmittedVotes] = useState(null)
  const [sessionSubmitted, setSessionSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [availability, setAvailability] = useState({})
  const [bookedSlots, setBookedSlots] = useState(new Set())
  const [bookingSlot, setBookingSlot] = useState(null)
  const [adminMode, setAdminMode] = useState(false)
  const [bookingError, setBookingError] = useState(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const timerRef = useRef(null)
  const availTimerRef = useRef(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY(voteId))
      if (saved) {
        const { voterName: name, votes } = JSON.parse(saved)
        setVoterName(name)
        setSubmittedVotes(votes)
        setPendingVotes(votes)
      }
    } catch {
      // ignore malformed data
    }
  }, [voteId])

  const visitedRef = useRef(false)
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/votes/${voteId}`)
      if (res.status === 404) {
        setNotFound(true)
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        return
      }
      if (!res.ok) return
      const data = await res.json()
      setSession(data)
      if (data.booked_slots?.length) setBookedSlots(new Set(data.booked_slots))
      if (!visitedRef.current) {
        visitedRef.current = true
        const dateRange = voteDateRangeLabel(data.slots?.map((s) => s.date) ?? [])
        onVoteVisited?.(voteId, dateRange ?? undefined)
      }
    } finally {
      setLoading(false)
    }
  }, [voteId, onVoteVisited])

  useEffect(() => {
    fetchSession()
    timerRef.current = setInterval(fetchSession, 3000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchSession])

  useEffect(() => {
    if (!sessionSubmitted) return
    const timer = setTimeout(() => setSessionSubmitted(false), 10000)
    return () => clearTimeout(timer)
  }, [sessionSubmitted])

  useEffect(() => {
    if (!isActive) setSessionSubmitted(false)
  }, [isActive])

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await fetch(`/api/votes/${voteId}/availability`)
      if (!res.ok) return
      const data = await res.json()
      setAvailability(data.availability ?? {})
    } catch {
      // best-effort
    }
  }, [voteId])

  useEffect(() => {
    fetchAvailability()
    availTimerRef.current = setInterval(fetchAvailability, 60000)
    const onVisible = () => { if (!document.hidden) fetchAvailability() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (availTimerRef.current) clearInterval(availTimerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchAvailability])

  async function handleSubmitVotes() {
    if (!voterName.trim() || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const votes = session.slots.map(s => ({
        slot_id: s.slot_id,
        can_attend: pendingVotes[s.slot_id] === true,
      }))
      const res = await fetch(`/api/votes/${voteId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter_name: voterName.trim(), votes }),
      })
      if (!res.ok) {
        setSubmitError(t('votePage.submit_error'))
        return
      }
      const data = await res.json()
      setSession(prev => prev
        ? { ...prev, tally: data.tally, voter_count: data.voter_count, voters: data.voters, attendees: data.attendees }
        : prev)
      const saved = { ...pendingVotes }
      setSubmittedVotes(saved)
      setSessionSubmitted(true)
      try {
        localStorage.setItem(LS_KEY(voteId), JSON.stringify({ voterName: voterName.trim(), votes: saved }))
      } catch {
        // ignore storage errors
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkBooked(slotId) {
    setBookingSlot(slotId)
    setBookingError(null)
    try {
      const res = await fetch(`/api/votes/${voteId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId }),
      })
      if (!res.ok) { setBookingError(t('votePage.booking_error')); return }
      const data = await res.json()
      setBookedSlots(new Set(data.booked_slots ?? []))
      setAvailability(prev => ({ ...prev, [slotId]: null }))
    } catch {
      setBookingError(t('votePage.booking_error'))
    } finally {
      setBookingSlot(null)
    }
  }

  async function handleUnmarkBooked(slotId) {
    setBookingSlot(slotId)
    setBookingError(null)
    try {
      const res = await fetch(`/api/votes/${voteId}/book`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId }),
      })
      if (!res.ok) { setBookingError(t('votePage.booking_error')); return }
      const data = await res.json()
      setBookedSlots(new Set(data.booked_slots ?? []))
      // Clear cached availability so the slot shows "checking" immediately,
      // then fire a fresh check without waiting for the 60s poll.
      setAvailability(prev => { const n = { ...prev }; delete n[slotId]; return n })
      fetchAvailability()
    } catch {
      setBookingError(t('votePage.booking_error'))
    } finally {
      setBookingSlot(null)
    }
  }

  function handleChangeVote() {
    setPendingVotes({ ...submittedVotes })
    setSubmittedVotes(null)
    setSessionSubmitted(false)
    setSubmitError(null)
  }

  if (loading) return <div className="find-container"><p className="find-summary">{t('votePage.loading')}</p></div>
  if (notFound) return <div className="find-container"><p className="find-error">{t('votePage.not_found')}</p></div>

  const unvotedCount = session?.slots.filter(s => pendingVotes[s.slot_id] === undefined).length ?? 0

  const winners = new Set(
    session?.slots
      .filter(s => (session.tally[s.slot_id] || 0) >= threshold(s.court_type))
      .map(s => s.slot_id) ?? []
  )

  return (
    <div className="find-container">

      {/* Header */}
      <div className="vote-page-header">
        <h2 className="vote-page-title">🗳️ {t('votePage.title')}</h2>
        <div className="vote-page-header-actions">
          {submittedVotes !== null && (
            <button className="vote-change-top-btn" onClick={handleChangeVote}>
              ✏️ {t('votePage.change_vote')}
            </button>
          )}
          <button
            className="vote-admin-toggle"
            onClick={() => {
              const url = `${window.location.origin}/vote/${voteId}`
              navigator.clipboard.writeText(url).catch(() => {})
              setCopiedLink(true)
              setTimeout(() => setCopiedLink(false), 1500)
            }}
            aria-label={t('votePage.share')}
          >
            <span aria-hidden="true">{copiedLink ? '✓' : '🔗'}</span>
            <span className="vote-admin-label">
              {copiedLink ? t('votePage.share_copied') : t('votePage.share')}
            </span>
          </button>
          <button
            className={`vote-admin-toggle${adminMode ? ' vote-admin-toggle--active' : ''}`}
            onClick={() => setAdminMode(m => !m)}
            aria-label={t('votePage.admin_mode')}
          >
            <span aria-hidden="true">⚙️</span>
            <span className="vote-admin-label">{t('votePage.admin_mode')}</span>
          </button>
        </div>
      </div>

      {/* Who has voted */}
      {session?.voters?.length > 0 ? (
        <p className="vote-voters-line">
          {session.voters.join(' · ')}
          {' '}
          <span className="vote-voters-count">
            ({t('votePage.voters_label', { count: session.voter_count })})
          </span>
        </p>
      ) : submittedVotes === null ? (
        <p className="vote-voters-empty">{t('votePage.no_votes_yet')}</p>
      ) : null}

      {/* Slot cards */}
      <div className="vote-cards">
        {session?.slots.map(slot => {
          const yesCount = session.tally[slot.slot_id] || 0
          const slotAttendees = session.attendees?.[slot.slot_id] ?? []
          const thresh = threshold(slot.court_type)
          const pct = Math.min(100, Math.round((yesCount / thresh) * 100))
          const isWinner = winners.has(slot.slot_id)
          const isBooked = bookedSlots.has(slot.slot_id)
          const myAnswer = submittedVotes !== null
            ? (submittedVotes[slot.slot_id] ?? false)
            : pendingVotes[slot.slot_id]

          const availStatus = isBooked ? 'booked'
            : availability[slot.slot_id] === true ? 'ok'
            : availability[slot.slot_id] === false ? 'gone'
            : 'unknown'

          return (
            <div
              key={slot.slot_id}
              className={`vote-card${isWinner ? ' vote-card--winner' : ''}`}
              data-avail={availStatus}
            >
              {/* Row 1: metadata + availability status */}
              <div className="vote-card-meta">
                <div className="vote-card-meta-top">
                  <span className="vote-card-day">{weekday(slot.date, i18n.language)}</span>
                  <span className="vote-card-sep">·</span>
                  <span className="vote-card-date">{formatDate(slot.date)}</span>
                  <span className="vote-card-sep">·</span>
                  <span className="vote-card-time">{slot.local_time}</span>
                  {availStatus === 'unknown' && !isBooked && (
                    <span className="vote-avail-text vote-avail-text--checking" aria-label={t('votePage.avail_checking')}>···</span>
                  )}
                  {availStatus === 'ok' && (
                    <span className="vote-avail-text vote-avail-text--ok">✓ {t('votePage.avail_available')}</span>
                  )}
                  {availStatus === 'gone' && (
                    <span className="vote-avail-text vote-avail-text--gone">✗ {t('votePage.avail_unavailable')}</span>
                  )}
                  {availStatus === 'booked' && (
                    <span className="vote-avail-text vote-avail-text--booked">🎾 {t('votePage.avail_booked')}</span>
                  )}
                </div>
                <div className="vote-card-meta-sub">
                  <span className="vote-card-court">{slot.court}</span>
                  <span className="vote-card-sep">·</span>
                  <span className="vote-card-dur">{slot.duration}m</span>
                  {slot.price && (
                    <>
                      <span className="vote-card-sep">·</span>
                      <span className="vote-card-price">{slot.price}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: progress + names + actions */}
              <div className="vote-card-row">
                <div className="vote-card-bar">
                  <div
                    className="vote-card-bar-fill"
                    style={{ width: `${pct}%`, background: pct >= 100 ? 'rgb(22, 163, 74)' : undefined }}
                  />
                </div>
                <span className="vote-card-count">{yesCount}/{thresh}</span>
                {slotAttendees.length > 0 && (
                  <span className="vote-card-names">{slotAttendees.join(' · ')}</span>
                )}
                <div className="vote-card-actions">
                  {adminMode && !isBooked && (
                    <button
                      className="vote-mark-booked-btn"
                      disabled={bookingSlot === slot.slot_id}
                      onClick={() => handleMarkBooked(slot.slot_id)}
                      aria-label={t('votePage.mark_booked')}
                    >
                      <span className="vote-mark-booked-circle" aria-hidden="true">
                        {bookingSlot === slot.slot_id ? '…' : '📌'}
                      </span>
                    </button>
                  )}
                  {adminMode && isBooked && (
                    <button
                      className="vote-unmark-booked-btn"
                      disabled={bookingSlot === slot.slot_id}
                      onClick={() => handleUnmarkBooked(slot.slot_id)}
                      aria-label={t('votePage.unmark_booked')}
                    >
                      {bookingSlot === slot.slot_id ? '…' : t('votePage.unmark_booked')}
                    </button>
                  )}
                  <button
                    className={`vote-attend-btn${myAnswer === true ? ' vote-attend-btn--yes' : ''}`}
                    disabled={submittedVotes !== null}
                    onClick={() => setPendingVotes(prev => ({
                      ...prev,
                      [slot.slot_id]: prev[slot.slot_id] === true ? undefined : true,
                    }))}
                    aria-label={t('votePage.can_attend')}
                    aria-pressed={myAnswer === true}
                  >
                    <span className="vote-attend-circle" aria-hidden="true">✓</span>
                  </button>
                </div>
              </div>

              {/* Row 3: book CTA — full width, winner only */}
              {isWinner && !isBooked && (
                <a
                  href={slot.booking_link}
                  className="vote-book-link vote-book-link--cta"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🎾 {t('votePage.book_btn')}
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Unvoted hint */}
      {submittedVotes === null && unvotedCount > 0 && (
        <p className="vote-unvoted-hint">
          {t('votePage.unvoted_hint', { count: unvotedCount })}
        </p>
      )}

      {/* Submit / status */}
      <p className="vote-expires-note">{t('votePage.expires_note')}</p>

      {submitError && <p className="vote-error-msg">{submitError}</p>}
      {bookingError && <p className="vote-error-msg">{bookingError}</p>}

      {(submittedVotes === null || sessionSubmitted) && (
        <div className="vote-submit-row">
          {submittedVotes === null ? (
            <>
              <div className="vote-name-field">
                <input
                  type="text"
                  value={voterName}
                  onChange={e => setVoterName(e.target.value)}
                  placeholder={t('votePage.name_placeholder')}
                  maxLength={40}
                />
              </div>
              <button
                className="vote-submit-btn"
                disabled={!voterName.trim() || submitting}
                onClick={handleSubmitVotes}
              >
                {submitting ? t('votePage.submitting') : t('votePage.submit_btn')}
              </button>
            </>
          ) : (
            <span className="vote-submitted-label">✓ {t('votePage.submitted_label')}</span>
          )}
        </div>
      )}
    </div>
  )
}
