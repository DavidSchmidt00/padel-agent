import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { REGIONS } from '../regions'

export default function SettingsMenu({ region, onRegionChange, theme, onThemeToggle }) {
    const { t } = useTranslation()
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
                aria-label={t('settings.open_label')}
                aria-expanded={open}
                title={t('settings.title')}
            >
                ⚙️
            </button>

            {open && (
                <div className="settings-dropdown">

                    {/* ── Settings ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">{t('settings.title')}</div>

                        <div className="settings-sub-label">{t('settings.region')}</div>
                        <button
                            className="settings-region-selector"
                            onClick={() => setRegionOpen((prev) => !prev)}
                            aria-label={t('settings.select_region')}
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

                        <div className="settings-sub-label" style={{ marginTop: '0.75rem' }}>{t('settings.theme')}</div>
                        <div className="settings-theme-row">
                            <button
                                className="theme-toggle"
                                onClick={onThemeToggle}
                                aria-label={t(theme === 'dark' ? 'settings.switch_to_light' : 'settings.switch_to_dark')}
                            >
                                <span className="theme-toggle-thumb">
                                    {theme === 'dark' ? '🌙' : '☀️'}
                                </span>
                            </button>
                            <span className="settings-theme-label">
                                {t(theme === 'dark' ? 'settings.dark_mode' : 'settings.light_mode')}
                            </span>
                        </div>
                    </div>

                    {/* ── Account ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">{t('settings.account')}</div>
                        <div className="settings-account-row">
                            <div className="settings-account-avatar">👤</div>
                            <div>
                                <div className="settings-account-name">{t('settings.guest')}</div>
                                <div className="settings-account-sub">{t('settings.sign_in_soon')}</div>
                            </div>
                        </div>
                    </div>

                    {/* ── Links ── */}
                    <div className="settings-section">
                        <button className="settings-link-row" disabled>{t('settings.about')}</button>
                        <button className="settings-link-row" disabled>{t('settings.imprint')}</button>
                    </div>

                </div>
            )}
        </div>
    )
}
