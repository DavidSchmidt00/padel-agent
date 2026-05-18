import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

function formatDate(iso) {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

function deriveLabel(session) {
  const dates = session.slots?.map((s) => s.date) ?? []
  if (!dates.length) return null
  const minDate = dates.reduce((a, b) => (a < b ? a : b), dates[0])
  const maxDate = dates.reduce((a, b) => (a > b ? a : b), dates[0])
  return minDate === maxDate ? formatDate(minDate) : `${formatDate(minDate)}–${formatDate(maxDate)}`
}

export default function ProfilePage({ myVotes, onRemoveVote, onNavigateToVote, onNavigateToFind }) {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState({})
  const fetchedRef = useRef(new Set())

  useEffect(() => {
    for (const { vote_id } of myVotes) {
      if (fetchedRef.current.has(vote_id)) continue
      fetchedRef.current.add(vote_id)
      fetch(`/api/votes/${vote_id}`)
        .then((res) => {
          if (res.status === 404) return null
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data) => setSessions((prev) => ({ ...prev, [vote_id]: data ?? 'expired' })))
        .catch(() => setSessions((prev) => ({ ...prev, [vote_id]: 'error' })))
    }
  }, [myVotes])

  return (
    <div className="find-container">
      {/* Account */}
      <div className="profile-account">
        <div className="profile-account-avatar">👤</div>
        <div>
          <div className="profile-account-name">{t('settings.guest')}</div>
          <div className="profile-account-sub">{t('settings.sign_in_soon')}</div>
        </div>
      </div>

      {/* My Votes */}
      <h2 className="my-votes-heading">{t('myVotes.title')}</h2>

      {myVotes.length === 0 ? (
        <div className="my-votes-empty">
          <p className="my-votes-empty-icon">🗳️</p>
          <p className="my-votes-empty-title">{t('myVotes.empty_title')}</p>
          <p className="my-votes-empty-sub">{t('myVotes.empty_sub')}</p>
          <button className="my-votes-empty-cta" onClick={onNavigateToFind}>
            {t('findMode.mode_find')} →
          </button>
        </div>
      ) : (
        <div className="my-votes-list">
          {myVotes.map(({ vote_id, label: storedLabel }) => {
            const session = sessions[vote_id]
            const isExpired = session === 'expired' || session === 'error'
            const isLoading = session === undefined
            const label = storedLabel || (!isExpired && !isLoading && session ? deriveLabel(session) : null)
            const voterCount = session && !isExpired ? session.voter_count : null
            const bookedCount = session && !isExpired ? (session.booked_slots || []).length : 0

            return (
              <div key={vote_id} className={`my-votes-item${isExpired ? ' my-votes-item--expired' : ''}`}>
                <button
                  className="my-votes-item-main"
                  onClick={() => onNavigateToVote(vote_id)}
                  disabled={isExpired}
                >
                  <span className="my-votes-item-icon">🗳️</span>
                  <div className="my-votes-item-info">
                    <span className="my-votes-item-label">
                      {isExpired
                        ? (label || vote_id)
                        : (label || (isLoading ? t('myVotes.loading') : vote_id))}
                    </span>
                    <span className={`my-votes-item-sub${isExpired ? ' my-votes-item-sub--expired' : ''}`}>
                      {isExpired && t('myVotes.expired')}
                      {!isExpired && !isLoading && voterCount != null && t('myVotes.voters', { count: voterCount })}
                      {!isExpired && !isLoading && bookedCount > 0 && ' · 📌'}
                    </span>
                  </div>
                </button>
                <button
                  className="my-votes-item-remove"
                  onClick={() => onRemoveVote(vote_id)}
                  aria-label={t('myVotes.remove')}
                  title={t('myVotes.remove')}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
