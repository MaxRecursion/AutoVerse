import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AnalysisResultData } from '@/lib/validation/schemas'

interface AnalysisContextValue {
  analysis: AnalysisResultData | null
  setAnalysis: (value: AnalysisResultData | null) => void
  selectedNodeId: string | null
  setSelectedNodeId: (value: string | null) => void
  selectedFilePath: string | null
  selectFile: (path: string | null) => void
}
const Context = createContext<AnalysisContextValue | null>(null)

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [analysis, setAnalysis] = useState<AnalysisResultData | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const selectFile = useCallback((path: string | null) => {
    setSelectedFilePath(path)
    const file = analysis?.nodes.find((node) => node.type === 'file' && node.path === path)
    setSelectedNodeId(file?.id ?? null)
  }, [analysis])
  const value = useMemo(() => ({ analysis, setAnalysis, selectedNodeId, setSelectedNodeId, selectedFilePath, selectFile }), [analysis, selectFile, selectedNodeId, selectedFilePath])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(Context)
  if (!context) throw new Error('useAnalysis must be used within AnalysisProvider')
  return context
}
