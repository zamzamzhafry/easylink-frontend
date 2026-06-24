# Token Migration Spec

Migrate hardcoded neutral colors → semantic tokens so both `html[data-theme='dark']` and `[light]` work. Tailwind now configured `darkMode:["selector",'[data-theme="dark"]']`, but hardcoded `slate`/`white` ignore the toggle entirely. Tokens flip via CSS vars in `app/globals.css`.

## Goal

Zero matches for this grep on migrated files:
```bash
grep -nE "text-white\b|text-slate-|bg-slate-|border-slate-|divide-slate-|hover:bg-slate-|hover:text-slate-|ring-slate-" <file>
```

## Deterministic mapping (apply verbatim, no judgment on these)

| Hardcoded | Token |
|---|---|
| `text-slate-300` | `text-foreground` |
| `text-slate-400` | `text-muted-foreground` |
| `text-slate-500` | `text-muted-foreground` |
| `text-slate-600` | `text-muted-foreground` |
| `text-slate-700` | `text-muted-foreground` |
| `bg-slate-900` | `bg-card` |
| `bg-slate-900/60` | `bg-card/60` |
| `bg-slate-900/50` | `bg-card/50` |
| `bg-slate-800` | `bg-muted` |
| `bg-slate-800/40` | `bg-muted/40` |
| `bg-slate-800/50` | `bg-muted/50` |
| `border-slate-700` | `border-border` |
| `border-slate-800` | `border-border` |
| `border-slate-700/50` | `border-border` |
| `divide-slate-800` | `divide-border` |
| `hover:bg-slate-800` | `hover:bg-muted` |
| `hover:bg-slate-800/40` | `hover:bg-muted/40` |
| `hover:bg-slate-700` | `hover:bg-muted` |
| `hover:text-slate-300` | `hover:text-foreground` |
| `hover:text-white` (on neutral) | `hover:text-foreground` |
| `ring-slate-*` | `ring-ring` |

## text-white — requires context check (THIS is the invisible-in-light bug)

`text-white` is **invisible on light theme** (light bg `#ecfdf5`). Convert EXCEPT on colored buttons.

- **KEEP `text-white`** when the SAME element's className contains a colored background: `bg-teal-`, `bg-rose-`, `bg-emerald-`, `bg-amber-`, `bg-primary`, `bg-destructive`, `bg-violet-`, `bg-[hsl(var(--primary`. These are button/badge labels on saturated color — legible in both themes. Example: `bg-teal-600 px-4 py-2 text-white` → KEEP.
- **CONVERT `text-white` → `text-foreground`** in all other cases (page headings, table cell values, body text, labels on neutral/card backgrounds).

## Keep (do NOT touch)

- Status accent colors: `teal-300/400`, `rose-300/400`, `amber-300/400`, `emerald-300/400`, `violet-300/400`, `blue-300`, `fuchsia-300`, `orange-300`, `pink-300`, `purple-300` and their `bg-*-500/10` badge tints. These are intentional brand/status semantics, visible on both themes.
- `text-teal-300` on neutral bg is acceptable (colored, legible). Leave it.

## Rules

1. Pure find-replace via the table above. No layout, structure, or logic changes.
2. Only edit the single file assigned.
3. Preserve all whitespace, indentation, and surrounding classes exactly.
4. After edits, run the grep on the file — must be zero matches.
5. Do NOT run build/typecheck (coordinator does that). Just edit + grep-verify.
6. Return: file path, count of replacements per category, final grep result.
