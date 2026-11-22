import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import CampaignCreator from './components/CampaignCreator.jsx'
import CampaignEditor from './components/CampaignEditor.jsx'
import CampaignList from './components/CampaignList.jsx'

const LAST_CAMPAIGN_KEY = 'adrobot.lastCampaignId'

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const editMatch = location.pathname.match(/^\/campaigns\/(\d+)\/edit\/?$/)
  const activeCampaignId = editMatch ? editMatch[1] : null
  const storedCampaignId = localStorage.getItem(LAST_CAMPAIGN_KEY)
  const lastCampaignId = activeCampaignId || storedCampaignId

  const isCreate = location.pathname === '/' || location.pathname === '/campaigns/create'
  const isList = location.pathname === '/campaigns'
  const isEdit = Boolean(activeCampaignId)

  function rememberCampaign(id) {
    if (id) localStorage.setItem(LAST_CAMPAIGN_KEY, String(id))
  }

  function openEditor(id) {
    rememberCampaign(id)
    navigate(`/campaigns/${id}/edit`)
  }

  function openEditorTab() {
    if (lastCampaignId) navigate(`/campaigns/${lastCampaignId}/edit`)
    else navigate('/campaigns')
  }

  return (
    <div className="container">
      <h1>Adrobot</h1>
      <p className="subtitle">Кампании Keitaro — создание и редактирование офферов</p>

      <div className="tabs">
        <button className={isCreate ? 'active' : ''} onClick={() => navigate('/campaigns/create')}>
          Создать кампанию
        </button>
        <button className={isList ? 'active' : ''} onClick={() => navigate('/campaigns')}>
          Мои кампании
        </button>
        <button className={isEdit ? 'active' : ''} onClick={openEditorTab}>
          Редактор
        </button>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to="/campaigns/create" replace />} />
        <Route
          path="/campaigns/create"
          element={<CampaignCreator onCreated={() => navigate('/campaigns')} />}
        />
        <Route path="/campaigns" element={<CampaignList onEdit={openEditor} />} />
        <Route
          path="/campaigns/:campaignId/edit"
          element={<CampaignEditor onCampaignChange={rememberCampaign} />}
        />
        <Route path="*" element={<Navigate to="/campaigns/create" replace />} />
      </Routes>
    </div>
  )
}
