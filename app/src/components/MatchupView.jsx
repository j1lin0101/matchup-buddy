import { useMemo, useState, useCallback } from 'react'
import { useCharacterData } from '../hooks/useMatchupData'
import { getSafestOptions, getOOSOptions, analyzeMatchup, CATEGORY_ORDER, getCategory } from '../analysis/analysis'
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

function Section({ title, accent, children }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: accent,
      }}>
        {title}
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
    </div>
  )
}

function SafestOptionsList({ charData, defenderOOSOptions }) {
  const options = useMemo(
    () => getSafestOptions(charData, defenderOOSOptions)
      .filter(o => (o.punishCount ?? 0) === 0 && getCategory(o.move) !== 'Misc'),
    [charData, defenderOOSOptions]
  )
  if (!options.length) return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No safe moves found.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {options.map((o, i) => {
        const punishCount = o.punishCount ?? 0
        const tagColor = 'var(--safe)'
        const tagLabel = 'SAFE'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.83rem' }}>
            <span style={{
              display: 'inline-block', padding: '1px 6px', borderRadius: '4px',
              background: tagColor + '22', color: tagColor,
              border: `1px solid ${tagColor}44`, fontSize: '0.68rem', fontWeight: 700,
              whiteSpace: 'nowrap', minWidth: '56px', textAlign: 'center',
            }}>{tagLabel}</span>
            <span style={{ fontWeight: 600 }}>{getDisplayName(charData.character, o.move)}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>[{o.hitbox}]</span>
          </div>
        )
      })}
    </div>
  )
}

function OOSList({ charData }) {
  const options = useMemo(() => getOOSOptions(charData).slice(0, 5), [charData])
  if (!options.length) return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No OOS data.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'var(--accent)22',
            color: 'var(--accent)',
            border: '1px solid var(--accent)44',
            fontSize: '0.75rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            minWidth: '48px',
            textAlign: 'center',
          }}>
            {o.oosStartup}f
          </span>
          <span style={{ fontWeight: 600 }}>{o.label}</span>
          {o.jumpCancel && (
            <span style={{ color: 'var(--accent2)', fontSize: '0.7rem', fontWeight: 600 }}>JC</span>
          )}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
        <span style={gBadge.style}>Grounded {gBadge.str}</span>
        <span style={aBadge.style}>Aerial {aBadge.str}</span>
      </div>
    )
  }

  return <span style={gBadge.style}>{gBadge.str}</span>
}

function MoveRow({ row, attackerName, defenderName }) {
  const statusColor = row.isSafe ? SAFE_COLOR : row.isRisky ? RISKY_COLOR : PUNISH_COLOR

  return (
    <div style={{
      padding: '10px 16px',
      borderBottom: '1px solid var(--border)',
      display: 'grid',
      gridTemplateColumns: '1fr 120px 90px 1fr',
      gap: '12px',
      alignItems: 'start',
      fontSize: '0.82rem',
    }}>
      {/* Move + hitbox */}
      <div>
        <span style={{ fontWeight: 600 }}>{getDisplayName(attackerName, row.move)}</span>
        {row.hitbox && (
          <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitbox}]
          </span>
        )}
      </div>

      {/* Shield safety */}
      <div style={{ textAlign: 'center' }}>
        <ShieldBadge value={row.shieldSafety} color={statusColor} />
      </div>

      {/* Tumble % */}
      <div style={{ textAlign: 'center' }}>
        <TumbleBadge row={row} defenderName={defenderName} />
      </div>

      {/* Punishes */}
      <div>
        {row.punishes && row.punishes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {row.punishes.map((p, i) => (
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

function CategoryAccordion({ category, rows, attackerName, defenderName }) {
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
        <span style={{ color: SAFE_COLOR, fontSize: '0.72rem' }}>{safe} safe</span>
        <span style={{ color: RISKY_COLOR, fontSize: '0.72rem' }}>{risky} risky</span>
        <span style={{ color: PUNISH_COLOR, fontSize: '0.72rem' }}>{punishable} punishable</span>
        <span style={{ width: '1px', height: '12px', background: 'var(--border)', margin: '0 4px' }} />
        {tumbleCounts.early  > 0 && <span style={{ color: TUMBLE_EARLY_COLOR,  fontSize: '0.72rem' }}>{tumbleCounts.early} early KD</span>}
        {tumbleCounts.medium > 0 && <span style={{ color: TUMBLE_MEDIUM_COLOR, fontSize: '0.72rem' }}>{tumbleCounts.medium} mid KD</span>}
        {tumbleCounts.high   > 0 && <span style={{ color: TUMBLE_HIGH_COLOR,   fontSize: '0.72rem' }}>{tumbleCounts.high} high KD</span>}
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginLeft: '4px' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ background: 'var(--surface)' }}>
          {/* Column headers */}
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: '1fr 120px 90px 1fr',
            gap: '12px',
          }}>
            <SortHeader col="move" label="Move" />
            <SortHeader col="shield" label="On Shield" align="center" />
            <SortHeader col="tumble" label="Tumble %" align="center" />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Punish Options</span>
          </div>
          {sorted.map((row, i) => <MoveRow key={i} row={row} attackerName={attackerName} defenderName={defenderName} />)}
        </div>
      )}
    </div>
  )
}

function BreakdownTable({ matchup }) {
  const { breakdown } = matchup

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {CATEGORY_ORDER.map(category => {
        const rows = breakdown.filter(r => r.category === category)
        if (!rows.length) return null
        return (
          <CategoryAccordion
            key={category}
            category={category}
            rows={rows}
            attackerName={matchup.attacker}
            defenderName={matchup.defender}
          />
        )
      })}
    </div>
  )
}

function BreakdownSection({ matchupVsOpp, matchupVsMe, myChar, oppChar }) {
  const [view, setView] = useState('me') // 'me' = I attack opp, 'opp' = opp attacks me

  const active = view === 'opp' ? matchupVsOpp : matchupVsMe
  const activeColor = view === 'opp' ? 'var(--accent2)' : 'var(--accent)'
  const label = view === 'opp'
    ? `${oppChar} attacking`
    : `${myChar} attacking`

  return (
    <div>
      {/* Toggle — my char first */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <ToggleButton active={view === 'me'} color="var(--accent)" onClick={() => setView('me')}>
          {myChar} attacking
        </ToggleButton>
        <ToggleButton active={view === 'opp'} color="var(--accent2)" onClick={() => setView('opp')}>
          {oppChar} attacking
        </ToggleButton>
      </div>

      {active && (
        <div>
          <h2 style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: activeColor, marginBottom: '12px' }}>
            {label}
          </h2>
          <BreakdownTable matchup={active} />
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

export default function MatchupView({ myChar, oppChar, onBack }) {
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
      {/* Header */}
      <header style={{ padding: '20px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--muted)', borderRadius: 'var(--radius)',
          padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem',
        }}>
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            <span style={{ color: 'var(--accent)' }}>{myChar}</span>
            <span style={{ color: 'var(--muted)', margin: '0 10px' }}>vs</span>
            <span style={{ color: 'var(--accent2)' }}>{oppChar}</span>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '2px' }}>
            Shield safety &amp; punish analysis · Shield release {matchupVsOpp?.shieldRelease}f · Jump squat 4f
          </p>
        </div>
      </header>

      <main style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1300px', width: '100%', margin: '0 auto' }}>

        {/* Top row: player first, then opponent */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
          {myData && (
            <Section title={`${myChar}'s Safe Options on Shield`} accent="var(--accent)">
              <SafestOptionsList charData={myData} defenderOOSOptions={oppOOS} />
            </Section>
          )}
          {myData && (
            <Section title={`${myChar} OOS Options`} accent="var(--accent)">
              <OOSList charData={myData} />
            </Section>
          )}
          {oppData && (
            <Section title={`${oppChar}'s Safe Options on Shield`} accent="var(--accent2)">
              <SafestOptionsList charData={oppData} defenderOOSOptions={myOOS} />
            </Section>
          )}
          {oppData && (
            <Section title={`${oppChar} OOS Options`} accent="var(--accent2)">
              <OOSList charData={oppData} />
            </Section>
          )}
        </div>

        {/* Breakdown tables — toggled */}
        {(matchupVsOpp || matchupVsMe) && (
          <BreakdownSection
            matchupVsOpp={matchupVsOpp}
            matchupVsMe={matchupVsMe}
            myChar={myChar}
            oppChar={oppChar}
          />
        )}

      </main>
    </div>
  )
}
