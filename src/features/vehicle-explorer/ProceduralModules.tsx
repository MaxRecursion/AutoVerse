import { useEffect, useMemo } from 'react'
import type { BufferGeometry, Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useLab } from '@/components/three/LabContext'
import { ExplorerPart } from './ExplorerPart'
import { MODEL_COMPONENTS } from './explorerSystems'
import { P } from './explorerConfig'
import { buildShape, createProceduralMaterials, DETAIL } from './proceduralGeometry'
import { labelAnchor, type MaterialKey, type ShapeSpec } from './vehicleParts'

interface Built {
  id: string
  meshes: { key: string; geometry: BufferGeometry; material: Material }[]
}

/**
 * Original procedural modules, one <ExplorerPart> per component. Shapes that
 * share a component and material are merged into a single mesh.
 */
export function ProceduralModules({
  source,
  only,
  detail,
}: {
  source: Readonly<Record<string, readonly ShapeSpec[]>>
  only?: readonly string[]
  detail: 'low' | 'high'
}) {
  const model = useLab((s) => s.params[P.model])
  const materials = useMemo(() => createProceduralMaterials(), [])
  const built = useMemo<Built[]>(() => {
    const ids = Object.keys(source).filter((id) => !only || only.includes(id))
    return ids.map((id) => {
      const byMaterial = new Map<MaterialKey, BufferGeometry[]>()
      for (const spec of source[id]) {
        const g = buildShape(spec.shape, DETAIL[detail])
        const list = byMaterial.get(spec.material)
        if (list) list.push(g)
        else byMaterial.set(spec.material, [g])
      }
      return {
        id,
        meshes: [...byMaterial].map(([key, geos]) => {
          const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g))
          const merged = flat.length === 1 ? flat[0] : (mergeGeometries(flat) ?? flat[0])
          geos.concat(flat).forEach((g) => g !== merged && g.dispose())
          merged.computeBoundingSphere()
          return { key, geometry: merged, material: materials[key] }
        }),
      }
    })
  }, [source, only, detail, materials])

  useEffect(() => () => built.forEach((b) => b.meshes.forEach((m) => m.geometry.dispose())), [built])
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  // Parts that the loaded model also draws carry their label on the model's Part.
  const modelParts = MODEL_COMPONENTS[model === 'kenney' || model === 'procedural' ? model : 'carconcept']
  return (
    <>
      {built.map((b) => (
        <ExplorerPart key={b.id} id={b.id} labelAnchor={modelParts.includes(b.id) ? undefined : labelAnchor(b.id)}>
          {b.meshes.map((m) => (
            <mesh key={m.key} geometry={m.geometry} material={m.material} />
          ))}
        </ExplorerPart>
      ))}
    </>
  )
}
