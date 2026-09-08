import { contentEqual } from "../../shared/locations.js";

// Three-way merge: only genuinely conflicting records need a manager's choice.
export function mergeDraft(base, mine, published) {
  const maps = [base, mine, published].map(rows => new Map(rows.map(row => [row.id, row])));
  const ids = new Set([...maps[2].keys(), ...maps[1].keys(), ...maps[0].keys()]);
  const merged = [], conflicts = [];
  for (const id of ids) {
    const [before, draft, latest] = maps.map(map => map.get(id));
    if (contentEqual(draft, before)) { if (latest) merged.push(latest); }
    else if (contentEqual(latest, before) || contentEqual(draft, latest)) { if (draft) merged.push(draft); }
    else conflicts.push({ id, before, mine: draft, published: latest });
  }
  return { merged, conflicts };
}
