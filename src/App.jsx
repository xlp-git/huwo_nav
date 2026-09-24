import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import './App.css'
import AddSiteForm from './components/AddSiteForm'
import ImportBookmarks from './components/ImportBookmarks'
import EditSiteForm from './components/EditSiteForm'
import EditTitleForm from './components/EditTitleForm'
import Modal from './components/Modal'
import {
  getSites, addSite, updateSite, deleteSites, addCategory, getSettings, updateSettings,
  verifyPassword, clearPassword, getSavedCategory, setSavedCategory as persistSavedCategory,
} from './storage'
import { isHttpUrl } from './lib/bookmarks'

const WALLPAPER_URL = 'https://api.xsot.cn/bing?jump=true'
const WALLPAPER_TIMEOUT = 6000
const WALLPAPER_RETRY = 10000
const WEB_SEARCH_URL = 'https://www.bing.com/search?q='

const FAVICON_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOCIgZmlsbD0iI2YxZjVmOSIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjkuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEuOCIvPjxlbGxpcHNlIGN4PSIyMCIgY3k9IjIwIiByeD0iNCIgcnk9IjkuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEuMyIvPjxsaW5lIHgxPSIxMC41IiB5MT0iMjAiIHgyPSIyOS41IiB5Mj0iMjAiIHN0cm9rZT0iIzk0YTNiOCIgc3Ryb2tlLXdpZHRoPSIxLjMiLz48cGF0aCBkPSJNMjAgMTAuNWExMyA5LjUgMCAwIDAgMCAxOSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEiLz48cGF0aCBkPSJNMjAgMTAuNWExMyA5LjUgMCAwIDEgMCAxOSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4='

function hostnameOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// 卡片副标题显示的域名，去掉 www. 前缀
function hostOf(url) {
  return hostnameOf(url).replace(/^www\./, '') || url
}

// 已加载过的图标地址，切换分类重新挂载卡片时直接复用，避免再次显示加载动画
const faviconCache = new Map()

function FaviconImg({ url }) {
  const domain = hostnameOf(url)
  const [src, setSrc] = useState(() => faviconCache.get(url) || (domain ? null : FAVICON_SVG))

  useEffect(() => {
    if (!domain || faviconCache.has(url)) return
    let cancelled = false
    const faviconUrl = `https://favicon.im/zh/${domain}`
    preload(faviconUrl).then(ok => {
      const finalSrc = ok ? faviconUrl : FAVICON_SVG
      faviconCache.set(url, finalSrc)
      if (!cancelled) setSrc(finalSrc)
    })
    return () => { cancelled = true }
  }, [url, domain])

  if (!src) {
    return <div className="favicon-spinner" />
  }

  return <img className="site-favicon" src={src} alt="" />
}

function preload(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  })
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function greeting(hour) {
  if (hour < 5) return '夜深了'
  if (hour < 9) return '早上好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

// 独立组件自更新，不会带动整个 App 重新渲染；对齐到整秒，避免秒数跳变不均
function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer
    const tick = () => {
      const current = new Date()
      setNow(current)
      timer = setTimeout(tick, 1000 - current.getMilliseconds())
    }
    timer = setTimeout(tick, 1000 - new Date().getMilliseconds())
    return () => clearTimeout(timer)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return (
    <div className="clock">
      <div className="clock-time">
        {hh}<span className="clock-colon">:</span>{mm}<span className="clock-sec">{ss}</span>
      </div>
      <div className="clock-date">
        {now.getMonth() + 1}月{now.getDate()}日 星期{WEEKDAYS[now.getDay()]} · {greeting(now.getHours())}
      </div>
    </div>
  )
}

// 仅在有精确指针（鼠标）且未开启"减少动态效果"时启用光斑和视差
function motionEnabled() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

const SKELETON_CARDS = Array.from({ length: 10 }, (_, i) => i)

function App() {
  const [sites, setSites] = useState([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [selectedSites, setSelectedSites] = useState([])
  const [wallpaper, setWallpaper] = useState(null)
  const [browserTitle, setBrowserTitle] = useState('小鹏导航')
  const [headerTitle, setHeaderTitle] = useState('我的个人网址导航')
  const [rememberCategory, setRememberCategory] = useState(false)
  const [savedCategory, setSavedCategory] = useState(() => getSavedCategory())
  const [showEditTitleForm, setShowEditTitleForm] = useState(false)

  // 轻提示
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const notify = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
  }, [])

  // 确认框：{ title, message, confirmText, onConfirm }
  const [confirmState, setConfirmState] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  useEffect(() => {
    getSites().then(data => {
      setSites(data)
      setSitesLoading(false)
    })
    getSettings().then(s => {
      setBrowserTitle(s.browserTitle)
      setHeaderTitle(s.headerTitle)
      setRememberCategory(Boolean(s.rememberCategory))
    })
  }, [])

  useEffect(() => {
    document.title = browserTitle
  }, [browserTitle])

  // 壁纸加载（自动重试）：一旦有一次加载成功就停止，超时后迟到的成功也会被采用并取消重试
  useEffect(() => {
    let cancelled = false
    let settled = false
    let retryTimer = null

    function scheduleRetry() {
      clearTimeout(retryTimer)
      retryTimer = setTimeout(loadWallpaper, WALLPAPER_RETRY)
    }

    function loadWallpaper() {
      if (cancelled || settled) return
      const img = new Image()
      const timeout = setTimeout(() => {
        if (!cancelled && !settled) scheduleRetry()
      }, WALLPAPER_TIMEOUT)

      img.onload = () => {
        clearTimeout(timeout)
        if (cancelled || settled) return
        settled = true
        clearTimeout(retryTimer)
        setWallpaper(img.src)
      }
      img.onerror = () => {
        clearTimeout(timeout)
        if (!cancelled && !settled) scheduleRetry()
      }
      img.src = `${WALLPAPER_URL}&t=${Date.now()}`
    }

    loadWallpaper()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [])

  // 壁纸视差：鼠标位置映射为 --px/--py（-1 ~ 1），CSS 据此反向平移背景
  useEffect(() => {
    if (!motionEnabled()) return
    const root = document.documentElement
    let frame = 0
    let x = 0
    let y = 0
    const onMove = (e) => {
      x = e.clientX / window.innerWidth * 2 - 1
      y = e.clientY / window.innerHeight * 2 - 1
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        root.style.setProperty('--px', x.toFixed(3))
        root.style.setProperty('--py', y.toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  // 面板光斑：把鼠标相对面板和各卡片的坐标写入 --mx/--my，不触发 React 渲染
  const panelRef = useRef(null)
  const spotFrameRef = useRef(0)
  const pointerRef = useRef({ x: 0, y: 0 })

  const handlePanelMove = (e) => {
    pointerRef.current = { x: e.clientX, y: e.clientY }
    if (spotFrameRef.current || !motionEnabled()) return
    spotFrameRef.current = requestAnimationFrame(() => {
      spotFrameRef.current = 0
      const panel = panelRef.current
      if (!panel) return
      const { x, y } = pointerRef.current
      const rect = panel.getBoundingClientRect()
      panel.style.setProperty('--mx', `${x - rect.left}px`)
      panel.style.setProperty('--my', `${y - rect.top}px`)
      panel.querySelectorAll('.site-card').forEach(card => {
        const r = card.getBoundingClientRect()
        card.style.setProperty('--mx', `${x - r.left}px`)
        card.style.setProperty('--my', `${y - r.top}px`)
      })
    })
  }

  useEffect(() => () => cancelAnimationFrame(spotFrameRef.current), [])

  const [showAddForm, setShowAddForm] = useState(false)
  const [showImportForm, setShowImportForm] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  // 分类从全部记录（含占位）提取；展示和计数只用真实站点
  const categories = useMemo(
    () => [...new Set(sites.map(site => site.category).filter(Boolean))],
    [sites]
  )
  const visibleSites = useMemo(() => sites.filter(site => !site.isPlaceholder), [sites])

  // activeCategory: null = 未手动选择；'' = 全部。已不存在的分类视为未选择
  const [activeCategory, setActiveCategory] = useState(null)
  const validActive = activeCategory === '' || categories.includes(activeCategory) ? activeCategory : null
  const restoredCategory = savedCategory && categories.includes(savedCategory) ? savedCategory : null
  const effectiveCategory = validActive ?? restoredCategory ?? categories[0] ?? ''

  const handleCategoryChange = (category) => {
    setActiveCategory(category)
    setSelectedSites([])
    if (rememberCategory) {
      setSavedCategory(category)
      persistSavedCategory(category)
    }
  }

  const [editMode, setEditMode] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)
  const [editingSite, setEditingSite] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const searchRef = useRef(null)

  // 过滤当前分类的站点
  const keyword = searchTerm.trim().toLowerCase()
  const filteredSites = visibleSites.filter(site => {
    const categoryMatch = !effectiveCategory || site.category === effectiveCategory
    const searchMatch = !keyword ||
      String(site.name || '').toLowerCase().includes(keyword) ||
      String(site.url || '').toLowerCase().includes(keyword)
    return categoryMatch && searchMatch
  })

  // 批量操作只作用于当前可见的已选站点，避免误删被搜索隐藏的站点
  const selectedSet = new Set(selectedSites)
  const visibleSelected = filteredSites.filter(site => selectedSet.has(site.id)).map(site => site.id)
  const allVisibleSelected = filteredSites.length > 0 && visibleSelected.length === filteredSites.length

  const openSite = (site) => {
    if (!isHttpUrl(site.url)) {
      notify('该链接不是 http/https 地址，已阻止打开', 'error')
      return
    }
    window.open(site.url, '_blank', 'noopener,noreferrer')
  }

  const activateSite = (site) => {
    if (editMode) {
      setEditingSite(site)
    } else {
      openSite(site)
    }
  }

  // 快捷键：/ 聚焦搜索框（输入中或弹窗打开时不拦截）
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(document.activeElement) || document.querySelector('.modal-mask')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      setSearchTerm('')
      return
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || !keyword) return
    if (filteredSites.length > 0) {
      activateSite(filteredSites[0])
    } else if (!editMode) {
      window.open(WEB_SEARCH_URL + encodeURIComponent(searchTerm.trim()), '_blank', 'noopener,noreferrer')
    }
  }

  // 处理站点选择
  const handleSiteSelect = (id) => {
    setSelectedSites(prev => (prev.includes(id) ? prev.filter(siteId => siteId !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    const visibleIds = new Set(filteredSites.map(site => site.id))
    if (allVisibleSelected) {
      setSelectedSites(prev => prev.filter(id => !visibleIds.has(id)))
    } else {
      setSelectedSites(prev => [...new Set([...prev, ...visibleIds])])
    }
  }

  // 处理批量删除（先确认）
  const handleBatchDelete = () => {
    const ids = visibleSelected
    if (ids.length === 0) return
    setConfirmState({
      title: '批量删除',
      message: `确定删除选中的 ${ids.length} 个站点吗？此操作无法撤销。`,
      confirmText: '删除',
      onConfirm: async () => {
        const remaining = await deleteSites(ids)
        setSites(remaining)
        setSelectedSites(prev => prev.filter(id => !ids.includes(id)))
        notify(`已删除 ${ids.length} 个站点`, 'success')
      },
    })
  }

  const runConfirm = async () => {
    setConfirmBusy(true)
    try {
      await confirmState.onConfirm()
    } catch (error) {
      notify(error.message || '操作失败', 'error')
    } finally {
      setConfirmBusy(false)
      setConfirmState(null)
    }
  }

  // 处理添加站点（错误抛回表单显示）
  const handleAddSite = async (newSite) => {
    const created = await addSite(newSite)
    setSites(prev => [...prev, created])
    setShowAddForm(false)
    notify(`已添加「${created.name}」`, 'success')
  }

  // 处理导入完成
  const handleImportComplete = async ({ count, skipped }) => {
    setSites(await getSites())
    setShowImportForm(false)
    notify(`已导入 ${count} 个站点${skipped ? `，跳过 ${skipped} 个已存在的网址` : ''}`, 'success')
  }

  // 处理密码提交：生产环境由服务端校验
  const closePasswordForm = () => {
    setShowPasswordForm(false)
    setPassword('')
    setPasswordError('')
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (verifying) return
    setVerifying(true)
    const result = await verifyPassword(password)
    setVerifying(false)
    if (result.ok) {
      setEditMode(true)
      closePasswordForm()
    } else {
      setPasswordError(result.error)
    }
  }

  const exitEditMode = () => {
    setEditMode(false)
    setSelectedSites([])
    clearPassword()
  }

  // 处理添加分类
  const closeCategoryForm = () => {
    setShowAddCategoryForm(false)
    setNewCategory('')
    setCategoryError('')
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    const name = newCategory.trim()
    if (!name || categorySaving) return
    if (categories.includes(name)) {
      setCategoryError('分类已存在')
      return
    }
    setCategorySaving(true)
    try {
      setSites(await addCategory(name))
      closeCategoryForm()
      handleCategoryChange(name)
      notify(`已添加分类「${name}」`, 'success')
    } catch (error) {
      setCategoryError(error.message || '添加失败，请重试')
    } finally {
      setCategorySaving(false)
    }
  }

  // 处理更新网站（错误抛回表单显示）
  const handleUpdateSite = async (updatedSite) => {
    setSites(await updateSite(updatedSite))
    setEditingSite(null)
    notify('已保存修改', 'success')
  }

  const handleSaveTitles = async (bt, ht) => {
    const s = await updateSettings({ browserTitle: bt, headerTitle: ht, rememberCategory })
    setBrowserTitle(s.browserTitle)
    setHeaderTitle(s.headerTitle)
    setShowEditTitleForm(false)
    notify('标题已保存', 'success')
  }

  const toggleRememberCategory = async () => {
    const next = !rememberCategory
    try {
      await updateSettings({ browserTitle, headerTitle, rememberCategory: next })
      setRememberCategory(next)
      if (next) {
        setSavedCategory(effectiveCategory)
        persistSavedCategory(effectiveCategory)
      }
    } catch (error) {
      notify(error.message || '保存失败', 'error')
    }
  }

  // 分类栏：内容超出时在上/下边缘显示渐隐，提示还能滚动（直接改 class，不触发渲染）
  const categoriesRef = useRef(null)
  const updateCategoryFade = useCallback(() => {
    const el = categoriesRef.current
    if (!el) return
    el.classList.toggle('more-above', el.scrollTop > 2)
    el.classList.toggle('more-below', el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }, [])

  useEffect(() => {
    const el = categoriesRef.current
    if (!el) return
    updateCategoryFade()
    const observer = new ResizeObserver(updateCategoryFade)
    observer.observe(el)
    return () => observer.disconnect()
  }, [categories, updateCategoryFade])

  // 分类栏最大高度 = 从它当前顶部到屏幕底部：首屏时整栏都在屏幕内，吸顶后长到接近一屏高
  const sidebarRef = useRef(null)
  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    let frame = 0
    const fit = () => {
      frame = 0
      const stickyTop = parseFloat(getComputedStyle(el).top) || 0
      const top = Math.max(el.getBoundingClientRect().top, stickyTop)
      el.style.maxHeight = `${Math.max(window.innerHeight - top - stickyTop, 160)}px`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit)
    }
    fit()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // 编辑工具栏出现/消失等会改变分类栏位置但不触发滚动，监听页面尺寸变化兜底
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  // 选中的分类不在可见范围内时（如刷新后恢复到靠下的分类），只滚动分类栏让它出现在
  // "分类栏与屏幕的交集"中间；首屏分类栏下半截可能在屏幕外，所以要按实际露出的区域计算
  useEffect(() => {
    const el = categoriesRef.current
    const active = el?.querySelector('.chip.active')
    if (!active) return
    const navRect = el.getBoundingClientRect()
    const itemRect = active.getBoundingClientRect()
    const top = Math.max(navRect.top, 0)
    const bottom = Math.min(navRect.bottom, window.innerHeight)
    if (bottom - top < itemRect.height) return
    if (itemRect.top < top || itemRect.bottom > bottom) {
      el.scrollTop += (itemRect.top + itemRect.height / 2) - (top + bottom) / 2
    }
  }, [effectiveCategory, categories])

  // 分类项：名称超长省略并以 title 显示全名
  const renderChip = (category, label) => (
    <button
      key={category}
      className={`chip${effectiveCategory === category ? ' active' : ''}`}
      onClick={() => handleCategoryChange(category)}
      title={label}
    >
      <span className="chip-label">{label}</span>
    </button>
  )

  const emptyText = keyword
    ? `没有找到匹配「${searchTerm.trim()}」的站点${editMode ? '' : '，按回车用必应搜索'}`
    : effectiveCategory
      ? `「${effectiveCategory}」分类下还没有站点${editMode ? '，点击上方「添加站点」' : ''}`
      : '暂无站点，请进入编辑模式添加或导入收藏夹'

  return (
    <>
      {/* 全屏背景层 */}
      <div className="bg-layer">
        <div
          className={`bg-image${wallpaper ? ' loaded' : ''}`}
          style={wallpaper ? { backgroundImage: `url("${wallpaper}")` } : undefined}
        />
        <div className="bg-overlay" />
      </div>
      {/* 内容层 */}
      <div className="page">
        {/* 顶部栏 */}
        <header className="topbar">
          <h1 className="site-title">{headerTitle}</h1>
          {editMode ? (
            <button className="btn" onClick={exitEditMode}>退出编辑</button>
          ) : (
            <button className="btn" onClick={() => setShowPasswordForm(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              编辑
            </button>
          )}
        </header>

        {/* 时钟 + 搜索 + 编辑工具栏 */}
        <section className="hero">
          <Clock />
          <div className="search">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              ref={searchRef}
              className="search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索站点，回车打开第一个结果"
              aria-label="搜索站点"
            />
            {searchTerm ? (
              <button className="search-clear" onClick={() => setSearchTerm('')} aria-label="清除">×</button>
            ) : (
              <kbd className="search-kbd">/</kbd>
            )}
          </div>

          {editMode && (
            <div className="toolbar">
              <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>添加站点</button>
              <button className="btn" onClick={() => setShowImportForm(true)}>导入收藏夹</button>
              <button className="btn" onClick={() => setShowAddCategoryForm(true)}>添加分类</button>
              <button className="btn" onClick={() => setShowEditTitleForm(true)}>编辑标题</button>
              <button className={`btn${rememberCategory ? ' btn-on' : ''}`} onClick={toggleRememberCategory}>
                记录分类: {rememberCategory ? '开' : '关'}
              </button>
              {filteredSites.length > 0 && (
                <button className="btn" onClick={toggleSelectAll}>
                  {allVisibleSelected ? '取消全选' : '全选'}
                </button>
              )}
              {visibleSelected.length > 0 && (
                <button className="btn btn-danger" onClick={handleBatchDelete}>
                  批量删除 ({visibleSelected.length})
                </button>
              )}
            </div>
          )}
        </section>

        <div className="layout">
          {/* 左侧分类栏：固定在视口内，可单独滚动 */}
          <aside className="sidebar" ref={sidebarRef}>
            <nav className="categories" ref={categoriesRef} onScroll={updateCategoryFade}>
              {renderChip('', '全部')}
              {categories.map(category => renderChip(category, category))}
            </nav>
          </aside>

          {/* 站点网格 */}
          <main className="panel" ref={panelRef} onPointerMove={handlePanelMove}>
            {effectiveCategory && <h2 className="panel-title">{effectiveCategory}</h2>}

            {sitesLoading ? (
              <div className="site-grid" aria-busy="true">
                {SKELETON_CARDS.map(i => (
                  <div key={i} className="site-card skeleton" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="site-icon" />
                    <div className="site-text">
                      <span className="skeleton-line" />
                      <span className="skeleton-line short" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredSites.length === 0 ? (
              <p className="empty">{emptyText}</p>
            ) : (
              // key 随分类变化，切换分类时卡片重新挂载以重播入场动画
              <div className={`site-grid${editMode ? ' editing' : ''}`} key={effectiveCategory}>
                {filteredSites.map((site, index) => (
                  <div
                    key={site.id}
                    className={`site-card${selectedSet.has(site.id) ? ' selected' : ''}`}
                    style={{ animationDelay: `${Math.min(index, 30) * 20}ms` }}
                    title={editMode ? `编辑「${site.name}」` : `${site.name}\n${site.url}`}
                    role={editMode ? 'button' : 'link'}
                    tabIndex={0}
                    onClick={() => activateSite(site)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && e.key === 'Enter') activateSite(site)
                    }}
                  >
                    <div className="site-icon">
                      <FaviconImg key={site.url} url={site.url} />
                    </div>
                    <div className="site-text">
                      <span className="site-name">{site.name}</span>
                      <span className="site-domain">{hostOf(site.url)}</span>
                    </div>
                    {editMode && (
                      <input
                        className="site-check"
                        type="checkbox"
                        checked={selectedSet.has(site.id)}
                        onChange={() => handleSiteSelect(site.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`选择「${site.name}」`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 添加站点表单 */}
      {showAddForm && (
        <AddSiteForm
          onAdd={handleAddSite}
          onCancel={() => setShowAddForm(false)}
          categories={categories}
          defaultCategory={effectiveCategory}
        />
      )}

      {/* 导入收藏夹表单 */}
      {showImportForm && (
        <ImportBookmarks
          onComplete={handleImportComplete}
          onCancel={() => setShowImportForm(false)}
        />
      )}

      {/* 密码表单 */}
      {showPasswordForm && (
        <Modal title="进入编辑模式" onClose={closePasswordForm}>
          <form onSubmit={handlePasswordSubmit}>
            <div className="field">
              <label className="field-label">密码</label>
              <input
                className="field-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
              {passwordError && <p className="field-error">{passwordError}</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="mbtn mbtn-secondary" onClick={closePasswordForm}>取消</button>
              <button type="submit" className="mbtn mbtn-primary" disabled={verifying}>
                {verifying ? '验证中...' : '确定'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 添加分类表单 */}
      {showAddCategoryForm && (
        <Modal title="添加分类" onClose={closeCategoryForm}>
          <form onSubmit={handleAddCategory}>
            <div className="field">
              <label className="field-label">分类名称</label>
              <input
                className="field-input"
                type="text"
                value={newCategory}
                onChange={(e) => {
                  setNewCategory(e.target.value)
                  setCategoryError('')
                }}
                placeholder="例如：搜索"
                maxLength={50}
                autoFocus
                required
              />
              {categoryError && <p className="field-error">{categoryError}</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="mbtn mbtn-secondary" onClick={closeCategoryForm}>取消</button>
              <button type="submit" className="mbtn mbtn-primary" disabled={categorySaving}>
                {categorySaving ? '添加中...' : '添加'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 编辑标题表单 */}
      {showEditTitleForm && (
        <EditTitleForm
          browserTitle={browserTitle}
          headerTitle={headerTitle}
          onSave={handleSaveTitles}
          onCancel={() => setShowEditTitleForm(false)}
        />
      )}

      {/* 编辑网站表单 */}
      {editingSite && (
        <Modal title="编辑站点" onClose={() => setEditingSite(null)}>
          <EditSiteForm
            key={editingSite.id}
            site={editingSite}
            categories={categories}
            onUpdate={handleUpdateSite}
            onCancel={() => setEditingSite(null)}
          />
        </Modal>
      )}

      {/* 确认框 */}
      {confirmState && (
        <Modal title={confirmState.title} onClose={() => !confirmBusy && setConfirmState(null)} showClose={!confirmBusy}>
          <p className="confirm-message">{confirmState.message}</p>
          <div className="modal-actions">
            <button type="button" className="mbtn mbtn-secondary" onClick={() => setConfirmState(null)} disabled={confirmBusy}>
              取消
            </button>
            <button type="button" className="mbtn mbtn-danger" onClick={runConfirm} disabled={confirmBusy} autoFocus>
              {confirmBusy ? '处理中...' : confirmState.confirmText}
            </button>
          </div>
        </Modal>
      )}

      {/* 轻提示 */}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>{toast.message}</div>
        ))}
      </div>
    </>
  )
}

export default App
