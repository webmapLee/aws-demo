import type { User, UserInput } from './types'

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
  return raw
}
