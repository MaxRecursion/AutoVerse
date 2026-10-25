import { useMemo } from 'react'
import { useLab } from '@/components/three/LabContext'
import { driveState, type DriveOutputs } from './gearbox'
import { PARAM, readParams, type TransmissionParams } from './config'

/**
 * The lab's typed, sanitised params. Each value is selected separately (as a
 * primitive) so components re-render only when a control actually changes.
 */
export function useTransmissionParams(): TransmissionParams {
  const gear = useLab((s) => s.params[PARAM.gear])
  const clutch = useLab((s) => s.params[PARAM.clutch])
  const rpm = useLab((s) => s.params[PARAM.rpm])
  const running = useLab((s) => s.params[PARAM.running])
  return useMemo(
    () =>
      readParams({
        ...(gear !== undefined && { [PARAM.gear]: gear }),
        ...(clutch !== undefined && { [PARAM.clutch]: clutch }),
        ...(rpm !== undefined && { [PARAM.rpm]: rpm }),
        ...(running !== undefined && { [PARAM.running]: running }),
      }),
    [gear, clutch, rpm, running],
  )
}

/** Steady operating point (ratio, speeds, torques, road speed) for the current controls. */
export function useDriveState(): DriveOutputs {
  const p = useTransmissionParams()
  return useMemo(() => driveState({ gear: p.gear, pedal: p.clutch, rpm: p.rpm }), [p.gear, p.clutch, p.rpm])
}
