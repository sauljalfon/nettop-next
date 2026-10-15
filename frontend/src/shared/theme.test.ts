import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Visual-pass rule test (D33): colours, fonts and sizes live in theme.css only.
// Each task of the visual pass converts CSS files and removes them from this list;
// the list can only shrink, and the item is done when it is empty.
const ALLOWLIST: string[] = []

const SRC = join(process.cwd(), 'src')
const THEME = 'src/shared/theme.css'

// The plan's token table, plus fonts, type scale, radii and control heights.
const TOKENS: Record<string, string> = {
  '--floor': '#eef1f3',
  '--paper': '#ffffff',
  '--paper-sunk': '#f6f8f9',
  '--ink': '#1c2b3a',
  '--ink-soft': '#56636f',
  '--rule': '#d3dae1',
  '--rule-soft': '#e6ebef',
  '--steel': '#1f2731',
  '--steel-2': '#2a3440',
  '--steel-3': '#3a4552',
  '--tape': '#fbfbf8',
  '--tape-ink': '#15202b',
  '--jack-free': '#ffffff',
  '--route': '#0f8b7a',
  '--route-soft': '#e2f3f0',
  '--amber': '#d99a0b',
  '--amber-soft': '#fdf3dc',
  '--proposed': '#8a6100',
  '--proposed-soft': '#fff6dd',
  '--danger': '#b4361f',
  '--unresolved': '#9bacc0',
  '--sans':
    '"IBM Plex Sans", "IBM Plex Sans Hebrew", "Segoe UI", Arial, sans-serif',
  '--mono': '"IBM Plex Mono", Consolas, ui-monospace, monospace',
  '--t-xs': '12px',
  '--t-sm': '13px',
  '--t-md': '14px',
  '--t-lg': '16px',
  '--t-xl': '20px',
  '--t-2xl': '26px',
  '--r-drawer': '10px',
  '--r-control': '6px',
  '--r-hw': '2px',
  '--h-control': '32px',
  '--h-control-lg': '36px',
  '--h-input': '34px',
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return name.endsWith('.css') ? [p] : []
  })
}

// Blank out comments but keep line numbers.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

// Lines inside `/* fixed-colors: paper output */ … /* end fixed-colors */`.
function exemptLines(text: string): Set<number> {
  const exempt = new Set<number>()
  let inside = false
  text.split('\n').forEach((line, i) => {
    if (line.includes('/* end fixed-colors */')) inside = false
    if (inside) exempt.add(i)
    if (line.includes('/* fixed-colors: paper output */')) inside = true
  })
  return exempt
}

type Violation = { line: number; rule: string }

const COLOR =
  /(^|[^\w&-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|\b(?:rgba?|hsla?)\(/
const FONT_SIZE = /font-size\s*:\s*([\d.]+)(px|rem|em)\b/g

function check(
  text: string,
  rules: { colors: boolean; sizes: boolean; caps: boolean },
): Violation[] {
  const exempt = exemptLines(text)
  const out: Violation[] = []
  stripComments(text)
    .split('\n')
    .forEach((line, i) => {
      if (exempt.has(i)) return
      if (rules.colors && COLOR.test(line)) {
        out.push({
          line: i + 1,
          rule: 'colour outside theme.css (use a var(--…) token)',
        })
      }
      if (rules.sizes) {
        for (const m of line.matchAll(FONT_SIZE)) {
          const px = Number(m[1]) * (m[2] === 'px' ? 1 : 16)
          if (px < 11)
            out.push({
              line: i + 1,
              rule: `font-size ${m[1]}${m[2]} is below 11px`,
            })
        }
      }
      if (rules.caps && /text-transform\s*:\s*uppercase/.test(line)) {
        out.push({ line: i + 1, rule: 'text-transform: uppercase' })
      }
    })
  return out
}

const all = cssFiles(SRC).map((p) => ({
  rel: relative(process.cwd(), p).split('\\').join('/'),
  path: p,
}))

describe('theme.css', () => {
  const themePath = join(process.cwd(), THEME)

  it('exists', () => {
    expect(existsSync(themePath), `${THEME} is missing`).toBe(true)
  })

  it('has no size or case violations', () => {
    if (!existsSync(themePath)) return expect.fail(`${THEME} is missing`)
    const v = check(readFileSync(themePath, 'utf8'), {
      colors: false,
      sizes: true,
      caps: true,
    })
    expect(v.map((x) => `${THEME}:${x.line} ${x.rule}`)).toEqual([])
  })

  it('defines every token with the plan value', () => {
    if (!existsSync(themePath)) return expect.fail(`${THEME} is missing`)
    const css = stripComments(readFileSync(themePath, 'utf8'))
    const found: Record<string, string> = {}
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      found[m[1]] = m[2]
        .trim()
        .replace(/'/g, '"')
        .replace(/\s+/g, ' ')
        .toLowerCase()
    }
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(found[name], `${name} in ${THEME}`).toBe(
        value.replace(/\s+/g, ' ').toLowerCase(),
      )
    }
  })
})

describe('CSS rules (D33)', () => {
  it('lists only CSS files that exist', () => {
    const rels = new Set(all.map((f) => f.rel))
    for (const a of ALLOWLIST)
      expect(rels.has(a), `${a} is allowlisted but missing`).toBe(true)
  })

  for (const f of all.filter((f) => f.rel !== THEME)) {
    const allowed = ALLOWLIST.includes(f.rel)
    it(`${f.rel}${allowed ? ' (allowlisted)' : ''}`, () => {
      const v = check(readFileSync(f.path, 'utf8'), {
        colors: true,
        sizes: true,
        caps: true,
      })
      if (allowed) {
        expect(
          v.length,
          `${f.rel} already passes all rules: remove it from the allowlist`,
        ).toBeGreaterThan(0)
      } else {
        expect(v.map((x) => `${f.rel}:${x.line} ${x.rule}`)).toEqual([])
      }
    })
  }
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return /\.(css|tsx)$/.test(name) ? [p] : []
  })
}
const sources = sourceFiles(SRC).map((p) => ({
  rel: relative(process.cwd(), p).split('\\').join('/'),
  text: readFileSync(p, 'utf8'),
}))

describe('legacy names are gone (D33)', () => {
  it('no file uses --purple, --line, --muted or --green, and none defines them', () => {
    const ALIAS = /--(?:purple|line|muted|green)(?![\w-])/
    const found = sources.flatMap((f) =>
      f.text
        .split('\n')
        .map((line, i) => (ALIAS.test(line) ? `${f.rel}:${i + 1}` : ''))
        .filter(Boolean),
    )
    expect(found).toEqual([])
  })

  it('no TSX class is `button` or `outline-button`, and no CSS defines them', () => {
    const LEGACY = new Set(['button', 'outline-button'])
    const tsx = sources
      .filter((f) => f.rel.endsWith('.tsx'))
      .flatMap((f) => {
        const hits: string[] = []
        for (const m of f.text.matchAll(
          /className=(?:"([^"]*)"|\{([^}]*)\})/g,
        )) {
          const literals =
            m[1] !== undefined
              ? [m[1]]
              : [...m[2].matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map((x) => x[2])
          for (const text of literals)
            for (const word of text.split(/\s+/))
              if (LEGACY.has(word)) hits.push(`${f.rel}: ${m[0].slice(0, 60)}`)
        }
        return hits
      })
    const css = sources
      .filter((f) => f.rel.endsWith('.css'))
      .flatMap((f) =>
        stripComments(f.text)
          .split('\n')
          .map((line, i) =>
            /\.(?:outline-)?button(?![\w-])/.test(line)
              ? `${f.rel}:${i + 1}`
              : '',
          )
          .filter(Boolean),
      )
    expect([...tsx, ...css]).toEqual([])
  })
})
