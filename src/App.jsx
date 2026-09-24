import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import './App.css'
import AddSiteForm from './components/AddSiteForm'
import ImportBookmarks from './components/ImportBookmarks'
import EditSiteForm from './components/EditSiteForm'
import EditTitleForm from './components/EditTitleForm'
import Modal from './components/Modal'
import {
  getSites, addSite, updateSite, deleteSites, addCategory, renameCategory, deleteCategory,
  getSettings, updateSettings,
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

// 仅在有精确指针（鼠标）且未开启"减少动态效果"时启用面板光斑
function motionEnabled() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

const SKELETON_CARDS = Array.from({ length: 10 }, (_, i) => i)

// "未分类"不是真实存储的分类：只要有 category 为空的站点，分类栏末尾就显示这一项
const UNCATEGORIZED = '__uncategorized__'
const UNCATEGORIZED_LABEL = '未分类'

function App() {
  const [sites, setSites] = useState([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [selectedSites, setSelectedSites] = useState([])
  const [wallpaper, setWallpaper] = useState(null)
  const [browserTitle, setBrowserTitle] = useState('小鹏导航')
  const [headerTitle, setHeaderTitle] = useState('我的个人网址导航')
  const [rememberCategory, setRememberCategory] = useState(false)
  const [categoryOrder, setCategoryOrder] = useState([])
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

  // 确认框：{ title, message, actions: [{ label, variant: 'danger' | 'primary', run }] }
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
      setCategoryOrder(Array.isArray(s.categoryOrder) ? s.categoryOrder : [])
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

  // 面板光斑：把鼠标相对面板和各卡片的坐标写入 --mx/--my，不触发 React 渲染
  const panelRef = useRef(null)
  const spotFrameRef = useRef(0)
  const pointerRef = useRef({ x: 0, y: 0 })

  const scheduleSpotlight = () => {
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

  const handlePanelMove = (e) => {
    pointerRef.current = { x: e.clientX, y: e.clientY }
    scheduleSpotlight()
  }

  useEffect(() => () => cancelAnimationFrame(spotFrameRef.current), [])

  const [showAddForm, setShowAddForm] = useState(false)
  const [showImportForm, setShowImportForm] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  // 分类从全部记录（含占位）提取；展示和计数只用真实站点
  // 分类按用户拖动保存的顺序排列，未排过序的（如新建的）按出现顺序排在后面
  const categories = useMemo(() => {
    const found = [...new Set(sites.map(site => site.category).filter(Boolean))]
    const foundSet = new Set(found)
    const ordered = categoryOrder.filter(name => foundSet.has(name))
    const orderedSet = new Set(ordered)
    return [...ordered, ...found.filter(name => !orderedSet.has(name))]
  }, [sites, categoryOrder])
  // 编辑模式下拖动分类时的临时顺序（松手后保存）
  const [dragOrder, setDragOrder] = useState(null)
  const [draggingCategory, setDraggingCategory] = useState(null)
  const orderedCategories = dragOrder ?? categories
  const visibleSites = useMemo(() => sites.filter(site => !site.isPlaceholder), [sites])

  // 分类栏显示的列表 = 真实分类 + （有未分类站点时）末尾的"未分类"
  const hasUncategorized = visibleSites.some(site => !site.category)
  const navCategories = useMemo(
    () => (hasUncategorized ? [...orderedCategories, UNCATEGORIZED] : orderedCategories),
    [orderedCategories, hasUncategorized]
  )
  // 万一存在真实的"未分类"分类（如导入的书签文件夹），虚拟项改名避免重名
  const categoryLabel = (category) => {
    if (category !== UNCATEGORIZED) return category
    return categories.includes(UNCATEGORIZED_LABEL) ? '（无分类）' : UNCATEGORIZED_LABEL
  }

  // activeCategory: null = 未手动选择；'' = 全部。已不存在的分类视为未选择
  const [activeCategory, setActiveCategory] = useState(null)
  const validActive = activeCategory === '' || navCategories.includes(activeCategory) ? activeCategory : null
  const restoredCategory = savedCategory && navCategories.includes(savedCategory) ? savedCategory : null
  const effectiveCategory = validActive ?? restoredCategory ?? navCategories[0] ?? ''

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
    const categoryMatch = !effectiveCategory ||
      (effectiveCategory === UNCATEGORIZED ? !site.category : site.category === effectiveCategory)
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

  // 卡片点击：编辑模式下切换选中（编辑走卡片上的铅笔按钮），普通模式打开链接
  const handleCardClick = (site) => {
    if (editMode) {
      handleSiteSelect(site.id)
    } else {
      openSite(site)
    }
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
      actions: [{
        label: '删除',
        variant: 'danger',
        run: async () => {
          const remaining = await deleteSites(ids)
          setSites(remaining)
          setSelectedSites(prev => prev.filter(id => !ids.includes(id)))
          notify(`已删除 ${ids.length} 个站点`, 'success')
        },
      }],
    })
  }

  // 删除分类：有站点时让用户选择移到未分类或连同站点删除
  const handleDeleteCategory = (name) => {
    const count = visibleSites.filter(site => site.category === name).length
    // 移到未分类后直接切到"未分类"，让用户看到这些站点
    const afterDelete = (updated, text, moved) => {
      setSites(updated)
      if (categoryOrder.includes(name)) {
        saveCategoryOrder(categoryOrder.filter(item => item !== name), categoryOrder)
      }
      setActiveCategory(moved ? UNCATEGORIZED : null)
      setSelectedSites([])
      if (savedCategory === name) {
        setSavedCategory('')
        persistSavedCategory('')
      }
      notify(text, 'success')
    }
    setConfirmState({
      title: '删除分类',
      message: count
        ? `分类「${name}」下还有 ${count} 个站点，要怎么处理？`
        : `确定删除空分类「${name}」吗？`,
      actions: count
        ? [
          {
            label: '站点移到未分类',
            variant: 'primary',
            run: async () => afterDelete(await deleteCategory(name, 'move'), `已删除分类「${name}」，${count} 个站点已移到「未分类」`, true),
          },
          {
            label: `连同 ${count} 个站点删除`,
            variant: 'danger',
            run: async () => afterDelete(await deleteCategory(name, 'delete'), `已删除分类「${name}」及其 ${count} 个站点`),
          },
        ]
        : [{
          label: '删除',
          variant: 'danger',
          run: async () => afterDelete(await deleteCategory(name, 'delete'), `已删除分类「${name}」`),
        }],
    })
  }

  // 重命名分类
  const [renamingCategory, setRenamingCategory] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  const openRename = (name) => {
    setRenamingCategory(name)
    setRenameValue(name)
    setRenameError('')
  }

  const handleRenameCategory = async (e) => {
    e.preventDefault()
    const from = renamingCategory
    const to = renameValue.trim()
    if (!to || renameSaving) return
    if (to === from) {
      setRenamingCategory(null)
      return
    }
    if (to === UNCATEGORIZED_LABEL) {
      setRenameError(`「${UNCATEGORIZED_LABEL}」是系统保留名称，请换一个`)
      return
    }
    if (categories.includes(to)) {
      setRenameError(`分类「${to}」已存在`)
      return
    }
    setRenameSaving(true)
    try {
      setSites(await renameCategory(from, to))
      if (categoryOrder.includes(from)) {
        saveCategoryOrder(categoryOrder.map(name => (name === from ? to : name)), categoryOrder)
      }
      if (activeCategory === from) setActiveCategory(to)
      if (savedCategory === from) {
        setSavedCategory(to)
        persistSavedCategory(to)
      }
      setRenamingCategory(null)
      notify(`已将「${from}」重命名为「${to}」`, 'success')
    } catch (error) {
      setRenameError(error.message || '重命名失败，请重试')
    } finally {
      setRenameSaving(false)
    }
  }

  const runConfirm = async (action) => {
    setConfirmBusy(true)
    try {
      await action.run()
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
    if (name === UNCATEGORIZED_LABEL) {
      setCategoryError(`「${UNCATEGORIZED_LABEL}」是系统保留名称，请换一个`)
      return
    }
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

  // 分类栏与站点列表各自在内部滚动
  const categoriesRef = useRef(null)
  const panelBodyRef = useRef(null)

  // 切换分类时站点列表回到顶部
  useEffect(() => {
    if (panelBodyRef.current) panelBodyRef.current.scrollTop = 0
  }, [effectiveCategory])

  // 选中的分类不在分类栏可见范围内时（如刷新后恢复到靠下的分类），滚动分类栏使其居中
  useEffect(() => {
    const el = categoriesRef.current
    const active = el?.querySelector('.chip.active')
    if (!active) return
    if (active.offsetTop < el.scrollTop || active.offsetTop + active.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = active.offsetTop - (el.clientHeight - active.offsetHeight) / 2
    }
  }, [effectiveCategory, navCategories])

  // ---------- 分类拖动排序（编辑模式） ----------
  // 电脑：按住移动超过 5px 开始拖；手机：长按 300ms 开始拖（期间移动超过 8px 视为滑动列表，取消）
  // "全部"和"未分类"固定不参与排序
  const isSortable = (category) => editMode && category !== '' && category !== UNCATEGORIZED
  const dragRef = useRef(null)
  const dragOrderRef = useRef(null)
  const suppressClickRef = useRef(false)
  const latestRef = useRef({})
  latestRef.current = { categories, categoryOrder, effectiveCategory }

  // 排序前固定当前查看的分类：未手动选过时显示的是"第一个分类"，顺序一变视图会跳走
  const pinCurrentCategory = () => {
    setActiveCategory(prev => prev ?? latestRef.current.effectiveCategory)
  }

  const saveCategoryOrder = useCallback(async (order, previous) => {
    setCategoryOrder(order)
    try {
      const saved = await updateSettings({ categoryOrder: order })
      if (Array.isArray(saved.categoryOrder)) setCategoryOrder(saved.categoryOrder)
    } catch (error) {
      setCategoryOrder(previous)
      notify(error.message || '保存分类顺序失败', 'error')
    }
  }, [notify])

  const updateDragOrder = (order) => {
    dragOrderRef.current = order
    setDragOrder(order)
  }

  useEffect(() => {
    if (!editMode) return undefined
    const nav = categoriesRef.current
    if (!nav) return undefined
    let scrollFrame = 0

    const begin = () => {
      const d = dragRef.current
      if (!d || d.active) return
      d.active = true
      pinCurrentCategory()
      setDraggingCategory(d.category)
      updateDragOrder(latestRef.current.categories)
      navigator.vibrate?.(10)
      autoScroll()
    }

    // 按指针 Y 坐标计算拖动项应插入的位置（用 offsetTop，不受重排动画的 transform 影响）
    const reorder = (clientY) => {
      const d = dragRef.current
      const y = clientY - nav.getBoundingClientRect().top + nav.scrollTop
      const others = [...nav.querySelectorAll('.chip[data-sortable]')].filter(el => el.dataset.category !== d.category)
      const index = others.filter(el => el.offsetTop + el.offsetHeight / 2 < y).length
      const order = others.map(el => el.dataset.category)
      order.splice(index, 0, d.category)
      if (order.join('\u0000') !== (dragOrderRef.current || []).join('\u0000')) updateDragOrder(order)
    }

    // 拖到列表上/下边缘 40px 内时自动滚动
    const autoScroll = () => {
      const d = dragRef.current
      if (!d?.active) return
      const rect = nav.getBoundingClientRect()
      const edge = 40
      let delta = 0
      if (d.lastY < rect.top + edge) delta = -Math.ceil((rect.top + edge - d.lastY) / 4)
      else if (d.lastY > rect.bottom - edge) delta = Math.ceil((d.lastY - rect.bottom + edge) / 4)
      if (delta) {
        nav.scrollTop += delta
        reorder(d.lastY)
      }
      scrollFrame = requestAnimationFrame(autoScroll)
    }

    const finish = (commit) => {
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      clearTimeout(d.timer)
      cancelAnimationFrame(scrollFrame)
      if (!d.active) return
      // 拖动结束后浏览器仍会派发一次 click，忽略它以免误切换分类
      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 0)
      const order = dragOrderRef.current
      const { categories: before, categoryOrder: previous } = latestRef.current
      dragOrderRef.current = null
      setDragOrder(null)
      setDraggingCategory(null)
      if (commit && order && order.join('\u0000') !== before.join('\u0000')) {
        saveCategoryOrder(order, previous)
      }
    }

    const onPointerDown = (e) => {
      const chip = e.target.closest('.chip[data-sortable]')
      if (!chip || e.button !== 0) return
      dragRef.current = {
        category: chip.dataset.category,
        pointerId: e.pointerId,
        type: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        lastY: e.clientY,
        active: false,
        timer: e.pointerType === 'touch' ? setTimeout(begin, 300) : 0,
      }
    }

    const onPointerMove = (e) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      d.lastY = e.clientY
      if (!d.active) {
        const distance = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
        if (d.type === 'touch') {
          if (distance > 8) finish(false)
          return
        }
        if (distance <= 5) return
        begin()
      }
      reorder(e.clientY)
    }

    const onPointerUp = (e) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) finish(true)
    }
    const onPointerCancel = (e) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) finish(false)
    }
    // 手机长按进入拖动后，阻止列表跟着手指滚动
    const onTouchMove = (e) => {
      if (dragRef.current?.active) e.preventDefault()
    }

    nav.addEventListener('pointerdown', onPointerDown)
    nav.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      finish(false)
      nav.removeEventListener('pointerdown', onPointerDown)
      nav.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [editMode, saveCategoryOrder])

  // 键盘排序：编辑模式下聚焦分类，Alt + ↑/↓ 移动
  const moveCategoryByKey = (category, step) => {
    const index = categories.indexOf(category)
    const target = index + step
    if (index < 0 || target < 0 || target >= categories.length) return
    const order = [...categories]
    order.splice(index, 1)
    order.splice(target, 0, category)
    pinCurrentCategory()
    saveCategoryOrder(order, categoryOrder)
    requestAnimationFrame(() => {
      categoriesRef.current?.querySelector(`[data-category="${CSS.escape(category)}"]`)?.focus()
    })
  }

  // 顺序变化时做 FLIP 动画：各项从旧位置平滑移到新位置
  const chipTopsRef = useRef(new Map())
  useLayoutEffect(() => {
    const nav = categoriesRef.current
    if (!nav) return
    const previous = chipTopsRef.current
    const next = new Map()
    const animate = previous.size > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    nav.querySelectorAll('.chip[data-category]').forEach(el => {
      const top = el.offsetTop
      next.set(el.dataset.category, top)
      const old = previous.get(el.dataset.category)
      if (animate && old !== undefined && old !== top) {
        el.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease-out' })
      }
    })
    chipTopsRef.current = next
  }, [navCategories])

  // 分类项：名称超长省略并以 title 显示全名
  const renderChip = (category, label) => {
    const sortable = isSortable(category)
    return (
      <button
        key={category}
        className={`chip${effectiveCategory === category ? ' active' : ''}${draggingCategory === category ? ' dragging' : ''}`}
        data-category={category}
        data-sortable={sortable || undefined}
        onClick={() => {
          if (suppressClickRef.current) return
          handleCategoryChange(category)
        }}
        onKeyDown={sortable ? (e) => {
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault()
            moveCategoryByKey(category, e.key === 'ArrowUp' ? -1 : 1)
          }
        } : undefined}
        onContextMenu={sortable ? (e) => e.preventDefault() : undefined}
        title={sortable ? `${label}（按住拖动调整顺序，或 Alt + ↑/↓）` : label}
      >
        <span className="chip-label">{label}</span>
      </button>
    )
  }

  const emptyText = keyword
    ? `没有找到匹配「${searchTerm.trim()}」的站点${editMode ? '' : '，按回车用必应搜索'}`
    : effectiveCategory
      ? `「${categoryLabel(effectiveCategory)}」分类下还没有站点${editMode ? '，点击上方「添加站点」' : ''}`
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
          <aside className="sidebar">
            <nav className="categories scroll-area" ref={categoriesRef}>
              {renderChip('', '全部')}
              {navCategories.map(category => renderChip(category, categoryLabel(category)))}
            </nav>
          </aside>

          {/* 站点网格 */}
          <main className="panel" ref={panelRef} onPointerMove={handlePanelMove}>
            {effectiveCategory && (
              <div className="panel-head">
                <h2 className="panel-title">{categoryLabel(effectiveCategory)}</h2>
                {editMode && effectiveCategory !== UNCATEGORIZED && (
                  <div className="panel-actions">
                    <button className="btn btn-sm" onClick={() => openRename(effectiveCategory)}>重命名</button>
                    <button className="btn btn-sm btn-danger-ghost" onClick={() => handleDeleteCategory(effectiveCategory)}>删除分类</button>
                  </div>
                )}
              </div>
            )}

            <div className="panel-body scroll-area" ref={panelBodyRef} onScroll={scheduleSpotlight}>
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
                      title={editMode ? `点击选择「${site.name}」` : `${site.name}\n${site.url}`}
                      role={editMode ? 'checkbox' : 'link'}
                      aria-checked={editMode ? selectedSet.has(site.id) : undefined}
                      tabIndex={0}
                      onClick={() => handleCardClick(site)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || (editMode && e.key === ' ')) {
                          e.preventDefault()
                          handleCardClick(site)
                        }
                      }}
                    >
                      {editMode && (
                        <span className="site-select" aria-hidden="true">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                        </span>
                      )}
                      <div className="site-icon">
                        <FaviconImg key={site.url} url={site.url} />
                      </div>
                      <div className="site-text">
                        <span className="site-name">{site.name}</span>
                        <span className="site-domain">{hostOf(site.url)}</span>
                      </div>
                      {editMode && (
                        <button
                          type="button"
                          className="site-edit"
                          title={`编辑「${site.name}」`}
                          aria-label={`编辑「${site.name}」`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingSite(site)
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* 添加站点表单 */}
      {showAddForm && (
        <AddSiteForm
          onAdd={handleAddSite}
          onCancel={() => setShowAddForm(false)}
          categories={categories}
          defaultCategory={effectiveCategory === UNCATEGORIZED ? '' : effectiveCategory}
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
          <div className={`modal-actions${confirmState.actions.length > 1 ? ' stacked' : ''}`}>
            <button type="button" className="mbtn mbtn-secondary" onClick={() => setConfirmState(null)} disabled={confirmBusy}>
              取消
            </button>
            {confirmState.actions.map((action, i) => (
              <button
                key={action.label}
                type="button"
                className={`mbtn mbtn-${action.variant}`}
                onClick={() => runConfirm(action)}
                disabled={confirmBusy}
                autoFocus={i === 0}
              >
                {confirmBusy ? '处理中...' : action.label}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* 重命名分类 */}
      {renamingCategory !== null && (
        <Modal title="重命名分类" onClose={() => !renameSaving && setRenamingCategory(null)}>
          <form onSubmit={handleRenameCategory}>
            <div className="field">
              <label className="field-label">新名称</label>
              <input
                className="field-input"
                type="text"
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value)
                  setRenameError('')
                }}
                maxLength={50}
                autoFocus
                required
              />
              {renameError && <p className="field-error">{renameError}</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="mbtn mbtn-secondary" onClick={() => setRenamingCategory(null)} disabled={renameSaving}>取消</button>
              <button type="submit" className="mbtn mbtn-primary" disabled={renameSaving}>
                {renameSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
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
