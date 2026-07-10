import { useState, useEffect } from 'react'

// Matches the underscore-joined slug convention used for data/icon filenames
// across both games (see scripts/cargo-scrape.js and scripts/fetch-ssbu-roster.js).
function nameToSlug(name) {
  return name.replace(/&/g, 'and').replace(/[.]/g, '').replace(/\s+/g, '_')
}

export function useCharacterData(name, game = 'roa2') {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setData(null)
    fetch(`${import.meta.env.BASE_URL}data/${game}/${nameToSlug(name)}.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [name, game])

  return { data, loading, error }
}
