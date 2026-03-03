import { highlight } from "@/lib/highlight"
import { CodeTerminal } from "./code-terminal"

interface CodeBlockProps {
  code: string
  lang?: string
  filename?: string
  colorize?: boolean
}

export async function CodeBlock({ code, lang = "typescript", filename, colorize = true }: CodeBlockProps) {
  const html = colorize ? await highlight(code, lang) : undefined
  return <CodeTerminal code={code} filename={filename} html={html} />
}
