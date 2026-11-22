import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function CampaignList({ onEdit }) {
  const [campaigns, setCampaigns] = useState([])
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [importingId, setImportingId] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchPerformed, setSearchPerformed] = useState(false)
  const [importingRemoteId, setImportingRemoteId] = useState(null)

  function load() {
    setLoading(true)
    api
      .listCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function importCampaign(campaign) {
    setError(null)
    setSuccess(null)
    setImportingId(campaign.keitaro_id)
    try {
      const updated = await api.importCampaign(campaign.keitaro_id)
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setSuccess(`Кампания #${campaign.keitaro_id} импортирована из Keitaro.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setImportingId(null)
    }
  }

  async function searchKeitaro(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setError(null)
    setSuccess(null)
    setSearching(true)
    try {
      if (/^\d+$/.test(q)) {
        setResults([{ id: Number(q), name: `Кампания #${q}`, alias: '', state: '' }])
      } else {
        setResults(await api.searchKeitaroCampaigns(q))
      }
      setSearchPerformed(true)
    } catch (e) {
      setError(e.message)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function importRemoteCampaign(campaign) {
    setError(null)
    setSuccess(null)
    setImportingRemoteId(campaign.id)
    try {
      const updated = await api.importCampaign(campaign.id)
      load()
      setSuccess(`Кампания «${updated.name}» (#${campaign.id}) добавлена в список.`)
      setResults((prev) => prev.filter((c) => c.id !== campaign.id))
      setQuery('')
    } catch (e) {
      setError(e.message)
    } finally {
      setImportingRemoteId(null)
    }
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Мои кампании</h2>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Обновить
        </button>
      </div>

      <form className="toolbar" onSubmit={searchKeitaro}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label>Добавить кампанию из Keitaro</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название или Campaign ID"
          />
        </div>
        <button
          className="btn btn-ghost"
          type="submit"
          style={{ marginTop: 22 }}
          disabled={searching}
        >
          {searching ? 'Ищем…' : 'Найти в kt'}
        </button>
      </form>

      {searchPerformed && results.length === 0 && (
        <div className="empty">Ничего не найдено. Проверьте название или введите Campaign ID.</div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          {results.length === 20 && (
            <div className="search-results-hint">
              Показаны первые 20 совпадений — уточните запрос, чтобы сузить список.
            </div>
          )}
          <table>
            <tbody>
              {results.map((c) => (
                <tr key={c.id}>
                  <td className="search-result-name">
                    <span className="search-result-title">{c.name}</span>
                    <span className="muted">
                      #{c.id}
                      {c.alias ? ` · ${c.alias}` : ''}
                      {c.group ? ` · ${c.group}` : ''}
                    </span>
                  </td>
                  <td className="search-result-action">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => importRemoteCampaign(c)}
                      disabled={importingRemoteId === c.id}
                    >
                      {importingRemoteId === c.id
                        ? 'Импортируем…'
                        : campaigns.some((local) => local.keitaro_id === c.id)
                          ? 'Обновить из kt'
                          : 'Импортировать'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {loading ? (
        <div className="empty">Загрузка…</div>
      ) : campaigns.length === 0 ? (
        <div className="empty">Пока нет созданных кампаний</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Гео</th>
              <th>Создано</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.keitaro_id}</td>
                <td>{c.name}</td>
                <td>
                  <span className="badge">{c.geo_code || '—'}</span>
                </td>
                <td className="muted">{new Date(c.created_at).toLocaleString()}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => importCampaign(c)}
                      disabled={importingId === c.keitaro_id}
                      title="Обновить данные кампании из Keitaro"
                    >
                      {importingId === c.keitaro_id ? 'Импортируем…' : 'Импорт с kt'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(c.keitaro_id)}>
                      Редактировать
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
