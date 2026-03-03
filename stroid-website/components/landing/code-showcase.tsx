import { highlight } from "@/lib/highlight"
import { CodeShowcaseClient, ShowcaseTab } from "./CodeShowcaseClient"

const tabs = [
  {
    id: "basic",
    label: "Basic Store",
    filename: "store.ts",
    code: `import { createStore, setStore, useStore } from 'stroid'

createStore('todos', { items: [] as Todo[], filter: 'all' as 'all' | 'active' | 'done' })

export function addTodo(text: string) {
  setStore('todos', (s) => {
    s.items.push({ id: Date.now(), text, done: false })
  })
}

export function useVisibleTodos() {
  return useStore('todos', (s) =>
    s.filter === 'all' ? s.items : s.items.filter((t) => (s.filter === 'done' ? t.done : !t.done))
  )
}
`,
    lang: 'typescript',
  },
  {
    id: "async",
    label: "Async Actions",
    filename: "async-store.ts",
    code: `import { createStore, setStore, useStore } from 'stroid'

createStore('user', { user: null as User | null, status: 'idle' as Status, error: null as string | null })

export async function fetchUser(id: string) {
  setStore('user', (s) => { s.status = 'loading'; s.error = null })
  try {
    const res = await fetch('/api/users/' + id)
    const data = await res.json()
    setStore('user', (s) => { s.user = data; s.status = 'success' })
  } catch (err) {
    setStore('user', (s) => { s.error = err instanceof Error ? err.message : 'Error'; s.status = 'error' })
  }
}

export function useUserState() {
  return useStore('user', (s) => ({ status: s.status, error: s.error, user: s.user }))
}
`,
    lang: 'typescript',
  },
  {
    id: "persist",
    label: "Persistence",
    filename: "persist-store.ts",
    code: `import { createStore, setStore } from 'stroid'

createStore('settings', { theme: 'dark' as 'light' | 'dark', locale: 'en', notifications: true }, {
  persist: { key: 'app-settings', driver: localStorage },
  sync: true,
})

export const toggleNotifications = () => setStore('settings', (s) => { s.notifications = !s.notifications })
`,
    lang: 'typescript',
  },
  {
    id: "form",
    label: "Form Store",
    filename: "form-store.ts",
    code: `import { createStore } from 'stroid'
import { useFormStore } from 'stroid/react'

createStore('signup', { name: '', email: '', password: '' })

export function SignupForm() {
  const name = useFormStore('signup', 'name')
  const email = useFormStore('signup', 'email')
  const password = useFormStore('signup', 'password')

  return (
    <form>
      <input {...name} />
      <input type='email' {...email} />
      <input type='password' {...password} />
    </form>
  )
}
`,
    lang: 'typescript',
  },
] as const

export async function CodeShowcase() {
  const highlighted: ShowcaseTab[] = await Promise.all(
    tabs.map(async (tab) => ({
      ...tab,
      html: await highlight(tab.code, tab.lang),
    }))
  )

  return <CodeShowcaseClient tabs={highlighted} />
}
