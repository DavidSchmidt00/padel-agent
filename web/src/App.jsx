import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Chat from './components/Chat'
import FindMode from './components/FindMode'
import VotePage from './components/VotePage'
import AboutPage from './components/AboutPage'
import SettingsMenu from './components/SettingsMenu'
import useRegion from './hooks/useRegion'
import useProfile from './hooks/useProfile'

const LAST_ROUTE_KEY = 'padel-last-route'

function modeFromPath() {
  const p = window.location.pathname
  if (p === '/about') return 'about'
  if (p === '/find') return 'find'
  if (p.startsWith('/vote/')) return 'vote'
  if (p === '/chat') return 'chat'
  // Root or unknown path: restore last route, or show about for first-timers
  return localStorage.getItem(LAST_ROUTE_KEY) || 'about'
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

  // Sync URL ↔ mode
  useEffect(() => {
    const onPopState = () => { setMode(modeFromPath()); setVoteId(voteIdFromPath()) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const { region, setRegionId } = useRegion()
  const { profile } = useProfile()
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
    localStorage.setItem(LAST_ROUTE_KEY, path)
  }

  function navigateToAbout() {
    history.pushState(null, '', '/about')
    setMode('about')
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
          <Chat ref={chatRef} region={region} />
        </div>
        <div style={{ display: mode === 'find' ? 'contents' : 'none' }}>
          <FindMode region={region} profile={profile} />
        </div>
        <div style={{ display: mode === 'vote' ? 'contents' : 'none' }}>
          {voteId && <VotePage voteId={voteId} />}
        </div>
        <div style={{ display: mode === 'about' ? 'contents' : 'none' }}>
          <AboutPage onNavigate={navigateTo} />
        </div>
      </main>
    </div>
  )
}
