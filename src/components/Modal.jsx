import { useEffect, useRef } from 'react'

// 通用弹窗：Esc 或点击遮罩关闭，带入场动画
const Modal = ({ title, onClose, children, showClose = true }) => {
  const onCloseRef = useRef(onClose)
  const pressedOnMaskRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      className="modal-mask"
      // 按下和松开都在遮罩上才关闭，避免在输入框里拖选文字时误关
      onMouseDown={(e) => { pressedOnMaskRef.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (pressedOnMaskRef.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          {showClose && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal
