import { describe, expect, it } from 'vitest'
import vehicleComponents from '@/content/components/vehicle.json'
import manifest from '../../../public/models/manifest.json'
import { labs } from '@/features/labs/registry'
import { getComponent, getTopic } from '@/lib/content'
import { CARCONCEPT_NODE_COMPONENT, classifyCarConceptNode } from './carConceptNodes'
import {
  COMPONENT_ALIASES,
  EXPLORER_COMPONENT_IDS,
  EXPLORER_SYSTEMS,
  EXPLORER_SYSTEM_IDS,
  MODEL_COMPONENTS,
  availableComponents,
  componentSource,
  componentsOfSystem,
  explorerHref,
  resolveExplorerTarget,
  systemOfComponent,
} from './explorerSystems'
import { CARCONCEPT_ATTRIBUTION } from './modelCredits'

const contentSystemOf = (id: string) => getComponent(id)?.systemId

describe('explorer systems → components mapping', () => {
  it('covers the nine required systems, each with parts', () => {
    expect([...EXPLORER_SYSTEM_IDS].sort()).toEqual(
      ['body', 'braking', 'cooling', 'drivetrain', 'electrical', 'engine', 'exhaust', 'steering', 'suspension'].sort(),
    )
    for (const s of EXPLORER_SYSTEMS) expect(s.componentIds.length, s.id).toBeGreaterThan(0)
  })

  it('assigns every component to exactly one system', () => {
    expect(new Set(EXPLORER_COMPONENT_IDS).size).toBe(EXPLORER_COMPONENT_IDS.length)
    for (const s of EXPLORER_SYSTEMS) for (const id of s.componentIds) expect(systemOfComponent(id)).toBe(s.id)
    expect(systemOfComponent('not-a-part')).toBeNull()
  })

  it('documents every component in vehicle.json with the matching systemId, and nothing else', () => {
    const documented = new Map(vehicleComponents.map((c) => [c.id, c.systemId]))
    expect([...documented.keys()].sort()).toEqual([...EXPLORER_COMPONENT_IDS].sort())
    for (const s of EXPLORER_SYSTEMS) for (const id of s.componentIds) expect(documented.get(id), id).toBe(s.id)
  })

  it('links only to lessons and labs that exist', () => {
    const labIds = new Set(labs.map((l) => l.id))
    for (const s of EXPLORER_SYSTEMS) {
      for (const t of s.topicIds) expect(getTopic(t), `${s.id} → ${t}`).toBeDefined()
      if (s.labId) expect(labIds.has(s.labId), s.labId).toBe(true)
    }
    for (const c of vehicleComponents) for (const t of c.relatedTopicIds) expect(getTopic(t), `${c.id} → ${t}`).toBeDefined()
    // The four labs are each reachable from a system.
    expect(EXPLORER_SYSTEMS.map((s) => s.labId).filter(Boolean).sort()).toEqual(['braking', 'engine', 'suspension', 'transmission'])
  })

  it('aliases point at real explorer components', () => {
    for (const [alias, id] of Object.entries(COMPONENT_ALIASES)) expect(systemOfComponent(id), `${alias} → ${id}`).not.toBeNull()
  })

  it('lists components in display order per system', () => {
    expect(componentsOfSystem('braking')).toEqual(['brake-discs', 'brake-calipers', 'footbrake-pedal', 'servo-and-master-cylinder', 'brake-pipes'])
  })
})

describe('resolveExplorerTarget (deep links)', () => {
  it('resolves ?system=', () => {
    expect(resolveExplorerTarget({ system: 'braking' })).toEqual({ systemId: 'braking', componentId: null })
    expect(resolveExplorerTarget({ system: ' Cooling ' })).toEqual({ systemId: 'cooling', componentId: null })
  })

  it('resolves ?component= by id and by lab-style alias, and the component wins', () => {
    expect(resolveExplorerTarget({ component: 'brake-disc' })).toEqual({ systemId: 'braking', componentId: 'brake-discs' })
    expect(resolveExplorerTarget({ component: 'radiator', system: 'braking' })).toEqual({ systemId: 'cooling', componentId: 'radiator' })
    expect(resolveExplorerTarget({ component: 'steering-rack' })).toEqual({ systemId: 'steering', componentId: 'steering-gear' })
  })

  it('maps a lab component the explorer does not model onto its system', () => {
    expect(resolveExplorerTarget({ component: 'caliper-piston' }, contentSystemOf)).toEqual({ systemId: 'braking', componentId: null })
    expect(resolveExplorerTarget({ component: 'synchro-1-2' }, contentSystemOf)).toEqual({ systemId: 'drivetrain', componentId: null })
    expect(resolveExplorerTarget({ component: 'piston' }, contentSystemOf)).toEqual({ systemId: 'engine', componentId: null })
  })

  it('falls back to the whole car for unknown values', () => {
    expect(resolveExplorerTarget({ system: 'warp-drive', component: 'flux-capacitor' }, contentSystemOf)).toEqual({ systemId: null, componentId: null })
    expect(resolveExplorerTarget({})).toEqual({ systemId: null, componentId: null })
  })

  it('builds explorer links', () => {
    expect(explorerHref({ systemId: 'braking' })).toBe('/explore?system=braking')
    expect(explorerHref({ systemId: 'braking', componentId: 'brake-discs' })).toBe('/explore?component=brake-discs')
    expect(explorerHref({})).toBe('/explore')
  })
})

describe('model sources', () => {
  it('shows every component with the Car Concept, from the model or an original module', () => {
    expect(availableComponents('carconcept').size).toBe(EXPLORER_COMPONENT_IDS.length)
    expect(componentSource('brake-discs', 'carconcept')).toEqual({ model: true, procedural: false })
    expect(componentSource('radiator', 'carconcept')).toEqual({ model: false, procedural: true })
  })

  it('substitutes procedural parts for what the fallbacks lack', () => {
    expect(componentSource('brake-discs', 'kenney')).toEqual({ model: false, procedural: true })
    expect(componentSource('engine-unit', 'procedural')).toEqual({ model: false, procedural: true })
    // Doors and clamshells exist only on the Car Concept.
    expect(availableComponents('kenney').has('side-doors')).toBe(false)
    // Every system still has something to show with either fallback model.
    for (const kind of ['kenney', 'procedural'] as const) {
      const shown = availableComponents(kind)
      for (const s of EXPLORER_SYSTEMS) expect(s.componentIds.some((id) => shown.has(id)), `${kind}: ${s.id}`).toBe(true)
    }
  })

  it('every model component is an explorer component', () => {
    for (const ids of Object.values(MODEL_COMPONENTS)) for (const id of ids) expect(systemOfComponent(id), id).not.toBeNull()
  })
})

describe('Car Concept node mapping', () => {
  const asset = manifest.assets.find((a) => a.id === 'khronos-carconcept')!

  it('maps every node of the manifest componentMap to the same part the alias names', () => {
    for (const [node, researchId] of Object.entries(asset.componentMap ?? {})) {
      const mapped = CARCONCEPT_NODE_COMPONENT[node]
      expect(mapped, node).toBeDefined()
      expect(COMPONENT_ALIASES[researchId] ?? researchId, node).toBe(mapped)
    }
  })

  it('maps only to explorer components, and resolves unnamed tyre / floor meshes by parent', () => {
    for (const id of Object.values(CARCONCEPT_NODE_COMPONENT)) expect(systemOfComponent(id), id).not.toBeNull()
    expect(classifyCarConceptNode('', 'WheelFrontL')).toBe('tyres')
    expect(classifyCarConceptNode('', 'BodyUnderside')).toBe('body-shell')
    expect(classifyCarConceptNode('', 'BodyHood')).toBeNull()
    expect(classifyCarConceptNode('Mystery', null)).toBeNull()
  })

  it('shows the attribution exactly as the manifest records it', () => {
    expect(CARCONCEPT_ATTRIBUTION).toBe(asset.license.attributionText)
  })
})
