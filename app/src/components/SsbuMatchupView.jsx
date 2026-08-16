import { useState, useMemo } from 'react'
import { useCharacterData } from '../hooks/useMatchupData'
import {
  getDisplayOOSOptions,
  getOOSOptions,
  getSafestOptions,
  analyzeMatchup,
  CATEGORY_ORDER,
} from '../analysis/analysisSsbu'

// Matches the underscore-joined slug convention used for data/icon filenames
// (see scripts/fetch-ssbu-frame-data.js / fetch-ssbu-roster.js).
function nameToSlug(name) {
  return name.replace(/&/g, 'and').replace(/[.]/g, '').replace(/\s+/g, '_')
}

const SAFE_COLOR = 'var(--safe)'
const RISKY_COLOR = 'var(--risky)'
const PUNISH_COLOR = 'var(--punish)'

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>How to Read This</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px' }}
          >✕</button>
        </div>

        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <iframe
            src="https://www.youtube.com/embed/W2QBwcA57y0"
            title="How to read this"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>

        <div>
          <h3 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent2)', marginBottom: '8px' }}>
            What is this?
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6 }}>
            MatchupBuddy shows frame data in a matchup context. The Matchup Overview gives a quick snapshot of each character's safest moves and OOS options. The individual character tabs break down every move's shield safety and who can punish it.
          </p>
        </div>
      </div>
    </div>
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
          width: '240px', zIndex: 100, pointerEvents: 'none',
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
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px', minHeight: '44px', borderBottom: '1px solid var(--border)',
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

function CharColumnHeader({ name, accent }) {
  const slug = nameToSlug(name)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px' }}>
      <img
        src={`${import.meta.env.BASE_URL}icons/ssbu/${slug}.png`}
        alt={name}
        style={{ width: '32px', height: '32px', objectFit: 'contain', flexShrink: 0 }}
      />
      <span style={{ fontSize: '1rem', fontWeight: 700, color: accent, letterSpacing: '0.02em' }}>
        {name}
      </span>
    </div>
  )
}

function EmptyNote({ children }) {
  return <p style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '10px 16px' }}>{children}</p>
}

// Formats an Advantage array (from analysisSsbu — always at least one
// number when present) as a badge label: "+3" for a single positive value,
// "-15/-16" when the source gave multiple hitbox-variant values.
function formatAdvantage(advantage) {
  return advantage.map(v => `${v > 0 ? '+' : ''}${v}`).join('/')
}

function advantageColor(worst) {
  if (worst > 0) return SAFE_COLOR
  if (worst >= -3) return RISKY_COLOR
  return PUNISH_COLOR
}

function AdvantageBadge({ advantage, worst }) {
  const color = advantageColor(worst)
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      background: color + '22', color, border: `1px solid ${color}44`,
      fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {formatAdvantage(advantage)}
    </span>
  )
}

function OOSList({ charData, accent }) {
  const options = useMemo(() => getDisplayOOSOptions(charData), [charData])
  if (!options.length) return <EmptyNote>No OOS data.</EmptyNote>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 600 }}>{o.move}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.72rem', marginLeft: '6px' }}>{o.category}</span>
          </div>
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
            background: accent + '22', color: accent, border: `1px solid ${accent}44`,
            fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{o.oosStartup}f</span>
        </div>
      ))}
    </div>
  )
}

function SafestOptionsList({ charData, defenderOOSOptions }) {
  const options = useMemo(
    () => getSafestOptions(charData, defenderOOSOptions).filter(o => o.worstAdvantage > 0 || (o.punishCount ?? 0) === 0),
    [charData, defenderOOSOptions]
  )
  if (!options.length) return <EmptyNote>No safe moves found.</EmptyNote>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{o.move}</span>
            {o.hitboxLabels && <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>[{o.hitboxLabels.join('/')}]</span>}
          </div>
          <AdvantageBadge advantage={o.advantage} worst={o.worstAdvantage} />
        </div>
      ))}
    </div>
  )
}

function MoveRow({ row, oosFilter, simplified }) {
  const punishes = (oosFilter && oosFilter.size > 0)
    ? row.punishes.filter(p => oosFilter.has(p.move))
    : row.punishes
  const statusColor = advantageColor(row.worstAdvantage)
  return (
    <div className={`move-row${simplified ? ' simplified' : ''}`}>
      <div>
        <span style={{ fontWeight: 600, color: statusColor }}>{row.move}</span>
        {row.hitboxLabels && (
          <span className="hitbox-label" style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '0.75rem' }}>
            [{row.hitboxLabels.join('/')}]
          </span>
        )}
      </div>
      {!simplified && (
        <div className="move-row-badges" style={{ textAlign: 'center' }}>
          <AdvantageBadge advantage={row.advantage} worst={row.worstAdvantage} />
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
                {p.move} <span style={{ color: 'var(--muted)' }}>{p.oosStartup}f</span>
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
  const sorted = useMemo(() => [...rows].sort((a, b) => b.worstAdvantage - a.worstAdvantage), [rows])
  const safe = rows.filter(r => r.isSafe).length
  const risky = rows.filter(r => r.isRisky).length
  const punishable = rows.filter(r => r.isPunishable).length

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

function BreakdownTable({ matchup, simplified }) {
  const byCategory = CATEGORY_ORDER
    .map(category => ({ category, rows: matchup.breakdown.filter(r => r.category === category) }))
    .filter(g => g.rows.length > 0)

  if (!byCategory.length) {
    return <EmptyNote>No move data.</EmptyNote>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {byCategory.map(g => <CategoryAccordion key={g.category} category={g.category} rows={g.rows} simplified={simplified} />)}
    </div>
  )
}

function AttackingView({ attackerData, defenderData, attackerName, attackerColor }) {
  const [simplified, setSimplified] = useState(false)
  const matchup = useMemo(() => analyzeMatchup(attackerData, defenderData), [attackerData, defenderData])

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px', padding: '10px 16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
          <span style={{ color: attackerColor, fontWeight: 700 }}>{attackerName}</span> attacking, on shield
        </span>
        <button
          onClick={() => setSimplified(s => !s)}
          style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text)',
            borderRadius: '6px', height: '28px', padding: '0 12px', cursor: 'pointer',
            fontSize: '0.72rem', fontWeight: 600,
          }}
        >{simplified ? 'Show On Shield column' : 'Simplify'}</button>
      </div>
      <BreakdownTable matchup={matchup} simplified={simplified} />
    </div>
  )
}

export default function SsbuMatchupView({ myChar, oppChar, onBack }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const { data: myData, loading: myLoading } = useCharacterData(myChar, 'ssbu')
  const { data: oppData, loading: oppLoading } = useCharacterData(oppChar, 'ssbu')

  const loading = myLoading || oppLoading

  const myOOS = useMemo(() => myData ? getOOSOptions(myData) : [], [myData])
  const oppOOS = useMemo(() => oppData ? getOOSOptions(oppData) : [], [oppData])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--muted)' }}>
      Loading frame data...
    </div>
  )

  const mySlug = nameToSlug(myChar)
  const oppSlug = nameToSlug(oppChar)

  const tabs = [
    { id: 'overview', label: 'Matchup Overview' },
    { id: 'me', label: `${myChar} Attacking`, icon: `${import.meta.env.BASE_URL}icons/ssbu/${mySlug}.png`, color: 'var(--accent)' },
    { id: 'opp', label: `${oppChar} Attacking`, icon: `${import.meta.env.BASE_URL}icons/ssbu/${oppSlug}.png`, color: 'var(--accent2)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <a
            href="https://ko-fi.com/boi_jiro"
            target="_blank"
            rel="noopener noreferrer"
            title="Support me on Ko-Fi!"
            style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
              borderRadius: '6px', height: '26px', padding: '0 8px', fontSize: '1rem', lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
            }}
          >☕</a>
          <button
            onClick={() => setHelpOpen(true)}
            title="How to read this"
            style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text)',
              borderRadius: '6px', height: '26px', padding: '0 10px', cursor: 'pointer',
              fontSize: '0.72rem', fontWeight: 700, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >Demo</button>
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

      <main className="page-main" style={{ padding: '16px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '900px', margin: '0 auto' }}>
            <CharColumnHeader name={myChar} accent="var(--accent)" />
            <CharColumnHeader name={oppChar} accent="var(--accent2)" />

            <Section
              title="Safest Options"
              accent="var(--accent)"
              tooltip="Moves with the fewest OOS punish options available to the opponent in this matchup. Positive = attacker acts first. Negative = defender acts first."
            >
              {myData && oppData ? <SafestOptionsList charData={myData} defenderOOSOptions={oppOOS} /> : <EmptyNote>No data.</EmptyNote>}
            </Section>
            <Section
              title="Safest Options"
              accent="var(--accent2)"
              tooltip="Moves with the fewest OOS punish options available to the opponent in this matchup. Positive = attacker acts first. Negative = defender acts first."
            >
              {myData && oppData ? <SafestOptionsList charData={oppData} defenderOOSOptions={myOOS} /> : <EmptyNote>No data.</EmptyNote>}
            </Section>

            <Section
              title="Fastest OOS Options"
              accent="var(--accent)"
              tooltip="Options available out of shield, sorted by total frames from shield drop to the move hitting. Default shield-drop delay is 11f; Up Special and Up Smash skip it entirely; aerials cost 3f (jump first); grab costs 4f (its own shorter shieldgrab window)."
            >
              {myData ? <OOSList charData={myData} accent="var(--accent)" /> : <EmptyNote>No data.</EmptyNote>}
            </Section>
            <Section
              title="Fastest OOS Options"
              accent="var(--accent2)"
              tooltip="Options available out of shield, sorted by total frames from shield drop to the move hitting. Default shield-drop delay is 11f; Up Special and Up Smash skip it entirely; aerials cost 3f (jump first); grab costs 4f (its own shorter shieldgrab window)."
            >
              {oppData ? <OOSList charData={oppData} accent="var(--accent2)" /> : <EmptyNote>No data.</EmptyNote>}
            </Section>
          </div>
        )}

        {activeTab === 'me' && myData && oppData && (
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <AttackingView attackerData={myData} defenderData={oppData} attackerName={myChar} attackerColor="var(--accent)" />
          </div>
        )}
        {activeTab === 'opp' && myData && oppData && (
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <AttackingView attackerData={oppData} defenderData={myData} attackerName={oppChar} attackerColor="var(--accent2)" />
          </div>
        )}
      </main>
    </div>
  )
}
