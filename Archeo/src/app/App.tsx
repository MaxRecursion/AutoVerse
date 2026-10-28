import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AnalysisProvider, useAnalysis } from '@/features/analysis/AnalysisContext'
import { HomePage } from './HomePage'
import { WorkspacePage } from './WorkspacePage'

function AppRoutes() {
  const { analysis } = useAnalysis()
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/explore" element={analysis ? <WorkspacePage /> : <Navigate to="/" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

export default function App() {
  return <BrowserRouter><AnalysisProvider><AppRoutes /></AnalysisProvider></BrowserRouter>
}
