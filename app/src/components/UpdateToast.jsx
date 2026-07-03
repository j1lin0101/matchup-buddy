import { useRegisterSW } from 'virtual:pwa-register/react'

// Shown when a new service worker (i.e. a new build with fresh frame data) has
// installed in the background. Refreshing is never required to keep working
// offline — the previously-cached version keeps serving fine either way — this
// is purely an opt-in nudge so a long-lived tab doesn't sit on stale data forever.
export default function UpdateToast() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        fontSize: '0.82rem',
        color: 'var(--text)',
      }}
    >
      <span>New frame data available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          padding: '5px 12px',
          borderRadius: '6px',
          border: 'none',
          background: 'var(--accent)',
          color: '#0e0e12',
          fontSize: '0.78rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Refresh
      </button>
    </div>
  )
}
