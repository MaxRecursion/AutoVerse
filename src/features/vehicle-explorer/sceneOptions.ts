import { createContext, useContext } from 'react'

/** Scene-wide presentation options, provided inside the canvas by VehicleScene. */
export interface ExplorerSceneOptions {
  /** Phones: dot-only hotspots, and part names only for the selected part. */
  compact: boolean
}

export const ExplorerSceneOptionsContext = createContext<ExplorerSceneOptions>({ compact: false })

export const useExplorerSceneOptions = (): ExplorerSceneOptions => useContext(ExplorerSceneOptionsContext)
