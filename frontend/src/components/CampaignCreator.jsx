import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function CampaignCreator({ onCreated }) {
  const [offers, setOffers] = useState([])
  const [domains, setDomains] = useState([])
  const [groups, setGroups] = useState([])
  const [sources, setSources] = useState([])

  const [form, setForm] = useState({
    name: '',
    geo_code: '',
    offer_id: '',
    domain_id: '',
    group_id: '',
    traffic_source_id: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    Promise.all([api.listOffers(), api.listDomains(), api.listGroups(), api.listSources()])
      .then(([o, d, g, s]) => {
        setOffers(o)
        setDomains(d)
        setGroups(g)
        setSources(s)
      })
      .catch((e) => setError(e.message))
  }, [])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      const payload = {
        name: form.name,
        geo_code: form.geo_code,
        offer_id: Number(form.offer_id),
        domain_id: Number(form.domain_id),
        group_id: Number(form.group_id),
        traffic_source_id: Number(form.traffic_source_id),
      }
      const created = await api.createCampaign(payload)
      setSuccess(`Кампания создана (Keitaro ID: ${created.keitaro_id})`)
      setForm({ name: '', geo_code: '', offer_id: '', domain_id: '', group_id: '', traffic_source_id: '' })
      if (onCreated) onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <h2>Создать кампанию</h2>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <form onSubmit={submit}>
        <div className="field">
          <label>Название кампании</label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="My campaign"
            required
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label>Гео-код страны (ISO, напр. MX)</label>
            <input
              value={form.geo_code}
              onChange={(e) => set('geo_code', e.target.value.toUpperCase())}
              placeholder="MX"
              maxLength={2}
              required
            />
          </div>
          <div className="field">
            <label>Оффер Keitaro</label>
            <select value={form.offer_id} onChange={(e) => set('offer_id', e.target.value)} required>
              <option value="">Выберите оффер…</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} (#{o.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row three">
          <div className="field">
            <label>Домен</label>
            <select value={form.domain_id} onChange={(e) => set('domain_id', e.target.value)} required>
              <option value="">Выберите домен…</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Группа</label>
            <select value={form.group_id} onChange={(e) => set('group_id', e.target.value)} required>
              <option value="">Выберите группу…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Источник</label>
            <select value={form.traffic_source_id} onChange={(e) => set('traffic_source_id', e.target.value)} required>
              <option value="">Выберите источник…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Создаём…' : 'Создать кампанию'}
        </button>
      </form>
    </div>
  )
}
