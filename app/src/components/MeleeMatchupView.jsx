import { useState, useMemo } from 'react'
import { useCharacterData } from '../hooks/useMatchupData'
import {
  getSafestOptions,
  getDisplayOOSOptions,
  getOOSOptions,
  analyzeMatchup,
  CATEGORY_ORDER,
} from '../analysis/analysisMelee'

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
  const label = value.min === value.max ? `${v > 0 ? '+' : ''}${v}` : `${value.min} to ${value.max}`
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
        const tagLabel = o.shieldSafety.min === v ? fmt(v) : `${fmt(o.shieldSafety.min)} to ${fmt(v)}`
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

function MoveRow({ row }) {
  const statusColor = row.isSafe ? SAFE_COLOR : row.isRisky ? RISKY_COLOR : PUNISH_COLOR
  return (
    <div className="move-row">
      <div>
        <span style={{ fontWeight: 600, color: statusColor }}>{row.move}</span>
        {row.hitbox && (
          <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitbox}]
          </span>
        )}
      </div>
      <div className="move-row-badges" style={{ textAlign: 'center' }}>
        {row.shieldSafety?.isProjectile
          ? <ProjectileBadge stun={row.shieldSafety.min} />
          : <ShieldBadge value={row.shieldSafety} color={statusColor} />}
      </div>
      <div>
        {row.punishes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {row.punishes.map((p, i) => (
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

function CategoryAccordion({ category, rows }) {
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
          <div className="col-headers">
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Move</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center' }}>On Shield</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Punish Options</span>
          </div>
          {sorted.map((row, i) => <MoveRow key={i} row={row} />)}
        </div>
      )}
    </div>
  )
}

function BreakdownTable({ matchup }) {
  const byCategory = CATEGORY_ORDER
    .map(category => ({ category, rows: matchup.breakdown.filter(r => r.category === category) }))
    .filter(g => g.rows.length > 0)

  if (!byCategory.length) return <EmptyNote>No move data.</EmptyNote>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {byCategory.map(g => <CategoryAccordion key={g.category} category={g.category} rows={g.rows} />)}
    </div>
  )
}

export default function MeleeMatchupView({ myChar, oppChar, onBack }) {
  const [activeTab, setActiveTab] = useState('overview')
  const { data: myData,  loading: myLoading }  = useCharacterData(myChar, 'ssbm')
  const { data: oppData, loading: oppLoading } = useCharacterData(oppChar, 'ssbm')

  const loading = myLoading || oppLoading

  const myOOS  = useMemo(() => myData  ? getOOSOptions(myData)  : [], [myData])
  const oppOOS = useMemo(() => oppData ? getOOSOptions(oppData) : [], [oppData])

  const matchupVsOpp = useMemo(() => (myData && oppData) ? analyzeMatchup(oppData, myData) : null, [myData, oppData])  // opp attacks, I defend
  const matchupVsMe  = useMemo(() => (myData && oppData) ? analyzeMatchup(myData, oppData) : null, [myData, oppData]) // I attack, opp defends

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
          </div>
        )}

        {activeTab === 'me' && matchupVsMe && <BreakdownTable matchup={matchupVsMe} />}
        {activeTab === 'opp' && matchupVsOpp && <BreakdownTable matchup={matchupVsOpp} />}
      </main>
    </div>
  )
}
