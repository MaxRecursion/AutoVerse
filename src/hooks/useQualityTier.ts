import { useMediaQuery } from './useMediaQuery'

export type QualityTier = 'low' | 'high'

/** Coarse rendering tier: small screens / few cores get fewer pixels and cheaper effects. */
export function useQualityTier(): QualityTier {
  const small = useMediaQuery('(max-width: 767px)')
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8
  return small || cores <= 4 ? 'low' : 'high'
}
