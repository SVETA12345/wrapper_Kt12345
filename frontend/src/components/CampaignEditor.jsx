import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

function sortOfferItems(list) {
  return [...list].sort((a, b) => {
    if (a.removed !== b.removed) return a.removed ? 1 : -1
    if (a.removed) return (a.removedOrder ?? 0) - (b.removedOrder ?? 0)
    return (a.sortIndex ?? 0) - (b.sortIndex ?? 0)
  })
}

function makeOfferItem(offerId, offerName, sortIndex) {
  return {
    offer_id: offerId,
    offer_name: offerName,
    share: null,
    removed: false,
    isNew: true,
    committedRemoved: false,
    sortIndex,
    removedOrder: null,
    pinned: false,
  }
}

function buildGroups(data, previousGroups = [], mode = 'import') {
  const previousPinned = new Map(
    previousGroups.flatMap((g) => g.items).map((i) => [i.offer_id, Boolean(i.pinned)]),
  )

  const allServerGroups = [...(data?.with_offers || []), ...(data?.without_offers || [])].map(
    (s, groupIndex) => ({
      key: String(s.id ?? `stream-${groupIndex}`),
      streamId: s.id ?? null,
      streamName: s.name || 'Без названия',
      schema: s.schema,
      type: s.type,
      items: (s.offers || []).map((o, index) => ({
        ...o,
        removed: false,
        isNew: false,
        committedRemoved: false,
        sortIndex: index,
        removedOrder: null,
        pinned: previousPinned.get(o.offer_id) || false,
      })),
    }),
  )

  if (!previousGroups.length) return allServerGroups

  const serverByKey = new Map(allServerGroups.map((g) => [g.key, g]))
  const knownKeys = new Set(previousGroups.map((g) => g.key))

  if (mode === 'export') {
    const merged = previousGroups
      .map((prev) => {
        const server = serverByKey.get(prev.key)
        const serverIds = new Set(server?.items.map((i) => i.offer_id) || [])

        const archived = prev.items
          .filter((i) => i.removed && !serverIds.has(i.offer_id))
          .map((i) => ({
            ...i,
            removed: true,
            isNew: false,
            committedRemoved: true,
          }))

        if (!server) {
          return archived.length ? { ...prev, items: archived } : null
        }

        return { ...server, items: [...server.items, ...archived] }
      })
      .filter(Boolean)

    return [...merged, ...allServerGroups.filter((g) => !knownKeys.has(g.key))]
  }

  const merged = previousGroups.map((prev) => {
    const server = serverByKey.get(prev.key)
    const extras = prev.items.filter((i) => i.removed || i.isNew)
    if (!server) return { ...prev, items: extras }

    const extraIds = new Set(extras.map((i) => i.offer_id))
    const baseItems = server.items.filter((i) => !extraIds.has(i.offer_id))
    return { ...server, items: [...baseItems, ...extras] }
  })

  return [...merged, ...allServerGroups.filter((g) => !knownKeys.has(g.key))]
}

export default function CampaignEditor({ onCampaignChange }) {
  const { campaignId: urlCampaignId } = useParams()
  const navigate = useNavigate()

  const [campaignId, setCampaignId] = useState(urlCampaignId ? String(urlCampaignId) : '')
  const [groups, setGroups] = useState([])
  const [allOffers, setAllOffers] = useState([])
  const [available, setAvailable] = useState([])
  const [newOfferId, setNewOfferId] = useState('')
  const [manualOfferId, setManualOfferId] = useState('')
  const [offerQuery, setOfferQuery] = useState('')
  const [offersLoading, setOffersLoading] = useState(true)
  const [offersError, setOffersError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [importingCampaign, setImportingCampaign] = useState(false)
  const [pinsDirty, setPinsDirty] = useState(false)
  const [removalCounter, setRemovalCounter] = useState(0)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchPerformed, setSearchPerformed] = useState(false)
  const [streamsLoading, setStreamsLoading] = useState(false)
  const [streamsLoaded, setStreamsLoaded] = useState(false)
  const [streamsWithoutOffers, setStreamsWithoutOffers] = useState([])

  async function loadAllOffers() {
    setOffersLoading(true)
    setOffersError(null)
    try {
      setAllOffers(await api.listOffers())
    } catch (e) {
      setOffersError(e.message)
    } finally {
      setOffersLoading(false)
    }
  }

  function resetImported() {
    setGroups([])
    setStreamsWithoutOffers([])
    setStreamsLoaded(false)
    setPinsDirty(false)
    setSuccess(null)
  }

  useEffect(() => {
    loadAllOffers()
  }, [])

  useEffect(() => {
    if (urlCampaignId) {
      setCampaignId(String(urlCampaignId))
      resetImported()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCampaignId])

  function goToCampaign(id) {
    const value = id == null ? '' : String(id)
    setCampaignId(value)
    setSearchResults([])
    setSearch('')
    resetImported()
    if (!value) return
    onCampaignChange?.(value)
    if (value !== String(urlCampaignId || '')) {
      navigate(`/campaigns/${value}/edit`)
    }
  }

  useEffect(() => {
    const activeIds = new Set(groups.flatMap((g) => g.items).filter((i) => !i.removed).map((i) => i.offer_id))
    setAvailable(allOffers.filter((o) => !activeIds.has(o.id)))
  }, [groups, allOffers])

  function updateItem(groupId, offerId, updater) {
    setGroups((prev) =>
      prev.map((g) =>
        g.key !== groupId
          ? g
          : {
              ...g,
              items: g.items.map((i) => (i.offer_id === offerId ? updater(i) : i)),
            },
      ),
    )
  }

  function findItem(offerId) {
    let fallback = null
    for (const group of groups) {
      for (const item of group.items) {
        if (item.offer_id !== offerId) continue
        if (item.removed || item.isNew) return { group, item }
        if (!fallback) fallback = { group, item }
      }
    }
    return fallback
  }

  async function onLoad(e) {
    e.preventDefault()
    goToCampaign(campaignId)
  }

  async function onSearch(e) {
    e.preventDefault()
    if (!search.trim()) return
    setError(null)
    try {
      const found = await api.searchKeitaroCampaigns(search.trim())
      setSearchResults(found)
      setSearchPerformed(true)
    } catch (err) {
      setError(err.message)
    }
  }

  function openCampaign(id) {
    goToCampaign(id)
  }

  async function importCampaignFromKt() {
    if (!campaignId) return
    setError(null)
    setSuccess(null)
    setImportingCampaign(true)
    try {
      const updated = await api.importCampaign(Number(campaignId))
      setSuccess(`Кампания #${campaignId} импортирована из Keitaro: ${updated.name}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setImportingCampaign(false)
    }
  }

  async function onImportStreams() {
    if (!campaignId) return
    setStreamsLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const data = await api.importStreams(Number(campaignId))
      setGroups(buildGroups(data, groups))
      setStreamsWithoutOffers(data.without_offers || [])
      setStreamsLoaded(true)
      setSuccess('Потоки импортированы.')
    } catch (e) {
      setError(e.message)
    } finally {
      setStreamsLoading(false)
    }
  }

  function addOffer() {
    const offerId = Number(selectedOfferId)
    if (!campaignId || !streamsLoaded || !offerId) return
    setError(null)
    setSuccess(null)

    const found = findItem(offerId)

    if (found && !found.item.removed) {
      setError('Этот оффер уже активен в потоке')
      return
    }

    if (found) {
      if (found.item.committedRemoved) {
        updateItem(found.group.key, offerId, (i) => ({
          ...i,
          removed: false,
          isNew: true,
          share: null,
          committedRemoved: false,
          removedOrder: null,
        }))
        setSuccess(`Оффер ${found.item.offer_name} возвращён в поток. Нажмите «Экспортировать в kt».`)
      } else {
        updateItem(found.group.key, offerId, (i) => ({
          ...i,
          removed: false,
          committedRemoved: false,
          removedOrder: null,
        }))
        setSuccess(`Оффер ${found.item.offer_name} восстановлен в списке.`)
      }
      setNewOfferId('')
      setManualOfferId('')
      setOfferQuery('')
      return
    }

    const targetGroup =
      groups.find(
        (g) =>
          (g.streamName || '').toLowerCase() === 'offers' ||
          g.schema === 'landings' ||
          g.type === 'default',
      ) || groups[0]

    const catalogOffer = allOffers.find((o) => o.id === offerId)
    const name = catalogOffer ? catalogOffer.name : `Offer #${offerId}`

    if (!targetGroup) {
      const newGroup = {
        key: `new-offers-${Date.now()}`,
        streamId: null,
        streamName: 'Offers',
        schema: 'landings',
        type: 'default',
        items: [],
      }
      setGroups((prev) => [...prev, { ...newGroup, items: [makeOfferItem(offerId, name, 0)] }])
      setSuccess(`Оффер ${name} добавлен в новый поток Offers. Нажмите «Экспортировать в kt».`)
      setNewOfferId('')
      setManualOfferId('')
      setOfferQuery('')
      return
    }

    setGroups((prev) =>
      prev.map((g) =>
        g.key === targetGroup.key
          ? { ...g, items: [...g.items, makeOfferItem(offerId, name, g.items.length)] }
          : g,
      ),
    )
    setSuccess(`Оффер ${name} добавлен в поток ${targetGroup.streamName}. Нажмите «Экспортировать в kt».`)
    setNewOfferId('')
    setManualOfferId('')
    setOfferQuery('')
  }

  function removeOffer(offerId) {
    const found = findItem(offerId)
    if (!found) return
    setError(null)
    setSuccess(null)

    if (found.item.isNew) {
      setGroups((prev) =>
        prev.map((g) =>
          g.key !== found.group.key
            ? g
            : { ...g, items: g.items.filter((i) => i.offer_id !== offerId) },
        ),
      )
      setSuccess('Новый оффер убран из списка.')
      return
    }

    const nextOrder = removalCounter + 1
    setRemovalCounter(nextOrder)
    updateItem(found.group.key, offerId, (i) => ({
      ...i,
      removed: true,
      committedRemoved: false,
      removedOrder: nextOrder,
    }))
    setSuccess('Оффер помечен на удаление. Примените изменения через «Экспортировать в kt».')
  }

  function restoreOffer(offerId) {
    const found = findItem(offerId)
    if (!found) return
    setError(null)
    setSuccess(null)
    updateItem(found.group.key, offerId, (i) => ({
      ...i,
      removed: false,
      isNew: i.committedRemoved,
      share: i.committedRemoved ? null : i.share,
      committedRemoved: false,
      removedOrder: null,
    }))
    setSuccess('Оффер возвращён в поток. Не забудьте экспортировать изменения.')
  }

  function togglePin(offerId) {
    const found = findItem(offerId)
    if (!found || found.item.removed) return
    const nextPinned = !found.item.pinned
    setError(null)
    setSuccess(null)
    setPinsDirty(true)
    updateItem(found.group.key, offerId, (i) => ({ ...i, pinned: nextPinned }))
    setSuccess(
      nextPinned
        ? `Доля оффера ${found.item.offer_name} зафиксирована. При экспорте она не будет пересчитана.`
        : `Фиксация доли оффера ${found.item.offer_name} снята. При экспорте доля будет пересчитана.`,
    )
  }

  async function exportToKt() {
    if (!campaignId || !pending) return
    setError(null)
    setSuccess(null)
    setExporting(true)
    try {
      const payload = groups
        .filter((g) => g.items.length > 0)
        .map((g) => ({
          stream_id: g.streamId,
          offers: g.items
            .filter((i) => !i.removed)
            .map((i) => ({
              offer_id: i.offer_id,
              ...(i.share == null ? {} : { share: i.share }),
              pinned: Boolean(i.pinned),
            })),
        }))
      const data = await api.exportOffers(Number(campaignId), payload)
      setGroups(buildGroups(data, groups, 'export'))
      setStreamsWithoutOffers(data.without_offers || [])
      setStreamsLoaded(true)
      setPinsDirty(false)
      setSuccess('Изменения экспортированы в Keitaro.')
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }

  const allItems = groups.flatMap((g) => g.items)
  const activeItems = allItems.filter((i) => !i.removed)
  const shareItems = activeItems.filter((i) => !i.isNew && i.share != null)
  const totalShare = shareItems.reduce((sum, o) => sum + o.share, 0)
  const removedCount = allItems.length - activeItems.length
  const pinnedCount = activeItems.filter((i) => i.pinned).length
  const archivedCount = allItems.filter((i) => i.removed && i.committedRemoved).length
  const pending = pinsDirty || allItems.some((i) => (i.removed && !i.committedRemoved) || i.isNew)
  const currentOfferIds = new Set(activeItems.map((i) => i.offer_id))
  const query = offerQuery.trim().toLowerCase()
  const filteredOffers = allOffers.filter((o) => {
    if (!query) return true
    return (o.name || '').toLowerCase().includes(query) || String(o.id).includes(query)
  })
  const selectedOfferId = manualOfferId.trim() || newOfferId
  const displayedStreamsWithoutOffers = streamsWithoutOffers
    .map((s) => (typeof s === 'string' ? s : s.name || `Stream #${s.id}`))
    .filter((name) => !groups.some((g) => g.items.length > 0 && g.streamName === name))
  const hintIsWarning =
    !streamsLoaded || Boolean(offersError) || (!offersLoading && allOffers.length > 0 && available.length === 0)
  const offersHint = !streamsLoaded
    ? 'Сначала нажмите «Импортировать потоки», чтобы загрузить офферы.'
    : offersLoading
      ? 'Загружаем список офферов из Keitaro…'
      : offersError
        ? `Список офферов недоступен: ${offersError}. Введите ID вручную.`
        : allOffers.length === 0
          ? 'В Keitaro не найдено офферов. Введите ID оффера вручную.'
          : query && filteredOffers.length === 0
            ? 'По поиску ничего не найдено. Введите ID оффера вручную.'
            : `Всего офферов в Keitaro: ${allOffers.length}. Активных в потоках: ${activeItems.length}. Доступно для добавления: ${available.length}.${archivedCount ? ` Удалённых из kt: ${archivedCount} — выберите оффер в списке, чтобы вернуть его.` : ''}${pinnedCount ? ` Зафиксировано долей: ${pinnedCount}. Если они дают 100%, новым офферам достанется 0%.` : ''}`

  return (
    <div className="panel">
      <h2>Редактор кампании</h2>

      <form className="toolbar" onSubmit={onLoad}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label>Keitaro Campaign ID</label>
          <input
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            placeholder="Например, 215077"
            inputMode="numeric"
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" style={{ marginTop: 22 }}>
          Загрузить
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={onImportStreams}
          disabled={streamsLoading || !campaignId}
          style={{ marginTop: 22 }}
        >
          {streamsLoading ? 'Импортируем…' : 'Импортировать потоки'}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={importCampaignFromKt}
          disabled={importingCampaign || !campaignId}
          style={{ marginTop: 22 }}
          title="Импортировать кампанию из Keitaro или обновить её данные"
        >
          {importingCampaign ? 'Импортируем…' : 'Импорт кампании из kt'}
        </button>
      </form>

      <form className="toolbar" onSubmit={onSearch}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label>Найти кампанию Keitaro по названию</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Введите название…"
          />
        </div>
        <button className="btn btn-ghost" type="submit" style={{ marginTop: 22 }}>
          Найти
        </button>
      </form>

      {searchPerformed && searchResults.length === 0 && (
        <div className="empty">Ничего не найдено. Проверьте название или введите Campaign ID.</div>
      )}

      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.length === 20 && (
            <div className="search-results-hint">
              Показаны первые 20 совпадений — уточните запрос, чтобы сузить список.
            </div>
          )}
          <table>
            <tbody>
              {searchResults.map((c) => (
                <tr key={c.id}>
                  <td className="search-result-name">
                    <span className="search-result-title">{c.name}</span>
                    <span className="muted">
                      #{c.id}
                      {c.alias ? ` · ${c.alias}` : ''}
                      {c.group ? ` · ${c.group}` : ''}
                      {c.state ? ` · ${c.state}` : ''}
                    </span>
                  </td>
                  <td className="search-result-action">
                    <button className="btn btn-ghost btn-sm" onClick={() => openCampaign(c.id)}>
                      Открыть
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

      <div className="add-offer-card">
        <div className="add-offer-head">
          <div>
            <h3>Добавить оффер в поток</h3>
            <p className="muted">
              Оффер появится в таблице потока и применится в Keitaro только после нажатия{' '}
              <b>«Экспортировать в kt»</b>.
            </p>
          </div>
          {!campaignId ? (
            <span className="badge">Сначала загрузите кампанию</span>
          ) : !streamsLoaded ? (
            <span className="badge">Сначала импортируйте потоки</span>
          ) : null}
        </div>

        <div className="add-offer-controls">
          <div className="field">
            <label>1. Найдите оффер в списке</label>
            <input
              value={offerQuery}
              onChange={(e) => setOfferQuery(e.target.value)}
              placeholder="Поиск по названию или ID"
              disabled={offersLoading || !campaignId || !streamsLoaded}
            />
            <select
              value={newOfferId}
              onChange={(e) => setNewOfferId(e.target.value)}
              disabled={offersLoading || !campaignId || !streamsLoaded || allOffers.length === 0}
            >
              <option value="">
                {!streamsLoaded
                  ? 'Импортируйте потоки'
                  : allOffers.length === 0
                    ? 'Офферы не загружены'
                    : available.length === 0
                      ? 'Все офферы уже добавлены'
                      : 'Выберите оффер…'}
              </option>
              {filteredOffers.map((o) => {
                const alreadyAdded = currentOfferIds.has(o.id)
                return (
                  <option
                    key={o.id}
                    value={o.id}
                    disabled={alreadyAdded || offersLoading || !campaignId || !streamsLoaded}
                  >
                    {o.name} (#{o.id}){alreadyAdded ? ' — уже в списке' : ''}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="field">
            <label>2. Или введите ID оффера</label>
            <input
              value={manualOfferId}
              onChange={(e) => setManualOfferId(e.target.value.replace(/\D/g, ''))}
              placeholder="Например, 12345"
              inputMode="numeric"
              disabled={!campaignId || !streamsLoaded}
            />
            <button className="btn btn-ghost btn-sm" onClick={loadAllOffers} disabled={offersLoading}>
              {offersLoading ? 'Обновляем…' : 'Обновить список'}
            </button>
          </div>

          <button
            className="btn btn-primary add-offer-submit"
            onClick={addOffer}
            disabled={!campaignId || !streamsLoaded || !selectedOfferId}
          >
            Добавить оффер
          </button>
        </div>

        <div className={`hint ${hintIsWarning ? 'hint-warning' : ''}`}>{offersHint}</div>
      </div>

      <div className={`offers-stream ${pending ? 'pending' : ''}`}>
        <div className="toolbar">
          <div>
            <span className="pill">Офферы в кампании</span>{' '}
            <span className="muted">
              активных: <b>{activeItems.length}</b> · удалено: <b>{removedCount}</b> · сумма долей:{' '}
              <b>{totalShare}%</b>
            </span>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={exportToKt}
            disabled={!campaignId || !streamsLoaded || !pending || exporting}
          >
            {exporting ? 'Экспортируем…' : 'Экспортировать в kt'}
          </button>
        </div>

        {pending && (
          <div className="pending-banner">
            Изменения ещё не применены в Keitaro. Нажмите «Экспортировать в kt», чтобы сохранить их.
          </div>
        )}

        {!streamsLoaded ? (
          <div className="empty">Нажмите «Импортировать потоки», чтобы загрузить офферы</div>
        ) : groups.every((g) => g.items.length === 0) ? (
          <div className="empty">В импортированных потоках нет офферов. Добавьте оффер выше.</div>
        ) : (
          <>
            <div className="share-bar" style={{ marginBottom: 16 }}>
              {shareItems.map((o, i) => (
                <div
                  key={`${o.offer_id}-${i}`}
                  style={{ width: `${o.share}%`, background: COLORS[i % COLORS.length] }}
                  title={`${o.offer_name}: ${o.share}%`}
                />
              ))}
            </div>

            <table>
              <thead>
                <tr>
                  <th>Оффер</th>
                  <th>Статус</th>
                  <th>Доля</th>
                  <th>Stats</th>
                  <th>Trends</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groups.filter((g) => g.items.length > 0).map((group) => (
                  <Fragment key={group.key}>
                    <tr className="stream-group-row">
                      <td colSpan={6}>
                        <span className="pill">{group.streamName}</span>{' '}
                        <span className="muted">#{group.streamId ?? 'новый'}</span>
                        {group.schema && <span className="muted"> · schema: {group.schema}</span>}
                      </td>
                    </tr>
                    {sortOfferItems(group.items).map((o) => {
                      const rowClass = o.removed ? 'offer-row-removed' : o.isNew ? 'offer-row-new' : ''
                      return (
                        <tr key={`${group.key}-${o.offer_id}`} className={rowClass}>
                          <td>
                            {o.offer_name} <span className="muted">#{o.offer_id}</span>
                          </td>
                          <td>
                            {o.removed ? (
                              <span className="badge badge-muted">
                                {o.committedRemoved ? 'удалён в kt' : 'удалить · ожидает'}
                              </span>
                            ) : o.isNew ? (
                              <span className="badge badge-new">новый · ожидает</span>
                            ) : (
                              <span className="muted">активен</span>
                            )}
                          </td>
                          <td>
                            <div className="share-cell">
                              <b>{o.removed || o.isNew ? '—' : `${o.share}%`}</b>
                              <button
                                type="button"
                                className={`pin-toggle ${o.pinned ? 'pinned' : ''}`}
                                onClick={() => togglePin(o.offer_id)}
                                disabled={o.removed}
                                title={
                                  o.pinned
                                    ? 'Снять фиксацию доли — при экспорте доля будет пересчитана'
                                    : 'Зафиксировать долю — при экспорте она не изменится'
                                }
                                aria-label={o.pinned ? 'Снять фиксацию доли' : 'Зафиксировать долю'}
                              >
                                {o.pinned ? '🔒' : '🔓'}
                              </button>
                            </div>
                          </td>
                          <td className="muted">{o.stats ? JSON.stringify(o.stats) : '—'}</td>
                          <td className="muted">{o.trends ? JSON.stringify(o.trends) : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {o.removed ? (
                              <button
                                className="btn btn-return btn-sm"
                                onClick={() => restoreOffer(o.offer_id)}
                              >
                                Вернуть
                              </button>
                            ) : (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => removeOffer(o.offer_id)}
                              >
                                Удалить
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>

            {displayedStreamsWithoutOffers.length > 0 && (
              <div className="muted" style={{ marginTop: 12 }}>
                Потоки без офферов: <b>{displayedStreamsWithoutOffers.join(', ')}</b>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
