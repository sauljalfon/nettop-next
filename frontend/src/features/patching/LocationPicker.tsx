import { useState } from 'react'
import {
  chooseNode,
  chooseSite,
  eligibleIn,
  findRack,
  follow,
  racksOf,
  startPlace,
  type Near,
  type Place,
  type PickRules,
  type SiteBranch,
} from './patching'
import Field from '../../shared/ui/Field'
import { optionText } from '../../shared/textPieces'
import './location-picker.css'

type Props = {
  tree: readonly SiteBranch[]
  /** The group's accessible name. */
  label?: string
  /** A rack in rack mode, an equipment otherwise; never offered. */
  exclude?: string
  disabled?: boolean
  /** Rack mode: where to start when there is no rack, instead of the first site. */
  near?: Near
} & (
  | {
      level?: 'equipment'
      equipmentId?: string
      freeOf: (equipmentId: string) => number
      onChange: (equipmentId: string) => void
    }
  | {
      level: 'rack'
      rackId?: string
      onChange: (rackId: string) => void
    }
)

/**
 * A place chosen as Site › Node › Rack (rack mode, the forms) or Site › Node ›
 * Rack › Equipment (the patching far end), so a large network never becomes
 * one long list. Where it starts (in rack mode with no rack: `near`) and what
 * a Site or Node change selects are the pure `startPlace`, `chooseSite` and
 * `chooseNode` in patching.ts.
 */
export default function LocationPicker(props: Props) {
  const { tree, disabled } = props
  const rules: PickRules = {
    level: props.level ?? 'equipment',
    exclude: props.exclude,
  }
  const value = props.level === 'rack' ? props.rackId : props.equipmentId
  const [choice, setChoice] = useState(() =>
    startPlace(tree, value, rules, props.near),
  )
  // Follow a value set elsewhere (a recent target, Undo, a new drop).
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setChoice(follow(tree, choice, value, rules, props.near))
  }
  const site = tree.find((s) => s.id === choice.siteId) ?? tree[0]
  const node = site?.nodes.find((n) => n.id === choice.nodeId) ?? site?.nodes[0]
  const racks = racksOf(node, rules)
  const rack =
    racks.find((r) => r.id === choice.rackId) ??
    (rules.level === 'rack' ? undefined : racks[0])
  const inRack = eligibleIn(rack, rules)

  /** Moves to `next` and reports it: the rack, or its first equipment when it has one. */
  const go = (next: Place) => {
    setChoice(next)
    if (props.level === 'rack') return props.onChange(next.rackId)
    const first = eligibleIn(findRack(tree, next), rules)[0]
    if (first) props.onChange(first.id)
  }

  return (
    <div
      className="location-picker"
      role="group"
      aria-label={props.label ?? 'Far end'}
      data-level={rules.level}
    >
      <span className="place-label">{props.label ?? 'Far end'}</span>
      <div className="place-row">
        <Field label="Site">
          {(fieldId) => (
            <select
              id={fieldId}
              aria-label="Site"
              value={site?.id ?? ''}
              disabled={disabled || tree.length === 0}
              onChange={(e) => go(chooseSite(tree, e.target.value, rules))}
            >
              {tree.length === 0 && <option value="">No sites yet</option>}
              {tree.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Node">
          {(fieldId) => (
            <select
              id={fieldId}
              aria-label="Node"
              value={node?.id ?? ''}
              disabled={disabled || !site?.nodes.length}
              onChange={(e) =>
                go(chooseNode(tree, site?.id ?? '', e.target.value, rules))
              }
            >
              {!site?.nodes.length && <option value="">No nodes here</option>}
              {site?.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Rack">
          {(fieldId) => (
            <select
              id={fieldId}
              aria-label="Rack"
              value={rack?.id ?? ''}
              disabled={disabled || racks.length === 0}
              onChange={(e) =>
                go({
                  siteId: site?.id ?? '',
                  nodeId: node?.id ?? '',
                  rackId: e.target.value,
                })
              }
            >
              {racks.length === 0 && <option value="">No racks here</option>}
              {racks.length > 0 && !rack && (
                <option value="" disabled>
                  Choose…
                </option>
              )}
              {racks.map((r) => (
                <option key={r.id} value={r.id}>
                  {optionText([
                    { name: r.name },
                    {
                      text:
                        rules.level === 'rack'
                          ? ` · ${r.units}U`
                          : ` (${eligibleIn(r, rules).length})`,
                    },
                  ])}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {props.level !== 'rack' && (
        <Field label="Equipment">
          {(fieldId) => (
            <select
              id={fieldId}
              aria-label="Equipment"
              value={inRack.some((e) => e.id === value) ? value : ''}
              disabled={disabled || inRack.length === 0}
              onChange={(e) => props.onChange(e.target.value)}
            >
              {inRack.length === 0 && (
                <option value="">No equipment here</option>
              )}
              {inRack.length > 0 && !inRack.some((e) => e.id === value) && (
                <option value="" disabled>
                  Choose…
                </option>
              )}
              {inRack.map((e) => (
                <option key={e.id} value={e.id}>
                  {optionText([
                    { name: e.name },
                    { text: ` · ${props.freeOf(e.id)} free` },
                  ])}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
    </div>
  )
}
