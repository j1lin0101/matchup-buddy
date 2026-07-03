import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useCharacterData } from '../hooks/useMatchupData'
import { getSafestOptions, getOOSOptions, getDisplayOOSOptions, analyzeMatchup, CATEGORY_ORDER, getCategory, getFloorhugBreakers, getOnHitBreakdown, analyzePerfectShieldMatchup, getPerfectShieldOOSOptions } from '../analysis/analysis'
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
          width: '220px', zIndex: 100,
          pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </span>
  )
}

function Section({ title, accent, subtitle, tooltip, children }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent }}>
            {title}
          </span>
          {tooltip && <TooltipIcon text={tooltip} />}
        </div>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{getDisplayName(charData.character, o.move)}</span>
              <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>[{o.hitbox}]</span>
            </div>
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

function FloorhugList({ charData, accent }) {
  const moves = useMemo(() => getFloorhugBreakers(charData), [charData])
  if (!moves.length) return <p style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '10px 16px' }}>No data.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {moves.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600, flex: 1 }}>
            {m.move}
            {m.hitbox && <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: '6px' }}>[{m.hitbox}]</span>}
          </span>
          {m.aerialTumble != null && (() => {
            const { min, max } = m.aerialTumble
            const label = max === 0
              ? 'Always Amsah Techable'
              : `Amsah Tech ≤ ${min}%`
            return (
              <span style={{
                display: 'inline-block',
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'var(--risky)22',
                color: 'var(--risky)',
                border: '1px solid var(--risky)44',
                fontSize: '0.68rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {label}
              </span>
            )
          })()}
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

function MoveRow({ row, attackerName, defenderName, oosFilter, simplified }) {
  const statusColor = row.isSafe ? SAFE_COLOR : row.isRisky ? RISKY_COLOR : PUNISH_COLOR

  return (
    <div className={`move-row${simplified ? ' simplified' : ''}`}>
      {/* Move + hitbox */}
      <div>
        <span style={{ fontWeight: 600, color: statusColor }}>{getDisplayName(attackerName, row.move)}</span>
        {row.hitbox && (
          <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitbox}]
          </span>
        )}
      </div>

      {/* Shield safety */}
      {!simplified && (
        <div className="move-row-badges" style={{ textAlign: 'center' }}>
          {row.shieldSafety?.isProjectile
            ? <ProjectileBadge stun={row.shieldSafety.min} />
            : row.shieldSafety?.isStun
              ? <StunBadge stun={row.shieldSafety.min} />
              : <ShieldBadge value={row.shieldSafety} color={statusColor} />}
        </div>
      )}

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

function CategoryAccordion({ category, rows, attackerName, defenderName, oosFilter, isPerfectShield, simplified }) {
  const [open, setOpen] = useState(true)
  const [sortBy, setSortBy] = useState('shield')   // 'move' | 'shield'
  const [sortDir, setSortDir] = useState(1)

  const safe      = rows.filter(r => r.isSafe).length
  const risky     = rows.filter(r => r.isRisky).length
  const punishable = rows.filter(r => r.isPunishable).length

  const defKey = defenderName ? defenderName.toUpperCase() : null

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
      }
      return cmp * sortDir
    })
  }, [rows, sortBy, sortDir])

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
          <div className="accordion-counts-row">
            <span style={{ color: SAFE_COLOR, fontSize: '0.72rem' }}>{safe} safe</span>
            <span style={{ color: RISKY_COLOR, fontSize: '0.72rem' }}>{risky} risky</span>
            <span style={{ color: PUNISH_COLOR, fontSize: '0.72rem' }}>{punishable} punishable</span>
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginLeft: '4px', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ background: 'var(--surface)' }}>
          {/* Column headers */}
          <div className={`col-headers${simplified ? ' simplified' : ''}`}>
            <SortHeader col="move" label="Move" />
            {!simplified && <SortHeader col="shield" label="On Shield" align="center" />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Punish Options</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.6 }}>
                {isPerfectShield ? 'Grounded only · No shield release' : 'Shield release 12f · Jump squat 4f'}
              </span>
            </div>
          </div>
          {sorted.map((row, i) => <MoveRow key={i} row={row} attackerName={attackerName} defenderName={defenderName} oosFilter={oosFilter} simplified={simplified} />)}
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
          <div ref={modalRef} style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{defenderName}'s Punish Options</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {activeCount > 0 && (
                  <button onClick={clearAll} style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
                )}
                <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'scroll', padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {OOS_FILTER_GROUPS.map(g => renderGroup(g, grouped[g] || [], true))}
              {wavedashOpt && renderGroup('Wavedash', [wavedashOpt], true)}
            </div>
            {/* Fixed apply button */}
            <div style={{ padding: '12px 24px 28px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'var(--accent2)', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── On Hit Components ── */

function OnHitAdvBadge({ adv }) {
  if (adv === null) return <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>
  const color = adv > 0 ? SAFE_COLOR : adv >= -3 ? RISKY_COLOR : PUNISH_COLOR
  const label = `${adv > 0 ? '+' : ''}${adv}`
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

function OnHitRow({ row, attackerName, defenderName, defKey, pct, simplified }) {
  const amsahThreshold = row.alwaysBreaks ? getRowThreshold(row, defKey, true) : null
  const canAmsah = amsahThreshold != null && pct < amsahThreshold

  const moveColor = row.breaksFloorhug
    ? SAFE_COLOR
    : row.flugAdvantage == null
      ? 'var(--text)'
      : row.flugAdvantage > 0 ? SAFE_COLOR : row.flugAdvantage >= -3 ? RISKY_COLOR : PUNISH_COLOR

  const advCell = row.breaksFloorhug
    ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
          background: 'var(--safe)22', color: 'var(--safe)',
          border: '1px solid var(--safe)44', fontSize: '0.72rem', fontWeight: 700,
        }}>Knockdown</span>
        {canAmsah && (
          <span style={{
            display: 'inline-block', padding: '1px 6px', borderRadius: '4px',
            background: 'var(--risky)22', color: 'var(--risky)',
            border: '1px solid var(--risky)44', fontSize: '0.65rem', fontWeight: 700,
          }}>Amsah Tech</span>
        )}
      </div>
    : <OnHitAdvBadge adv={row.flugAdvantage} />

  return (
    <div className={`on-hit-row${simplified ? ' simplified' : ''}`}>
      <div>
        <span style={{ fontWeight: 600, color: moveColor }}>{getDisplayName(attackerName, row.move)}</span>
        {row.hitbox && (
          <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitbox}]
          </span>
        )}
      </div>
      {!simplified && <div style={{ textAlign: 'center' }}>{advCell}</div>}
      {!simplified && (
        <div style={{ textAlign: 'center' }}>
          <TumbleBadge row={row} defenderName={defenderName} />
        </div>
      )}
      <div>
        {!row.breaksFloorhug && row.punishes && row.punishes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {row.punishes.map((p, i) => (
              <span key={i} style={{
                padding: '1px 7px', borderRadius: '4px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                fontSize: '0.72rem', color: 'var(--text)', whiteSpace: 'nowrap',
              }}>
                {p.label} <span style={{ color: 'var(--muted)' }}>{p.onHitStartup}f</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function getRowThreshold(row, defKey, includeAlwaysBreaks = false) {
  if (row.alwaysBreaks && !includeAlwaysBreaks) return null
  if (!row.tumblePercent) return null
  const upper = defKey?.toUpperCase()
  if (upper && row.perCharacterTumble?.[upper] !== undefined) return row.perCharacterTumble[upper]
  return row.tumblePercent.min
}

function OnHitTable({ attackerData, defenderData, pct, isCrouch, defenderName, categoryFilter, oosFilter, simplified }) {
  const defKey = defenderData?.character
  const breakdown = useMemo(
    () => getOnHitBreakdown(attackerData, defenderData, pct, isCrouch),
    [attackerData, defenderData, pct, isCrouch]
  )
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState(1)

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => -d)
    else { setSortCol(col); setSortDir(1) }
  }

  function sortRows(rows) {
    if (!sortCol) return rows
    return [...rows].sort((a, b) => {
      let av, bv
      if (sortCol === 'move') {
        av = a.move || ''; bv = b.move || ''
        return av.localeCompare(bv) * sortDir
      } else if (sortCol === 'adv') {
        av = a.breaksFloorhug ? Infinity : (a.flugAdvantage ?? -Infinity)
        bv = b.breaksFloorhug ? Infinity : (b.flugAdvantage ?? -Infinity)
      } else if (sortCol === 'tumble') {
        av = getRowThreshold(a, defKey, true) ?? Infinity
        bv = getRowThreshold(b, defKey, true) ?? Infinity
      }
      return (av - bv) * sortDir
    })
  }

  const filtered = useMemo(() => {
    let rows = breakdown
    if (categoryFilter && categoryFilter !== 'All') {
      rows = rows.filter(r => r.category === categoryFilter)
    }
    if (oosFilter && oosFilter.size > 0) {
      rows = rows.filter(r => Array.isArray(r.punishes) && r.punishes.some(p => oosFilter.has(p.move)))
    }
    return rows
  }, [breakdown, categoryFilter, oosFilter])

  const byCategory = CATEGORY_ORDER
    .map(cat => ({ cat, rows: filtered.filter(r => r.category === cat) }))
    .filter(({ rows }) => rows.length > 0)

  if (!breakdown.length) return (
    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '16px' }}>No on-hit data available.</p>
  )

  function ColHeader({ col, label, style }) {
    const active = sortCol === col
    const arrow = active ? (sortDir > 0 ? ' ▲' : ' ▼') : ' ↕'
    return (
      <span
        onClick={() => handleSort(col)}
        style={{
          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: active ? 'var(--accent)' : 'var(--muted)',
          cursor: 'pointer', userSelect: 'none',
          ...style,
        }}
      >
        {label}<span style={{ opacity: active ? 1 : 0.4 }}>{arrow}</span>
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {byCategory.map(({ cat, rows }) => {
        const earlyKD = rows.filter(r => { const t = getRowThreshold(r, defKey); return t != null && t <= 40 }).length
        const midKD   = rows.filter(r => { const t = getRowThreshold(r, defKey); return t != null && t > 40 && t <= 80 }).length
        const highKD  = rows.filter(r => { const t = getRowThreshold(r, defKey); return t != null && t > 80 }).length
        const safe       = rows.filter(r => r.breaksFloorhug || (r.flugAdvantage != null && r.flugAdvantage > 0)).length
        const risky      = rows.filter(r => !r.breaksFloorhug && r.flugAdvantage != null && r.flugAdvantage <= 0 && r.flugAdvantage >= -3).length
        const punishable = rows.filter(r => !r.breaksFloorhug && r.flugAdvantage != null && r.flugAdvantage < -3).length
        const sortedRows = sortRows(rows)
        return (
        <div key={cat} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text)' }}>
              {cat}
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
          </div>
          {/* Column headers */}
          <div className={`on-hit-col-headers${simplified ? ' simplified' : ''}`}>
            <ColHeader col="move" label="Move" />
            {!simplified && <ColHeader col="adv" label="On Hit" style={{ textAlign: 'center' }} />}
            {!simplified && <ColHeader col="tumble" label="Tumble %" style={{ textAlign: 'center' }} />}
            <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Punish Options</span>
          </div>
          <div style={{ background: 'var(--surface)' }}>
            {sortedRows.map((row, i) => <OnHitRow key={i} row={row} attackerName={attackerData.character} defenderName={defenderName} defKey={defKey} pct={pct} simplified={simplified} />)}
          </div>
        </div>
      )})}
    </div>
  )
}

function BreakdownTable({ matchup, categoryFilter, oosFilter, isPerfectShield, simplified }) {
  const { breakdown } = matchup
  const visibleCategories = categoryFilter && categoryFilter !== 'All'
    ? [categoryFilter]
    : CATEGORY_ORDER

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
            key={`${category}-${[...oosFilter].sort().join(',')}-${isPerfectShield}`}
            category={category}
            rows={rows}
            attackerName={matchup.attacker}
            defenderName={matchup.defender}
            oosFilter={oosFilter}
            isPerfectShield={isPerfectShield}
            simplified={simplified}
          />
        )
      })}
    </div>
  )
}

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
      if (opt.move === 'Wavedash') return
      const cat = getCategory(opt.move)
      if (map[cat]) map[cat].push(opt)
      else map['Misc'].push(opt)
    })
    return map
  }, [defenderOOS])
  const wavedashOpt = defenderOOS.find(o => o.move === 'Wavedash')

  const attackColor = attackerColor
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
            { id: 'attacks', label: `${attackerName}'s Attacks`, color: attackColor, badge: atkActive ? 1 : 0 },
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
                      borderLeft: `3px solid ${isActive ? attackColor : 'transparent'}`,
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {/* Custom radio indicator */}
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${isActive ? attackColor : 'var(--muted)'}`,
                      background: isActive ? attackColor : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0e0e12' }} />}
                    </span>
                    <span style={{ fontSize: '0.88rem', color: isActive ? attackColor : 'var(--text)', fontWeight: isActive ? 700 : 400 }}>
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
              {[...OOS_FILTER_GROUPS, 'Wavedash'].map(g => {
                const opts = g === 'Wavedash'
                  ? (wavedashOpt ? [wavedashOpt] : [])
                  : (grouped[g] || []).filter(o => !relevantOOSMoves || relevantOOSMoves.has(o.move))
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
                          {/* Custom checkbox indicator */}
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
            style={{ width: '100%', padding: '11px', borderRadius: '8px', background: tab === 'punish' ? defenderColor : attackColor, border: 'none', color: '#0e0e12', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

const TOOLBAR_H = '32px'

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

// A group of options rendered as one self-contained bordered unit, with a divider
// between each segment inside it.
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

// A thin vertical rule placed between separate toolbar units. Hidden on mobile,
// where the toolbar stacks vertically instead (see .toolbar-row in index.css).
function ToolbarDivider() {
  return <div className="toolbar-divider" style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border)' }} />
}

function BreakdownSection({ matchupVsOpp, matchupVsMe, myChar, oppChar, myOOS, oppOOS, view, myData, oppData }) {
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [oosFilter, setOosFilter] = useState(new Set())
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [subTab, setSubTab] = useState('onShield')
  const [shieldMode, setShieldMode] = useState('normal')
  const [viewMode, setViewMode] = useState('expanded')
  const [pct, setPct] = useState(0)
  const [isCrouch, setIsCrouch] = useState(false)
  const simplified = viewMode === 'simplified'

  const active = view === 'opp' ? matchupVsOpp : matchupVsMe
  const activeColor = view === 'opp' ? 'var(--accent2)' : 'var(--accent)'
  const label = view === 'opp' ? `${oppChar}'s Attacks` : `${myChar}'s Attacks`

  const attackerData = view === 'opp' ? oppData : myData
  const defenderData = view === 'opp' ? myData : oppData

  // Perfect Shield matchup (computed from raw data)
  const psMatchup = useMemo(() => {
    if (!attackerData || !defenderData) return null
    return analyzePerfectShieldMatchup(attackerData, defenderData)
  }, [attackerData, defenderData])

  const isPerfectShield = subTab === 'onShield' && shieldMode === 'perfect'
  const effectiveMatchup = isPerfectShield ? psMatchup : active

  // Reset filters and sub-tab when tab (view) changes
  const prevView = useRef(view)
  useEffect(() => {
    if (prevView.current !== view) {
      setOosFilter(new Set())
      setCategoryFilter('All')
      setSubTab('onShield')
      setShieldMode('normal')
      prevView.current = view
    }
  }, [view])

  // Reset OOS filter when shield mode changes (different OOS option sets)
  const prevShieldMode = useRef(shieldMode)
  useEffect(() => {
    if (prevShieldMode.current !== shieldMode) {
      setOosFilter(new Set())
      prevShieldMode.current = shieldMode
    }
  }, [shieldMode])

  // Defender's OOS options: PS uses grounded-only set, normal uses standard OOS
  const defenderOOS = useMemo(() => {
    const baseOOS = view === 'me' ? oppOOS : myOOS
    if (!isPerfectShield) return baseOOS
    const defData = view === 'me' ? oppData : myData
    return defData ? getPerfectShieldOOSOptions(defData) : baseOOS
  }, [view, myOOS, oppOOS, isPerfectShield, myData, oppData])

  // OOS moves that actually appear as punishes in the selected category's rows
  const relevantOOSMoves = useMemo(() => {
    if (!effectiveMatchup) return null
    const rows = categoryFilter === 'All'
      ? effectiveMatchup.breakdown
      : effectiveMatchup.breakdown.filter(r => r.category === categoryFilter)
    const moves = new Set()
    rows.forEach(r => (r.punishes || []).forEach(p => moves.add(p.move)))
    return moves
  }, [effectiveMatchup, categoryFilter])

  const categoryTabs = ['All', ...CATEGORY_ORDER.filter(c => c !== 'Misc')]

  const atkActive = categoryFilter !== 'All' ? 1 : 0
  const oosActive = oosFilter.size
  const defenderColor = view === 'me' ? 'var(--accent2)' : 'var(--accent)'
  const anyActive = atkActive > 0 || oosActive > 0

  return (
    <div>
      {/* Sub-tabs + toolbar live in one shared card so they read as a single unit */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '16px', background: 'var(--surface)' }}>
        {/* Sub-tab bar: On Shield / On Hit — the About icon lives here, far right */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'onShield', label: 'On Shield' },
            { id: 'onHit',   label: 'On Hit' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                padding: '10px 20px', background: 'none', border: 'none',
                borderBottom: `2px solid ${subTab === t.id ? activeColor : 'transparent'}`,
                color: subTab === t.id ? activeColor : 'var(--muted)',
                fontWeight: subTab === t.id ? 700 : 400,
                fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
          {effectiveMatchup && (
            <div style={{ marginLeft: 'auto', paddingRight: '16px' }}>
              {subTab === 'onShield' ? <AboutShieldButton /> : <AboutHitButton />}
            </div>
          )}
        </div>

        {/* Toolbar row: view mode, mode-specific controls, filters */}
        {effectiveMatchup && (
              <div className="toolbar-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '10px 16px' }}>
                {/* View mode icon toggle */}
                <SegmentedToggle
                  activeColor={activeColor}
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: 'simplified', icon: <SimplifiedIcon />, title: 'Simplified — Move and Punish Options only' },
                    { value: 'expanded', icon: <ExpandedIcon />, title: 'Expanded — all columns' },
                  ]}
                />

                <ToolbarDivider />

                {subTab === 'onShield' ? (
                  <SegmentedToggle
                    activeColor="var(--accent)"
                    value={shieldMode}
                    onChange={setShieldMode}
                    options={[
                      { value: 'normal', label: 'Normal Shield' },
                      { value: 'perfect', label: 'Perfect Shield' },
                    ]}
                  />
                ) : (
                  <>
                    <div className="defender-input-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
                        Defender
                      </span>
                      <input
                        type="number"
                        min={0} max={999} step={1}
                        value={pct}
                        onChange={e => {
                          const v = Math.max(0, Math.min(999, Number(e.target.value) || 0))
                          setPct(v)
                        }}
                        className="defender-input"
                        style={{
                          width: '56px', height: '22px', padding: '0 8px', borderRadius: '6px',
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text)', fontSize: '0.82rem', fontWeight: 700,
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)' }}>%</span>
                    </div>

                    <ToolbarDivider />

                    <SegmentedToggle
                      activeColor="var(--accent)"
                      value={isCrouch}
                      onChange={setIsCrouch}
                      options={[
                        { value: false, label: 'Floorhug' },
                        { value: true, label: 'Crouch Cancel' },
                      ]}
                    />
                  </>
                )}

                <ToolbarDivider />

                <button
                  onClick={() => setFilterModalOpen(true)}
                  className="toolbar-filters-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    height: TOOLBAR_H, padding: '0 16px', borderRadius: 'var(--radius)',
                    border: `1px solid ${anyActive ? 'var(--text)' : 'var(--border)'}`,
                    background: anyActive ? activeColor + '18' : 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  <span>⚙ Filters</span>
                  {atkActive > 0 && (
                    <span style={{
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: activeColor, color: '#0e0e12',
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
        )}
      </div>

      {effectiveMatchup && filterModalOpen && (
        <FilterModal
          attackerName={view === 'me' ? myChar : oppChar}
          attackerColor={activeColor}
          defenderName={view === 'me' ? oppChar : myChar}
          defenderColor={view === 'me' ? 'var(--accent2)' : 'var(--accent)'}
          categoryTabs={categoryTabs}
          categoryFilter={categoryFilter}
          setCategoryFilter={v => { setCategoryFilter(v); setOosFilter(new Set()) }}
          defenderOOS={defenderOOS}
          oosFilter={oosFilter}
          setOosFilter={setOosFilter}
          relevantOOSMoves={relevantOOSMoves}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      {subTab === 'onHit' && attackerData && defenderData && (
        <OnHitTable
          attackerData={attackerData}
          defenderData={defenderData}
          pct={pct}
          isCrouch={isCrouch}
          defenderName={defenderData.character}
          categoryFilter={categoryFilter}
          oosFilter={oosFilter}
          simplified={simplified}
        />
      )}

      {subTab === 'onShield' && effectiveMatchup && (
        <BreakdownTable matchup={effectiveMatchup} categoryFilter={categoryFilter} oosFilter={oosFilter} isPerfectShield={isPerfectShield} simplified={simplified} />
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

const ON_SHIELD_INFO = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>
        "Dictates how much faster the attacker can act after the defender, calculated based on context."
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginTop: '8px' }}>
        A <span style={{ color: 'var(--safe)', fontWeight: 600 }}>positive value</span> means the attacker can act before the opponent, making the move safe on shield.
        A <span style={{ color: 'var(--punish)', fontWeight: 600 }}>negative value</span> means the defender acts first, opening a window to punish.
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginTop: '8px' }}>
        OOS options have <strong>12 frames</strong> of built-in shield release. Aerials and Up Strong buffer during jump squat (<strong>4 frames</strong>). Grab has no extra delay.
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>
        If a move has a shield safety of <strong>-10</strong>, any OOS option with a total startup of <strong>10 frames or fewer</strong> can punish it.
      </p>
    </div>
    <div style={{ height: '1px', background: 'var(--border)' }} />
    <div>
      <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: '6px' }}>Safe / Risky / Punishable</p>
      <ul style={{ fontSize: '0.85rem', lineHeight: 1.8, paddingLeft: '16px' }}>
        <li><span style={{ color: 'var(--safe)', fontWeight: 600 }}>Safe</span> — 0 OOS options can punish it.</li>
        <li><span style={{ color: 'var(--risky)', fontWeight: 600 }}>Risky</span> — 1–3 OOS options can punish it.</li>
        <li><span style={{ color: 'var(--punish)', fontWeight: 600 }}>Punishable</span> — 4+ OOS options can punish it.</li>
      </ul>
    </div>
    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
      Definition sourced from{' '}
      <a href="https://dragdown.wiki/wiki/RoA2" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>dragdown.wiki</a>
    </p>
  </div>
)

const ON_HIT_INFO = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>
        "Floorhugging is a mechanic that uses ASDI to ground airborne opponents. It requires downward ASDI as well as a stick position on the bottom half of the Left Stick."
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginTop: '8px', fontStyle: 'italic' }}>
        "If a crouching character is hit, the initial knockback will be reduced by 20%. This is known as crouch cancelling (CC)."
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>
        Floorhugging that doesn't knock down generates weak landing hitstun, calculated by halving the original hitstun, then capping it between 4–8 frames. If crouch cancelled, it is capped between 4–5 frames.
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginTop: '8px' }}>
        Floorhugging or Crouch Cancelling a move before its tumble value will give the defender a chance to counterattack. Similar to shield safety, we show a +/- value to represent how quickly each player is actionable after the attack is landed.
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>
        A <span style={{ color: 'var(--safe)', fontWeight: 600 }}>positive value</span> means the attacker acts first. A <span style={{ color: 'var(--punish)', fontWeight: 600 }}>negative value</span> means the defender can punish. Strongs and spikes always knock down regardless of %, however, if these moves land before their tumble value, the defending player can still <span style={{ color: 'var(--risky)', fontWeight: 600 }}>Amsah Tech</span>.
      </p>
    </div>
    <div style={{ height: '1px', background: 'var(--border)' }} />
    <div>
      <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: '6px' }}>Tumble %</p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>
        "The percent that sends an opponent into tumble. On floorhug, this can knock down."
      </p>
      <ul style={{ fontSize: '0.82rem', lineHeight: 1.8, paddingLeft: '16px', marginTop: '4px' }}>
        <li><span style={{ color: '#00CED1', fontWeight: 600 }}>Early KD</span> — tumble at ≤40%</li>
        <li><span style={{ color: '#F0E442', fontWeight: 600 }}>Mid KD</span> — tumble at 41–80%</li>
        <li><span style={{ color: '#DA70D6', fontWeight: 600 }}>High KD</span> — tumble at 81–130%</li>
      </ul>
    </div>
    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
      Definition sourced from{' '}
      <a href="https://dragdown.wiki/wiki/RoA2" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>dragdown.wiki</a>
    </p>
  </div>
)

function InfoModal({ title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxWidth: '520px', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const aboutIconStyle = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.35)',
  color: 'var(--text)',
  borderRadius: '50%', width: '22px', height: '22px',
  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1, padding: 0, flexShrink: 0,
}

function AboutShieldButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} style={aboutIconStyle} title="About On Shield Safety">?</button>
      {open && <InfoModal title="About On Shield Safety" onClose={() => setOpen(false)}>{ON_SHIELD_INFO}</InfoModal>}
    </>
  )
}

function AboutHitButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} style={aboutIconStyle} title="About On Hit Analysis">?</button>
      {open && <InfoModal title="About On Hit Analysis" onClose={() => setOpen(false)}>{ON_HIT_INFO}</InfoModal>}
    </>
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

        {/* Video embed */}
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <iframe
            src="https://www.youtube.com/embed/W2QBwcA57y0"
            title="How to read this"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>

        {/* Overview */}
        <div>
          <h3 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
            What is this?
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6 }}>
            MatchupBuddy shows frame data in a matchup context. The Matchup Overview gives a quick snapshot of each character's safest moves, OOS options, and floorhug counterplay. The individual character tabs break down every move with On Shield and On Hit analysis.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: '8px' }}>
            Use the <strong>About</strong> buttons on each tab for detailed explanations of the On Shield and On Hit math. Hover the <strong>?</strong> icons on the overview for quick definitions.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function MatchupView({ myChar, oppChar, onBack }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
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

  const mySlug  = myChar.replace(/ /g, '_')
  const oppSlug = oppChar.replace(/ /g, '_')

  const tabs = [
    { id: 'overview', label: 'Matchup Overview' },
    { id: 'me',  label: `${myChar} Attacking`,  icon: `${import.meta.env.BASE_URL}icons/${mySlug}.png`,  color: 'var(--accent)' },
    { id: 'opp', label: `${oppChar} Attacking`, icon: `${import.meta.env.BASE_URL}icons/${oppSlug}.png`, color: 'var(--accent2)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Header */}
      <header className="page-header">
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--muted)', borderRadius: 'var(--radius)',
          padding: '6px 10px', cursor: 'pointer', fontSize: '1rem',
          flexShrink: 0, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          ←
        </button>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <a
            href="https://ko-fi.com/boi_jiro"
            target="_blank"
            rel="noopener noreferrer"
            title="Support me on Ko-Fi!"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              borderRadius: '6px',
              height: '26px', padding: '0 8px',
              fontSize: '1rem',
              lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none',
            }}
          >☕</a>
          <button
            onClick={() => setHelpOpen(true)}
            title="How to read this"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: '6px',
              height: '26px', padding: '0 10px',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 700,
              lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >Demo</button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="matchup-tabs" style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id
          const color = tab.color || 'var(--text)'
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${isActive ? color : 'transparent'}`,
                color: isActive ? color : 'var(--muted)',
                fontWeight: isActive ? 700 : 400,
                fontSize: '0.82rem',
                cursor: 'pointer',
                letterSpacing: '0.02em',
                transition: 'color 0.15s, border-color 0.15s',
                flex: 1,
              }}
            >
              {tab.icon && (
                <img src={tab.icon} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain', opacity: isActive ? 1 : 0.5 }} />
              )}
              {tab.label}
            </button>
          )
        })}
      </nav>

      <main className="page-main">

        {activeTab === 'overview' && (
          <div className="top-panels-grid">
            <div className="char-col-header-my"><CharColumnHeader name={myChar} accent="var(--accent)" /></div>
            <div className="char-col-header-opp"><CharColumnHeader name={oppChar} accent="var(--accent2)" /></div>

            <div className="char-panel-safe-my">
              {myData
                ? <Section title="Safest Options" accent="var(--accent)" tooltip="Moves with the fewest OOS punish options available to the opponent in this matchup. Positive = attacker acts first. Negative = defender acts first.">
                    <SafestOptionsList charData={myData} defenderOOSOptions={oppOOS} />
                  </Section>
                : <div />}
            </div>
            <div className="char-panel-safe-opp">
              {oppData
                ? <Section title="Safest Options" accent="var(--accent2)" tooltip="Moves with the fewest OOS punish options available to the opponent in this matchup. Positive = attacker acts first. Negative = defender acts first.">
                    <SafestOptionsList charData={oppData} defenderOOSOptions={myOOS} />
                  </Section>
                : <div />}
            </div>

            <div className="char-panel-oos-my">
              {myData
                ? <Section title="OOS Options" accent="var(--accent)" subtitle="Shield release 12f · Jump squat 4f" tooltip="Out of Shield options, sorted by how quickly they can punish. Grounded moves cost 12f of shield release, aerials and Up Strong cost 4f of jump squat, grab has no extra delay.">
                    <OOSList charData={myData} />
                  </Section>
                : <div />}
            </div>
            <div className="char-panel-oos-opp">
              {oppData
                ? <Section title="OOS Options" accent="var(--accent2)" subtitle="Shield release 12f · Jump squat 4f" tooltip="Out of Shield options, sorted by how quickly they can punish. Grounded moves cost 12f of shield release, aerials and Up Strong cost 4f of jump squat, grab has no extra delay.">
                    <OOSList charData={oppData} />
                  </Section>
                : <div />}
            </div>

            {/* Row 4: Floorhug Counterplay */}
            <div className="char-panel-floorhug-my">
              {myData
                ? <Section title="Floorhug Counterplay" accent="var(--accent)" subtitle="Always breaks floorhug" tooltip="Moves that always cause knockdown regardless of percent. The defender cannot floorhug these, but may Amsah Tech if their percent is below the tumble threshold.">
                    <FloorhugList charData={myData} accent="var(--accent)" />
                  </Section>
                : <div />}
            </div>
            <div className="char-panel-floorhug-opp">
              {oppData
                ? <Section title="Floorhug Counterplay" accent="var(--accent2)" subtitle="Always breaks floorhug" tooltip="Moves that always cause knockdown regardless of percent. The defender cannot floorhug these, but may Amsah Tech if their percent is below the tumble threshold.">
                    <FloorhugList charData={oppData} accent="var(--accent2)" />
                  </Section>
                : <div />}
            </div>
          </div>
        )}

        {(activeTab === 'me' || activeTab === 'opp') && (matchupVsOpp || matchupVsMe) && (
          <BreakdownSection
            matchupVsOpp={matchupVsOpp}
            matchupVsMe={matchupVsMe}
            myChar={myChar}
            oppChar={oppChar}
            myOOS={myOOS}
            oppOOS={oppOOS}
            view={activeTab}
            myData={myData}
            oppData={oppData}
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
