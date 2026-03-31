import { useTranslation } from 'react-i18next'

export default function AboutPage({ onNavigate }) {
  const { t } = useTranslation()

  return (
    <div className="about-page">
      <div className="about-inner">

        {/* Hero */}
        <div className="about-hero">
          <div className="about-hero-icon">🎾</div>
          <h2 className="about-hero-title">Padel Agent</h2>
          <p className="about-hero-tagline">{t('about.tagline')}</p>
        </div>

        {/* Mode cards */}
        <div className="about-mode-cards">

          {/* Chat card */}
          <div className="about-mode-card about-mode-card--ai">
            <div className="about-card-header">
              <span className="about-card-icon">💬</span>
              <span className="about-ai-badge">{t('about.ai_badge')}</span>
            </div>
            <h3 className="about-card-title">{t('about.chat_title')}</h3>
            <p className="about-card-desc">{t('about.chat_desc')}</p>
            <button
              className="about-card-cta"
              onClick={() => onNavigate('chat')}
            >
              {t('about.chat_cta')}
            </button>
          </div>

          {/* Find card */}
          <div className="about-mode-card">
            <div className="about-card-header">
              <span className="about-card-icon">🔍</span>
            </div>
            <h3 className="about-card-title">{t('about.find_title')}</h3>
            <p className="about-card-desc">{t('about.find_desc')}</p>
            <button
              className="about-card-cta"
              onClick={() => onNavigate('find')}
            >
              {t('about.find_cta')}
            </button>
          </div>

        </div>

        {/* How it works */}
        <div className="about-steps-section">
          <div className="about-steps-label">{t('about.how_it_works')}</div>
          <ol className="about-steps">
            <li className="about-step">{t('about.step1')}</li>
            <li className="about-step">{t('about.step2')}</li>
            <li className="about-step">{t('about.step3')}</li>
          </ol>
        </div>

        {/* Footer */}
        <p className="about-footer">{t('about.footer')}</p>

      </div>
    </div>
  )
}
