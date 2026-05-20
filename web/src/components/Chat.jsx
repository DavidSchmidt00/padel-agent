import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import useProfile from '../hooks/useProfile'
import ProfileCard from './ProfileCard'
import ProfileSuggestion from './ProfileSuggestion'

const Chat = forwardRef(({ region, onHandoffToFind }, ref) => {
  const { t } = useTranslation()
  const { profile, updateProfile, removePreference, clearProfile, PROFILE_LABELS } = useProfile()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toolStatus, setToolStatus] = useState(null)
  const [suggestionChips, setSuggestionChips] = useState([])
  const [pendingSuggestions, setPendingSuggestions] = useState([])
  const [pendingHandoff, setPendingHandoff] = useState(null)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, toolStatus, loading, suggestionChips])

  const acceptSuggestions = () => {
    pendingSuggestions.forEach(s => updateProfile(s.key, s.value))
    setPendingSuggestions([])
  }

  const dismissSuggestions = () => {
    setPendingSuggestions([])
  }

  const handleNewChat = () => {
    setMessages([])
    setError(null)
    setToolStatus(null)
    setPendingSuggestions([])
    setSuggestionChips([])
    setInput('')
  }

  const handleChipClick = (text) => {
    submitMessage(text)
  }

  async function submitMessage(textOverride) {
    let prompt

    // Check if textOverride is an event object (e.g. from form submit)
    if (textOverride && typeof textOverride !== 'string' && textOverride.preventDefault) {
      textOverride.preventDefault()
      prompt = input
    } else {
      prompt = textOverride || input
    }

    if (!prompt || !prompt.trim()) {
      return
    }
    prompt = prompt.trim()

    const newUserMsg = { role: 'user', text: prompt }
    const updatedMessages = [...messages, newUserMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setError(null)
    setToolStatus(null)
    setSuggestionChips([])
    setPendingHandoff(null)

    let bufferedChips = []

    try {
      const history = updatedMessages.map((m) => ({ role: m.role, content: m.text }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          messages: history,
          user_profile: Object.keys(profile).length > 0 ? profile : null,
          country: region?.country || null,
          language: region?.language || 'en',
          timezone: region?.timezone || null,
        }),
      })

      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error(t('errors.INTERNAL_SERVER_ERROR'))
        }
        if (res.status === 429) {
          throw new Error(t('errors.RATE_LIMIT_ERROR'))
        }
        throw new Error(res.statusText || 'Request failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantMsg = { role: 'assistant', text: '' }

      setMessages((m) => [...m, assistantMsg])

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (line.trim() === '') continue
          if (line.startsWith('data: ')) {
            let data
            try {
              data = JSON.parse(line.slice(6))
            } catch (e) {
              console.warn('Failed to parse SSE data:', line)
              continue
            }

            if (data.type === 'tool_start') {
              const toolName = data.tool || 'default'
              const hiddenTools = ['suggest_next_steps', 'update_user_profile', 'suggest_preferred_options', 'handoff_to_find']
              if (!hiddenTools.includes(toolName)) {
                const translatedStatus = t(`tool_names.${toolName}`, { defaultValue: `Executing ${toolName}...` })
                setToolStatus(translatedStatus)
              }
            } else if (data.type === 'tool_end') {
              setTimeout(() => setToolStatus(null), 2000)
            } else if (data.type === 'message') {
              assistantMsg.text = data.text
              setMessages((prev) => {
                const newMsgs = [...prev]
                newMsgs[newMsgs.length - 1] = { ...assistantMsg }
                return newMsgs
              })
            } else if (data.type === 'profile_suggestion') {
              setPendingSuggestions((prev) => {
                const exists = prev?.find(s => s.key === data.key && s.value === data.value)
                if (exists) return prev
                return [...(prev || []), { key: data.key, value: data.value }]
              })
            } else if (data.type === 'suggestion_chips') {
              bufferedChips = data.options || []
            } else if (data.type === 'find_handoff') {
              if (!data.params) console.warn('[chat] find_handoff event received with no params', data)
              setPendingHandoff(data.params || {})
            } else if (data.type === 'error') {
              const errorKey = data.code ? `errors.${data.code}` : null
              const errorMessage = errorKey ? t(errorKey, { defaultValue: data.message || data.detail }) : (data.message || data.detail)
              throw new Error(errorMessage)
            }
          }
        }
      }

    } catch (err) {
      console.error(err)
      let errorMessage = err.message
      if (err.message === 'Failed to fetch' || err.message.includes('NetworkError') || err.name === 'TypeError') {
        errorMessage = t('errors.NETWORK_ERROR')
      }
      setError(errorMessage)
      setMessages((m) => {
        const last = m[m.length - 1]
        if (last.role === 'assistant' && !last.text) {
          const newMsgs = [...m]
          newMsgs[newMsgs.length - 1] = { role: 'assistant', text: `**${t('error_prefix')}:** ` + errorMessage }
          return newMsgs
        }
        return [...m, { role: 'assistant', text: `**${t('error_prefix')}:** ` + errorMessage }]
      })
    } finally {
      if (bufferedChips.length > 0) {
        setSuggestionChips(bufferedChips)
      }
      setLoading(false)
      setToolStatus(null)
    }
  }



  return (
    <div className="chat-container">
      <ProfileCard
        profile={profile}
        PROFILE_LABELS={PROFILE_LABELS}
        onRemove={removePreference}
        onClear={clearProfile}
      />

      <div className="chat-box">
        <div className="messages">
          {messages.map((msg, i) => {
            // Don't render empty assistant messages (waiting for stream)
            if (msg.role === 'assistant' && !msg.text) return null

            return (
              <div key={i} className={`message ${msg.role}`}>
                <div className={`bubble ${msg.role === 'assistant' ? 'markdown' : ''}`}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="message assistant">
              <div className={`bubble ${toolStatus ? 'tool-execution' : 'typing-indicator'}`}>
                {toolStatus ? (
                  <span className="tool-status">⚙️ {toolStatus}</span>
                ) : (
                  <>
                    <span></span>
                    <span></span>
                    <span></span>
                  </>
                )}
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <div className="empty">
              <img src="/icon.svg" className="empty-icon" alt="" aria-hidden="true" />
              <p>{t('empty_state')}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {pendingSuggestions.length > 0 && (
          <ProfileSuggestion
            suggestions={pendingSuggestions}
            onAccept={acceptSuggestions}
            onDismiss={dismissSuggestions}
            PROFILE_LABELS={PROFILE_LABELS}
          />
        )}

        {/* Find Mode Handoff Chip + Agent Suggestion Chips */}
        {(pendingHandoff || suggestionChips.length > 0) && (
          <div className="suggestions-row agent-suggestions">
            {pendingHandoff && (
              <button
                className="suggestion-chip suggestion-chip--find"
                onClick={() => { onHandoffToFind?.(pendingHandoff); setPendingHandoff(null) }}
              >
                🔍 {t('chat.open_in_find_mode')}
              </button>
            )}
            {suggestionChips.map((option, i) => (
              <button key={i} className="suggestion-chip" onClick={() => handleChipClick(option)}>
                {option}
              </button>
            ))}
          </div>
        )}

        {/* Default Empty State Suggestions */}
        {messages.length === 0 && (
          <div className="suggestions-row">
            {Object.values(t('examplePrompts', { returnObjects: true }) || {}).map((prompt, i) => (
              <button key={i} className="suggestion-chip" onClick={() => handleChipClick(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div className="input-row">
          <button
            className="clear-chat-btn"
            onClick={handleNewChat}
            type="button"
            title={t('new_chat', { defaultValue: 'New Chat' })}
            aria-label="New Chat"
          >
            🗑️
          </button>
          <input
            aria-label="Prompt"
            placeholder={t('placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitMessage(e)}
            disabled={loading}
          />
          <button onClick={() => submitMessage()} disabled={loading || !input.trim()}>
            {loading ? '...' : t('send_btn')}
          </button>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
})

export default Chat
