async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  listOffers: () => request('/api/offers'),
  listDomains: () => request('/api/reference/domains'),
  listGroups: () => request('/api/reference/groups'),
  listSources: () => request('/api/reference/traffic-sources'),

  listCampaigns: () => request('/api/campaigns'),
  createCampaign: (payload) =>
    request('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
  importCampaign: (campaignId) =>
    request(`/api/campaigns/${campaignId}/import`, { method: 'POST' }),

  listCampaignOffers: (campaignId) => request(`/api/campaigns/${campaignId}/offers`),
  addOffer: (campaignId, payload) =>
    request(`/api/campaigns/${campaignId}/offers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeOffer: (campaignId, offerId) =>
    request(`/api/campaigns/${campaignId}/offers/${offerId}`, { method: 'DELETE' }),
  exportOffers: (campaignId, streams) =>
    request(`/api/campaigns/${campaignId}/offers/export`, {
      method: 'POST',
      body: JSON.stringify({ streams }),
    }),

  importStreams: (campaignId) => request(`/api/campaigns/${campaignId}/streams`),

  searchKeitaroCampaigns: (q) => request(`/api/keitaro/campaigns?q=${encodeURIComponent(q)}`),}
