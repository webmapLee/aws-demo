import type { Task, TaskInput, TaskUpdate, User, UserInput } from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(0, '连不上用户服务，请确认 API 已启动')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const payload = text ? JSON.parse(text) as { error?: string } : {}
  if (!response.ok) {
    throw new ApiError(response.status, payload.error || '请求失败')
  }
  return payload as T
}

export function listUsers(): Promise<User[]> {
  return request<User[]>('/users')
}

export function createUser(input: UserInput): Promise<User> {
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateUser(id: number, input: UserInput): Promise<User> {
  return request<User>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteUser(id: number): Promise<void> {
  return request<void>(`/users/${id}`, { method: 'DELETE' })
}

export function listTasks(assigneeId?: number): Promise<Task[]> {
  const query = assigneeId ? `?assignee_id=${assigneeId}` : ''
  return request<Task[]>(`/tasks${query}`)
}

export function createTask(input: TaskInput): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTask(id: number, input: TaskUpdate): Promise<Task> {
  return request<Task>(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteTask(id: number): Promise<void> {
  return request<void>(`/tasks/${id}`, { method: 'DELETE' })
}

export async function checkHealth(): Promise<'ok' | 'down'> {
  try {
    const response = await fetch('/health')
    if (!response.ok) return 'down'
    const payload = await response.json() as { status?: string }
    return payload.status === 'ok' ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

export function explainError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '请求失败'
  if (raw.includes('email already exists')) return '这个邮箱已经登记过'
  if (raw.includes('email is invalid')) return '邮箱格式不正确'
  if (raw.includes('name must be')) return '姓名需要 1 到 100 个字符'
  if (raw.includes('user not found')) return '这条记录已经不在名册里'
  if (raw.includes('user has tasks')) return '这个用户还有待办，请先改派或删除'
  if (raw.includes('title must be')) return '标题需要 1 到 200 个字符'
  if (raw.includes('assignee not found')) return '负责人不在名册里'
  if (raw.includes('assignee is invalid')) return '请选择负责人'
  if (raw.includes('task not found')) return '这条待办已经不在'
  return raw
}
