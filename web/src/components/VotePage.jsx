import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

// Format ISO date (yyyy-mm-dd) as dd.mm (no year)
function formatDate(iso) {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

// Get short weekday name from ISO date (yyyy-mm-dd) in the given locale
function weekday(iso, locale) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short' })
}

// Court-type-aware consensus threshold
function threshold(courtType) {
  return courtType === 'SINGLE' ? 2 : 4
}

const LS_KEY = (voteId) => `vote-${voteId}`

export default function VotePage({ voteId }) {
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [voterName, setVoterName] = useState('')
  const [pendingVotes, setPendingVotes] = useState({})   // {slot_id: true|undefined} before submit
  const [submittedVotes, setSubmittedVotes] = useState(null) // {slot_id: bool|undefined} after submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [availability, setAvailability] = useState({}) // {slot_id: true|false|null}
  const [bookedSlots, setBookedSlots] = useState(new Set())
  const [bookingSlot, setBookingSlot] = useState(null) // slot_id currently being marked
  const timerRef = useRef(null)
  const availTimerRef = useRef(null)

  // Restore previous vote from localStorage on mount
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
    } finally {
      setLoading(false)
    }
  }, [voteId])

  useEffect(() => {
    fetchSession()
    timerRef.current = setInterval(fetchSession, 3000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchSession])

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await fetch(`/api/votes/${voteId}/availability`)
      if (!res.ok) return
      const data = await res.json()
      setAvailability(data.availability ?? {})
    } catch {
      // best-effort — silently ignore
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
      try {
        localStorage.setItem(LS_KEY(voteId), JSON.stringify({ voterName: voterName.trim(), votes: saved }))
      } catch {
        // ignore storage errors (e.g. private mode quota)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkBooked(slotId) {
    setBookingSlot(slotId)
    try {
      const res = await fetch(`/api/votes/${voteId}/slots/${slotId}/book`, { method: 'POST' })
      if (!res.ok) return
      setBookedSlots(prev => new Set([...prev, slotId]))
      setAvailability(prev => ({ ...prev, [slotId]: null }))
    } finally {
      setBookingSlot(null)
    }
  }

  function handleChangeVote() {
    setPendingVotes({ ...submittedVotes })
    setSubmittedVotes(null)
    setSubmitError(null)
  }

  if (loading) return <div className="find-container"><p className="find-summary">{t('votePage.loading')}</p></div>
  if (notFound) return <div className="find-container"><p className="find-error">{t('votePage.not_found')}</p></div>

  const unvotedCount = session?.slots.filter(s => pendingVotes[s.slot_id] === undefined).length ?? 0

  // Set of slot IDs that have reached their threshold
  const winners = new Set(
    session?.slots
      .filter(s => (session.tally[s.slot_id] || 0) >= threshold(s.court_type))
      .map(s => s.slot_id) ?? []
  )

  return (
    <div className="find-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>🗳️ {t('votePage.title')}</h2>
        {submittedVotes !== null && (
          <button className="vote-change-top-btn" onClick={handleChangeVote}>
            ✏️ {t('votePage.change_vote')}
          </button>
        )}
      </div>

      {/* Name input (shown until votes submitted) */}
      {submittedVotes === null && (
        <div className="find-field" style={{ marginBottom: '14px' }}>
          <label>{t('votePage.your_name')}</label>
          <input
            type="text"
            value={voterName}
            onChange={e => setVoterName(e.target.value)}
            placeholder={t('votePage.name_placeholder')}
            maxLength={40}
          />
        </div>
      )}

      {/* Voter list with count */}
      {session?.voters?.length > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {session.voters.join(' · ')}
          {' '}
          <span style={{ color: 'var(--text-tertiary)' }}>
            ({t('votePage.voters_label', { count: session.voter_count })})
          </span>
        </p>
      )}

      {/* Slot list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {session?.slots.map(slot => {
          const yesCount = session.tally[slot.slot_id] || 0
          const slotAttendees = session.attendees?.[slot.slot_id] ?? []
          const thresh = threshold(slot.court_type)
          const pct = Math.min(100, Math.round((yesCount / thresh) * 100))
          const isWinner = winners.has(slot.slot_id)
          // After submit, treat unvoted (undefined) as "can't attend" (false)
          const myAnswer = submittedVotes !== null
            ? (submittedVotes[slot.slot_id] ?? false)
            : pendingVotes[slot.slot_id]

          return (
            <div
              key={slot.slot_id}
              className="find-slot"
              style={{
                flexDirection: 'column', alignItems: 'flex-start', gap: '6px',
                borderColor: isWinner ? 'rgba(6,182,212,0.5)' : undefined,
                background: isWinner ? 'var(--accent-subtle)' : undefined,
              }}
            >
              {/* Slot header */}
              <div style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', padding: '1px 6px', borderRadius: '4px',
                  background: 'rgba(6,182,212,0.15)', color: 'var(--accent)', whiteSpace: 'nowrap',
                }}>{weekday(slot.date, i18n.language)}</span>
                <span className="find-slot-time">{formatDate(slot.date)} {slot.local_time}</span>
                <span className="find-slot-court" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{slot.court}</span>
                <span className="find-slot-meta">{slot.duration} min</span>
                <span style={{ marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    <span className="attendees-label">{t('votePage.attendees')}: </span>{yesCount}/{thresh}
                  </span>
                </span>
              </div>

              {/* Availability / booked badge */}
              {bookedSlots.has(slot.slot_id)
                ? <span className="slot-avail-badge slot-avail-badge--booked">🎾 {t('votePage.avail_booked')}</span>
                : availability[slot.slot_id] === true
                  ? <span className="slot-avail-badge slot-avail-badge--ok">✓ {t('votePage.avail_available')}</span>
                  : null
              }

              {/* Progress bar */}
              <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'var(--border-color)' }}>
                <div style={{
                  height: '100%', borderRadius: '2px', background: 'var(--accent)',
                  width: `${pct}%`, transition: 'width 0.4s ease',
                }} />
              </div>

              {/* Voter name chips — always visible, no click needed */}
              {slotAttendees.length > 0 && (
                <div className="vote-attendee-chips">
                  {slotAttendees.map(name => (
                    <span key={name} className="vote-attendee-chip">👤 {name}</span>
                  ))}
                </div>
              )}

              {/* Can attend toggle + book button */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%' }}>
                <button
                  style={{
                    padding: '4px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: `1px solid ${myAnswer === true ? 'rgb(22,163,74)' : 'var(--border-color)'}`,
                    background: myAnswer === true ? 'rgba(22,163,74,0.12)' : 'var(--bg-surface-raised)',
                    color: 'var(--text-primary)',
                    fontWeight: myAnswer === true ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}
                  disabled={submittedVotes !== null}
                  onClick={() => setPendingVotes(prev => ({
                    ...prev,
                    [slot.slot_id]: prev[slot.slot_id] === true ? undefined : true,
                  }))}
                >
                  ✓ {t('votePage.can_attend')}
                </button>
                {isWinner && !bookedSlots.has(slot.slot_id) && (
                  <button
                    className="slot-mark-booked-btn"
                    disabled={bookingSlot === slot.slot_id}
                    onClick={() => handleMarkBooked(slot.slot_id)}
                    style={{ marginLeft: 'auto' }}
                  >
                    {bookingSlot === slot.slot_id ? '…' : t('votePage.mark_booked')}
                  </button>
                )}
                <a
                  href={isWinner && !bookedSlots.has(slot.slot_id) ? slot.booking_link : undefined}
                  className="find-book-btn"
                  style={{
                    marginLeft: isWinner && !bookedSlots.has(slot.slot_id) ? '0' : 'auto',
                    visibility: isWinner && !bookedSlots.has(slot.slot_id) ? 'visible' : 'hidden',
                    pointerEvents: isWinner && !bookedSlots.has(slot.slot_id) ? 'auto' : 'none',
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('votePage.book_btn')}
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {/* Unvoted slots hint */}
      {submittedVotes === null && voterName.trim() && unvotedCount > 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '10px 0 0' }}>
          {t('votePage.unvoted_hint', { count: unvotedCount })}
        </p>
      )}

      {/* Submit / Change row */}
      <div style={{ marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        {submittedVotes === null ? (
          <button
            className="find-submit"
            style={{ margin: 0, opacity: !voterName.trim() ? 0.5 : 1 }}
            disabled={!voterName.trim() || submitting}
            onClick={handleSubmitVotes}
          >
            {submitting ? t('votePage.submitting') : t('votePage.submit_btn')}
          </button>
        ) : (
          <>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>{t('votePage.submitted_label')}</span>
            <button className="suggestion-chip" onClick={handleChangeVote}>
              {t('votePage.change_vote')}
            </button>
          </>
        )}
      </div>

      {/* Submit error */}
      {submitError && (
        <p style={{ fontSize: '0.8rem', color: 'rgb(220,38,38)', marginTop: '8px' }}>{submitError}</p>
      )}

      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '16px' }}>
        {t('votePage.expires_note')}
      </p>
    </div>
  )
}
