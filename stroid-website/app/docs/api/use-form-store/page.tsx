import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsTable,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "useFormStore - API Reference - stroid Docs",
  description: "API reference for stroid's useFormStore hook.",
}

export default function UseFormStoreAPIPage() {
  return (
    <article>
      <DocsH1 className="font-mono">useFormStore</DocsH1>
      <DocsParagraph>
        A specialized React hook for form state management with built-in validation,
        dirty tracking, and async submission handling.
      </DocsParagraph>

      <DocsH2 id="signature">Signature</DocsH2>
      <DocsCode>{`function useFormStore<T extends Record<string, any>>(
  initialValues: T,
  options?: FormStoreOptions<T>
): FormStore<T>`}</DocsCode>

      <DocsH2 id="parameters">Parameters</DocsH2>
      <DocsTable
        headers={["Parameter", "Type", "Description"]}
        rows={[
          ["initialValues", "T", "Object with initial form field values."],
          ["options.validate", "Partial<Record<keyof T, (value) => string | null>>", "Per-field validation functions. Return null for valid, string for error message."],
          ["options.validateOn", "'blur' | 'change' | 'submit'", "When to run validation. Default: 'blur'."],
        ]}
      />

      <DocsH2 id="return-value">Return Value: FormStore{"<T>"}</DocsH2>
      <DocsTable
        headers={["Property / Method", "Type", "Description"]}
        rows={[
          ["values", "T", "Current form values."],
          ["field(name)", "(name: keyof T) => InputProps", "Returns { value, onChange, onBlur, name } for binding to inputs."],
          ["error(name)", "(name: keyof T) => string | null", "Returns the validation error for a field, or null."],
          ["errors", "Partial<Record<keyof T, string>>", "All current validation errors."],
          ["isValid", "boolean", "True when all fields pass validation."],
          ["isDirty(name?)", "(name?: keyof T) => boolean", "Whether a specific field (or any field) has been modified."],
          ["isSubmitting", "boolean", "True while an async submit handler is in progress."],
          ["handleSubmit(fn)", "(fn: (values: T) => void | Promise<void>) => FormEventHandler", "Returns a form onSubmit handler that validates and calls fn."],
          ["reset()", "() => void", "Reset all fields to initial values."],
          ["resetField(name)", "(name: keyof T) => void", "Reset a single field to its initial value."],
          ["setFieldValue(name, value)", "(name: keyof T, value: T[keyof T]) => void", "Programmatically set a field value."],
        ]}
      />

      <DocsH2 id="example">Complete Example</DocsH2>
      <DocsCode filename="ContactForm.tsx">{`import { useFormStore } from 'stroid'

function ContactForm() {
  const form = useFormStore({
    name: '',
    email: '',
    message: '',
  }, {
    validate: {
      name: (v) => v.trim().length < 2 ? 'Name is required' : null,
      email: (v) => !/^[^\\s@]+@[^\\s@]+$/.test(v) ? 'Invalid email' : null,
      message: (v) => v.trim().length < 10 ? 'Message too short' : null,
    },
    validateOn: 'blur',
  })

  const onSubmit = async (values: typeof form.values) => {
    await fetch('/api/contact', {
      method: 'POST',
      body: JSON.stringify(values),
    })
    form.reset()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <input {...form.field('name')} placeholder="Name" />
        {form.error('name') && <span>{form.error('name')}</span>}
      </div>
      
      <div>
        <input {...form.field('email')} placeholder="Email" />
        {form.error('email') && <span>{form.error('email')}</span>}
      </div>
      
      <div>
        <textarea {...form.field('message')} placeholder="Message" />
        {form.error('message') && <span>{form.error('message')}</span>}
      </div>
      
      <button type="submit" disabled={!form.isValid || form.isSubmitting}>
        {form.isSubmitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}`}</DocsCode>
    </article>
  )
}
