import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Chat from './components/Chat'
import FindMode from './components/FindMode'
import VotePage from './components/VotePage'
import ProfilePage from './components/ProfilePage'
import AboutPage from './components/AboutPage'
import SettingsMenu from './components/SettingsMenu'
import useRegion from './hooks/useRegion'
import useProfile from './hooks/useProfile'
import useMyVotes from './hooks/useMyVotes'

const LAST_ROUTE_KEY = 'padel-last-route'
const MODE_PATHS = { chat: '/chat', find: '/find', profile: '/profile' }

function modeFromPath() {
  const p = window.location.pathname
  if (p === '/about') return 'about'
  if (p === '/find') return 'find'
  if (p.startsWith('/vote/')) return 'vote'
  if (p === '/profile' || p === '/votes') return 'profile'  // /votes = legacy alias
  if (p === '/chat') return 'chat'
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
  const [theme, setTheme] = useState(() => localStorage.getItem('padel-agent-theme') || 'dark')
  const [mode, setMode] = useState(modeFromPath)
  const [voteId, setVoteId] = useState(voteIdFromPath)
  const [pendingFindParams, setPendingFindParams] = useState(null)
  const handleParamsConsumed = useCallback(() => setPendingFindParams(null), [])

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

  useEffect(() => {
    if (region?.language) i18n.changeLanguage(region.language)
  }, [region, i18n])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('padel-agent-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  function navigateTo(newMode) {
    const path = MODE_PATHS[newMode] || '/chat'
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
        <div className="header-controls">
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
        <div style={{ display: mode === 'profile' ? 'contents' : 'none' }}>
          <ProfilePage
            myVotes={myVotes}
            onRemoveVote={removeVote}
            onNavigateToVote={navigateToVote}
          />
        </div>
        <div style={{ display: mode === 'about' ? 'contents' : 'none' }}>
          <AboutPage onNavigate={navigateTo} />
        </div>
      </main>

      <nav className="bottom-nav">
        <button
          className={`bottom-nav-btn${mode === 'chat' ? ' active' : ''}`}
          onClick={() => navigateTo('chat')}
        >
          <span className="bottom-nav-icon">💬</span>
          <span className="bottom-nav-label">{t('findMode.mode_chat')}</span>
        </button>
        <button
          className={`bottom-nav-btn${mode === 'find' ? ' active' : ''}`}
          onClick={() => navigateTo('find')}
        >
          <span className="bottom-nav-icon">🔍</span>
          <span className="bottom-nav-label">{t('findMode.mode_find')}</span>
        </button>
        <button
          className={`bottom-nav-btn${mode === 'profile' || mode === 'vote' ? ' active' : ''}`}
          onClick={() => navigateTo('profile')}
        >
          <span className="bottom-nav-icon">👤</span>
          <span className="bottom-nav-label">{t('nav.profile')}</span>
        </button>
      </nav>
    </div>
  )
}
