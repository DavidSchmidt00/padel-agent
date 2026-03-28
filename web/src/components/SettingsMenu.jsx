import React, { useState, useRef, useEffect } from 'react'
import { REGIONS } from '../regions'

export default function SettingsMenu({ region, onRegionChange, theme, onThemeToggle }) {
    const [open, setOpen] = useState(false)
    const [regionOpen, setRegionOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false)
                setRegionOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    function handleRegionSelect(id) {
        onRegionChange(id)
        setRegionOpen(false)
        setOpen(false)
    }

    return (
        <div className="settings-menu" ref={ref}>
            <button
                className="settings-toggle"
                onClick={() => { setOpen((prev) => !prev); setRegionOpen(false) }}
                aria-label="Open settings"
                aria-expanded={open}
                title="Settings"
            >
                ⚙️
            </button>

            {open && (
                <div className="settings-dropdown">

                    {/* ── Settings ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Settings</div>

                        <div className="settings-sub-label">Region</div>
                        <button
                            className="settings-region-selector"
                            onClick={() => setRegionOpen((prev) => !prev)}
                            aria-label="Select region"
                            aria-expanded={regionOpen}
                        >
                            <span>{region.label}</span>
                            <span className="settings-region-caret">{regionOpen ? '▴' : '▾'}</span>
                        </button>
                        {regionOpen && (
                            <div className="settings-region-list">
                                {REGIONS.map((r) => (
                                    <button
                                        key={r.id}
                                        className={`settings-region-list-item${r.id === region.id ? ' active' : ''}`}
                                        onClick={() => handleRegionSelect(r.id)}
                                    >
                                        <span>{r.label}</span>
                                        <span className="settings-region-lang">{r.languageLabel}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="settings-sub-label" style={{ marginTop: '0.75rem' }}>Theme</div>
                        <div className="settings-theme-row">
                            <button
                                className="theme-toggle"
                                onClick={onThemeToggle}
                                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                            >
                                <span className="theme-toggle-thumb">
                                    {theme === 'dark' ? '🌙' : '☀️'}
                                </span>
                            </button>
                            <span className="settings-theme-label">
                                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                            </span>
                        </div>
                    </div>

                    {/* ── Account ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Account</div>
                        <div className="settings-account-row">
                            <div className="settings-account-avatar">👤</div>
                            <div>
                                <div className="settings-account-name">Guest</div>
                                <div className="settings-account-sub">Sign in coming soon</div>
                            </div>
                        </div>
                    </div>

                    {/* ── Links ── */}
                    <div className="settings-section">
                        <button className="settings-link-row" disabled>About</button>
                        <button className="settings-link-row" disabled>Imprint</button>
                    </div>

                </div>
            )}
        </div>
    )
}
