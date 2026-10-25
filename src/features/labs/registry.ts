import type { LabDefinition } from './types'
import { engineLabConfig } from '@/features/engine-lab/config'
import { transmissionLabConfig } from '@/features/transmission-lab/config'
import { brakingLabConfig } from '@/features/braking-lab/config'
import { suspensionLabConfig } from '@/features/suspension-lab/config'

export const labs: LabDefinition[] = [
  {
    id: 'engine',
    title: 'Four-Stroke Engine Laboratory',
    shortTitle: 'Engine',
    summary: 'Watch intake, compression, power and exhaust with crank, piston, cam and valves on one synchronised timeline.',
    systemId: 'engine',
    topicId: 'four-stroke-cycle',
    config: engineLabConfig,
    load: () => import('@/features/engine-lab/EngineLabView'),
    order: 1,
    status: 'complete',
  },
  {
    id: 'transmission',
    title: 'Manual Gearbox Laboratory',
    shortTitle: 'Gearbox',
    summary: 'Select gears and see how ratio trades rotational speed for torque between input and output shafts.',
    systemId: 'transmission',
    topicId: 'manual-gearbox',
    config: transmissionLabConfig,
    load: () => import('@/features/transmission-lab/TransmissionLabView'),
    order: 2,
    status: 'complete',
  },
  {
    id: 'braking',
    title: 'Disc Brake Laboratory',
    shortTitle: 'Brakes',
    summary: 'Press the pedal, watch hydraulic pressure clamp the pads, and see kinetic energy become heat — with a conceptual ABS demo.',
    systemId: 'braking',
    topicId: 'disc-brakes',
    config: brakingLabConfig,
    load: () => import('@/features/braking-lab/BrakingLabView'),
    order: 3,
    status: 'complete',
  },
  {
    id: 'suspension',
    title: 'Suspension Laboratory',
    shortTitle: 'Suspension',
    summary: 'Drive over bumps and see the spring, damper and control arms keep the tyre on the road.',
    systemId: 'suspension',
    topicId: 'suspension-basics',
    config: suspensionLabConfig,
    load: () => import('@/features/suspension-lab/SuspensionLabView'),
    order: 4,
    status: 'complete',
  },
]

export const getLab = (id: string) => labs.find((l) => l.id === id)
