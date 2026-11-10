import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  checkHealth,
  createUser,
  deleteUser,
  explainError,
  listUsers,
  updateUser,
} from './api'
import type { User } from './types'

type Draft = {
  mode: 'create' | 'edit'
  id?: number
  name: string
  email: string
}

const emailPattern = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/

function validate(name: string, email: string): string {
  const trimmedName = name.trim()
  const trimmedEmail = email.trim().toLowerCase()
  if (!trimmedName || trimmedName.length > 100) return '姓名需要 1 到 100 个字符'
  if (!emailPattern.test(trimmedEmail)) return '邮箱格式不正确'
  return ''
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function App() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<'unknown' | 'ok' | 'down'>('unknown')
  const [query, setQuery] = useState('')
  const [banner, setBanner] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const searchId = useId()
  const [panelKey, setPanelKey] = useState(0)

  async function refresh() {
    const [list, status] = await Promise.all([listUsers(), checkHealth()])
    setUsers(list)
    setHealth(status)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [list, status] = await Promise.all([listUsers(), checkHealth()])
        if (cancelled) return
        setUsers(list)
        setHealth(status)
      } catch (error) {
        if (cancelled) return
        setBanner(explainError(error))
        setHealth('down')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (panelKey === 0) return
    nameInput.current?.focus()
  }, [panelKey])

  function openCreate() {
    setFormError('')
    setPanelKey((value) => value + 1)
    setDraft({ mode: 'create', name: '', email: '' })
  }

  function openEdit(user: User) {
    setFormError('')
    setPanelKey((value) => value + 1)
    setDraft({ mode: 'edit', id: user.id, name: user.name, email: user.email })
  }

  async function submitDraft(event: FormEvent) {
    event.preventDefault()
    if (!draft || saving) return
    const message = validate(draft.name, draft.email)
    if (message) {
      setFormError(message)
      return
    }
    const input = { name: draft.name.trim(), email: draft.email.trim() }
    setSaving(true)
    setFormError('')
    try {
      if (draft.mode === 'create') {
        await createUser(input)
        setNotice('已登记')
      } else if (draft.id) {
        await updateUser(draft.id, input)
        setNotice('已更新')
      }
      await refresh()
      setDraft(null)
      setBanner('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) setHealth('down')
      setFormError(explainError(error))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    try {
      await deleteUser(pendingDelete.id)
      setNotice(`已删除 ${pendingDelete.name}`)
      setPendingDelete(null)
      await refresh()
      setBanner('')
    } catch (error) {
      setBanner(explainError(error))
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const keyword = query.trim().toLowerCase()
  const visible = keyword
    ? users.filter((user) => user.name.toLowerCase().includes(keyword) || user.email.includes(keyword))
    : users

  return (
    <div className="app">
      <aside className="rail">
        <p className="eyebrow">AWS GO · REGISTRY</p>
        <h1>名册</h1>
        <p className="rail-copy">登记用户、改正资料、把不再使用的记录从名册上划掉。写入的是本地 PostgreSQL。</p>
        <p className={`status status-${health}`}>
          <span className="status-dot" aria-hidden="true" />
          {health === 'ok' ? '用户服务可用' : health === 'down' ? '用户服务不可用' : '正在检查服务'}
        </p>
      </aside>

      <main className="sheet">
        <header className="sheet-head">
          <div>
            <p className="eyebrow">在册记录</p>
            <h2>
              <span className="count">{loading ? '—' : users.length}</span>
              人
            </h2>
          </div>
          <button className="primary" type="button" onClick={openCreate}>
            登记用户
          </button>
        </header>

        <div className="toolbar">
          <label htmlFor={searchId}>查找</label>
          <input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="姓名或邮箱"
            autoComplete="off"
          />
        </div>

        {banner ? <p className="banner" role="alert">{banner}</p> : null}
        {notice ? <p className="notice" role="status">{notice}</p> : null}

        {loading ? <p className="muted">正在读取名册…</p> : null}
        {!loading && visible.length === 0 ? (
          <p className="empty">{users.length === 0 ? '名册还是空的。先登记第一个用户。' : '没有符合条件的记录。'}</p>
        ) : null}

        {visible.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>邮箱</th>
                    <th>登记时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td className="email">{user.email}</td>
                      <td>{formatTime(user.created_at)}</td>
                      <td className="actions">
                        <button type="button" onClick={() => openEdit(user)}>修改</button>
                        <button type="button" className="danger" onClick={() => setPendingDelete(user)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="cards">
              {visible.map((user) => (
                <li key={user.id}>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                  <time dateTime={user.created_at}>{formatTime(user.created_at)}</time>
                  <div className="actions">
                    <button type="button" onClick={() => openEdit(user)}>修改</button>
                    <button type="button" className="danger" onClick={() => setPendingDelete(user)}>删除</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </main>

      {draft ? (
        <div className="overlay" onMouseDown={() => { if (!saving) setDraft(null) }}>
          <form
            className="panel"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={submitDraft}
            aria-labelledby="draft-title"
          >
            <p className="eyebrow">{draft.mode === 'create' ? '新记录' : `编号 ${draft.id}`}</p>
            <h3 id="draft-title">{draft.mode === 'create' ? '登记用户' : '修改用户'}</h3>
            <label htmlFor="user-name">姓名</label>
            <input
              id="user-name"
              ref={nameInput}
              value={draft.name}
              maxLength={100}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              autoComplete="name"
            />
            <label htmlFor="user-email">邮箱</label>
            <input
              id="user-email"
              type="email"
              value={draft.email}
              maxLength={255}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              autoComplete="email"
            />
            <p className="hint">邮箱会按小写保存。重复邮箱不能再次登记。</p>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="panel-actions">
              <button type="button" onClick={() => setDraft(null)} disabled={saving}>取消</button>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="overlay" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h3 id="delete-title">删除这条记录？</h3>
            <p>{pendingDelete.name}（{pendingDelete.email}）会从名册中移除，且不能撤销。</p>
            <div className="panel-actions">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={deleting}>留下</button>
              <button className="danger solid" type="button" onClick={() => void confirmDelete()} disabled={deleting}>
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
