import React, { useState } from 'react'
import Modal from './Modal'
import { importBookmarks } from '../storage'

const ImportBookmarks = ({ onComplete, onCancel }) => {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      if (selectedFile.type === 'text/html' || selectedFile.name.toLowerCase().endsWith('.html')) {
        setFile(selectedFile)
        setError('')
      } else {
        setError('请上传 HTML 格式的收藏夹文件')
        setFile(null)
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!file) {
      setError('请选择收藏夹文件')
      return
    }

    setLoading(true)

    try {
      const result = await importBookmarks(file)
      await onComplete(result)
    } catch (err) {
      console.error('Error importing bookmarks:', err)
      setError(err.message || '导入失败，请重试')
      setLoading(false)
    }
  }

  return (
    // 导入进行中不允许关闭，避免用户误以为已取消
    <Modal title="导入收藏夹" onClose={loading ? () => {} : onCancel} showClose={!loading}>
      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label">选择收藏夹文件</label>
          <input
            className="field-input"
            type="file"
            accept=".html,text/html"
            onChange={handleFileChange}
            required
          />
          <p className="field-hint">请上传浏览器导出的 HTML 格式收藏夹文件，已存在的网址会自动跳过</p>
        </div>

        {file && <div className="form-note">已选择：{file.name}</div>}

        <div className="modal-actions">
          <button type="button" className="mbtn mbtn-secondary" onClick={onCancel} disabled={loading}>取消</button>
          <button type="submit" className="mbtn mbtn-primary" disabled={loading || !file}>
            {loading ? '导入中...' : '导入'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ImportBookmarks
