# Legacy NetTop references

Legacy code is useful for physical UI behavior, HDF interpretation, edge cases, and eventual data migration. It is not the target architecture and should not overwrite the new endpoint/network/plan contract.

The original environment has sibling projects `Net-Top-1` and `net-top-next`. Paths below are relative to the legacy repository. If legacy is not available, the approved behavior is still documented in this directory; do not make implementation depend on accessing an external working tree.

## Physical navigation worth preserving

| Legacy path | Useful behavior |
| --- | --- |
| `frontend/src/components/topology/NetworkTopology.jsx` | Searchable visual site overview; site expansion and node access |
| `frontend/src/components/topology/SiteDiagram.jsx` | Site-focused navigator with owned physical nodes and rack actions |
| `frontend/src/components/topology/RackModal.jsx` | Rack selection within a node; inventory counts; entry to layout |
| `frontend/src/components/detail/NodeDetail.jsx` | Node-owned rack cards and selected rack detail |
| `frontend/src/components/topology/RackVisualization.jsx` | Rack units, equipment height, selection, port inspection |
| `frontend/src/components/ports/PortsPanel.jsx` | Device/panel banks, HDF row/column blocks, side-aware occupancy/detail |
| `frontend/src/components/ports/PortsPanel.css` | Four-column HDF presentation |

Retain progressive detail and recognizable ownership. Improve the legacy mix of expansion, node details, drawers, and stacked rack modals with a consistent workspace/breadcrumb flow. No canvas circle/radial layout implies real room coordinates. Preserve selected route context across views.

## HDF references

| Legacy path | What it proves |
| --- | --- |
| `backend/routes/hdf_panels.py` | Four A–D columns, variable rows, one subpanel per row/column block, six logical positions, front/rear endpoint creation |
| `backend/tests/test_hdf_consistency.py` | Block naming/local numbering/capacity, doubled side endpoints, and display-label edge cases |
| `backend/tests/test_local_port_numbering.py` | Local subpanel numbering expectations |
| `backend/tests/test_panel_front_rear_ports.py` | Side-aware endpoint behavior |
| `backend/tests/test_pathfinding_panel_sides.py` | Passive panel-side traversal cases |
| `frontend/src/components/infrastructure/panels/CreateHDFPanel.jsx` | User-controlled rows, rack choice, validation, and preview |
| `frontend/src/utils/portDisplay.js` | Human-readable display handling; do not use those strings for new graph identity |
| `backend/src/models.py` | Actual legacy owner/side relationships and display properties |

The inspected creator uses local port numbers 1–6 within each block and creates a front and rear record for each position. It also carries a global panel-position counter. Older imports/templates/renderers may use different display/name conventions or column-style grouping. Do not flatten or reinterpret them solely by a label regex.

New HDFs need structured row/column/subpanel/local-position fields and stable references. Import needs an explicit validated mapping from legacy record IDs, owner/subpanel IDs, side metadata, and position numbering. Retain actual cable endpoint references. Presentation labels such as `[3-C] 5`, `3C`, or `9,10` are not enough to invent graph adjacency.

The legacy creator's row bounds and estimated rack-unit formula are reference behavior, not settled new-production limits or accurate physical dimensions. Confirm row limits and accept actual configured rack height independently.

## Pathfinding references

`backend/src/pathfinding/` and its tests contain useful direct continuity and panel-side cases. Legacy equipment-transit exploration and role/name heuristics are not approval to add active transit to the new engine.

The user finalized the new rule: normally traverse passive panels, accept both explicit AGG and BB destination roles, return both kinds when reachable, and stop at active endpoints. No automatic jump through AGG sibling ports to BB.

## Legacy scope discipline

Legacy may contain user changes unrelated to this project. Inspect before any import/reference operation; do not alter, stage, commit, or delete them as part of the new implementation. The original whiteboard studies created during this design round were retired. Older project-owned design material is not automatically new-project scope.

Importing production data, port-state cleanup, repairing side metadata, and carrying every legacy admin/template/sync feature forward require their own explicit scope. Use the new acceptance example for development until data policy is confirmed.
