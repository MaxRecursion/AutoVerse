import type { ModelKind } from './explorerSystems'

/**
 * Required attribution for the CC BY 4.0 Car Concept, copied verbatim from
 * public/models/manifest.json (asset `khronos-carconcept`, license.attributionText);
 * a unit test keeps the two identical.
 */
export const CARCONCEPT_ATTRIBUTION =
  '"Car Concept" © 2024 Darmstadt Graphics Group GmbH, artist Eric Chadwick, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), from KhronosGroup glTF-Sample-Assets (https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept); derived from "FREE Concept Car 004 - public domain (CC0)" by Unity Fan. Modified for AutoVerse: Khronos and 3D Commerce logo textures removed, geometry simplified and meshopt-compressed, textures converted to WebP.'

/** What the explorer itself changes on top of the shipped file (CC BY requires saying so). */
export const CARCONCEPT_EXPLORER_CHANGES =
  'In this explorer the placeholder engine block is resized, the axle mesh is split into front and rear halves, and the doors and clamshells are re-hinged so they can open. Every gearbox, suspension, steering, brake-hydraulic, electrical, cooling, exhaust and fuel part is original AutoVerse geometry added to the model.'

export const LINKS = {
  carConcept: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept',
  ccBy: 'https://creativecommons.org/licenses/by/4.0/',
  kenney: 'https://kenney.nl/assets/car-kit',
  cc0: 'http://creativecommons.org/publicdomain/zero/1.0/',
} as const

export interface ModelCredit {
  title: string
  /** Short plain-text credit (always shown). */
  text: string
}

export const MODEL_CREDIT: Readonly<Record<ModelKind, ModelCredit>> = {
  carconcept: { title: 'Car Concept model', text: CARCONCEPT_ATTRIBUTION },
  kenney: {
    title: 'Kenney sedan (fallback model)',
    text: 'Car Kit by Kenney (www.kenney.nl), CC0 — no attribution required. Body stretched to this explorer’s wheelbase; all internal parts are original AutoVerse geometry.',
  },
  procedural: {
    title: 'Simplified car (fallback model)',
    text: 'The detailed model could not be loaded, so a simplified original AutoVerse car is shown.',
  },
}
