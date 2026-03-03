import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "@/components/code-block"
import {
  DocsH1,
  DocsH2,
  DocsH3,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsCallout,
} from "@/components/docs/docs-content"
import { createStoreExample } from "@/lib/code-examples"

export const metadata = {
  title: "Quick Start - stroid Docs",
  description: "Install stroid and create your first store in under 2 minutes.",
}

export default function QuickStartPage() {
  return (
    <article>
      <DocsH1>Quick Start</DocsH1>
      <DocsParagraph>
        Go from zero to a working stroid store in under 2 minutes. Stroid uses named stores:
        declare once with <DocsInlineCode>createStore(name, initialState, options?)</DocsInlineCode>,
        then read with <DocsInlineCode>useStore</DocsInlineCode> and update with
        <DocsInlineCode>setStore</DocsInlineCode>.
      </DocsParagraph>

      <CodeBlock
        code={createStoreExample}
        filename="stores/user-store.ts"
        lang="typescript"
      />

      <DocsH2 id="installation">1. Installation</DocsH2>
      <DocsParagraph>
        Install stroid with your package manager of choice:
      </DocsParagraph>
      <DocsCode filename="Terminal">{`npm install stroid
# or
yarn add stroid
# or
pnpm add stroid`}</DocsCode>

      <DocsH2 id="create-store">2. Create a Store</DocsH2>
      <DocsParagraph>
        Declare a store once at module scope. The first argument is the store name (string); the
        second is your initial state object. Do not place actions in the state — mutations happen
        through <DocsInlineCode>setStore</DocsInlineCode>.
      </DocsParagraph>
      <DocsCode filename="stores/todo-store.ts">{`import { createStore } from 'stroid'

type Todo = { id: number; text: string; done: boolean }

createStore('todos', {
  items: [] as Todo[],
})`}</DocsCode>

      <DocsH2 id="use-in-component">3. Use in a Component</DocsH2>
      <DocsParagraph>
        Read with <DocsInlineCode>useStore(name, selector?)</DocsInlineCode>. Update anywhere with
        <DocsInlineCode>setStore(name, draftFn)</DocsInlineCode>. Selectors keep re-renders
        minimal.
      </DocsParagraph>
      <DocsCode filename="components/TodoList.tsx">{`import { useStore, setStore } from 'stroid'

function TodoList() {
  const todos = useStore('todos', (s) => s.items)

  const toggle = (id: number) => {
    setStore('todos', (d) => {
      const todo = d.items.find((t) => t.id === id)
      if (todo) todo.done = !todo.done
    })
  }

  const remove = (id: number) => {
    setStore('todos', (d) => {
      d.items = d.items.filter((t) => t.id !== id)
    })
  }

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} />
          <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.text}</span>
          <button onClick={() => remove(todo.id)}>Delete</button>
        </li>
      ))}
    </ul>
  )
}`}</DocsCode>

      <DocsH2 id="add-persistence">4. Add Persistence (Optional)</DocsH2>
      <DocsParagraph>
        Pass options as the third argument to <DocsInlineCode>createStore</DocsInlineCode>.
      </DocsParagraph>
      <DocsCode filename="stores/todo-store.ts">{`createStore(
  'todos',
  { items: [] as Todo[] },
  {
    persist: { key: 'my-todos', driver: localStorage },
    sync: true, // cross-tab
  }
)`}</DocsCode>

      <DocsCallout type="tip">
        That's it — no providers, reducers, or action types. Named stores keep the API tiny while
        still supporting persistence, sync, and DevTools.
      </DocsCallout>

      <DocsH2 id="next-steps">Next Steps</DocsH2>
      <DocsParagraph>
        You now have a working stroid store. Continue learning:
      </DocsParagraph>

      <ul className="mt-4 flex flex-col gap-2 pl-6 text-muted-foreground">
        <li className="list-disc text-sm">
          <Link href="/docs/core-concepts/create-store" className="text-primary underline underline-offset-2">
            createStore deep dive
          </Link>{" "}
          — initialization patterns, computed values, and middleware
        </li>
        <li className="list-disc text-sm">
          <Link href="/docs/core-concepts/use-store" className="text-primary underline underline-offset-2">
            useStore & Selectors
          </Link>{" "}
          — prevent unnecessary re-renders with precise subscriptions
        </li>
        <li className="list-disc text-sm">
          <Link href="/docs/guides/async" className="text-primary underline underline-offset-2">
            Async State
          </Link>{" "}
          — model loading, success, and error states cleanly
        </li>
        <li className="list-disc text-sm">
          <Link href="/docs/guides/typescript" className="text-primary underline underline-offset-2">
            TypeScript Guide
          </Link>{" "}
          — advanced typing patterns and best practices
        </li>
      </ul>
    </article>
  )
}
