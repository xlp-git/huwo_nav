import React, { useState } from 'react'
import Modal from './Modal'

const EditTitleForm = ({ browserTitle, headerTitle, onSave, onCancel }) => {
  const [bt, setBt] = useState(browserTitle)
  const [ht, setHt] = useState(headerTitle)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!bt.trim() || !ht.trim()) {
      setError('标题不能为空')
      return
    }
    setError('')
    setLoading(true)
    try {
      await onSave(bt.trim(), ht.trim())
    } catch (err) {
      setError(err.message || '保存失败，请重试')
      setLoading(false)
    }
  }

  return (
    <Modal title="编辑标题" onClose={onCancel}>
      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label">浏览器标签页标题</label>
          <input
            className="field-input"
            type="text"
            value={bt}
            onChange={(e) => setBt(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="field">
          <label className="field-label">首页标题</label>
          <input
            className="field-input"
            type="text"
            value={ht}
            onChange={(e) => setHt(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="mbtn mbtn-secondary" onClick={onCancel}>取消</button>
          <button type="submit" className="mbtn mbtn-primary" disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default EditTitleForm
