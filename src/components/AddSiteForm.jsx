import React, { useState } from 'react'
import Modal from './Modal'

const AddSiteForm = ({ onAdd, onCancel, categories, defaultCategory = '' }) => {
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    category: defaultCategory
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim() || !formData.url.trim()) {
      setError('请填写站点名称和 URL')
      return
    }

    setLoading(true)
    try {
      await onAdd({ ...formData, name: formData.name.trim(), url: formData.url.trim() })
    } catch (err) {
      setError(err.message || '添加失败，请重试')
      setLoading(false)
    }
  }

  return (
    <Modal title="添加站点" onClose={onCancel}>
      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label">站点名称</label>
          <input
            className="field-input"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="例如：Google"
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label className="field-label">站点 URL</label>
          <input
            className="field-input"
            type="url"
            name="url"
            value={formData.url}
            onChange={handleChange}
            placeholder="例如：https://www.google.com"
            required
          />
        </div>

        <div className="field">
          <label className="field-label">分类</label>
          <select
            className="field-input"
            name="category"
            value={formData.category}
            onChange={handleChange}
          >
            <option value="">选择分类</option>
            {categories && categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          <button type="button" className="mbtn mbtn-secondary" onClick={onCancel}>取消</button>
          <button type="submit" className="mbtn mbtn-primary" disabled={loading}>
            {loading ? '添加中...' : '添加'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddSiteForm
