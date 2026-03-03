export const createStoreExample = `import { createStore, setStore, useStore } from 'stroid'

// 1) Declare a named store once at module scope
createStore('users', {
  list: [] as { id: string; name: string }[],
})

// 2) Update it anywhere (mutable draft; immutable under the hood)
export function addUser(user: { id: string; name: string }) {
  setStore('users', (draft) => {
    draft.list.push(user)
  })
}

// 3) Read inside React components
export function UsersBadge() {
  const count = useStore('users', (s) => s.list.length)
  return <span>{count} users</span>
}`

export const useStoreExample = `import { useStore, setStore } from 'stroid'

function TodoList() {
  const todos = useStore('todos', (s) => s.items)

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          <input
            type=\"checkbox\"
            checked={todo.done}
            onChange={() =>
              setStore('todos', (draft) => {
                const t = draft.items.find((x) => x.id === todo.id)
                if (t) t.done = !t.done
              })
            }
          />
          {todo.text}
        </li>
      ))}
    </ul>
  )
}`

export const persistenceExample = `import { createStore } from 'stroid'

createStore(
  'counter',
  { count: 0 },
  {
    persist: {
      key: 'counter',
      driver: localStorage,
    },
    sync: true, // cross-tab sync
  }
)`

export const formStoreExample = `import { createStore, setStore, useStore } from 'stroid'

createStore('form', { email: '', password: '', errors: {} as Record<string, string> })

export function SubmitButton() {
  const email = useStore('form', (s) => s.email)
  return <button disabled={!email}>Submit</button>
}

export function saveEmail(value: string) {
  setStore('form', (draft) => {
    draft.email = value
  })
}`

export const asyncExample = `import { createStore, setStore } from 'stroid'

createStore('user', { data: null as User | null, loading: false, error: null as string | null })

export async function fetchUser(id: string) {
  setStore('user', (d) => {
    d.loading = true
    d.error = null
  })
  try {
    const res = await fetch('/api/user/' + id)
    const data = await res.json()
    setStore('user', (d) => {
      d.data = data
    })
  } catch (err: any) {
    setStore('user', (d) => {
      d.error = err?.message ?? 'Request failed'
    })
  } finally {
    setStore('user', (d) => {
      d.loading = false
    })
  }
}`
