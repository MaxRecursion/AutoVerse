import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { LabState, LabStore } from '@/lib/simulation/labStore'

export const LabStoreContext = createContext<LabStore | null>(null)

export function useLabStoreApi(): LabStore {
  const store = useContext(LabStoreContext)
  if (!store) throw new Error('useLabStoreApi must be used inside <LabStoreContext.Provider>')
  return store
}

export function useOptionalLabStoreApi(): LabStore | null {
  return useContext(LabStoreContext)
}

/** Subscribe a component to a slice of lab state. Keep selectors narrow. */
export function useLab<T>(selector: (s: LabState) => T): T {
  return useStore(useLabStoreApi(), selector)
}
