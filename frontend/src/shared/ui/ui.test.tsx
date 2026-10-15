import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Name from './Name'
import PlacePath from './PlacePath'
import Pieces from './Pieces'
import Chip from './Chip'
import NetworkBadge from '../../features/map/NetworkBadge'

const bdis = (html: string) =>
  [...html.matchAll(/<bdi[^>]*>(.*?)<\/bdi>/g)].map((m) => m[1])

describe('Name', () => {
  it('renders a bdi with the text and the title', () => {
    expect(renderToStaticMarkup(<Name text="פאנל ראשי 1" />)).toBe(
      '<bdi title="פאנל ראשי 1">פאנל ראשי 1</bdi>',
    )
  })
  it('passes the class name on', () => {
    expect(renderToStaticMarkup(<Name text="A" className="x" />)).toBe(
      '<bdi title="A" class="x">A</bdi>',
    )
  })
})

describe('PlacePath', () => {
  it('renders the parts in order as bdis, joined by aria-hidden separators', () => {
    const html = renderToStaticMarkup(
      <PlacePath parts={['Main Campus', 'מחסני קשר + מעבדה', 'Rack SM01']} />,
    )
    expect(bdis(html)).toEqual([
      'Main Campus',
      'מחסני קשר + מעבדה',
      'Rack SM01',
    ])
    expect(
      html.match(/<span class="place-sep" aria-hidden="true"> › <\/span>/g),
    ).toHaveLength(2)
    expect(html).toContain('class="place-path')
  })
  it('skips empty parts and renders nothing for no parts', () => {
    const html = renderToStaticMarkup(<PlacePath parts={['A', '', 'B']} />)
    expect(bdis(html)).toEqual(['A', 'B'])
    expect(html.match(/place-sep/g)).toHaveLength(1)
    expect(renderToStaticMarkup(<PlacePath parts={[]} />)).toBe('')
  })
})

describe('Pieces', () => {
  it('renders names as bdi and text as plain text', () => {
    const html = renderToStaticMarkup(
      <Pieces
        pieces={[{ text: 'Ends at ' }, { name: 'PANEL-A' }, { text: ' · 1.' }]}
      />,
    )
    expect(bdis(html)).toEqual(['PANEL-A'])
    expect(html.replace(/<[^>]+>/g, '')).toBe('Ends at PANEL-A · 1.')
  })
})

describe('Chip', () => {
  it('a network chip has a dot in the colour and the name, with no inline text colour', () => {
    const html = renderToStaticMarkup(
      <Chip kind="network" color="#2f6fdb">
        Network A
      </Chip>,
    )
    expect(html).toContain('class="chip network"')
    expect(html).toContain('<i class="dot" style="background:#2f6fdb"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('Network A')
    expect(html).not.toMatch(/style="[^"]*color:/)
  })
  it('a proposed chip has the proposed class, and className and title are passed on', () => {
    const html = renderToStaticMarkup(
      <Chip kind="proposed" className="muted" title="t">
        Proposed
      </Chip>,
    )
    expect(html).toContain('chip proposed muted')
    expect(html).toContain('title="t"')
    expect(html).not.toContain('class="dot"')
  })
  it('every kind sets its own class', () => {
    for (const kind of ['role', 'route', 'state'] as const)
      expect(renderToStaticMarkup(<Chip kind={kind}>x</Chip>)).toContain(
        `chip ${kind}`,
      )
  })
})

describe('NetworkBadge', () => {
  it('keeps the network-badge class, with the name in a bdi and a dot', () => {
    const html = renderToStaticMarkup(
      <NetworkBadge name="קליקנט" color="#9a4fc7" />,
    )
    expect(html).toContain('network-badge')
    expect(bdis(html)).toEqual(['קליקנט'])
    expect(html).toContain('class="dot"')
  })
})
