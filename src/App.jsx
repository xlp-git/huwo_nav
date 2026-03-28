import { useState, useEffect } from 'react'
import './App.css'
import AddSiteForm from './components/AddSiteForm'
import ImportBookmarks from './components/ImportBookmarks'
import EditSiteForm from './components/EditSiteForm'

function App() {
  const [sites, setSites] = useState([])
  const [selectedSites, setSelectedSites] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [showImportForm, setShowImportForm] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('常用网站')
  const [editMode, setEditMode] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [editingSite, setEditingSite] = useState(null)
  const [showEditForm, setShowEditForm] = useState(false)

  // 获取站点数据
  useEffect(() => {
    fetchSites()
  }, [])

  // 提取分类
  useEffect(() => {
    // 提取所有非空分类
    const uniqueCategories = [...new Set(sites.map(site => site.category).filter(Boolean))]
    // 确保常用网站分类存在
    if (!uniqueCategories.includes('常用网站')) {
      uniqueCategories.unshift('常用网站')
    }
    // 添加未分类
    uniqueCategories.push('未分类')
    setCategories(uniqueCategories)
  }, [sites])

  // 过滤当前分类的站点
  const filteredSites = activeCategory === '未分类' 
    ? sites.filter(site => !site.category || site.category.trim() === '')
    : sites.filter(site => site.category === activeCategory)

  // 获取所有站点
  const fetchSites = async () => {
    try {
      const response = await fetch('/api/sites')
      
      // 检查响应状态
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      // 检查响应类型
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON')
      }
      
      const data = await response.json()
      setSites(data)
    } catch (error) {
      console.error('Error fetching sites:', error)
      // API 请求失败时使用空数据
      setSites([])
    }
  }

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

    try {
      await fetch('/api/sites', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedSites })
      })
      setSites(prev => prev.filter(site => !selectedSites.includes(site.id)))
      setSelectedSites([])
    } catch (error) {
      console.error('Error deleting sites:', error)
      // 本地开发时模拟删除
      setSites(prev => prev.filter(site => !selectedSites.includes(site.id)))
      setSelectedSites([])
    }
  }

  // 处理添加站点
  const handleAddSite = (newSite) => {
    setSites(prev => [...prev, newSite])
    setShowAddForm(false)
  }

  // 处理导入完成
  const handleImportComplete = (importedCount) => {
    // 重新加载数据，确保本地存储中的数据被正确显示
    const localData = localStorage.getItem('nav_sites')
    setSites(localData ? JSON.parse(localData) : [])
    setShowImportForm(false)
  }

  // 处理密码提交
  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    // Cloudflare Pages 环境变量在前端通过 import.meta.env 访问
    // 本地开发时使用默认密码 'admin123'
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

    try {
      // 检查分类是否已存在
      if (categories.includes(categoryName.trim())) {
        alert('分类已存在')
        return
      }

      // 发送请求到 API 添加分类
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ category: categoryName.trim() })
      })

      if (!response.ok) {
        throw new Error('添加分类失败')
      }

      // 刷新分类列表
      const updatedSites = await response.json()
      setSites(updatedSites)
      setNewCategory('')
      setShowAddCategoryForm(false)
    } catch (error) {
      console.error('Error adding category:', error)
      // 本地开发时模拟添加分类
      alert('分类添加成功（本地模拟）')
      setNewCategory('')
      setShowAddCategoryForm(false)
    }
  }

  // 处理编辑网站
  const handleEditSite = (site) => {
    setEditingSite(site)
    setShowEditForm(true)
  }

  // 处理更新网站
  const handleUpdateSite = async (updatedSite) => {
    try {
      // 发送请求到 API 更新网站
      const response = await fetch('/api/sites', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedSite)
      })

      if (!response.ok) {
        throw new Error('更新网站失败')
      }

      // 刷新网站列表
      const updatedSites = await response.json()
      setSites(updatedSites)
      setEditingSite(null)
      setShowEditForm(false)
    } catch (error) {
      console.error('Error updating site:', error)
      // 本地开发时模拟更新网站
      setSites(prev => prev.map(site => site.id === updatedSite.id ? updatedSite : site))
      setEditingSite(null)
      setShowEditForm(false)
      alert('网站更新成功（本地模拟）')
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f3f4f6',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 顶部导航栏 */}
      <header style={{ 
        backgroundColor: 'white',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ 
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ 
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#111827'
          }}>小鹏导航</h1>
          <div style={{ 
            display: 'flex',
            gap: '8px'
          }}>
            {editMode ? (
              <>
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
                  退出
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
              </>
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
        </div>
      </header>

      {/* 分类导航 */}
      <div style={{ 
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            style={{ 
              padding: '8px 16px',
              borderRadius: '9999px',
              backgroundColor: activeCategory === category ? '#2563eb' : 'white',
              color: activeCategory === category ? 'white' : '#4b5563',
              cursor: 'pointer',
              border: 'none'
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
        margin: '0 auto',
        padding: '16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '24px'
      }}>
        {filteredSites.map(site => (
          <div 
            key={site.id} 
            style={{ 
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              transition: 'box-shadow 0.2s',
              border: selectedSites.includes(site.id) ? '2px solid #2563eb' : 'none',
              cursor: editMode ? 'pointer' : 'default'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
            }}
            onClick={() => editMode && handleEditSite(site)}
          >
            <div style={{ 
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{ 
                  width: '40px',
                  height: '40px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  flexShrink: '0'
                }}>
                  <img 
                    src={`https://favicon.im/zh/${site.url}`} 
                    alt={`${site.name} icon`} 
                    style={{ 
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none"%3E%3Crect width="40" height="40" rx="8" fill="%23f3f4f6"/%3E%3Cpath d="M10 20H30" stroke="%239ca3af" strokeWidth="2" strokeLinecap="round"/%3E%3Cpath d="M20 10V30" stroke="%239ca3af" strokeWidth="2" strokeLinecap="round"/%3E%3C/svg%3E'
                    }}
                  />
                </div>
                <div>
                  <h3 style={{ 
                    fontWeight: '500',
                    color: '#111827',
                    margin: '0',
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>{site.name}</h3>
                  {site.category && (
                    <p style={{ 
                      fontSize: '12px',
                      color: '#6b7280',
                      margin: '4px 0 0 0'
                    }}>{site.category}</p>
                  )}
                </div>
              </div>
              <input
                type="checkbox"
                checked={selectedSites.includes(site.id)}
                onChange={() => handleSiteSelect(site.id)}
                style={{ 
                  width: '16px',
                  height: '16px',
                  color: '#2563eb'
                }}
              />
            </div>
            <a 
              href={site.url} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ 
                fontSize: '14px',
                color: '#2563eb',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#1d4ed8'
                e.currentTarget.style.textDecoration = 'underline'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#2563eb'
                e.currentTarget.style.textDecoration = 'none'
              }}
            >
              {site.url}
            </a>
          </div>
        ))}
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
          categories={categories.filter(cat => cat !== '未分类')}
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
              categories={categories.filter(cat => cat !== '未分类')}
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
  )
}

export default App
