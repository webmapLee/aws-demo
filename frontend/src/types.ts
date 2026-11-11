export type User = {
  id: number
  name: string
  email: string
  created_at: string
}

export type UserInput = {
  name: string
  email: string
}

export type Assignee = {
  id: number
  name: string
  email: string
}

export type Task = {
  id: number
  title: string
  assignee_id: number
  assignee: Assignee
  done: boolean
  created_at: string
}

export type TaskInput = {
  title: string
  assignee_id: number
}

export type TaskUpdate = TaskInput & {
  done: boolean
}
