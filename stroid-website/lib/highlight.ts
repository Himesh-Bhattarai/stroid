import { codeToHtml } from "shiki"

const theme = "github-dark"

export async function highlight(code: string, lang: string = "typescript") {
  return codeToHtml(code, { lang, theme })
}
