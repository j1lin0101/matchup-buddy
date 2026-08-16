import { useState, useMemo } from 'react'
import { useCharacterData } from '../hooks/useMatchupData'
import { getDisplayOOSOptions } from '../analysis/analysisSsbu'

// Matches the underscore-joined slug convention used for data/icon filenames
// (see scripts/fetch-ssbu-frame-data.js / fetch-ssbu-roster.js).
function nameToSlug(name) {
  return name.replace(/&/g, 'and').replace(/[.]/g, '').replace(/\s+/g, '_')
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
            MatchupBuddy shows frame data in a matchup context. Out of Shield options are live for Smash Ultimate now — shield safety and full punish-option tables are still being built out.
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

export default function SsbuMatchupView({ myChar, oppChar, onBack }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const { data: myData, loading: myLoading } = useCharacterData(myChar, 'ssbu')
  const { data: oppData, loading: oppLoading } = useCharacterData(oppChar, 'ssbu')

  const loading = myLoading || oppLoading

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--muted)' }}>
      Loading frame data...
    </div>
  )

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

      <main className="page-main" style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '900px', margin: '0 auto' }}>
          <CharColumnHeader name={myChar} accent="var(--accent)" />
          <CharColumnHeader name={oppChar} accent="var(--accent2)" />

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

        <div style={{ maxWidth: '900px', margin: '32px auto 0', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
            Shield safety &amp; punish tables coming soon
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', maxWidth: '440px', margin: '8px auto 0' }}>
            Out of Shield options are live. The full move-by-move shield-safety breakdown for {myChar} vs {oppChar} is still being built out.
          </p>
        </div>
      </main>
    </div>
  )
}
