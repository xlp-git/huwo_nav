import { useState, useMemo, useEffect, useRef } from 'react'
import './App.css'
import AddSiteForm from './components/AddSiteForm'
import ImportBookmarks from './components/ImportBookmarks'
import EditSiteForm from './components/EditSiteForm'
import EditTitleForm from './components/EditTitleForm'
import { getSites, addSite, updateSite, deleteSites, addCategory, getSettings, updateSettings } from './storage'

const WALLPAPER_URL = 'https://api.xsot.cn/bing?jump=true'
const WALLPAPER_TIMEOUT = 6000

const FAVICON_SVG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22 fill=%22none%22%3E%3Crect width=%2240%22 height=%2240%22 rx=%228%22 fill=%22%23f3f4f6%22/%3E%3Cpath d=%22M10 20H30%22 stroke=%22%239ca3af%22 stroke-width=%222%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M20 10V30%22 stroke=%22%239ca3af%22 stroke-width=%222%22 stroke-linecap=%22round%22/%3E%3C/svg%3E'

function getFaviconUrl(url, tier) {
  try {
    const domain = new URL(url).hostname
    switch (tier) {
      case 0: return `https://favicon.im/${domain}`
      case 1: return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
      default: return null
    }
  } catch {
    return null
  }
}

function App() {
  const [sites, setSites] = useState([])
  const [selectedSites, setSelectedSites] = useState([])
  const [wallpaper, setWallpaper] = useState(null)
  const [browserTitle, setBrowserTitle] = useState('小鹏导航')
  const [headerTitle, setHeaderTitle] = useState('我的个人网址导航')
  const [showEditTitleForm, setShowEditTitleForm] = useState(false)

  useEffect(() => {
    getSites().then(setSites)
    getSettings().then(s => {
      setBrowserTitle(s.browserTitle)
      setHeaderTitle(s.headerTitle)
    })
  }, [])

  useEffect(() => {
    document.title = browserTitle
  }, [browserTitle])

  // 壁纸加载（自动重试）
  const retryRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    function loadWallpaper() {
      if (cancelled) return
      const img = new Image()
      const timeout = setTimeout(() => {
        if (!cancelled) {
          retryRef.current = setTimeout(loadWallpaper, 10000)
        }
      }, WALLPAPER_TIMEOUT)

      img.onload = () => {
        clearTimeout(timeout)
        if (!cancelled) setWallpaper(img.src)
      }
      img.onerror = () => {
        clearTimeout(timeout)
        if (!cancelled) retryRef.current = setTimeout(loadWallpaper, 10000)
      }
      img.src = `${WALLPAPER_URL}&t=${Date.now()}`
    }

    loadWallpaper()

    return () => {
      cancelled = true
      clearTimeout(retryRef.current)
    }
  }, [])
  const [showAddForm, setShowAddForm] = useState(false)
  const [showImportForm, setShowImportForm] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const categories = useMemo(
    () => [...new Set(sites.map(site => site.category).filter(Boolean))],
    [sites]
  )
  const [activeCategory, setActiveCategory] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [editingSite, setEditingSite] = useState(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // 过滤当前分类的站点
  const filteredSites = sites.filter(site => {
    const categoryMatch = !activeCategory || site.category === activeCategory
    const searchMatch = !searchTerm || 
                       site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       site.url.toLowerCase().includes(searchTerm.toLowerCase())
    
    return categoryMatch && searchMatch
  })

  // 处理站点选择
  const handleSiteSelect = (id) => {
    setSelectedSites(prev => {
      if (prev.includes(id)) {
        return prev.filter(siteId => siteId !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  // 处理批量删除
  const handleBatchDelete = async () => {
    if (selectedSites.length === 0) return
    const remaining = await deleteSites(selectedSites)
    setSites(remaining)
    setSelectedSites([])
  }

  // 处理添加站点
  const handleAddSite = async (newSite) => {
    const created = await addSite(newSite)
    setSites(prev => [...prev, created])
    setShowAddForm(false)
  }

  // 处理导入完成
  const handleImportComplete = async () => {
    const data = await getSites()
    setSites(data)
    setShowImportForm(false)
  }

  // 处理密码提交
  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    const correctPassword = import.meta.env.VITE_PASSWORD || 'admin123'
    if (password === correctPassword) {
      setEditMode(true)
      setShowPasswordForm(false)
      setPasswordError('')
    } else {
      setPasswordError('密码错误，请重新输入')
    }
  }

  // 处理添加分类
  const handleAddCategory = async (categoryName) => {
    if (!categoryName || categoryName.trim() === '') return
    if (categories.includes(categoryName.trim())) {
      alert('分类已存在')
      return
    }
    const result = await addCategory(categoryName.trim())
    if (result.error) {
      alert(result.error)
      return
    }
    setSites(result.sites)
    setNewCategory('')
    setShowAddCategoryForm(false)
  }

  // 处理编辑网站
  const handleEditSite = (site) => {
    setEditingSite(site)
    setShowEditForm(true)
  }

  // 处理更新网站
  const handleUpdateSite = async (updatedSite) => {
    const result = await updateSite(updatedSite)
    if (result) {
      setSites(result)
    }
    setEditingSite(null)
    setShowEditForm(false)
  }

  return (
    <>
      {/* 全屏背景层 */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        background: wallpaper
          ? `linear-gradient(rgba(26,26,46,0.3), rgba(26,26,46,0.5)), url(${wallpaper}) center/cover no-repeat`
          : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        transition: 'background 0.8s ease'
      }} />
      {/* 内容层 */}
      <div style={{
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
      {/* 顶部导航栏 */}
      <header>
        <div style={{
          maxWidth: '1280px',
          margin: '16px auto 0',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(12px)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <div style={{ 
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h1 style={{ 
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#111827'
            }}>{headerTitle}</h1>
            {editMode ? (
              <button 
                onClick={() => setEditMode(false)}
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b7280'
                }}
              >
                退出编辑
              </button>
            ) : (
              <button 
                onClick={() => setShowPasswordForm(true)}
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d97706'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f59e0b'
                }}
              >
                编辑
              </button>
            )}
          </div>
          
          {/* 搜索栏 */}
          <div style={{ 
            display: 'flex',
            gap: '8px',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="输入搜索内容..."
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px 0 0 6px',
                border: '1px solid #d1d5db',
                fontSize: '14px'
              }}
            />
            <button
              onClick={() => setSearchTerm('')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '0 6px 6px 0',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              搜索
            </button>
          </div>
          
          {/* 编辑模式工具栏 */}
          {editMode && (
            <div style={{ 
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button 
                onClick={() => setShowAddForm(true)}
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1d4ed8'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb'
                }}
              >
                添加站点
              </button>
              <button 
                onClick={() => setShowImportForm(true)}
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#16a34a',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803d'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#16a34a'
                }}
              >
                导入收藏夹
              </button>
              <button 
                onClick={() => setShowAddCategoryForm(true)}
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#7c3aed'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8b5cf6'
                }}
              >
                添加分类
              </button>
              <button
                onClick={() => setShowEditTitleForm(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d97706'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f59e0b'
                }}
              >
                编辑标题
              </button>
              {filteredSites.length > 0 && (
                <button 
                  onClick={() => {
                    if (selectedSites.length === filteredSites.length) {
                      setSelectedSites([])
                    } else {
                      setSelectedSites(filteredSites.map(site => site.id))
                    }
                  }}
                  style={{ 
                    padding: '8px 16px',
                    backgroundColor: '#8b5cf6',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#7c3aed'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#8b5cf6'
                  }}
                >
                  {selectedSites.length === filteredSites.length ? '取消全选' : '全选'}
                </button>
              )}
              {selectedSites.length > 0 && (
                <button 
                  onClick={handleBatchDelete}
                  style={{ 
                    padding: '8px 16px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#b91c1c'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#dc2626'
                  }}
                >
                  批量删除 ({selectedSites.length})
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 分类导航 */}
      <div style={{
        maxWidth: '1280px',
        margin: '16px auto 0',
        padding: '16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(12px)',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            style={{ 
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: activeCategory === category ? '#2563eb' : 'white',
              color: activeCategory === category ? 'white' : '#4b5563',
              cursor: 'pointer',
              border: activeCategory === category ? '1px solid #2563eb' : '1px solid #e5e7eb',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              if (activeCategory !== category) {
                e.currentTarget.style.backgroundColor = '#f3f4f6'
              }
            }}
            onMouseLeave={(e) => {
              if (activeCategory !== category) {
                e.currentTarget.style.backgroundColor = 'white'
              }
            }}
          >
            {category}
          </button>
        ))}
      </div>

      {/* 站点网格 */}
      <main style={{ 
        maxWidth: '1280px',
        margin: '20px auto',
        padding: '24px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(12px)',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        {/* 分类标题 */}
        {activeCategory && (
          <h2 style={{ 
            fontSize: '18px',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '16px'
          }}>{activeCategory}</h2>
        )}
        
        {/* 站点图标网格 */}
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '16px'
        }}>
          {filteredSites.map(site => (
            <div 
              key={site.id} 
              style={{ 
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
                border: selectedSites.includes(site.id) ? '2px solid #2563eb' : 'none',
                cursor: editMode ? 'pointer' : 'default',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
              onClick={() => editMode && handleEditSite(site)}
            >
              <div style={{ 
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f3f4f6'
              }}>
                <img 
                  src={getFaviconUrl(site.url, 0)}
                  alt={`${site.name} icon`}
                  data-tier="0"
                  style={{ 
                    width: '40px',
                    height: '40px',
                    objectFit: 'contain'
                  }}
                  onError={(e) => {
                    const tier = parseInt(e.target.dataset.tier || '0')
                    const next = getFaviconUrl(site.url, tier + 1)
                    if (next) {
                      e.target.dataset.tier = String(tier + 1)
                      e.target.src = next
                    } else {
                      e.target.src = FAVICON_SVG
                    }
                  }}
                />
              </div>
              <a 
                href={site.url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  fontSize: '14px',
                  color: '#111827',
                  textDecoration: 'none',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#2563eb'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#111827'
                }}
              >
                {site.name}
              </a>
              {editMode && (
                <input
                  type="checkbox"
                  checked={selectedSites.includes(site.id)}
                  onChange={() => handleSiteSelect(site.id)}
                  style={{ 
                    width: '16px',
                    height: '16px',
                    marginTop: '8px',
                    color: '#2563eb'
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </main>
      {filteredSites.length === 0 && (
        <div style={{ 
          textAlign: 'center',
          padding: '48px',
          maxWidth: '1280px',
          margin: '0 auto'
        }}>
          <p style={{ 
            color: '#6b7280'
          }}>暂无站点，请添加或导入收藏夹</p>
        </div>
      )}

      {/* 添加站点表单 */}
      {showAddForm && (
        <AddSiteForm 
          onAdd={handleAddSite} 
          onCancel={() => setShowAddForm(false)} 
          categories={categories}
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#111827',
              margin: '0 0 16px 0'
            }}>请输入密码以进入编辑模式</h2>
            <form onSubmit={handlePasswordSubmit}>
              <div style={{
                marginBottom: '16px'
              }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px'
                  }}
                  required
                />
                {passwordError && (
                  <p style={{
                    color: '#dc2626',
                    fontSize: '12px',
                    marginTop: '4px'
                  }}>{passwordError}</p>
                )}
              </div>
              <div style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false)
                    setPassword('')
                    setPasswordError('')
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f3f4f6',
                    color: '#4b5563',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none'
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none'
                  }}
                >
                  确定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 添加分类表单 */}
      {showAddCategoryForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#111827',
              margin: '0 0 16px 0'
            }}>添加分类</h2>
            <form onSubmit={(e) => {
              e.preventDefault()
              handleAddCategory(newCategory)
            }}>
              <div style={{
                marginBottom: '16px'
              }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>分类名称</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px'
                  }}
                  placeholder="例如：搜索"
                  required
                />
              </div>
              <div style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCategoryForm(false)
                    setNewCategory('')
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f3f4f6',
                    color: '#4b5563',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none'
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: 'none'
                  }}
                >
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑标题表单 */}
      {showEditTitleForm && (
        <EditTitleForm
          browserTitle={browserTitle}
          headerTitle={headerTitle}
          onSave={async (bt, ht) => {
            const s = await updateSettings({ browserTitle: bt, headerTitle: ht })
            setBrowserTitle(s.browserTitle)
            setHeaderTitle(s.headerTitle)
            setShowEditTitleForm(false)
          }}
          onCancel={() => setShowEditTitleForm(false)}
        />
      )}

      {/* 编辑网站表单 */}
      {showEditForm && editingSite && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            width: '100%',
            maxWidth: '400px',
            padding: '24px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#111827'
              }}>编辑站点</h2>
              <button 
                onClick={() => {
                  setShowEditForm(false)
                  setEditingSite(null)
                }}
                style={{
                  color: '#6b7280',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  fontSize: '20px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#4b5563'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#6b7280'
                }}
              >
                ×
              </button>
            </div>

            <EditSiteForm 
              site={editingSite} 
              categories={categories}
              onUpdate={handleUpdateSite} 
              onCancel={() => {
                setShowEditForm(false)
                setEditingSite(null)
              }} 
            />
          </div>
        </div>
      )}
    </div>
    </>
  )
}

export default App
