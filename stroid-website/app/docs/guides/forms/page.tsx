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
  title: "Forms with useFormStore - Guides - stroid Docs",
  description: "Bind inputs to stroid stores with useFormStore.",
}

export default function FormsGuidePage() {
  return (
    <article>
      <DocsH1>Forms with useFormStore</DocsH1>
      <DocsParagraph>
        <DocsInlineCode>useFormStore(name, path)</DocsInlineCode> gives you controlled input bindings
        backed by a stroid store. It keeps form state in the same store system as the rest of your app.
      </DocsParagraph>

      <DocsH2 id="basic-form">Basic form</DocsH2>
      <DocsCode filename="signup.tsx">{`import { createStore } from 'stroid'
import { useFormStore } from 'stroid/react'

// Declare once
createStore('signup', { name: '', email: '', password: '' })

export function SignupForm() {
  const name = useFormStore('signup', 'name')
  const email = useFormStore('signup', 'email')
  const password = useFormStore('signup', 'password')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // read current values with getStore('signup')
  }

  return (
    <form onSubmit={onSubmit}>
      <input placeholder="Name" {...name} />
      <input placeholder="Email" type="email" {...email} />
      <input placeholder="Password" type="password" {...password} />
      <button type="submit">Sign Up</button>
    </form>
  )
}`}</DocsCode>

      <DocsParagraph>
        Each call returns <DocsInlineCode>{`{ value, onChange }`}</DocsInlineCode>. Wire it to any
        input element. Values persist in the named store like any other state.
      </DocsParagraph>

      <DocsH2 id="validation">Inline validation</DocsH2>
      <DocsCode filename="profile.tsx">{`import { createStore, setStore, getStore } from 'stroid'
import { useFormStore } from 'stroid/react'

createStore('profile', { email: '', age: 0, errors: {} as Record<string, string> })

export function ProfileForm() {
  const email = useFormStore('profile', 'email')
  const age = useFormStore('profile', 'age')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const state = getStore('profile')
    const errors: Record<string, string> = {}
    if (!state.email.includes('@')) errors.email = 'Enter a valid email'
    if (state.age < 18) errors.age = 'Must be 18+'
    setStore('profile', { errors })
  }

  return (
    <form onSubmit={onSubmit}>
      <input {...email} />
      <input type="number" {...age} />
      {/* render errors from getStore('profile').errors */}
      <button type="submit">Save</button>
    </form>
  )
}`}</DocsCode>

      <DocsCallout type="tip">
        Because form state lives in a normal store, you can reuse the same selectors, persistence,
        and sync options as any other state slice.
      </DocsCallout>


    </article>
  )
}
