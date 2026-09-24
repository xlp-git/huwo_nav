import React, { useState } from 'react'

// 父组件以 key={site.id} 渲染，切换站点时重新挂载，用初始值即可
const EditSiteForm = ({ site, categories, onUpdate, onCancel }) => {
  const [formData, setFormData] = useState(() => ({
    name: site?.name || '',
    url: site?.url || '',
    category: site?.category || ''
  }))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // 表单验证
    if (!formData.name.trim() || !formData.url.trim()) {
      setError('请填写站点名称和 URL')
      return
    }

    // 确保 URL 格式正确
    let url = formData.url.trim()
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url
    }

    setLoading(true)

    try {
      await onUpdate({
        ...site,
        ...formData,
        name: formData.name.trim(),
        url
      })
    } catch (err) {
      setError(err.message || '更新失败，请重试')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label className="field-label">站点名称</label>
        <input
          className="field-input"
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="例如：Google"
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
          {loading ? '更新中...' : '更新'}
        </button>
      </div>
    </form>
  )
}

export default EditSiteForm
