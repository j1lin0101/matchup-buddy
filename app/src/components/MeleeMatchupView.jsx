import { useState, useMemo, useEffect, useRef } from 'react'
import { useCharacterData } from '../hooks/useMatchupData'
import {
  getSafestOptions,
  getDisplayOOSOptions,
  getOOSOptions,
  analyzeMatchup,
  CATEGORY_ORDER,
  SHIELD_RELEASE_FRAMES,
  POWERSHIELD_RELEASE_FRAMES,
  getMeleeBreakers,
  getMeleeOnHitOptions,
  getMeleeOnHitBreakdown,
} from '../analysis/analysisMelee'

// Grab and Wavedash are universal OOS options that don't belong to any of
// CATEGORY_ORDER's move categories — grouped under "Misc" here, mirroring
// Rivals' MatchupView.jsx OOS_FILTER_GROUPS convention.
const OOS_FILTER_GROUPS = [...CATEGORY_ORDER, 'Misc']

// A CSS custom property (not a fixed value) so the mobile media query in
// index.css can make toolbar units a bit taller without touching desktop.
const TOOLBAR_H = 'var(--toolbar-h)'

const SAFE_COLOR   = 'var(--safe)'
const RISKY_COLOR  = 'var(--risky)'
const PUNISH_COLOR = 'var(--punish)'

// Matches the underscore-joined slug convention used for data/icon filenames
// (see CharacterSelect.jsx / useMatchupData.js / scripts/fetch-melee-data.js).
function nameToSlug(name) {
  return name.replace(/&/g, 'and').replace(/[.]/g, '').replace(/\s+/g, '_')
}

function ShieldBadge({ value, color }) {
  if (!value) return null
  const v = value.max
  const label = value.min === value.max ? `${v > 0 ? '+' : ''}${v}` : `${value.min}/${value.max}`
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      background: color + '22', color, border: `1px solid ${color}44`,
      fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// Mirrors Rivals' MatchupView.jsx ProjectileBadge exactly — a move that
// detaches from the character and travels doesn't have a meaningful on-shield
// frame advantage (the attacker isn't standing there when it lands), so
// scripts/fetch-melee-data.js flags these with shieldSafety.isProjectile and
// reports raw shieldstun instead of a computed number.
const PROJECTILE_COLOR = '#7B68EE'
const PROJ_TOOLTIP = "This move is a projectile — the attacker isn't standing at the shield when it lands, so a normal on-shield frame advantage isn't meaningful. We show raw shield stun instead."

function ProjectileBadge({ stun }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '2px 8px', borderRadius: '4px',
          background: PROJECTILE_COLOR + '22', color: PROJECTILE_COLOR,
          border: `1px solid ${PROJECTILE_COLOR}44`,
          fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help',
        }}
      >
        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>PROJ</span>
        {stun}
      </span>
      {visible && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg)', color: 'var(--text)', border: `1px solid ${PROJECTILE_COLOR}66`,
          borderRadius: '6px', padding: '8px 10px', fontSize: '0.7rem', lineHeight: 1.45,
          width: '240px', whiteSpace: 'normal', zIndex: 1000, pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {PROJ_TOOLTIP}
        </span>
      )}
    </span>
  )
}

function FrameBadge({ frames, color = 'var(--accent)' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      background: color + '22', color, border: `1px solid ${color}44`,
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {frames}f
    </span>
  )
}

// Mirrors Rivals' MatchupView.jsx SegmentedToggle exactly.
function SegmentedToggle({ options, value, onChange, activeColor }) {
  return (
    <div className="segmented-toggle" style={{
      display: 'flex', alignItems: 'stretch', height: TOOLBAR_H,
      border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      {options.map((opt, i) => {
        const active = value === opt.value
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            aria-label={opt.title || opt.label}
            title={opt.title || opt.label}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              height: TOOLBAR_H, padding: opt.icon ? '0 12px' : '0 14px',
              border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              background: active ? activeColor + '22' : 'var(--surface)',
              color: active ? activeColor : 'var(--muted)',
              fontSize: '0.72rem', fontWeight: 600, lineHeight: 1,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// Mirrors Rivals' MatchupView.jsx SimplifiedIcon/ExpandedIcon exactly.
function SimplifiedIcon() {
  return (
    <svg width="15" height="12" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1" y="1" width="16" height="12" rx="1.5" />
      <line x1="9" y1="1" x2="9" y2="13" />
    </svg>
  )
}

function ExpandedIcon() {
  return (
    <svg width="15" height="12" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1" y="1" width="16" height="12" rx="1.5" />
      <line x1="5" y1="1" x2="5" y2="13" />
      <line x1="9" y1="1" x2="9" y2="13" />
      <line x1="13" y1="1" x2="13" y2="13" />
    </svg>
  )
}

// A thin vertical rule placed between separate toolbar units. Hidden on mobile,
// where the toolbar stacks vertically instead (see .toolbar-row in index.css).
function ToolbarDivider() {
  return <div className="toolbar-divider" style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border)' }} />
}

function TooltipIcon({ text }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
          borderRadius: '50%', width: '14px', height: '14px',
          fontSize: '0.55rem', fontWeight: 700, cursor: 'default',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, padding: 0, flexShrink: 0,
        }}
      >?</button>
      {visible && (
        <span style={{
          position: 'absolute', left: 0, top: 'calc(100% + 6px)',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: '6px', padding: '6px 10px',
          fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5,
          width: '220px', zIndex: 100, pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </span>
  )
}

function Section({ title, accent, tooltip, children }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px', minHeight: '44px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent }}>
          {title}
        </span>
        {tooltip && <TooltipIcon text={tooltip} />}
      </div>
      <div>{children}</div>
    </div>
  )
}

function CharColumnHeader({ name, accent, wikiUrl }) {
  const slug = nameToSlug(name)
  return (
    <a
      href={wikiUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        textDecoration: 'none', padding: '8px 4px', borderRadius: '6px',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <img
        src={`${import.meta.env.BASE_URL}icons/ssbm/${slug}.png`}
        alt={name}
        style={{ width: '32px', height: '32px', objectFit: 'contain', flexShrink: 0 }}
      />
      <span style={{ fontSize: '1rem', fontWeight: 700, color: accent, letterSpacing: '0.02em' }}>
        {name}
      </span>
      <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginLeft: '2px' }}>↗</span>
    </a>
  )
}

function EmptyNote({ children }) {
  return <p style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '10px 16px' }}>{children}</p>
}

function SafestOptionsList({ charData, defenderOOSOptions }) {
  const options = useMemo(
    () => getSafestOptions(charData, defenderOOSOptions).filter(o => o.shieldSafety.max > 0 || (o.punishCount ?? 0) === 0),
    [charData, defenderOOSOptions]
  )
  if (!options.length) return <EmptyNote>No safe moves found.</EmptyNote>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {options.map((o, i) => {
        const fmt = n => `${n > 0 ? '+' : ''}${n}`
        const v = o.shieldSafety.max
        const tagLabel = o.shieldSafety.min === v ? fmt(v) : `${fmt(o.shieldSafety.min)}/${fmt(v)}`
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{o.move}</span>
              {o.hitbox && <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>[{o.hitbox}]</span>}
            </div>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
              background: SAFE_COLOR + '22', color: SAFE_COLOR, border: `1px solid ${SAFE_COLOR}44`,
              fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
            }}>{tagLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

function OOSList({ charData }) {
  const options = useMemo(() => getDisplayOOSOptions(charData), [charData])
  if (!options.length) return <EmptyNote>No OOS data.</EmptyNote>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600, flexShrink: 0 }}>{o.label}</span>
          {o.jumpCancel && (
            <span style={{ color: 'var(--accent2)', fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}>JC</span>
          )}
          <span style={{ flex: 1 }} />
          <FrameBadge frames={o.oosStartup} />
        </div>
      ))}
    </div>
  )
}

// Moves that always beat Crouch Cancel or ASDI Down against the opponent's
// real weight, regardless of the defender's damage % — the Overview-page
// counterpart to Rivals' FloorhugList, mirroring this file's existing
// SafestOptionsList/OOSList row style.
function BreakersList({ charData, opponentWeight }) {
  const breakers = useMemo(
    () => getMeleeBreakers(charData, opponentWeight),
    [charData, opponentWeight]
  )
  if (!breakers.length) return <EmptyNote>No moves always break CC or ASDI Down.</EmptyNote>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {breakers.map((b, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{b.move}</span>
            {b.hitbox && <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>[{b.hitbox}]</span>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {b.breaksCC && <FrameOnlyBadge label="Breaks CC" color={PUNISH_COLOR} />}
            {b.breaksASDI && <FrameOnlyBadge label="Breaks ASDI" color={PUNISH_COLOR} />}
          </div>
        </div>
      ))}
    </div>
  )
}

// Tumble % color scale — mirrors Rivals' MatchupView.jsx tumbleColor exactly.
// Low % = good (combos early) → High % = risky (won't tumble until late).
function tumbleColor(pct) {
  if (pct === null || pct === undefined) return '#888899'
  if (pct <= 40)  return '#00CED1'  // cyan          — tumbles very early, great combo tool
  if (pct <= 80)  return '#F0E442'  // yellow        — tumbles at low %
  if (pct <= 130) return '#DA70D6'  // orchid/purple — mid-range, situational
  if (pct <= 200) return '#888899'  // muted gray    — high %, hard to use
  return '#444455'                  // very muted    — extreme threshold, rarely relevant
}

function MeleeTumbleBadge({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>
  const color = tumbleColor(pct)
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      background: color + '22', color, border: `1px solid ${color}55`,
      fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {pct}%
    </span>
  )
}

// "Beats CC?" — whether this hit's raw knockback overcomes Crouch Cancel's
// reduction (KB ≥ 32). Independent of the Tumble %/Knockdown check (KB ≥
// 80), which answers "beats ASDI Down?" — ASDI Down never reduces
// knockback, so that question is just the tumble check, not a separate axis.
function BeatsCCBadge({ beats }) {
  if (!beats) return <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>No</span>
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      background: 'var(--muted)22', color: 'var(--text)', border: '1px solid var(--muted)44',
      fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      Yes
    </span>
  )
}

// A plain text badge (no frame-count suffix, unlike FrameBadge) for short
// static labels like "Breaks CC".
function FrameOnlyBadge({ label, color = 'var(--accent)' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      background: color + '22', color, border: `1px solid ${color}44`,
      fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function MoveRow({ row, oosFilter, simplified }) {
  const statusColor = row.isSafe ? SAFE_COLOR : row.isRisky ? RISKY_COLOR : PUNISH_COLOR
  const punishes = (oosFilter && oosFilter.size > 0)
    ? row.punishes.filter(p => oosFilter.has(p.move))
    : row.punishes
  return (
    <div className={`move-row${simplified ? ' simplified' : ''}`}>
      <div>
        <span style={{ fontWeight: 600, color: statusColor }}>{row.move}</span>
        {row.hitbox && (
          <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitbox}]
          </span>
        )}
      </div>
      {!simplified && (
        <div className="move-row-badges" style={{ textAlign: 'center' }}>
          {row.shieldSafety?.isProjectile
            ? <ProjectileBadge stun={row.shieldSafety.min} />
            : <ShieldBadge value={row.shieldSafety} color={statusColor} />}
        </div>
      )}
      <div>
        {punishes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {punishes.map((p, i) => (
              <span key={i} style={{
                padding: '1px 7px', borderRadius: '4px', background: 'var(--surface)',
                border: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text)', whiteSpace: 'nowrap',
              }}>
                {p.label} <span style={{ color: 'var(--muted)' }}>{p.oosStartup}f</span>
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>None</span>
        )}
      </div>
    </div>
  )
}

function CategoryAccordion({ category, rows, oosFilter, simplified }) {
  const [open, setOpen] = useState(true)
  const sorted = useMemo(() => [...rows].sort((a, b) => b.shieldSafety.max - a.shieldSafety.max), [rows])
  const safe        = rows.filter(r => r.isSafe).length
  const risky       = rows.filter(r => r.isRisky).length
  const punishable  = rows.filter(r => r.isPunishable).length

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 16px', background: 'var(--surface)', border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text)', flex: 1 }}>
          {category}
        </span>
        <div className="accordion-counts">
          <div className="accordion-counts-row">
            <span style={{ color: SAFE_COLOR, fontSize: '0.72rem' }}>{safe} safe</span>
            <span style={{ color: RISKY_COLOR, fontSize: '0.72rem' }}>{risky} risky</span>
            <span style={{ color: PUNISH_COLOR, fontSize: '0.72rem' }}>{punishable} punishable</span>
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginLeft: '4px', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: 'var(--surface)' }}>
          <div className={`col-headers${simplified ? ' simplified' : ''}`}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Move</span>
            {!simplified && <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center' }}>On Shield</span>}
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Punish Options</span>
          </div>
          {sorted.map((row, i) => <MoveRow key={i} row={row} oosFilter={oosFilter} simplified={simplified} />)}
        </div>
      )}
    </div>
  )
}

function BreakdownTable({ matchup, categoryFilter, oosFilter, simplified }) {
  const visibleCategories = (categoryFilter && categoryFilter !== 'All') ? [categoryFilter] : CATEGORY_ORDER
  const byCategory = visibleCategories
    .map(category => {
      let rows = matchup.breakdown.filter(r => r.category === category)
      if (oosFilter && oosFilter.size > 0) {
        rows = rows.filter(r => Array.isArray(r.punishes) && r.punishes.some(p => oosFilter.has(p.move)))
      }
      return { category, rows }
    })
    .filter(g => g.rows.length > 0)

  if (!byCategory.length) {
    return <EmptyNote>{categoryFilter !== 'All' || (oosFilter && oosFilter.size > 0) ? 'No moves match the current filters.' : 'No move data.'}</EmptyNote>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {byCategory.map(g => <CategoryAccordion key={g.category} category={g.category} rows={g.rows} oosFilter={oosFilter} simplified={simplified} />)}
    </div>
  )
}

// On-hit (CC/ASDI Down) row — rows have `advantage`/`beatsCC`/`isKnockdown`
// instead of `shieldSafety`, so this can't reuse MoveRow directly. No
// defensive-tech toggle: the defender always gets CC's reduction when it
// applies, and Knockdown (row.isKnockdown) already answers "beats ASDI
// Down?" since ASDI Down never reduces knockback — see analysisMelee.js.
function OnHitMoveRow({ row, oosFilter, simplified }) {
  const punishes = (oosFilter && oosFilter.size > 0)
    ? row.punishes.filter(p => oosFilter.has(p.move))
    : row.punishes

  if (row.isKnockdown) {
    return (
      <div className={`melee-on-hit-row${simplified ? ' simplified' : ''}`}>
        <div>
          <span style={{ fontWeight: 600, color: SAFE_COLOR }}>{row.move}</span>
          {row.hitbox && (
            <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
              [{row.hitbox}]
            </span>
          )}
        </div>
        {!simplified && (
          <div style={{ textAlign: 'center' }}>
            <FrameOnlyBadge label="Knockdown" color={SAFE_COLOR} />
          </div>
        )}
        {!simplified && (
          <div style={{ textAlign: 'center' }}>
            <MeleeTumbleBadge pct={row.tumblePercent} />
          </div>
        )}
        {!simplified && (
          <div style={{ textAlign: 'center' }}>
            <BeatsCCBadge beats={row.beatsCC} />
          </div>
        )}
        <div>
          <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>
        </div>
      </div>
    )
  }

  const statusColor = row.advantage > 0 ? SAFE_COLOR : row.advantage >= -3 ? RISKY_COLOR : PUNISH_COLOR
  const advLabel = `${row.advantage > 0 ? '+' : ''}${row.advantage}`

  return (
    <div className={`melee-on-hit-row${simplified ? ' simplified' : ''}`}>
      <div>
        <span style={{ fontWeight: 600, color: statusColor }}>{row.move}</span>
        {row.hitbox && (
          <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitbox}]
          </span>
        )}
      </div>
      {!simplified && (
        <div style={{ textAlign: 'center' }}>
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
            background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}44`,
            fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
          }}>{advLabel}</span>
        </div>
      )}
      {!simplified && (
        <div style={{ textAlign: 'center' }}>
          <MeleeTumbleBadge pct={row.tumblePercent} />
        </div>
      )}
      {!simplified && (
        <div style={{ textAlign: 'center' }}>
          <BeatsCCBadge beats={row.beatsCC} />
        </div>
      )}
      <div>
        {punishes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {punishes.map((p, i) => (
              <span key={i} style={{
                padding: '1px 7px', borderRadius: '4px', background: 'var(--surface)',
                border: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text)', whiteSpace: 'nowrap',
              }}>
                {p.label} <span style={{ color: 'var(--muted)' }}>{p.onHitStartup}f</span>
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>None</span>
        )}
      </div>
    </div>
  )
}

const TUMBLE_EARLY_COLOR  = '#00CED1'  // cyan   ≤40%
const TUMBLE_MEDIUM_COLOR = '#F0E442'  // yellow ≤80%
const TUMBLE_HIGH_COLOR   = '#DA70D6'  // orchid >80%

function OnHitCategoryAccordion({ category, rows, oosFilter, simplified }) {
  const [open, setOpen] = useState(true)
  const sorted = useMemo(() => [...rows].sort((a, b) => b.advantage - a.advantage), [rows])
  const safe        = rows.filter(r => r.isKnockdown || r.advantage > 0).length
  const risky       = rows.filter(r => !r.isKnockdown && r.advantage <= 0 && r.advantage >= -3).length
  const punishable  = rows.filter(r => !r.isKnockdown && r.advantage < -3).length
  const earlyKD = rows.filter(r => r.tumblePercent != null && r.tumblePercent <= 40).length
  const midKD   = rows.filter(r => r.tumblePercent != null && r.tumblePercent > 40 && r.tumblePercent <= 80).length
  const highKD  = rows.filter(r => r.tumblePercent != null && r.tumblePercent > 80).length

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 16px', background: 'var(--surface)', border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text)', flex: 1 }}>
          {category}
        </span>
        <div className="accordion-counts">
          <div className="accordion-counts-row">
            <span style={{ color: SAFE_COLOR, fontSize: '0.72rem' }}>{safe} safe</span>
            <span style={{ color: RISKY_COLOR, fontSize: '0.72rem' }}>{risky} risky</span>
            <span style={{ color: PUNISH_COLOR, fontSize: '0.72rem' }}>{punishable} punishable</span>
          </div>
          <span className="accordion-counts-divider">|</span>
          <div className="accordion-counts-row">
            {earlyKD > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: TUMBLE_EARLY_COLOR }}>{earlyKD} early KD</span>}
            {midKD   > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: TUMBLE_MEDIUM_COLOR }}>{midKD} mid KD</span>}
            {highKD  > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: TUMBLE_HIGH_COLOR }}>{highKD} high KD</span>}
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginLeft: '4px', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: 'var(--surface)' }}>
          <div className={`melee-on-hit-col-headers${simplified ? ' simplified' : ''}`}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Move</span>
            {!simplified && <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center' }}>On Hit</span>}
            {!simplified && <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center' }}>Tumble %</span>}
            {!simplified && <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center' }}>Beats CC?</span>}
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Punish Options</span>
          </div>
          {sorted.map((row, i) => <OnHitMoveRow key={i} row={row} oosFilter={oosFilter} simplified={simplified} />)}
        </div>
      )}
    </div>
  )
}

function MeleeOnHitTable({ breakdown, categoryFilter, oosFilter, simplified }) {
  const visibleCategories = (categoryFilter && categoryFilter !== 'All') ? [categoryFilter] : CATEGORY_ORDER
  const byCategory = visibleCategories
    .map(category => {
      let rows = breakdown.filter(r => r.category === category)
      if (oosFilter && oosFilter.size > 0) {
        rows = rows.filter(r => Array.isArray(r.punishes) && r.punishes.some(p => oosFilter.has(p.move)))
      }
      return { category, rows }
    })
    .filter(g => g.rows.length > 0)

  if (!byCategory.length) {
    return <EmptyNote>{categoryFilter !== 'All' || (oosFilter && oosFilter.size > 0) ? 'No moves match the current filters.' : 'No move data.'}</EmptyNote>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {byCategory.map(g => <OnHitCategoryAccordion key={g.category} category={g.category} rows={g.rows} oosFilter={oosFilter} simplified={simplified} />)}
    </div>
  )
}

// Mirrors Rivals' MatchupView.jsx FilterModal: one modal with two tabs — the
// attacker's move-category filter (radio, single-select) and the defender's
// OOS punish-option filter (checkboxes, multi-select, grouped by category).
// relevantOOSMoves narrows the punish-options list to only options that
// actually appear as a punish somewhere in the currently category-filtered
// breakdown, so the list doesn't show irrelevant options.
function FilterModal({
  attackerName, attackerColor,
  defenderName, defenderColor,
  categoryTabs, categoryFilter, setCategoryFilter,
  defenderOOS, oosFilter, setOosFilter, relevantOOSMoves,
  onClose,
}) {
  const [tab, setTab] = useState('attacks')
  const modalRef = useRef(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function toggleOOS(moveName) {
    setOosFilter(prev => {
      const next = new Set(prev)
      if (next.has(moveName)) next.delete(moveName)
      else next.add(moveName)
      return next
    })
  }

  const grouped = useMemo(() => {
    const map = {}
    OOS_FILTER_GROUPS.forEach(g => { map[g] = [] })
    defenderOOS.forEach(opt => {
      const cat = opt.category
      if (map[cat]) map[cat].push(opt)
      else map['Misc'].push(opt)
    })
    return map
  }, [defenderOOS])

  const atkActive = categoryFilter !== 'All'
  const oosActive = oosFilter.size

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div ref={modalRef} style={{ background: 'var(--surface)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Filters</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Inner tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {[
            { id: 'attacks', label: `${attackerName}'s Attacks`, color: attackerColor, badge: atkActive ? 1 : 0 },
            { id: 'punish', label: `${defenderName}'s Punish Options`, color: defenderColor, badge: oosActive },
          ].map(t => {
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '10px 16px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${isActive ? t.color : 'transparent'}`,
                  color: isActive ? t.color : 'var(--muted)',
                  fontWeight: isActive ? 700 : 400, fontSize: '0.78rem',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {t.label}
                {t.badge > 0 && (
                  <span style={{ background: t.color, color: '#0e0e12', borderRadius: '10px', padding: '1px 7px', fontSize: '0.65rem', fontWeight: 700 }}>
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="filter-modal-content" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {tab === 'attacks' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {categoryTabs.map(c => {
                const isActive = categoryFilter === c
                return (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 20px', background: 'none', border: 'none',
                      borderLeft: `3px solid ${isActive ? attackerColor : 'transparent'}`,
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${isActive ? attackerColor : 'var(--muted)'}`,
                      background: isActive ? attackerColor : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0e0e12' }} />}
                    </span>
                    <span style={{ fontSize: '0.88rem', color: isActive ? attackerColor : 'var(--text)', fontWeight: isActive ? 700 : 400 }}>
                      {c}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {tab === 'punish' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {oosActive > 0 && (
                <button onClick={() => setOosFilter(new Set())} style={{ alignSelf: 'flex-start', margin: '8px 20px', fontSize: '0.72rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Clear all ({oosActive})
                </button>
              )}
              {OOS_FILTER_GROUPS.map(g => {
                const opts = (grouped[g] || []).filter(o => !relevantOOSMoves || relevantOOSMoves.has(o.move))
                if (!opts.length) return null
                return (
                  <div key={g}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--muted)', padding: '10px 20px 4px' }}>{g}</div>
                    {opts.map(opt => {
                      const active = oosFilter.has(opt.move)
                      return (
                        <button
                          key={opt.move}
                          onClick={() => toggleOOS(opt.move)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '11px 20px', background: 'none', border: 'none',
                            borderLeft: `3px solid ${active ? defenderColor : 'transparent'}`,
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer', width: '100%', textAlign: 'left',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <span style={{
                            width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                            border: `2px solid ${active ? defenderColor : 'var(--muted)'}`,
                            background: active ? defenderColor : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {active && <span style={{ fontSize: '0.7rem', color: '#0e0e12', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                          </span>
                          <span style={{ flex: 1, fontSize: '0.88rem', color: active ? defenderColor : 'var(--text)', fontWeight: active ? 600 : 400 }}>{opt.label}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>{opt.oosStartup}f</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Apply button */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '11px', borderRadius: '8px', background: tab === 'punish' ? defenderColor : attackerColor, border: 'none', color: '#0e0e12', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// Owns the category/OOS filter state for one attacking direction (mirrors
// Rivals' BreakdownSection) and renders the "⚙ Filters" toolbar button plus
// the filtered BreakdownTable.
function AttackingView({ attackerData, defenderData, attackerName, attackerColor, defenderName, defenderColor }) {
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [oosFilter, setOosFilter] = useState(new Set())
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [shieldMode, setShieldMode] = useState('normal')
  const [subTab, setSubTab] = useState('onShield')
  const [pct, setPct] = useState(0)
  const [viewMode, setViewMode] = useState('expanded')
  const simplified = viewMode === 'simplified'

  const shieldReleaseFrames = shieldMode === 'powershield' ? POWERSHIELD_RELEASE_FRAMES : SHIELD_RELEASE_FRAMES
  // The defender's own OOS options don't depend on shield mode — only the
  // attacker's on-shield number does (see analyzeMatchup).
  const defenderOOS = useMemo(
    () => getOOSOptions(defenderData),
    [defenderData]
  )
  const matchup = useMemo(
    () => analyzeMatchup(attackerData, defenderData, shieldReleaseFrames),
    [attackerData, defenderData, shieldReleaseFrames]
  )
  const onHitOptions = useMemo(
    () => getMeleeOnHitOptions(defenderData),
    [defenderData]
  )
  const onHitBreakdown = useMemo(
    () => getMeleeOnHitBreakdown(attackerData, defenderData, pct),
    [attackerData, defenderData, pct]
  )

  const isOnHit = subTab === 'onHit'
  const activeRows = isOnHit ? onHitBreakdown : matchup.breakdown
  const activeDefenderOptions = isOnHit ? onHitOptions : defenderOOS

  const categoryTabs = ['All', ...CATEGORY_ORDER]

  // OOS/on-hit moves that actually appear as punishes in the selected category's rows
  const relevantOOSMoves = useMemo(() => {
    const rows = categoryFilter === 'All'
      ? activeRows
      : activeRows.filter(r => r.category === categoryFilter)
    const moves = new Set()
    rows.forEach(r => (r.punishes || []).forEach(p => moves.add(p.move)))
    return moves
  }, [activeRows, categoryFilter])

  const atkActive = categoryFilter !== 'All' ? 1 : 0
  const oosActive = oosFilter.size
  const anyActive = atkActive > 0 || oosActive > 0

  return (
    <div>
      {/* Sub-tabs + toolbar live in one shared card so they read as a single unit */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '16px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'onShield', label: 'On Shield' },
            { id: 'onHit', label: 'On Hit' },
          ].map(t => {
            const active = subTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                style={{
                  padding: '10px 20px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${active ? attackerColor : 'transparent'}`,
                  color: active ? attackerColor : 'var(--muted)', fontWeight: active ? 700 : 400,
                  fontSize: '0.82rem', cursor: 'pointer', letterSpacing: '0.02em',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="toolbar-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '10px 16px' }}>
        <SegmentedToggle
          activeColor={attackerColor}
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'simplified', icon: <SimplifiedIcon />, title: 'Simplified — Move and Punish Options only' },
            { value: 'expanded', icon: <ExpandedIcon />, title: 'Expanded — all columns' },
          ]}
        />

        <ToolbarDivider />

        {!isOnHit ? (
          <SegmentedToggle
            activeColor={attackerColor}
            value={shieldMode}
            onChange={setShieldMode}
            options={[
              { value: 'normal', label: 'Normal Shield' },
              { value: 'powershield', label: 'Powershield' },
            ]}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
              {defenderName}
            </span>
            <input
              type="number"
              min={0} max={999} step={1}
              value={pct}
              onChange={e => setPct(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
              style={{
                width: '56px', height: TOOLBAR_H, padding: '0 8px', borderRadius: '6px',
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: '0.82rem', fontWeight: 700, textAlign: 'right',
              }}
            />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)' }}>%</span>
          </div>
        )}

        <ToolbarDivider />

        <button
          onClick={() => setFilterModalOpen(true)}
          className="toolbar-filters-btn"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            height: TOOLBAR_H, padding: '0 16px', borderRadius: 'var(--radius)',
            border: `1px solid ${anyActive ? 'var(--text)' : 'var(--border)'}`,
            background: anyActive ? attackerColor + '18' : 'var(--surface)',
            color: 'var(--text)',
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          <span>⚙ Filters</span>
          {atkActive > 0 && (
            <span style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: attackerColor, color: '#0e0e12',
              fontSize: '0.65rem', fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {atkActive}
            </span>
          )}
          {oosActive > 0 && (
            <span style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: defenderColor, color: '#0e0e12',
              fontSize: '0.65rem', fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {oosActive}
            </span>
          )}
        </button>
        </div>
      </div>

      {filterModalOpen && (
        <FilterModal
          attackerName={attackerName} attackerColor={attackerColor}
          defenderName={defenderName} defenderColor={defenderColor}
          categoryTabs={categoryTabs} categoryFilter={categoryFilter}
          setCategoryFilter={v => { setCategoryFilter(v); setOosFilter(new Set()) }}
          defenderOOS={activeDefenderOptions} oosFilter={oosFilter} setOosFilter={setOosFilter}
          relevantOOSMoves={relevantOOSMoves}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      {isOnHit
        ? <MeleeOnHitTable breakdown={onHitBreakdown} categoryFilter={categoryFilter} oosFilter={oosFilter} simplified={simplified} />
        : <BreakdownTable matchup={matchup} categoryFilter={categoryFilter} oosFilter={oosFilter} simplified={simplified} />}
    </div>
  )
}

export default function MeleeMatchupView({ myChar, oppChar, onBack }) {
  const [activeTab, setActiveTab] = useState('overview')
  const { data: myData,  loading: myLoading }  = useCharacterData(myChar, 'ssbm')
  const { data: oppData, loading: oppLoading } = useCharacterData(oppChar, 'ssbm')

  const loading = myLoading || oppLoading

  // Overview panel always uses normal shield (only the Attacking tabs get the
  // shield-mode toggle — see AttackingView, which computes its own matchup/OOS
  // per shield mode since powershield timing only matters for punish analysis).
  const myOOS  = useMemo(() => myData  ? getOOSOptions(myData)  : [], [myData])
  const oppOOS = useMemo(() => oppData ? getOOSOptions(oppData) : [], [oppData])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--muted)' }}>
      Loading frame data...
    </div>
  )

  const mySlug  = nameToSlug(myChar)
  const oppSlug = nameToSlug(oppChar)

  const tabs = [
    { id: 'overview', label: 'Matchup Overview' },
    { id: 'me',  label: `${myChar} Attacking`,  icon: `${import.meta.env.BASE_URL}icons/ssbm/${mySlug}.png`,  color: 'var(--accent)' },
    { id: 'opp', label: `${oppChar} Attacking`, icon: `${import.meta.env.BASE_URL}icons/ssbm/${oppSlug}.png`, color: 'var(--accent2)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      <header className="page-header">
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
          borderRadius: 'var(--radius)', padding: '6px 10px', cursor: 'pointer', fontSize: '1rem',
          flexShrink: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 'clamp(0.72rem, 3.8vw, 1.1rem)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: 'var(--accent)' }}>{myChar}</span>
            <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
            <span style={{ color: 'var(--accent2)' }}>{oppChar}</span>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: '2px', lineHeight: 1.6 }}>
            Shield safety &amp; punish analysis
          </p>
        </div>
      </header>

      <nav className="matchup-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id
          const color = tab.color || 'var(--text)'
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px 20px', background: 'none', border: 'none',
                borderBottom: `2px solid ${isActive ? color : 'transparent'}`,
                color: isActive ? color : 'var(--muted)', fontWeight: isActive ? 700 : 400,
                fontSize: '0.82rem', cursor: 'pointer', letterSpacing: '0.02em',
                transition: 'color 0.15s, border-color 0.15s', flex: 1,
              }}
            >
              {tab.icon && <img src={tab.icon} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain', opacity: isActive ? 1 : 0.5 }} />}
              {tab.label}
            </button>
          )
        })}
      </nav>

      <main className="page-main">
        {activeTab === 'overview' && (
          <div className="top-panels-grid">
            <div className="char-col-header-my"><CharColumnHeader name={myChar} accent="var(--accent)" wikiUrl={myData?.wikiUrl} /></div>
            <div className="char-col-header-opp"><CharColumnHeader name={oppChar} accent="var(--accent2)" wikiUrl={oppData?.wikiUrl} /></div>

            <div className="char-panel-safe-my">
              {myData
                ? <Section title="Safest Options" accent="var(--accent)" tooltip="Moves with the fewest OOS punish options available to the opponent in this matchup. Positive = attacker acts first. Negative = defender acts first.">
                    <SafestOptionsList charData={myData} defenderOOSOptions={oppOOS} />
                  </Section>
                : null}
            </div>
            <div className="char-panel-safe-opp">
              {oppData
                ? <Section title="Safest Options" accent="var(--accent2)" tooltip="Moves with the fewest OOS punish options available to the opponent in this matchup. Positive = attacker acts first. Negative = defender acts first.">
                    <SafestOptionsList charData={oppData} defenderOOSOptions={myOOS} />
                  </Section>
                : null}
            </div>

            <div className="char-panel-oos-my">
              {myData
                ? <Section title="Fastest OOS Options" accent="var(--accent)" tooltip="Fastest options available out of shield, sorted by total frames from shielding to the move hitting. Includes wavedash.">
                    <OOSList charData={myData} />
                  </Section>
                : null}
            </div>
            <div className="char-panel-oos-opp">
              {oppData
                ? <Section title="Fastest OOS Options" accent="var(--accent2)" tooltip="Fastest options available out of shield, sorted by total frames from shielding to the move hitting. Includes wavedash.">
                    <OOSList charData={oppData} />
                  </Section>
                : null}
            </div>

            <div className="char-panel-breakers-my">
              {myData && oppData
                ? <Section title="CC/ASDI Breakers" accent="var(--accent)" tooltip="Moves that always beat Crouch Cancel or ASDI Down against this opponent's weight, regardless of their percent.">
                    <BreakersList charData={myData} opponentWeight={oppData.weight} />
                  </Section>
                : null}
            </div>
            <div className="char-panel-breakers-opp">
              {myData && oppData
                ? <Section title="CC/ASDI Breakers" accent="var(--accent2)" tooltip="Moves that always beat Crouch Cancel or ASDI Down against this opponent's weight, regardless of their percent.">
                    <BreakersList charData={oppData} opponentWeight={myData.weight} />
                  </Section>
                : null}
            </div>
          </div>
        )}

        {activeTab === 'me' && myData && oppData && (
          <AttackingView
            attackerData={myData} defenderData={oppData}
            attackerName={myChar} attackerColor="var(--accent)"
            defenderName={oppChar} defenderColor="var(--accent2)"
          />
        )}
        {activeTab === 'opp' && myData && oppData && (
          <AttackingView
            attackerData={oppData} defenderData={myData}
            attackerName={oppChar} attackerColor="var(--accent2)"
            defenderName={myChar} defenderColor="var(--accent)"
          />
        )}
      </main>
    </div>
  )
}
