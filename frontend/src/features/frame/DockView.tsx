import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  TAB_SUBTITLES,
  dockSession,
  tabLabel,
  tabTitle,
  tabsFor,
  useDock,
  type DockTab,
} from './dock'
import './frame.css'

interface Slots {
  body: HTMLElement | null
  details: HTMLElement | null
}
const SlotsContext = createContext<Slots>({ body: null, details: null })
const SetSlotsContext = createContext<{
  setBody: (el: HTMLElement | null) => void
  setDetails: (el: HTMLElement | null) => void
}>({ setBody: () => {}, setDetails: () => {} })

/** The element the details tab's body is drawn into (Node on the tree); null before the dock mounts. */
export const DockDetailsSlot = createContext<HTMLElement | null>(null)

/** Holds the dock's two slot elements so the features can portal into them. Wrap the frame once. */
export function DockProvider({ children }: { children: ReactNode }) {
  const [body, setBody] = useState<HTMLElement | null>(null)
  const [details, setDetails] = useState<HTMLElement | null>(null)
  const slots = useMemo(() => ({ body, details }), [body, details])
  const setters = useMemo(() => ({ setBody, setDetails }), [])
  return (
    <SetSlotsContext.Provider value={setters}>
      <SlotsContext.Provider value={slots}>
        <DockDetailsSlot.Provider value={details}>
          {children}
        </DockDetailsSlot.Provider>
      </SlotsContext.Provider>
    </SetSlotsContext.Provider>
  )
}

/** Draws its children as the body of that tab, only while it is the open one. */
export function DockBody({
  tab,
  children,
}: {
  tab: DockTab
  children: ReactNode
}) {
  const dock = useDock()
  const { body } = useContext(SlotsContext)
  if (!dock.open || dock.tab !== tab || !body) return null
  const subtitle = TAB_SUBTITLES[tab]
  return createPortal(
    <>
      <div className="dock-head">
        <h2>{tabTitle(dock, tab)}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </>,
    body,
  )
}

const typing = (el: Element | null) =>
  !!el &&
  (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
    (el as HTMLElement).isContentEditable)

/**
 * The one dock: a tab row and a body that narrows the page beside it.
 * Always mounted (hidden while closed) so the details slot stays stable.
 */
export default function Dock({
  planned,
  suppressed = false,
}: {
  planned: boolean
  /** The Trace page has the whole window: the dock is kept (its slots stay) but not drawn. */
  suppressed?: boolean
}) {
  const dock = useDock()
  const { setBody, setDetails } = useContext(SetSlotsContext)
  const tabs = tabsFor(dock, planned)
  const title = tabTitle(dock, dock.tab)
  const onDetails = dock.tab === 'details'
  const list = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ before: false, after: false })
  // The row scrolls when its tabs do not fit: say which side has more, and keep the
  // selected tab fully inside (also when the details tab appears).
  useEffect(() => {
    const el = list.current
    if (!el) return
    const update = () =>
      setMore({
        before: el.scrollLeft > 1,
        after: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      })
    const selected = el.querySelector<HTMLElement>('[aria-selected="true"]')
    if (selected && el.clientWidth > 0) {
      if (selected.offsetLeft < el.scrollLeft)
        el.scrollLeft = selected.offsetLeft
      else if (
        selected.offsetLeft + selected.offsetWidth >
        el.scrollLeft + el.clientWidth
      )
        el.scrollLeft =
          selected.offsetLeft + selected.offsetWidth - el.clientWidth
    }
    update()
    el.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [dock.tab, dock.open, dock.details, planned])
  const close = useCallback(() => {
    // On the details tab the feature that shows it closes it (its selection clears, which hides the tab).
    if (onDetails) dockSession.closeDetails()
    else dockSession.close()
  }, [onDetails])

  useEffect(() => {
    if (!dock.open || suppressed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (typing(event.target as Element | null)) return
      // An inline confirm or form open in the dock takes the key first.
      if (
        document.querySelector(
          '.dock [role="dialog"], .dock [role="alertdialog"]',
        )
      )
        return
      // The view's own Esc handler (the tree's) must not clear it a second time.
      if (onDetails) event.preventDefault()
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dock.open, suppressed, close, onDetails])

  return (
    <aside
      className="dock"
      aria-label={title}
      hidden={!dock.open || suppressed}
    >
      <div className="dock-tabs">
        <div className="dock-tablist-wrap">
          <div
            className="dock-tablist"
            role="tablist"
            aria-label="Dock"
            ref={list}
            data-more-before={more.before}
            data-more-after={more.after}
          >
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                className="tab"
                aria-selected={dock.tab === tab}
                onClick={() => dockSession.open(tab)}
              >
                {tabLabel(dock, tab)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="x"
          aria-label={`Close ${title}`}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div className="dock-bodies">
        <div className="dock-body" ref={setBody} hidden={onDetails} />
        <div
          className="dock-body dock-details"
          ref={setDetails}
          hidden={!onDetails}
        />
      </div>
    </aside>
  )
}
