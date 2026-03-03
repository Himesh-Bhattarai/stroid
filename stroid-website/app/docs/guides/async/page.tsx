import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsCallout,
} from "@/components/docs/docs-content"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Async State - Guides - stroid Docs",
  description: "Model loading, success, and error states with stroid's async actions.",
}

export default function AsyncGuidePage() {
  return (
    <article>
      <DocsH1>Async State</DocsH1>
      <DocsParagraph>
        Most applications deal with asynchronous data. stroid makes it straightforward to model
        loading, success, and error states directly in your store.
      </DocsParagraph>

      <DocsH2 id="pattern">The Async Pattern</DocsH2>
      <DocsParagraph>
        The recommended pattern uses a <DocsInlineCode>status</DocsInlineCode> field that tracks
        the lifecycle of an async operation:
      </DocsParagraph>
      <DocsCode filename="user-store.ts">{`import { createStore, setStore } from 'stroid'

type Status = 'idle' | 'loading' | 'success' | 'error'

createStore('user', {
  user: null as User | null,
  status: 'idle' as Status,
  error: null as string | null,
})

export async function fetchUser(id: string) {
  setStore('user', (s) => {
    s.status = 'loading'
    s.error = null
  })

  try {
    const res = await fetch(\`/api/users/\${id}\`)
    if (!res.ok) throw new Error('Failed to fetch')
    const data = await res.json()
    setStore('user', (s) => {
      s.user = data
      s.status = 'success'
    })
  } catch (err) {
    setStore('user', (s) => {
      s.error = err instanceof Error ? err.message : 'Unknown error'
      s.status = 'error'
    })
  }
}

export function resetUser() {
  setStore('user', (s) => {
    s.user = null
    s.status = 'idle'
    s.error = null
  })
}`}</DocsCode>

      <DocsH2 id="consuming">Consuming Async State</DocsH2>
      <DocsCode filename="UserProfile.tsx">{`import { useEffect } from 'react'
import { useStore } from 'stroid'
import { fetchUser } from './user-store'

function UserProfile({ id }: { id: string }) {
  const status = useStore('user', (s) => s.status)
  const user = useStore('user', (s) => s.user)
  const error = useStore('user', (s) => s.error)

  useEffect(() => {
    fetchUser(id)
  }, [id])

  if (status === 'loading') return <Spinner />
  if (status === 'error') return <Error message={error} />
  if (!user) return null

  return <div>{user.name}</div>
}`}</DocsCode>

      <DocsCallout type="tip">
        Notice that each <DocsInlineCode>await</DocsInlineCode> boundary triggers an update. Your
        component sees <DocsInlineCode>{"status: 'loading'"}</DocsInlineCode> immediately, then
        transitions to <DocsInlineCode>{"'success'"}</DocsInlineCode> or{" "}
        <DocsInlineCode>{"'error'"}</DocsInlineCode> when the request completes.
      </DocsCallout>

      <DocsH2 id="parallel">Parallel Requests</DocsH2>
      <DocsCode filename="parallel.ts">{`import { createStore, setStore } from 'stroid'

createStore('dashboard', { users: [] as User[], posts: [] as Post[], loading: false })

export async function fetchAll() {
  setStore('dashboard', (s) => {
    s.loading = true
  })

  const [users, posts] = await Promise.all([
    fetch('/api/users').then((r) => r.json()),
    fetch('/api/posts').then((r) => r.json()),
  ])

  setStore('dashboard', (s) => {
    s.users = users
    s.posts = posts
    s.loading = false
  })
}`}</DocsCode>

      <DocsH2 id="optimistic">Optimistic Updates</DocsH2>
      <DocsParagraph>
        For instant UI feedback, update state optimistically and roll back on failure:
      </DocsParagraph>
      <DocsCode filename="optimistic.ts">{`import { createStore, setStore } from 'stroid'

createStore('todos', { todos: [] as Todo[] })

export async function toggleTodo(id: number) {
  let previousDone: boolean | null = null
  let newDone: boolean | null = null

  setStore('todos', (s) => {
    const todo = s.todos.find((t) => t.id === id)
    if (!todo) return
    previousDone = todo.done
    todo.done = !todo.done
    newDone = todo.done
  })

  if (newDone === null) return

  try {
    await fetch(\`/api/todos/\${id}\`, {
      method: 'PATCH',
      body: JSON.stringify({ done: newDone }),
    })
  } catch {
    setStore('todos', (s) => {
      const todo = s.todos.find((t) => t.id === id)
      if (todo && previousDone !== null) todo.done = previousDone
    })
  }
}`}</DocsCode>

    </article>
  )
}
