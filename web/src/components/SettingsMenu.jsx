import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { REGIONS } from '../regions'

export default function SettingsMenu({ region, onRegionChange, theme, onThemeToggle }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    const { t } = useTranslation()

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="settings-menu" ref={ref}>
            <button
                className="settings-toggle"
                onClick={() => setOpen((prev) => !prev)}
                aria-label="Open settings"
                aria-expanded={open}
                title="Settings"
            >
                ⋮
            </button>
            {open && (
                <div className="settings-dropdown">
                    <div className="settings-section">
                        <div className="settings-section-label">{t('region.label')}</div>
                        <div className="settings-region-options">
                            {REGIONS.map((r) => (
                                <button
                                    key={r.id}
                                    className={`settings-region-btn${r.id === region.id ? ' active' : ''}`}
                                    onClick={() => {
                                        onRegionChange(r.id)
                                        setOpen(false)
                                    }}
                                    title={r.label}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="settings-section">
                        <div className="settings-section-label">{t('settings.theme')}</div>
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
                                {theme === 'dark' ? 'Dark' : 'Light'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
