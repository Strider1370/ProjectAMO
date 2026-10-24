import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, X } from 'lucide-react'

import { CHANGELOG } from '../about/changelog.js'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import { submitFeedback } from './feedbackApi.js'
import { MAX_IMAGES, prepareImage } from './imagePrep.js'
import './feedback.css'

const AVATAR = '/gisang-i/clear_3_avatar.png'
const KINDS = [
  { id: 'error', label: '오류', hint: '값이 틀림 · 작동 안 함' },
  { id: 'inconvenience', label: '불편', hint: '쓰기 불편함' },
  { id: 'suggestion', label: '제안', hint: '새 기능 · 바꿨으면 하는 점' },
]
const SEND_ERRORS = {
  too_many_requests: '짧은 시간에 여러 번 보내셨습니다. 잠시 후 다시 보내 주시기 바랍니다.',
  invalid_input: '내용을 확인해 주시기 바랍니다.',
}

// 반영 내역은 업데이트 소식(changelog.js)에서 의견을 받아 바꾼 항목(feedback)만 모은다.
const FEEDBACK_RELEASES = CHANGELOG.filter((entry) => entry.feedback?.length)

function SendForm({ getContext, onSent }) {
  const [kind, setKind] = useState('inconvenience')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState([]) // { blob, url }
  const [imageError, setImageError] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const imagesRef = useRef(images)
  imagesRef.current = images
  useEffect(() => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)), [])

  async function addFiles(fileList) {
    setImageError('')
    const room = MAX_IMAGES - images.length
    const files = Array.from(fileList || []).slice(0, room)
    if ((fileList?.length ?? 0) > room) setImageError(`사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`)
    const added = []
    for (const file of files) {
      try {
        const blob = await prepareImage(file)
        added.push({ blob, url: URL.createObjectURL(blob) })
      } catch {
        setImageError('열 수 없는 사진이 있어 빼고 첨부했습니다.')
      }
    }
    setImages((current) => [...current, ...added].slice(0, MAX_IMAGES))
  }

  function removeImage(index) {
    setImages((current) => {
      URL.revokeObjectURL(current[index].url)
      return current.filter((_, position) => position !== index)
    })
  }

  async function send(event) {
    event.preventDefault()
    if (!message.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const result = await submitFeedback({ kind, message: message.trim(), images: images.map((image) => image.blob), context: getContext?.() ?? {} })
      onSent(result)
    } catch (sendError) {
      setError(SEND_ERRORS[sendError.message] ?? '보내지 못했습니다. 잠시 후 다시 시도해 주시기 바랍니다.')
      setSending(false)
    }
  }

  return (
    <form className="feedback-form" onSubmit={send}>
      <div className="feedback-body">
        <div className="feedback-intro">
          <img src={AVATAR} alt="" width="44" height="44" />
          <p>서비스 개선을 위해 의견을 받고 있습니다. 불편한 점이나 개선할 점을 자유롭게 남겨 주시기 바랍니다.<br />보내 주신 의견은 운영자만 확인합니다.</p>
        </div>

        <fieldset className="feedback-field">
          <legend>종류</legend>
          <div className="feedback-kinds">
            {KINDS.map((item) => (
              <label key={item.id} className={`feedback-kind${kind === item.id ? ' is-selected' : ''}`}>
                <span className="feedback-kind__name">
                  <input type="radio" name="feedback-kind" value={item.id} checked={kind === item.id} onChange={() => setKind(item.id)} />
                  {item.label}
                </span>
                <span className="feedback-kind__hint">{item.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="feedback-field">
          <span className="feedback-label">내용</span>
          <textarea rows={5} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} required />
        </label>

        <div className="feedback-field">
          <span className="feedback-label" id="feedback-photo-label">사진 <span className="feedback-optional">(선택 · 최대 {MAX_IMAGES}장)</span></span>
          <div className="feedback-photos" aria-labelledby="feedback-photo-label">
            {images.map((image, index) => (
              <span className="feedback-thumb" key={image.url}>
                <img src={image.url} alt={`첨부 사진 ${index + 1}`} />
                <button type="button" aria-label={`첨부 사진 ${index + 1} 빼기`} onClick={() => removeImage(index)}><X size={12} strokeWidth={2.6} /></button>
              </span>
            ))}
            {images.length < MAX_IMAGES && (
              <button type="button" className="feedback-add-photo" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={20} />
                <span>사진 추가</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={(event) => { void addFiles(event.target.files); event.target.value = '' }} />
          </div>
          {imageError && <p className="feedback-note" role="status">{imageError}</p>}
        </div>
      </div>

      <footer className="feedback-footer">
        {error && <p className="feedback-error" role="alert">{error}</p>}
        <button type="submit" className="feedback-submit" disabled={!message.trim() || sending}>{sending ? '보내는 중…' : '보내기'}</button>
      </footer>
    </form>
  )
}

function Sent({ failedImages, onAgain, onClose }) {
  return (
    <div className="feedback-sent">
      <span className="feedback-sent__mark"><Check size={24} strokeWidth={2.6} /></span>
      <h3>의견이 전달되었습니다</h3>
      <p>반영된 내용은 반영 내역에서 확인할 수 있습니다.</p>
      {failedImages > 0 && <p className="feedback-note" role="status">사진 {failedImages}장은 올리지 못했습니다.</p>}
      <div className="feedback-sent__actions">
        <button type="button" className="feedback-secondary" onClick={onAgain}>다른 의견 보내기</button>
        <button type="button" className="feedback-submit" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

function Changes() {
  return (
    <div className="feedback-body feedback-changes">
      <p className="feedback-note">보내 주신 의견을 반영한 변경 사항입니다.</p>
      {!FEEDBACK_RELEASES.length && <p className="feedback-empty">아직 반영된 의견이 없습니다.</p>}
      {FEEDBACK_RELEASES.map((entry) => (
        <section key={entry.version} className="feedback-release">
          <h3>v{entry.version}<span>{entry.date}</span></h3>
          <ul>
            {entry.feedback.map((item) => <li key={item}><Check size={16} strokeWidth={2.4} />{item}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function FeedbackDialog({ onClose, getContext }) {
  const [tab, setTab] = useState('send')
  const [sent, setSent] = useState(null)
  const [formKey, setFormKey] = useState(0)
  useCloseOnBackButton(true, onClose)

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="feedback-overlay" onClick={onClose}>
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(event) => event.stopPropagation()}>
        <header className="feedback-header">
          <h2 id="feedback-title">의견</h2>
          <button type="button" className="feedback-close" aria-label="닫기" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="feedback-tabs" role="tablist" aria-label="의견">
          <button type="button" role="tab" aria-selected={tab === 'send'} onClick={() => setTab('send')}>의견 보내기</button>
          <button type="button" role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>반영 내역</button>
        </div>
        {tab === 'changes' && <Changes />}
        {/* 반영 내역을 보고 돌아와도 쓰던 글·사진이 남도록 보내기 화면은 숨기기만 한다. */}
        <div className="feedback-pane" hidden={tab !== 'send'}>
          {sent ? <Sent failedImages={sent.failedImages} onClose={onClose} onAgain={() => { setSent(null); setFormKey((key) => key + 1) }} />
            : <SendForm key={formKey} getContext={getContext} onSent={setSent} />}
        </div>
      </section>
    </div>
  )
}
