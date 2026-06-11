import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useCharacterData } from '../hooks/useMatchupData'
import { getSafestOptions, getOOSOptions, getDisplayOOSOptions, analyzeMatchup, CATEGORY_ORDER, getCategory } from '../analysis/analysis'
import { getDisplayName } from '../analysis/nicknames'

const SAFE_COLOR  = 'var(--safe)'
const RISKY_COLOR = 'var(--risky)'
const PUNISH_COLOR = 'var(--punish)'

// Tumble % color scale — distinct colors per tier, separate from the shield safety scale.
// Low % = good (combos early) → High % = risky (won't tumble until late)
function tumbleColor(pct) {
  if (pct === null || pct === undefined) return '#888899'
  if (pct <= 40)  return '#00CED1'  // cyan          — tumbles very early, great combo tool
  if (pct <= 80)  return '#F0E442'  // yellow        — tumbles at low %
  if (pct <= 130) return '#DA70D6'  // orchid/purple — mid-range, situational
  if (pct <= 200) return '#888899'  // muted gray    — high %, hard to use
  return '#444455'                  // very muted    — extreme threshold, rarely relevant
}

function ShieldBadge({ value, color }) {
  if (!value) return null
  const v = value.max
  const label = value.min === value.max ? `${v > 0 ? '+' : ''}${v}` : `${value.min} to ${value.max}`
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      fontSize: '0.75rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

const PROJECTILE_COLOR = '#7B68EE'
const PROJ_TOOLTIP = "This hitbox is flagged as a projectile by the game and wiki, though it may not behave like a traditional projectile. Distance greatly impacts safety and follow-up potential, so we show raw shield stun instead of a frame advantage."

const STUN_COLOR = '#E69F00'
const STUN_TOOLTIP = "This move has special properties (e.g. active for many frames while falling, can be jump-cancelled, hits during landing, or has a unique hitbox) that make a fixed shield safety value unreliable. We show raw shield stun so you can assess the situation yourself."

function ProjectileBadge({ stun }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: PROJECTILE_COLOR + '22',
          color: PROJECTILE_COLOR,
          border: `1px solid ${PROJECTILE_COLOR}44`,
          fontSize: '0.75rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          cursor: 'help',
        }}
      >
        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>PROJ</span>
        {stun}
      </span>
      {visible && (
        <span style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1a1a2e',
          color: '#e0e0f0',
          border: `1px solid ${PROJECTILE_COLOR}66`,
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '0.7rem',
          lineHeight: 1.45,
          width: '260px',
          whiteSpace: 'normal',
          zIndex: 1000,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {PROJ_TOOLTIP}
        </span>
      )}
    </span>
  )
}

function StunBadge({ stun }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: STUN_COLOR + '22',
          color: STUN_COLOR,
          border: `1px solid ${STUN_COLOR}44`,
          fontSize: '0.75rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          cursor: 'help',
        }}
      >
        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>STUN</span>
        {stun}
      </span>
      {visible && (
        <span style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1a1a2e',
          color: '#e0e0f0',
          border: `1px solid ${STUN_COLOR}66`,
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '0.7rem',
          lineHeight: 1.45,
          width: '240px',
          whiteSpace: 'normal',
          zIndex: 1000,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {STUN_TOOLTIP}
        </span>
      )}
    </span>
  )
}

function CharColumnHeader({ name, accent }) {
  const slug = name.replace(/ /g, '_')
  const wikiUrl = `https://dragdown.wiki/wiki/RoA2/${slug}`
  return (
    <a
      href={wikiUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
        padding: '8px 4px',
        borderRadius: '6px',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <img
        src={`${import.meta.env.BASE_URL}icons/${slug}.png`}
        alt={name}
        style={{ width: '32px', height: '32px', objectFit: 'contain', flexShrink: 0 }}
      />
      <span style={{
        fontSize: '1rem',
        fontWeight: 700,
        color: accent,
        letterSpacing: '0.02em',
      }}>
        {name}
      </span>
      <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginLeft: '2px' }}>↗</span>
    </a>
  )
}

function Section({ title, accent, subtitle, children }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px',
        minHeight: '44px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: subtitle ? 'flex-start' : 'center',
        flexDirection: subtitle ? 'column' : 'row',
        gap: '2px',
      }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.7 }}>{subtitle}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

function SafestOptionsList({ charData, defenderOOSOptions }) {
  const options = useMemo(
    () => getSafestOptions(charData, defenderOOSOptions)
      .filter(o => {
        if (getCategory(o.move) === 'Misc') return false
        if (o.shieldSafety?.isStun) return false
        // Always show moves that are positive on shield
        if (o.shieldSafety?.max > 0) return true
        // For negative moves, only show if nothing can punish them
        return (o.punishCount ?? 0) === 0
      }),
    [charData, defenderOOSOptions]
  )
  if (!options.length) return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No safe moves found.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {options.map((o, i) => {
        const tagColor = 'var(--safe)'
        const fmt = n => `${n > 0 ? '+' : ''}${n}`
        const v = o.shieldSafety?.max
        const tagLabel = o.shieldSafety
          ? (o.shieldSafety.min === o.shieldSafety.max
              ? fmt(v)
              : `${fmt(o.shieldSafety.min)} to ${fmt(v)}`)
          : '—'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, flexShrink: 0 }}>{getDisplayName(charData.character, o.move)}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.75rem', flexShrink: 0 }}>[{o.hitbox}]</span>
            <span style={{ flex: 1 }} />
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
              background: tagColor + '22', color: tagColor,
              border: `1px solid ${tagColor}44`, fontSize: '0.72rem', fontWeight: 700,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>{tagLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

function OOSList({ charData }) {
  const options = useMemo(() => getDisplayOOSOptions(charData), [charData])
  if (!options.length) return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No OOS data.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600, flexShrink: 0 }}>{o.label}</span>
          {o.jumpCancel && (
            <span style={{ color: 'var(--accent2)', fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}>JC</span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'var(--accent)22',
            color: 'var(--accent)',
            border: '1px solid var(--accent)44',
            fontSize: '0.72rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {o.oosStartup}f
          </span>
        </div>
      ))}
    </div>
  )
}

function TumbleBadge({ row, defenderName }) {
  const key = defenderName ? defenderName.toUpperCase() : null

  // Grounded value (numeric for coloring, string for display)
  let groundedNum = null
  let groundedStr = null
  if (key && row.perCharacterTumble?.[key] !== undefined) {
    groundedNum = row.perCharacterTumble[key]
    groundedStr = `${groundedNum}%`
  } else if (row.tumblePercent) {
    const { min, max } = row.tumblePercent
    groundedNum = Math.round((min + max) / 2)
    groundedStr = min === max ? `${min}%` : `${min}–${max}%`
  }

  // Aerial value (only when distinct from grounded)
  let aerialNum = null
  let aerialStr = null
  if (key && row.perCharacterTumbleAerial?.[key] !== undefined) {
    aerialNum = row.perCharacterTumbleAerial[key]
    aerialStr = `${aerialNum}%`
  } else if (row.tumblePercent?.aerial) {
    const { min, max } = row.tumblePercent.aerial
    aerialNum = Math.round((min + max) / 2)
    aerialStr = min === max ? `${min}%` : `${min}–${max}%`
  }

  if (!groundedStr) return <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>

  const makeBadge = (num, str) => {
    const color = tumbleColor(num)
    return {
      style: {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        background: color + '22',
        color,
        border: `1px solid ${color}55`,
        fontSize: '0.75rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      },
      str,
    }
  }

  const gBadge = makeBadge(groundedNum, groundedStr)

  if (aerialStr && aerialStr !== groundedStr) {
    const aBadge = makeBadge(aerialNum, aerialStr)
    return (
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '4px', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <span style={gBadge.style}>Grounded {gBadge.str}</span>
        <span style={aBadge.style}>Aerial {aBadge.str}</span>
      </div>
    )
  }

  return <span style={gBadge.style}>{gBadge.str}</span>
}

function MoveRow({ row, attackerName, defenderName, oosFilter }) {
  const statusColor = row.isSafe ? SAFE_COLOR : row.isRisky ? RISKY_COLOR : PUNISH_COLOR

  return (
    <div className="move-row">
      {/* Move + hitbox */}
      <div>
        <span style={{ fontWeight: 600 }}>{getDisplayName(attackerName, row.move)}</span>
        {row.hitbox && (
          <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitbox}]
          </span>
        )}
      </div>

      {/* Shield safety + Tumble % — grouped in a flex row on mobile */}
      <div className="move-row-badges" style={{ textAlign: 'center' }}>
        {row.shieldSafety?.isProjectile
          ? <ProjectileBadge stun={row.shieldSafety.min} />
          : row.shieldSafety?.isStun
            ? <StunBadge stun={row.shieldSafety.min} />
            : <ShieldBadge value={row.shieldSafety} color={statusColor} />}
      </div>
      <div className="move-row-badges" style={{ textAlign: 'center' }}>
        <TumbleBadge row={row} defenderName={defenderName} />
      </div>

      {/* Punishes */}
      <div>
        {row.punishes && row.punishes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {(oosFilter && oosFilter.size > 0
              ? row.punishes.filter(p => oosFilter.has(p.move))
              : row.punishes
            ).map((p, i) => (
              <span key={i} style={{
                padding: '1px 7px',
                borderRadius: '4px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '0.72rem',
                color: 'var(--text)',
                whiteSpace: 'nowrap',
              }}>
                {p.label} <span style={{ color: 'var(--muted)' }}>{p.oosStartup}f</span>
              </span>
            ))}
          </div>
        ) : (
          row.isPunishable
            ? <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>No OOS option fast enough</span>
            : null
        )}
      </div>
    </div>
  )
}

const TUMBLE_EARLY_COLOR  = '#00CED1'  // cyan   ≤40%
const TUMBLE_MEDIUM_COLOR = '#F0E442'  // yellow ≤80%
const TUMBLE_HIGH_COLOR   = '#DA70D6'  // orchid ≤130%

function getTumbleNum(row, defKey) {
  if (defKey && row.perCharacterTumble?.[defKey] !== undefined) return row.perCharacterTumble[defKey]
  if (row.tumblePercent) return Math.round((row.tumblePercent.min + row.tumblePercent.max) / 2)
  return null
}

function CategoryAccordion({ category, rows, attackerName, defenderName, oosFilter }) {
  const [open, setOpen] = useState(true)
  const [sortBy, setSortBy] = useState('shield')   // 'move' | 'shield' | 'tumble'
  const [sortDir, setSortDir] = useState(1)         // 1 = default asc/desc per column, flipped on click

  const safe      = rows.filter(r => r.isSafe).length
  const risky     = rows.filter(r => r.isRisky).length
  const punishable = rows.filter(r => r.isPunishable).length

  const defKey = defenderName ? defenderName.toUpperCase() : null
  // Count each hitbox row individually — matches exactly what's shown in the table
  const tumbleCounts = useMemo(() => {
    const vals = rows.map(r => getTumbleNum(r, defKey)).filter(t => t !== null)
    return {
      early:  vals.filter(t => t <= 40).length,
      medium: vals.filter(t => t > 40 && t <= 80).length,
      high:   vals.filter(t => t > 80 && t <= 130).length,
    }
  }, [rows, defKey])

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir(d => -d)
    } else {
      setSortBy(col)
      // Default directions: move=asc(1), shield=desc best-first(-1), tumble=asc lowest-first(1)
      setSortDir(col === 'shield' ? -1 : 1)
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'move') {
        cmp = a.move.localeCompare(b.move)
      } else if (sortBy === 'shield') {
        cmp = (a.shieldSafety?.max ?? -999) - (b.shieldSafety?.max ?? -999)
      } else if (sortBy === 'tumble') {
        const getT = r => getTumbleNum(r, defKey) ?? 9999
        cmp = getT(a) - getT(b)
      }
      return cmp * sortDir
    })
  }, [rows, sortBy, sortDir, defKey])

  function SortHeader({ col, label, align }) {
    const active = sortBy === col
    const arrow = active ? (sortDir > 0 ? ' ▲' : ' ▼') : ' ↕'
    return (
      <button
        onClick={() => handleSort(col)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: active ? 'var(--text)' : 'var(--muted)',
          textAlign: align || 'left',
          width: '100%',
        }}
      >
        {label}<span style={{ opacity: active ? 1 : 0.45 }}>{arrow}</span>
      </button>
    )
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Accordion header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          background: 'var(--surface)',
          border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text)',
          flex: 1,
        }}>
          {category}
        </span>
        <div className="accordion-counts">
          {/* Row 1: shield safety */}
          <div className="accordion-counts-row">
            <span style={{ color: SAFE_COLOR, fontSize: '0.72rem' }}>{safe} safe</span>
            <span style={{ color: RISKY_COLOR, fontSize: '0.72rem' }}>{risky} risky</span>
            <span style={{ color: PUNISH_COLOR, fontSize: '0.72rem' }}>{punishable} punishable</span>
          </div>
          {/* Row 2: KD tiers (only if any exist) */}
          {(tumbleCounts.early > 0 || tumbleCounts.medium > 0 || tumbleCounts.high > 0) && (<>
            <span className="accordion-counts-divider">|</span>
            <div className="accordion-counts-row">
              {tumbleCounts.early  > 0 && <span style={{ color: TUMBLE_EARLY_COLOR,  fontSize: '0.72rem' }}>{tumbleCounts.early} early KD</span>}
              {tumbleCounts.medium > 0 && <span style={{ color: TUMBLE_MEDIUM_COLOR, fontSize: '0.72rem' }}>{tumbleCounts.medium} mid KD</span>}
              {tumbleCounts.high   > 0 && <span style={{ color: TUMBLE_HIGH_COLOR,   fontSize: '0.72rem' }}>{tumbleCounts.high} high KD</span>}
            </div>
          </>)}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginLeft: '4px', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ background: 'var(--surface)' }}>
          {/* Column headers */}
          <div className="col-headers">
            <SortHeader col="move" label="Move" />
            <SortHeader col="shield" label="On Shield" align="center" />
            <SortHeader col="tumble" label="Tumble %" align="center" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Punish Options</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.6 }}>Shield release 12f · Jump squat 4f</span>
            </div>
          </div>
          {sorted.map((row, i) => <MoveRow key={i} row={row} attackerName={attackerName} defenderName={defenderName} oosFilter={oosFilter} />)}
        </div>
      )}
    </div>
  )
}

/* ── OOS Filter Bar ── */
const OOS_FILTER_GROUPS = ['Aerials', 'Normals', 'Strongs', 'Specials', 'Misc']

function OOSFilterBar({ defenderOOS, oosFilter, setOosFilter, defenderName, defenderColor, relevantOOSMoves }) {
  const [modalOpen, setModalOpen] = useState(false)
  const modalRef = useRef(null)

  // Close modal on outside click
  useEffect(() => {
    if (!modalOpen) return
    function handleClick(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) setModalOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [modalOpen])

  function toggle(moveName) {
    setOosFilter(prev => {
      const next = new Set(prev)
      if (next.has(moveName)) next.delete(moveName)
      else next.add(moveName)
      return next
    })
  }

  function clearAll() { setOosFilter(new Set()) }

  const activeCount = oosFilter.size

  // Group options by move category (Wavedash handled separately)
  const grouped = useMemo(() => {
    const map = {}
    OOS_FILTER_GROUPS.forEach(g => { map[g] = [] })
    defenderOOS.forEach(opt => {
      if (opt.move === 'Wavedash') return
      const cat = getCategory(opt.move)
      if (map[cat]) map[cat].push(opt)
      else map['Misc'].push(opt)
    })
    return map
  }, [defenderOOS])

  const wavedashOpt = defenderOOS.find(o => o.move === 'Wavedash')

  function renderGroup(groupName, opts, inModal = false) {
    if (!opts.length) return null
    const visibleOpts = relevantOOSMoves ? opts.filter(o => relevantOOSMoves.has(o.move)) : opts
    if (!visibleOpts.length) return null
    const groupActive = opts.filter(o => oosFilter.has(o.move)).length
    return (
      <div key={groupName} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Group label */}
        <span style={{
          fontSize: inModal ? '0.75rem' : '0.68rem',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
          color: groupActive > 0 ? 'var(--accent2)' : 'var(--muted)',
          paddingTop: inModal ? '8px' : '2px',
        }}>
          {groupName}
          {groupActive > 0 && (
            <span style={{ marginLeft: '6px', background: 'var(--accent2)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.62rem' }}>
              {groupActive}
            </span>
          )}
        </span>
        {/* Chips / items */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: inModal ? '8px' : '6px', paddingLeft: '4px', paddingBottom: '4px' }}>
          {opts.filter(opt => !relevantOOSMoves || relevantOOSMoves.has(opt.move)).map(opt => {
            const active = oosFilter.has(opt.move)
            return inModal ? (
              <label key={opt.move} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', width: '100%', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(opt.move)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent2)', cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text)' }}>{opt.label}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>{opt.oosStartup}f</span>
              </label>
            ) : (
              <button
                key={opt.move}
                onClick={() => toggle(opt.move)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  border: `1px solid ${active ? 'var(--accent2)' : 'var(--border)'}`,
                  background: active ? 'rgba(204,121,167,0.18)' : 'var(--surface)',
                  color: active ? 'var(--accent2)' : 'var(--muted)',
                  fontSize: '0.72rem', fontWeight: active ? 700 : 400, cursor: 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {opt.label} <span style={{ opacity: 0.7 }}>{opt.oosStartup}f</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop: grouped chips */}
      <div className="oos-filter-desktop">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: defenderColor || 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {defenderName}'s Punish Options
          </span>
          {activeCount > 0 && (
            <button onClick={clearAll} style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear ({activeCount})
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {OOS_FILTER_GROUPS.map(g => renderGroup(g, grouped[g] || [], false))}
          {wavedashOpt && renderGroup('Wavedash', [wavedashOpt], false)}
        </div>
      </div>

      {/* Mobile: button + bottom-sheet modal */}
      <div className="oos-filter-mobile">
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '8px',
            border: `1px solid ${activeCount > 0 ? 'var(--accent2)' : 'var(--border)'}`,
            background: activeCount > 0 ? 'rgba(204,121,167,0.18)' : 'var(--surface)',
            color: activeCount > 0 ? 'var(--accent2)' : 'var(--text)',
            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {defenderName}'s Punish Options
          {activeCount > 0 && (
            <span style={{ background: 'var(--accent2)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '0.7rem' }}>
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Bottom-sheet modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div ref={modalRef} style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: '20px 24px 32px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>{defenderName}'s Punish Options</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {activeCount > 0 && (
                  <button onClick={clearAll} style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
                )}
                <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {OOS_FILTER_GROUPS.map(g => renderGroup(g, grouped[g] || [], true))}
            {wavedashOpt && renderGroup('Wavedash', [wavedashOpt], true)}
            <button
              onClick={() => setModalOpen(false)}
              style={{ marginTop: '12px', padding: '12px', borderRadius: '10px', background: 'var(--accent2)', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function BreakdownTable({ matchup, categoryFilter, oosFilter }) {
  const { breakdown } = matchup
  const visibleCategories = categoryFilter && categoryFilter !== 'All'
    ? [categoryFilter]
    : CATEGORY_ORDER

  // Filter rows by selected OOS punish options (empty set = show all)
  function applyOosFilter(rows) {
    if (!oosFilter || oosFilter.size === 0) return rows
    return rows.filter(r =>
      Array.isArray(r.punishes) && r.punishes.some(p => oosFilter.has(p.move))
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {visibleCategories.map(category => {
        const rows = applyOosFilter(breakdown.filter(r => r.category === category))
        if (!rows.length) return null
        return (
          <CategoryAccordion
            key={`${category}-${[...oosFilter].sort().join(',')}`}
            category={category}
            rows={rows}
            attackerName={matchup.attacker}
            defenderName={matchup.defender}
            oosFilter={oosFilter}
          />
        )
      })}
    </div>
  )
}

function BreakdownSection({ matchupVsOpp, matchupVsMe, myChar, oppChar, myOOS, oppOOS, view, setView }) {
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [oosFilter, setOosFilter] = useState(new Set())

  const active = view === 'opp' ? matchupVsOpp : matchupVsMe
  const activeColor = view === 'opp' ? 'var(--accent2)' : 'var(--accent)'
  const label = view === 'opp' ? `${oppChar}'s Attacks` : `${myChar}'s Attacks`

  // When view switches, reset filters
  function switchView(v) {
    setView(v)
    setOosFilter(new Set())
  }

  // Keep filters in sync when view changes externally (from header toggle)
  const prevView = useRef(view)
  useEffect(() => {
    if (prevView.current !== view) {
      setOosFilter(new Set())
      prevView.current = view
    }
  }, [view])

  // Defender's OOS options (what can punish the attacker)
  const defenderOOS = view === 'me' ? oppOOS : myOOS

  // OOS moves that actually appear as punishes in the selected category's rows
  const relevantOOSMoves = useMemo(() => {
    if (!active) return null
    const rows = categoryFilter === 'All'
      ? active.breakdown
      : active.breakdown.filter(r => r.category === categoryFilter)
    const moves = new Set()
    rows.forEach(r => (r.punishes || []).forEach(p => moves.add(p.move)))
    return moves
  }, [active, categoryFilter])

  const categoryTabs = ['All', ...CATEGORY_ORDER.filter(c => c !== 'Misc')]

  return (
    <div>
      {active && (
        <div>
          {/* Section header */}
          <h2 style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 16px 0' }}>
            Attack-Punish Breakdown
          </h2>

          {/* Attacker toggle */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}>
            <ToggleButton active={view === 'me'} color="var(--accent)" onClick={() => switchView('me')}>
              {myChar} Is Attacking
            </ToggleButton>
            <ToggleButton active={view === 'opp'} color="var(--accent2)" onClick={() => switchView('opp')}>
              {oppChar} Is Attacking
            </ToggleButton>
          </div>

          {/* Category tab bar — primary filter */}
          <div style={{ borderTop: '1px solid var(--border)', marginBottom: '16px' }} />
          <div style={{ marginBottom: '4px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: activeColor }}>
              {label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {categoryTabs.map(c => {
              const isActive = categoryFilter === c
              return (
                <button
                  key={c}
                  onClick={() => { setCategoryFilter(c); setOosFilter(new Set()) }}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '20px',
                    border: `1px solid ${isActive ? activeColor : 'var(--border)'}`,
                    background: isActive ? activeColor + '22' : 'var(--surface)',
                    color: isActive ? activeColor : 'var(--muted)',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 700 : 400,
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                    transition: 'all 0.15s',
                  }}
                >
                  {c}
                </button>
              )
            })}
          </div>

          {/* Punish options chips — secondary filter */}
          {defenderOOS.length > 0 && (
            <div style={{ marginBottom: '12px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <OOSFilterBar defenderOOS={defenderOOS} oosFilter={oosFilter} setOosFilter={setOosFilter} defenderName={view === 'me' ? oppChar : myChar} defenderColor={view === 'me' ? 'var(--accent2)' : 'var(--accent)'} relevantOOSMoves={relevantOOSMoves} />
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--border)', marginBottom: '16px' }} />
          <BreakdownTable matchup={active} categoryFilter={categoryFilter} oosFilter={oosFilter} />
        </div>
      )}
    </div>
  )
}

function ToggleButton({ active, color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px',
        borderRadius: 'var(--radius)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        background: active ? color + '22' : 'var(--surface)',
        color: active ? color : 'var(--muted)',
        fontWeight: active ? 700 : 400,
        fontSize: '0.78rem',
        cursor: 'pointer',
        letterSpacing: '0.04em',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function HelpModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>How to Read This</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px' }}
          >✕</button>
        </div>

        {/* Shield Safety + OOS */}
        <div>
          <h3 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
            On Shield Safety &amp; OOS Options
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>
            "Dictates how much faster the attacker can act after the defender, calculated based on context."
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginTop: '8px' }}>
            A <span style={{ color: 'var(--safe)', fontWeight: 600 }}>positive value</span> means the attacker can act before the opponent can, making the move safe.
            A <span style={{ color: 'var(--punish)', fontWeight: 600 }}>negative value</span> means the defender acts first, opening a window to punish.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginTop: '8px' }}>
            Out of Shield (OOS) options have <strong>12 frames</strong> of built-in shield release before a move can come out. The exceptions to this rule are aerials and Up Strong which can be buffered during Jump Squat (adding <strong>4 frames</strong> instead of 12) and grab which has no additional startup frames.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>
            If a move has a shield safety of <strong>−10</strong>, any OOS option with a total startup of <strong>10 frames or fewer</strong> can punish it. The more OOS options that fit inside that window, the more dangerous the move is to throw out.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginTop: '8px' }}>
            Shield safety and OOS options do not account for spaced moves. A move can be negative on hit and still go unpunished if spaced well enough or with enough disjoint.
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
            Definition sourced from{' '}
            <a href="https://dragdown.wiki/wiki/RoA2" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>dragdown.wiki</a>
          </p>
        </div>

        <div style={{ height: '1px', background: 'var(--border)' }} />

        {/* Safe / Risky / Punishable */}
        <div>
          <h3 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
            Safe / Risky / Punishable
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6 }}>
            Each move is classified by how many of the opponent's OOS options can punish it in this specific matchup:
          </p>
          <ul style={{ fontSize: '0.85rem', lineHeight: 1.8, paddingLeft: '16px', marginTop: '6px' }}>
            <li><span style={{ color: 'var(--safe)', fontWeight: 600 }}>Safe</span> — 0 OOS options can punish it.</li>
            <li><span style={{ color: 'var(--risky)', fontWeight: 600 }}>Risky</span> — 1–3 OOS options can punish it.</li>
            <li><span style={{ color: 'var(--punish)', fontWeight: 600 }}>Punishable</span> — 4 or more OOS options can punish it.</li>
          </ul>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>
            These safety categories are matchup-specific. Some characters have faster OOS options than others, so this rating reflects how a move is in the matchup context.
          </p>
        </div>

        <div style={{ height: '1px', background: 'var(--border)' }} />

        {/* Tumble % */}
        <div>
          <h3 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
            Tumble %
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>
            "The percent that sends an opponent into tumble. On floorhug, this can knock down."
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>
            Lower % = the move sends into tumble earlier, making it a safer move on hit and more effective combo starter and extender. The color tiers used here:
          </p>
          <ul style={{ fontSize: '0.82rem', lineHeight: 1.8, paddingLeft: '16px', marginTop: '4px' }}>
            <li><span style={{ color: '#00CED1', fontWeight: 600 }}>Early KD</span> — tumble at ≤40%</li>
            <li><span style={{ color: '#F0E442', fontWeight: 600 }}>Mid KD</span> — tumble at 41–80%</li>
            <li><span style={{ color: '#DA70D6', fontWeight: 600 }}>High KD</span> — tumble at 81–130%</li>
          </ul>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
            Definition sourced from{' '}
            <a href="https://dragdown.wiki/wiki/RoA2" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>dragdown.wiki</a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function MatchupView({ myChar, oppChar, onBack }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [attackerView, setAttackerView] = useState('me')
  const { data: myData,  loading: myLoading  } = useCharacterData(myChar)
  const { data: oppData, loading: oppLoading } = useCharacterData(oppChar)

  const loading = myLoading || oppLoading

  const myOOS  = useMemo(() => myData  ? getOOSOptions(myData)  : [], [myData])
  const oppOOS = useMemo(() => oppData ? getOOSOptions(oppData) : [], [oppData])

  const matchupVsOpp = useMemo(() => {
    if (!oppData || !myData) return null
    return analyzeMatchup(oppData, myData)   // opp attacks, I defend
  }, [myData, oppData])

  const matchupVsMe = useMemo(() => {
    if (!myData || !oppData) return null
    return analyzeMatchup(myData, oppData)   // I attack, opp defends
  }, [myData, oppData])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--muted)' }}>
      Loading frame data...
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Header */}
      <header className="page-header">
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--muted)', borderRadius: 'var(--radius)',
          padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem',
          flexShrink: 0,
        }}>
          ← Back
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: 'var(--accent)' }}>{myChar}</span>
            <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
            <span style={{ color: 'var(--accent2)' }}>{oppChar}</span>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: '2px', lineHeight: 1.6 }}>
            Shield safety &amp; punish analysis
          </p>
        </div>

        <button
          onClick={() => setHelpOpen(true)}
          title="How to read this"
          style={{
            flexShrink: 0,
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            borderRadius: '50%',
            width: '28px', height: '28px',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700,
            lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >?</button>
      </header>

      <main className="page-main">

        {/* Top panels: 2-col grid, each row spans both characters so heights match */}
        {/* On mobile, CSS order groups each character's panels together */}
        <div className="top-panels-grid">
          {/* Row 1: character headers */}
          <div className="char-col-header-my"><CharColumnHeader name={myChar} accent="var(--accent)" /></div>
          <div className="char-col-header-opp"><CharColumnHeader name={oppChar} accent="var(--accent2)" /></div>

          {/* Row 2: Safest Options — same row height for both */}
          <div className="char-panel-safe-my">
            {myData
              ? <Section title="Safest Options" accent="var(--accent)">
                  <SafestOptionsList charData={myData} defenderOOSOptions={oppOOS} />
                </Section>
              : <div />}
          </div>
          <div className="char-panel-safe-opp">
            {oppData
              ? <Section title="Safest Options" accent="var(--accent2)">
                  <SafestOptionsList charData={oppData} defenderOOSOptions={myOOS} />
                </Section>
              : <div />}
          </div>

          {/* Row 3: OOS Options — same row height for both */}
          <div className="char-panel-oos-my">
            {myData
              ? <Section title="OOS Options" accent="var(--accent)" subtitle="Shield release 12f · Jump squat 4f">
                  <OOSList charData={myData} />
                </Section>
              : <div />}
          </div>
          <div className="char-panel-oos-opp">
            {oppData
              ? <Section title="OOS Options" accent="var(--accent2)" subtitle="Shield release 12f · Jump squat 4f">
                  <OOSList charData={oppData} />
                </Section>
              : <div />}
          </div>
        </div>

        {/* Breakdown tables — toggled */}
        {(matchupVsOpp || matchupVsMe) && (
          <BreakdownSection
            matchupVsOpp={matchupVsOpp}
            matchupVsMe={matchupVsMe}
            myChar={myChar}
            oppChar={oppChar}
            myOOS={myOOS}
            oppOOS={oppOOS}
            view={attackerView}
            setView={setAttackerView}
          />
        )}

      </main>

      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '14px 32px',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        <span>
          Created by{' '}
          <a
            href="https://x.com/boi_jir0"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
          >
            @boi_jiro
          </a>
        </span>
        <span>
          All frame data and definitions sourced from{' '}
          <a
            href="https://dragdown.wiki/wiki/RoA2"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}
          >
            dragdown.wiki
          </a>.
        </span>
        <span>
          Have a bug fix, feature suggestion, or general feedback? Please feel free to fill out{' '}
          <a
            href="https://forms.gle/7uZnA3EzMN2k19WA9"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}
          >
            this form
          </a>.
        </span>
      </footer>
    </div>
  )
}
