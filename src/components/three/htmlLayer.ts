import { createContext, useContext, type RefObject } from 'react'

/**
 * The DOM layer that in-scene HTML (drei <Html>: part labels, hotspots)
 * renders into, provided by <SceneCanvas>. Pass it as <Html portal={...}>.
 *
 * Without a fixed portal, <Html> appends to R3F's event target, which only
 * becomes known after the scene has mounted; the change makes every mounted
 * <Html> tear down and re-create its React root on the same element, which
 * races ("Attempted to synchronously unmount a root…") and later throws
 * "removeChild … not a child of this node" when the scene unmounts.
 */
export const HtmlLayerContext = createContext<RefObject<HTMLDivElement | null> | null>(null)

/** The scene's HTML layer as a drei `portal` (undefined outside a SceneCanvas: drei's default target). */
export function useHtmlLayer(): RefObject<HTMLElement> | undefined {
  return (useContext(HtmlLayerContext) ?? undefined) as RefObject<HTMLElement> | undefined
}
