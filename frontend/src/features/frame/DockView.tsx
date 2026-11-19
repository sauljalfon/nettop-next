import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

/** The element the details tab's body is drawn into (Node on the tree, Port on an equipment page); null before the dock mounts. */
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
  onCloseDetails,
}: {
  planned: boolean
  /** The × on the details tab: the view clears its selection (and calls `hideDetails`). */
  onCloseDetails?: () => void
}) {
  const dock = useDock()
  const { setBody, setDetails } = useContext(SetSlotsContext)
  const tabs = tabsFor(dock, planned)
  const title = tabTitle(dock, dock.tab)
  const onDetails = dock.tab === 'details'
  const close = useCallback(() => {
    if (onDetails && onCloseDetails) onCloseDetails()
    else dockSession.close()
  }, [onDetails, onCloseDetails])

  useEffect(() => {
    if (!dock.open) return
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
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dock.open, close])

  return (
    <aside className="dock" aria-label={title} hidden={!dock.open}>
      <div className="dock-tabs">
        <div className="dock-tablist" role="tablist" aria-label="Dock">
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
        <div className="dock-body" ref={setDetails} hidden={!onDetails} />
      </div>
    </aside>
  )
}
