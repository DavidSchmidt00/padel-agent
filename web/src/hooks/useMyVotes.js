import { useState, useCallback } from 'react'

const LS_KEY = 'padel-my-votes'
const MAX_VOTES = 20

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(votes) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(votes))
  } catch {
    // ignore storage errors
  }
}

export default function useMyVotes() {
  const [votes, setVotes] = useState(load)

  const addVote = useCallback((vote_id, label) => {
    setVotes((prev) => {
      const filtered = prev.filter((v) => v.vote_id !== vote_id)
      const entry = { vote_id, saved_at: new Date().toISOString() }
      if (label) entry.label = label
      const next = [entry, ...filtered].slice(0, MAX_VOTES)
      persist(next)
      return next
    })
  }, [])

  const removeVote = useCallback((vote_id) => {
    setVotes((prev) => {
      const next = prev.filter((v) => v.vote_id !== vote_id)
      persist(next)
      return next
    })
  }, [])

  return { votes, addVote, removeVote }
}
