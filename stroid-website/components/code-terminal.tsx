'use client'

import { Copy, Check } from 'lucide-react'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useTerminalCopy } from '@/app/sidebar-context'

type CodeTokenType =
  | 'keyword'
  | 'string'
  | 'function'
  | 'property'
  | 'number'
  | 'comment'
  | 'bracket'
  | 'operator'
  | 'text'

interface CodeToken {
  type: CodeTokenType
  value: string
}

const colorMap: Record<CodeTokenType, string> = {
  keyword: 'text-blue-300 font-semibold',
  string: 'text-emerald-300 font-medium',
  function: 'text-yellow-200 font-semibold',
  property: 'text-cyan-200',
  number: 'text-orange-300 font-semibold',
  comment: 'text-slate-400 italic',
  bracket: 'text-pink-400 font-bold',
  operator: 'text-rose-300 font-medium',
  text: 'text-slate-300',
}

interface CodeTerminalProps {
  code: string
  html?: string
  language?: string
  filename?: string
}

export function CodeTerminal({ code, html, language = 'typescript', filename }: CodeTerminalProps) {
  const { copied, setCopied } = useTerminalCopy()

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tokenize = (input: string): CodeToken[] => {
    const keywords = /\b(const|let|var|function|return|if|else|for|while|class|interface|type|async|await|import|export|from|default|as|new|this|super|extends|implements|public|private|protected|static|readonly|abstract|yield|switch|case|break|continue|throw|try|catch|finally|delete|instanceof|typeof|in|of)\b/g
    const strings = /(['"`])(?:(?=(\\?))\2.)*?\1/g
    const functions = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g
    const numbers = /\b(\d+\.?\d*)\b/g
    const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm
    const brackets = /[{}[\]()]/g

    const matches: { start: number; end: number; type: CodeTokenType }[] = []
    const collect = (regex: RegExp, type: CodeTokenType) => {
      let m
      while ((m = regex.exec(input)) !== null) matches.push({ start: m.index, end: m.index + m[0].length, type })
    }
    collect(comments, 'comment')
    collect(strings, 'string')
    collect(keywords, 'keyword')
    collect(functions, 'function')
    collect(numbers, 'number')
    collect(brackets, 'bracket')
    matches.sort((a, b) => a.start - b.start)

    const tokens: CodeToken[] = []
    let cursor = 0
    for (const m of matches) {
      if (m.start < cursor) continue
      if (m.start > cursor) tokens.push({ type: 'text', value: input.slice(cursor, m.start) })
      tokens.push({ type: m.type, value: input.slice(m.start, m.end) })
      cursor = m.end
    }
    if (cursor < input.length) tokens.push({ type: 'text', value: input.slice(cursor) })
    return tokens
  }

  const tokenized = useMemo(() => tokenize(code), [code])

  return (
    <div className="mt-6 w-full max-w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-500/60" />
            <div className="size-2.5 rounded-full bg-yellow-500/60" />
            <div className="size-2.5 rounded-full bg-green-500/60" />
          </div>
          {filename && (
            <span className="font-[family-name:var(--font-mono)] text-xs font-semibold text-foreground/80">
              {filename}
            </span>
          )}
        </div>

        <button
          onClick={copyToClipboard}
          className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-4 text-green-400" /> : <Copy className="size-4" />}
        </button>
      </div>

      {/* Code */}
      <div className="w-full overflow-x-auto p-6">
        {html ? (
          <div
            className="shiki font-[family-name:var(--font-mono)] text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-[family-name:var(--font-mono)] text-sm leading-relaxed text-foreground">
            {tokenized.map((token, idx) => (
              <span key={idx} className={cn(colorMap[token.type])}>
                {token.value}
              </span>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}
