import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  ApiError,
  createTask,
  deleteTask,
  explainError,
  listTasks,
  updateTask,
} from './api'
import type { Task, User } from './types'

type Props = {
  users: User[]
  usersLoading: boolean
  onUnavailable: () => void
}

function titleError(title: string): string {
  const length = Array.from(title.trim()).length
  if (length < 1 || length > 200) return '标题需要 1 到 200 个字符'
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

export default function Tasks({ users, usersLoading, onUnavailable }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [formError, setFormError] = useState('')
  const [banner, setBanner] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)
  const [reassign, setReassign] = useState<Task | null>(null)
  const [nextAssignee, setNextAssignee] = useState('')
  const titleId = useId()
  const assigneeId = useId()
  const filterId = useId()
  const reassignId = useId()

  async function load(assigneeIdValue: string) {
    const selected = assigneeIdValue ? Number(assigneeIdValue) : undefined
    const list = await listTasks(selected)
    setTasks(list)
    setBanner('')
  }

  const roster = users.map((user) => `${user.id}:${user.name}:${user.email}`).join('|')

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const selected = filter ? Number(filter) : undefined
        const list = await listTasks(selected)
        if (cancelled) return
        setTasks(list)
        setBanner('')
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 0) onUnavailable()
        setBanner(explainError(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [filter, roster, onUnavailable])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (filter && !users.some((user) => String(user.id) === filter)) setFilter('')
    if (assignee && !users.some((user) => String(user.id) === assignee)) setAssignee('')
  }, [users, filter, assignee])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const message = titleError(title) || (assignee ? '' : '请选择负责人')
    if (message) {
      setFormError(message)
      return
    }
    setSaving(true)
    setCreating(true)
    setFormError('')
    try {
      await createTask({ title: title.trim(), assignee_id: Number(assignee) })
      setTitle('')
      setNotice('已添加')
      await load(filter)
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) onUnavailable()
      setFormError(explainError(error))
    } finally {
      setSaving(false)
      setCreating(false)
    }
  }

  async function toggle(task: Task) {
    if (saving) return
    setSaving(true)
    try {
      await updateTask(task.id, {
        title: task.title,
        assignee_id: task.assignee_id,
        done: !task.done,
      })
      setNotice(task.done ? '已恢复' : '已完成')
      await load(filter)
      setBanner('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) onUnavailable()
      setBanner(explainError(error))
    } finally {
      setSaving(false)
    }
  }

  async function saveReassign(event: FormEvent) {
    event.preventDefault()
    if (!reassign || saving) return
    if (!nextAssignee) {
      setFormError('请选择负责人')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await updateTask(reassign.id, {
        title: reassign.title,
        assignee_id: Number(nextAssignee),
        done: reassign.done,
      })
      setNotice('已改派')
      setReassign(null)
      await load(filter)
      setBanner('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) onUnavailable()
      setFormError(explainError(error))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || saving) return
    setSaving(true)
    try {
      await deleteTask(pendingDelete.id)
      setNotice(`已删除「${pendingDelete.title}」`)
      setPendingDelete(null)
      await load(filter)
      setBanner('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) onUnavailable()
      setBanner(explainError(error))
      setPendingDelete(null)
    } finally {
      setSaving(false)
    }
  }

  const openCount = tasks.filter((task) => !task.done).length
  const noUsers = !usersLoading && users.length === 0

  return (
    <section className="tasks" aria-labelledby="tasks-title">
      <header className="sheet-head">
        <div>
          <p className="eyebrow">交给具体的人</p>
          <h2 id="tasks-title">
            <span className="count">{loading ? '—' : openCount}</span>
            件未完成
          </h2>
        </div>
      </header>

      <form className="task-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor={titleId}>
          标题
          <input
            id={titleId}
            value={title}
            maxLength={200}
            placeholder="要做的事"
            disabled={noUsers || saving}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label htmlFor={assigneeId}>
          负责人
          <select
            id={assigneeId}
            value={assignee}
            disabled={noUsers || saving}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">选择用户</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>
        <button className="primary" type="submit" disabled={noUsers || saving}>
          {creating ? '保存中…' : '添加待办'}
        </button>
      </form>
      {noUsers ? <p className="hint">先在名册里登记用户，才能把待办交给某人。</p> : null}
      {formError && !reassign ? <p className="form-error" role="alert">{formError}</p> : null}

      <div className="toolbar">
        <label htmlFor={filterId}>查看</label>
        <select id={filterId} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">全部用户</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>
      </div>

      {banner ? <p className="banner" role="alert">{banner}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {loading ? <p className="muted">正在读取待办…</p> : null}
      {!loading && tasks.length === 0 ? (
        <p className="empty">{filter ? '这个人还没有待办。' : '还没有待办。写下一件，并交给名册里的人。'}</p>
      ) : null}

      {tasks.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>标题</th>
                  <th>负责人</th>
                  <th>状态</th>
                  <th>建立时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className={task.done ? 'is-done' : undefined}>{task.title}</td>
                    <td>{task.assignee.name}</td>
                    <td>{task.done ? '已完成' : '未完成'}</td>
                    <td>{formatTime(task.created_at)}</td>
                    <td className="actions">
                      <button type="button" onClick={() => void toggle(task)} disabled={saving}>
                        {task.done ? '恢复' : '完成'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('')
                          setNextAssignee(String(task.assignee_id))
                          setReassign(task)
                        }}
                      >
                        改派
                      </button>
                      <button type="button" className="danger" onClick={() => setPendingDelete(task)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="cards">
            {tasks.map((task) => (
              <li key={task.id}>
                <strong className={task.done ? 'is-done' : undefined}>{task.title}</strong>
                <span>{task.assignee.name} · {task.done ? '已完成' : '未完成'}</span>
                <time dateTime={task.created_at}>{formatTime(task.created_at)}</time>
                <div className="actions">
                  <button type="button" onClick={() => void toggle(task)} disabled={saving}>
                    {task.done ? '恢复' : '完成'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError('')
                      setNextAssignee(String(task.assignee_id))
                      setReassign(task)
                    }}
                  >
                    改派
                  </button>
                  <button type="button" className="danger" onClick={() => setPendingDelete(task)}>删除</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {reassign ? (
        <div className="overlay" role="presentation">
          <form className="dialog" role="dialog" aria-modal="true" onSubmit={(event) => void saveReassign(event)} aria-labelledby="reassign-title">
            <h3 id="reassign-title">改派</h3>
            <p>{reassign.title}</p>
            <label htmlFor={reassignId}>负责人</label>
            <select id={reassignId} value={nextAssignee} onChange={(event) => setNextAssignee(event.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="panel-actions">
              <button type="button" onClick={() => setReassign(null)} disabled={saving}>取消</button>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="overlay" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="task-delete-title">
            <h3 id="task-delete-title">删除这条待办？</h3>
            <p>「{pendingDelete.title}」会从列表中移除，且不能撤销。</p>
            <div className="panel-actions">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={saving}>留下</button>
              <button className="danger solid" type="button" onClick={() => void confirmDelete()} disabled={saving}>
                {saving ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
