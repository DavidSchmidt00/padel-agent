import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Chat from './components/Chat'
import FindMode from './components/FindMode'
import VotePage from './components/VotePage'
import MyVotesPage from './components/MyVotesPage'
import AboutPage from './components/AboutPage'
import SettingsMenu from './components/SettingsMenu'
import useRegion from './hooks/useRegion'
import useProfile from './hooks/useProfile'
import useMyVotes from './hooks/useMyVotes'

const LAST_ROUTE_KEY = 'padel-last-route'

function modeFromPath() {
  const p = window.location.pathname
  if (p === '/about') return 'about'
  if (p === '/find') return 'find'
  if (p.startsWith('/vote/')) return 'vote'
  if (p === '/votes') return 'votes'
  if (p === '/chat') return 'chat'
  // Root or unknown path: restore last route, or show about for first-timers
  try {
    return localStorage.getItem(LAST_ROUTE_KEY) || 'about'
  } catch {
    return 'about'
  }
}

function voteIdFromPath() {
  const m = window.location.pathname.match(/^\/vote\/([a-z0-9]{8})$/)
  return m ? m[1] : null
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('padel-agent-theme') || 'dark'
  })
  const [mode, setMode] = useState(modeFromPath)
  const [voteId, setVoteId] = useState(voteIdFromPath)
  const [pendingFindParams, setPendingFindParams] = useState(null)
  const handleParamsConsumed = useCallback(() => setPendingFindParams(null), [])

  // Sync URL ↔ mode
  useEffect(() => {
    const onPopState = () => { setMode(modeFromPath()); setVoteId(voteIdFromPath()) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const { region, setRegionId } = useRegion()
  const { profile } = useProfile()
  const { votes: myVotes, addVote, removeVote } = useMyVotes()
  const { t, i18n } = useTranslation()
  const chatRef = useRef(null)

  // Sync language with region
  useEffect(() => {
    if (region?.language) {
      i18n.changeLanguage(region.language)
    }
  }, [region, i18n])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('padel-agent-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  // Navigate to chat or find, saving last route.
  // Only 'chat' and 'find' are valid — 'about' and 'vote' have their own navigators.
  function navigateTo(newMode) {
    const path = newMode === 'find' ? '/find' : '/chat'
    history.pushState(null, '', path)
    setMode(newMode)
    try {
      localStorage.setItem(LAST_ROUTE_KEY, newMode)
    } catch {
      console.warn('[padel-agent] Could not persist last route to localStorage')
    }
  }

  function navigateToAbout() {
    history.pushState(null, '', '/about')
    setMode('about')
  }

  function navigateToMyVotes() {
    history.pushState(null, '', '/votes')
    setMode('votes')
  }

  function navigateToVote(vote_id) {
    history.pushState(null, '', `/vote/${vote_id}`)
    setVoteId(vote_id)
    setMode('vote')
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>
          <span className="header-icon">🎾</span>
          <span className="header-accent">Padel Agent</span>
        </h1>
        <div className="mode-toggle-bar">
          <button
            className={`mode-btn${mode === 'chat' ? ' active' : ''}`}
            onClick={() => navigateTo('chat')}
          >
            {t('findMode.mode_chat')}
          </button>
          <button
            className={`mode-btn${mode === 'find' ? ' active' : ''}`}
            onClick={() => navigateTo('find')}
          >
            {t('findMode.mode_find')}
          </button>
        </div>
        <div className="header-controls">
          <button
            className={`my-votes-nav-btn${mode === 'votes' ? ' active' : ''}`}
            onClick={navigateToMyVotes}
            aria-label={t('myVotes.title')}
            title={t('myVotes.title')}
          >
            🗳️
            {myVotes.length > 0 && (
              <span className="my-votes-badge">{myVotes.length}</span>
            )}
          </button>
          <SettingsMenu
            region={region}
            onRegionChange={setRegionId}
            theme={theme}
            onThemeToggle={toggleTheme}
            onNavigateAbout={navigateToAbout}
          />
        </div>
      </header>
      <main>
        <div style={{ display: mode === 'chat' ? 'contents' : 'none' }}>
          <Chat ref={chatRef} region={region} onHandoffToFind={(params) => {
            setPendingFindParams(params)
            navigateTo('find')
          }} />
        </div>
        <div style={{ display: mode === 'find' ? 'contents' : 'none' }}>
          <FindMode
            region={region}
            profile={profile}
            initialParams={pendingFindParams}
            onParamsConsumed={handleParamsConsumed}
            onVoteCreated={addVote}
          />
        </div>
        <div style={{ display: mode === 'vote' ? 'contents' : 'none' }}>
          {voteId && <VotePage voteId={voteId} onVoteVisited={addVote} />}
        </div>
        <div style={{ display: mode === 'votes' ? 'contents' : 'none' }}>
          <MyVotesPage
            myVotes={myVotes}
            onRemoveVote={removeVote}
            onNavigateToVote={navigateToVote}
          />
        </div>
        <div style={{ display: mode === 'about' ? 'contents' : 'none' }}>
          <AboutPage onNavigate={navigateTo} />
        </div>
      </main>
    </div>
  )
}
