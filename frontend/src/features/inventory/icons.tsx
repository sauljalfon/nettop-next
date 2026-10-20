import type { ReactNode } from 'react'

const line = (d: ReactNode, size = 16) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d}
  </svg>
)

const ICONS = {
  switch: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="1.5" />
      <path d="M6 11v2M9.5 11v2M13 11v2M16.5 11v2" />
    </>
  ),
  panel: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="1.5" />
      <circle cx="7" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="17" cy="12" r="1.2" />
    </>
  ),
  hdf: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  rack: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M5 9h14M5 15h14M8.5 6h.01M8.5 12h.01M8.5 18h.01" />
    </>
  ),
  problem: (
    <>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  port: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M8 10h8v5H8zM10 15v-2M14 15v-2" />
    </>
  ),
  cable: (
    <>
      <path d="M4 18c5 0 5-12 10-12s3 7 6 7" />
      <circle cx="4" cy="18" r="1.6" />
      <circle cx="20" cy="13" r="1.6" />
    </>
  ),
}

export type TypeIconKind = keyof typeof ICONS

/** The type icon of a row or a list: switch, panel, HDF, port, cable or rack. */
export const TypeIcon = ({ kind }: { kind: TypeIconKind }) => line(ICONS[kind])

const status = (inner: ReactNode) => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16">
    {inner}
  </svg>
)
const ring = (
  <circle
    cx="8"
    cy="8"
    r="6.3"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  />
)
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }

const SHAPES: Record<string, ReactNode> = {
  ok: status(
    <>
      {ring}
      <path d="M5.2 8.2 7.2 10.1 10.9 6.3" {...stroke} />
    </>,
  ),
  off: status(
    <>
      {ring}
      <path d="M5 8h6" {...stroke} />
    </>,
  ),
  hold: status(
    <>
      {ring}
      <path d="M8 4.5V8l2.4 1.6" {...stroke} strokeLinecap="round" />
    </>,
  ),
  warn: status(
    <>
      <path
        d="M8 1.8 14.6 13.8H1.4Z"
        {...stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path d="M8 6.3v3.4M8 11.6v.1" {...stroke} strokeLinecap="round" />
    </>,
  ),
  bad: status(
    <>
      <circle cx="8" cy="8" r="6.6" fill="currentColor" />
      <path
        d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="1.6"
      />
    </>,
  ),
}

const SHAPE_OF: Record<string, keyof typeof SHAPES> = {
  active: 'ok',
  available: 'ok',
  inactive: 'off',
  disabled: 'off',
  maintenance: 'hold',
  reserved: 'hold',
  testing: 'warn',
  faulty: 'bad',
}

/** A status shape: the word is always written beside it. */
export const StatusIcon = ({ status: word }: { status: string }) =>
  SHAPES[SHAPE_OF[word] ?? 'off']
