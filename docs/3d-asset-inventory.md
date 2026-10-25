# 3D asset inventory

This is the record of where AutoVerse's third-party 3D models come from. It covers what was searched, what was verified, what is bundled, and where we build parts ourselves instead. The machine-readable source is [`public/models/manifest.json`](../public/models/manifest.json) (`generatedAt` 2026-10-21), which validates against `ModelManifestSchema` in `src/lib/schemas.ts`. This file mirrors it. If the two disagree, the manifest wins.

**Status at a glance**

| | Count | Notes |
|---|---|---|
| Ready, bundled in `public/models/` | 3 | 2,726,804 bytes in total. Each was downloaded, its licence confirmed by an independent check, and it is cleared for bundling. |
| Candidates that need a sign-in | 25 | Sketchfab token (23), BlenderKit account (1), Autodesk Fusion account to export CAD (1). Nothing was downloaded from these. |
| Candidates that need a purchase | 0 | No paid assets were considered. |
| Rejected or not selected | 16 | Each has a reason in the manifest and in §2. |

No accounts were created, no API keys or tokens were used, and nothing was bought. Bot-gated sites (HTTP 202/403) were not bypassed. Every file downloaded for inspection is in `.asset-staging/` and was only parsed, never executed. `.asset-staging/` is not part of the app bundle.

---

## 1. Asset acquisition report

**Eligibility rule.** An asset is used at runtime only if all three hold: (1) it was downloaded locally, (2) an independent check confirmed its licence, and (3) that check marked it eligible for bundling (`eligibleForBundling=true`). Separate, named parts matter more than looks.

**Decision order** for every system, preferred first:

1. Reuse an existing model as is.
2. Use one under licence with attribution.
3. Modify one and adapt it.
4. Combine several component models.
5. Build only the missing parts procedurally.
6. Fall back to a fully procedural model.

### 1.1 Vehicle: body, panels and wheels

| Role | Asset | Model page | Licence (verified) | Download | Decision |
|---|---|---|---|---|---|
| **Primary: ready** | Car Concept (logo-free) | <https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept> | CC BY 4.0. The Khronos and 3D Commerce logos are excluded from the licence. | Public GitHub raw URL, no sign-in | Ship. `/models/vehicle/khronos-carconcept.glb` |
| **Secondary: ready** | Kenney Car Kit 3.1, `sedan.glb` | <https://kenney.nl/assets/car-kit> | CC0 1.0 | Public zip, no sign-in | Ship. `/models/vehicle/kenney-car-kit.glb` |
| Needs a Sketchfab token | Generic passenger car pack | <https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5> | CC BY 4.0 | OAuth token | Optional: ten generic cars with no trademarks, panel separation unknown |
| Needs a Sketchfab token | Chevy Impala *Rigged* | <https://sketchfab.com/3d-models/chevy-impala-rigged-by-frigon-tech-e1c7974b8cd34697a7d651fa73d02065> | CC BY 4.0, derived from Eques_inferno's CC BY original; credit both | OAuth token | Optional: panels rigged with bones. Trademark: debadge it. |
| Needs a Sketchfab token | Rigged Car Mustang 1965 With Engine | <https://sketchfab.com/3d-models/rigged-car-mustang-1965-with-engine-3d-model-c2d4f0a6170d43f4a5a8303373ebb81a> | CC BY 4.0 | OAuth token | Optional: has an engine bay, parts split by vertex group. Trademark: debadge it. |
| Needs a Sketchfab token | Construct of the electric car Dubina Evo | <https://sketchfab.com/3d-models/construct-of-the-electric-car-dubina-evo-e27f1032f759436b95fbc851f9f68268> | CC BY 4.0 | OAuth token | Useful for chassis, double wishbone and steering structure (EV) |
| Needs a BlenderKit account | Mazda 787b | <https://www.blendkit.com/asset-gallery-detail/8afbb4b8-2406-4202-aea3-c4b463b3ab6d/> | CC0 | BlenderKit account and add-on | Low priority: CarConcept already covers this. Trademark. |

**Why Car Concept.** It is the only openly licensed car we found whose exterior is split into logically named parts with usable pivots:

- Doors: `BodyDoorLColor1` and `BodyDoorRColor1`, each with handles, mirror, window and interior trim as children. They pivot at their front edge.
- Front clamshell: `BodyHood`, which includes the headlights. It pivots at its front lower edge.
- Rear clamshell: `BodyRearPanelsColor1`, which includes the hatch, rear window and taillights. It pivots at its rear lower edge.
- Other body panels: `BodyRoofPanel`, `BodyPillars` and `BodyPanelsColor2`.
- Wheels: four hub-centred groups, `WheelFrontL`, `WheelFrontR`, `WheelRearL` and `WheelRearR`, each holding `…Rim`, `…BrakeDisc`, `…BrakePad` and an unnamed tyre.
- Cabin: a centrally mounted steering wheel, the column and the pedals.

So the doors can swing open and the clamshells can tilt open in code. Note that "bonnet" and "boot-lid" here are concept-car clamshells, not conventional rear-hinged panels. The pivot positions were measured from the file and are recorded in the manifest's `framing.notes`.

**What we changed.** The Khronos and 3D Commerce logos are trademarks outside the CC BY grant, and they appeared on the licence plate, the steering-wheel emblem, the caliper and rim emissive maps, and the tyre sidewalls. We removed them before optimising, and the attribution text states the modification, as CC BY 4.0 §3(a)(1)(B) requires.

**Car Concept caveats:**

- The `Engine` is one fused placeholder mesh.
- Each caliper (`Wheel…BrakePad`) is a child of the spinning wheel group, so re-parent it or spin only the rim, tyre and disc.
- Tyres are unnamed meshes.
- There are no suspension parts.

**Kenney sedan.** A 2,027-triangle overview car for the mobile quality tier and for wheel-rotation demos. Its five named nodes are `body` and the four `wheel-*` nodes. The body is fused.

**Rejected:**

- `ferrari.glb`: licence cannot be verified, and Ferrari is a trademark.
- Legacy `Buggy`: no licence.
- `ToyCar`: one fused mesh.
- Cesium Milk Truck: fused, and carries a logo trademark.
- Quaternius Cars Pack: no download located.

**Decision.** Steps 2 and 3 of the decision order: use Car Concept under CC BY with attribution, modified to remove the logos. Opening animations are written in code at the model's pivots. Anything inside the car (engine internals, suspension) comes from the system scenes below.

### 1.2 Engine and four-stroke cycle

**Ready: none.** No downloaded engine has both a confirmed licence and separate parts.

- The legacy Khronos *2 Cylinder Engine* has exactly the right structure: separate `Piston_…`, `rod_…`, `Lifter_…` and `Spring_Link…` meshes. But it has no licence, and Khronos removed it from its collection for that reason. It stays in `.asset-staging/` as an internal reference for hierarchy and animation design only.
- Poly Haven's portable generator has its engine fused into one mesh.

**Candidates that need the user's Sketchfab token**, best first. All are CC BY 4.0 and confirmed by the independent check unless marked:

| # | Asset | Model page | Why |
|---|---|---|---|
| 1 | Low-poly animated engines (Savalon) | <https://sketchfab.com/3d-models/low-poly-animated-engines-243837fb3a40440485c8f8c39b6742ba> | Includes a 1,089-face single-piston unit with rigged pistons. 20,818 faces in total. Best fit for the four-stroke lab if its pistons are separate meshes. |
| 2 | 4 stroke engine working piston and crank shaft (ujjavalchauhan) | <https://sketchfab.com/3d-models/4-stroke-engine-working-piston-and-crank-shaft-624939477a4c4e368ba44d481a98792f> | Single-cylinder slider-crank with an armature. Provenance is weakly stated. |
| 3 | Inline-4 Engine Modelling & Rigging Study (s1d.fx0) | <https://sketchfab.com/3d-models/inline-4-engine-modelling-rigging-study-652cf3def1ae40b7a6e546e62ed19778> | Pistons, rods and crank driven by constraints and parenting, so likely separate objects. Four clips, 27,864 faces. |
| 4 | Engine Chevy Chevette 1977 (flow3d) | <https://sketchfab.com/3d-models/engine-chevy-chevette-1977-ef123ab4b01140179745751dab5d7864> | The most complete real engine: valve timing, crank, pistons, pulleys, alternator, water pump and carburettor, with 224 clips. Very heavy at 439,893 faces, so it needs decimation. |
| 5 | Animated Engine V8 (meeww) | <https://sketchfab.com/3d-models/animated-engine-v8-b0dbf778b81e4afba4edf11336e2a099> | Running V8 with 94 materials. Its animation came via Alembic and may be baked. |
| 6 | engine exploded view (rondinellisophia) | <https://sketchfab.com/3d-models/engine-exploded-view-0a740cd20bfd4107a1e3c9fbcc5fe70b> | Exploded animation. No description; part names unknown. |
| 7 | Rigged 4-Cylinder Engine (FREE) (david.gnzlv) | <https://sketchfab.com/3d-models/rigged-4-cylinder-engine-free-e14ebe68273d49a3becda6802270b4b0> | One material, so parts may be skinned to one mesh. |
| 8 | Engine (JuanG3D) | <https://sketchfab.com/3d-models/engine-36c1f32d649c46df9f2f8b4d34cf32c7> | Four pistons and rods, crank and flywheel. NURBS-heavy, no animation. |
| Part | Piston and connecting rod (francobravo) | <https://sketchfab.com/3d-models/piston-and-connecting-rod-940d24ffb7864be898963391665fcc9f> | Close-ups of piston and rod. 11,608 faces. |
| Part | Spark Plug (Vaughan.Staehr) | <https://sketchfab.com/3d-models/spark-plug-306c0031ba8445a79897fa060791758a> | Identifying a spark plug. 1,877 faces. |
| Part | Camshaft (IU Indianapolis University Library) | <https://sketchfab.com/3d-models/camshaft-1f1c66b214834f9887aab1ecb3111149> | Real scanned part. The glb is about 60.6 MB. Licence was not re-checked independently. |
| CAD | FourCylinderEngine (Serhii Studenets) | <https://github.com/huggedd/FourCylinderEngine> | MIT. Bottom end with one Fusion 360 `.f3d` file per part. Needs an Autodesk Fusion sign-in to export. Licence was not re-checked independently. |

**Decision: build a procedural single-cylinder engine (step 6).** The model is our own and covers:

- Cylinder block as a cutaway, and cylinder head.
- Piston with rings and gudgeon pin, connecting rod, and crankshaft with counterweight.
- Camshaft, intake and exhaust valves with springs.
- Spark plug, and timing belt or chain.

It is driven by the pure crank-angle kinematics already in `src/features/engine-lab/kinematics.ts`. Why:

- No eligible model exists.
- The candidates' part separation is unverified, and the rigged ones risk being skinned to one mesh.
- The lab needs valve lift exactly synchronised to crank angle (720° per cycle) plus a transparent cutaway. Both are exact and unit-testable when built procedurally.

**Upgrade path.** Once the user downloads #1 or #4 using §4 and the inspection shows separate named nodes, add them to the manifest with a `componentMap` and use them for a real-engine tour. The procedural model stays as the fallback.

### 1.3 Transmission

- **Ready: none.**
- **Commercially usable candidates: none.**
  - The only manual gearbox on Sketchfab with a downloadable licence is *Manual Transmission/ gear box* by UnforgettableName (<https://sketchfab.com/3d-models/manual-transmission-gear-box-811ce409dda746099924ac0b39d34140>). It is **CC BY-NC 4.0**, so it is rejected unless AutoVerse stays strictly non-commercial.
  - Legacy `GearboxAssy` has no licence.
  - three.js `gears.glb` is a fused decorative gear set.
- **Decision: fully procedural gearbox (step 6).** It has an input shaft, layshaft (countershaft), output shaft, a gear pair per ratio, synchro hubs and collars, and a selector fork, with an optional clutch disc. Nothing usable exists, and procedural gears give exact tooth counts and ratios for the gear-selection lab.

### 1.4 Braking

- **Ready (in the car):** Car Concept's `Wheel…BrakeDisc` and `Wheel…BrakePad` (a red caliper shape) at each corner. They are good for showing where the brakes are, but have no internals: no pads, piston or hydraulics.
- **Candidates that need a Sketchfab token:**

  | Asset | Model page | Licence | Why |
  |---|---|---|---|
  | **Car Disc Brake** (Joko_P), best | <https://sketchfab.com/3d-models/car-disc-brake-9e2440a2fa624b31abd0963902217407> | CC BY 4.0, verified | Vented disc, pads and caliper, 6 materials, 16,896 faces. Tagged `noai`: do not use it as AI training data. |
  | **Brake Disk and Caliper** (Vladi), light fallback | <https://sketchfab.com/3d-models/brake-disk-and-caliper-5feda9dbf20a49cf9fd29d550e55e4b9> | CC BY 4.0, verified | 6,204 faces, but its textures are heavy. |
  | **Brake Assembly** (Nieve5677), heavy backup | <https://sketchfab.com/3d-models/brake-assembly-d36d43ad176a45a18095c04b1754ea79> | CC BY 4.0 per the API, not re-checked independently | 244,688 faces. |

- **Decision: combine and build the missing parts (steps 4 and 5).**
  - Use Car Concept to show the brakes in the car.
  - Build a procedural disc-brake close-up for the braking lab: disc, caliper body, caliper piston, two pads and the hydraulic line, with the master cylinder and pedal as a schematic. The lab has to show pedal force moving the piston and clamping the pads, which needs internal parts that no eligible model has.
  - Upgrade to Car Disc Brake if its pads and caliper download as separate nodes.

### 1.5 Suspension and steering

- **Ready: none.** Car Concept has no suspension. It only has a fused `Axles` mesh and the steering wheel group `InteriorSteeringCylinder`.
- **Candidates that need a Sketchfab token:**
  - [Free] Coilover Shock Absorber Damper: <https://sketchfab.com/3d-models/free-coilover-shock-absorber-damper-92e61757780840a683abdd38c4e8a700>. CC BY 4.0, verified. Spring and damper with one animation.
  - MACHPERSON SUSPENSION (STRUD): <https://sketchfab.com/3d-models/machperson-suspension-strud-bd202ee134454402bf398ca906c8e2f5>. CC BY 4.0, verified. CAD-style, one material.
  - Dubina Evo construct (link in §1.1). Double wishbone and electric power steering.
  - Double Wishbone and Live Axle Suspension: <https://sketchfab.com/3d-models/double-wishbone-and-live-axle-suspension-5cf0120b9bca4fd6a20c9357f7e5efaf>. Licence not re-checked independently. 2.5M faces, and the author calls it a work in progress.
  - rack and pinion: <https://sketchfab.com/3d-models/rack-and-pinion-9b199b652a874321980e0d2c19d5fd96>. Licence not re-checked independently. A generic mechanism that illustrates the principle.
- **Rejected:** *RWD car suspension/chassis*, because its Sketchfab "Free Standard" licence does not clearly allow redistributing the raw files.
- **Decision: procedural corner model (step 6).** It is a MacPherson strut or double-wishbone corner with:
  - A parametric helical coil spring that really compresses with road input.
  - A damper body and rod, lower and upper control arms, a knuckle and a hub.
  - A tie rod, plus a procedural rack and pinion for steering.

  The suspension lab is driven by parameters, and a static spring mesh would stretch rather than compress.

### 1.6 Drivetrain

- **Ready: none.**
- **Candidate that needs a token:** *Driveshaft* by PolyPhantom (<https://sketchfab.com/3d-models/driveshaft-09b38796c78e49d6bbaf6b7fa63b856f>), CC BY 4.0, verified. It is a ZIL-157 truck cardan shaft, described as five objects.
- **Rejected:** *Hypoid Gear* by C. Yamahata. It is labelled CC BY, but its geometry comes from GrabCAD user Dr Lunin, and GrabCAD needs the designer's permission for commercial use. That breaks the chain of title.
- **Decision: procedural (step 6).** A propshaft with universal joints, and an open differential with ring, pinion, spider and side gears.

### 1.7 Other: wheels and tyres, electrical, cooling

- **Ready: Old Tyre (Poly Haven), CC0.** Model page <https://polyhaven.com/a/old_tyre>, file `/models/other/polyhaven-old-tyre.glb`. Use it for tyre close-ups: its worn tread illustrates wear.
- **Not selected:** Rusted Wheel Rim 01 (CC0, eligible), which looks rusty and duplicates Car Concept's rims.
- **Rejected:**
  - *Alternator* (B0bik): one fused photoscan mesh of a branded part, about 33.9 MB.
  - *Car Radiator PL* (BlenderKit Royalty Free): its terms forbid extractable redistribution.
- **Decision:** electrical (battery, alternator, starter) and cooling (radiator, water pump, thermostat, fan) get simple procedural primitives or 2D flow diagrams (step 6).

### 1.8 Missing assets that need procedural fallback

| System | Missing components | Why nothing usable exists | Plan |
|---|---|---|---|
| Engine | Block cutaway, head, piston, rings, pin, connecting rod, crankshaft, camshaft, valves and springs, spark plug, timing drive | The only licensed candidates are on Sketchfab (need sign-in) with unverified separation. The ideal-structure model has no licence. | Procedural, driven by `kinematics.ts`. Optionally swap in Sketchfab models later. |
| Transmission | Shafts, gear pairs, synchros, selector, clutch | Only a CC BY-NC or unlicensed gearbox exists | Fully procedural |
| Braking (close-up) | Caliper piston, pads, hydraulic line, master cylinder | Car Concept has only the disc and caliper shell | Procedural close-up; Car Concept for the in-car view |
| Suspension and steering | Coil spring, damper, control arms, knuckle, hub, tie rod, rack and pinion | No eligible model | Procedural with a parametric spring |
| Drivetrain | Propshaft, U-joints, differential gears | Only a token-gated truck shaft; the hypoid gear has a broken licence chain | Procedural |
| Electrical and cooling | Battery, alternator, starter, radiator, pump, thermostat, fan | Only a fused photoscan or a no-redistribution asset | Procedural primitives and 2D diagrams |
| Vehicle | Engine-bay internals, tyre node names | Car Concept's engine is fused and its tyres are unnamed | Address tyres as the unnamed child of `Wheel…`; build engine internals in the engine scene |

### 1.9 Using the ready assets in the app

| id | File | Bytes before → after | Triangles before → after | Up axis and size | Front |
|---|---|---|---|---|---|
| `khronos-carconcept` | `/models/vehicle/khronos-carconcept.glb` | 11,778,688 → 2,336,460 | 213,347 → 148,222 | +Y; 2.54 × 1.15 × 4.36 m. Wheels on y = 0. Centre about z = +0.24. | +Z |
| `kenney-car-kit` | `/models/vehicle/kenney-car-kit.glb` | 184,587 (GLB plus external PNG) → 24,832 | 2,032 → 2,027 | +Y; 1.50 × 1.30 × 2.55 units, stylised. Scale it about 1.7× to sit beside Car Concept. | +Z |
| `polyhaven-old-tyre` | `/models/other/polyhaven-old-tyre.glb` | 2,237,203 (glTF, bin and 3 JPGs) → 365,512 | 2,880 → 2,880 | +Y, centred. 0.60 m diameter, 0.165 m wide. Rolling axis Z. | n/a |

**Processing applied to all three** (gltf-transform CLI 4.5.1):

1. If needed, convert or embed into one GLB with `gltf-transform copy`.
2. Run `gltf-transform optimize in out --join false --flatten false --instance false --palette false --compress meshopt --texture-compress webp --texture-size 2048`. The other defaults stay on: dedup, weld, simplify with error 0.0001, prune including solid textures, and sparse.
3. Re-inspect the output to confirm that every node named in `componentMap` still exists. All keys were confirmed against the optimised files.

**Side effects to know about:**

- **Car Concept:** meshopt quantization moved the meshes of six parent nodes into new **unnamed** child nodes: `BodyUnderside`, `BodyHood`, `BodyDoorLColor1`, `BodyDoorRColor1`, `BodyRearPanelsColor1` and `InteriorSteeringCylinder`. The named nodes keep their transforms, so they still pivot correctly, but they are now groups. Wrapping `nodes['BodyHood']` in a `<Part>` therefore wraps the whole bonnet assembly, including the headlights and grille. Simplify also cut the triangle count by about 30%.
- **Kenney sedan:** dedup now shares wheel geometry between nodes. Node names are unchanged, but mesh names no longer match them.

**Loading.** All three files *require* `EXT_meshopt_compression`, `KHR_mesh_quantization` and `EXT_texture_webp`.

- drei 10.7.9's `useGLTF` uses three-stdlib's `GLTFLoader`, which supports all three, and enables the meshopt decoder by default.
- `useGLTF` also configures a Draco decoder from `www.gstatic.com` by default. None of these files use Draco, so call `useGLTF(url, false)` to keep the runtime free of third-party fetches.
- Car Concept keeps `KHR_materials_variants` (Carmine Candy, Pearly Swirly, Torched Graphite). Switching between them needs a variants plugin; the default is Carmine.

**Mapping.** Use `componentMap` from the manifest: `<Part id={componentId}><primitive object={nodes[nodeName]} /></Part>`.

- The canonical ids used (`bonnet`, `door`, `boot-lid`, `body`, `wheel`, `brake-disc`, `brake-caliper`, `engine-block`, `tyre`) follow the research naming. They must be added to `src/content/components/<system>.json` before `<Part>` will accept them.
- Car Concept nodes that are useful but not mapped: `Axles` (one fused mesh), `InteriorSteeringCylinder`, `InteriorSteeringDashColumn`, `InteriorPedalBrake` and `InteriorPedalAccel`.

**Attribution in the UI.** Car Concept is CC BY 4.0, so the credits page must show the full `license.attributionText` from the manifest. That text already includes the modification notice. Kenney and Poly Haven are CC0, so credit is optional but courteous.

**Not verified yet:** none of the three optimised files has been rendered inside the AutoVerse app. They were checked structurally with gltf-transform inspect, a read-only JSON parser, and visual review of every remaining Car Concept texture.

---

## 2. Full inventory

Yes/No/Unclear values come from the licence text. "Unclear" means it could not be established. "Local path" is the public URL path; `null` means nothing is bundled. Full processing logs are in the manifest's `processing` arrays.

| # | Name / system | Status | Source URL | Author | Licence + URL | Commercial | Modification | Redistribution | Attribution text | Original format | Local path | Processing | Optimisation | Ready for interactive use |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Car Concept (glTF-Sample-Assets), logo-free / `vehicle` | **ready** | <https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept> | Eric Chadwick (artist); owner Darmstadt Graphics Group GmbH, 2024; derived from "FREE Concept Car 004 - public domain (CC0)" by Unity Fan | CC BY 4.0 (Khronos and 3D Commerce logos excluded from the licence) (<https://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Car Concept" © 2024 Darmstadt Graphics Group GmbH, artist Eric Chadwick, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), from KhronosGroup glTF-Sample-Assets (https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept); derived from "FREE Concept Car 004 - public domain (CC0)" by Unity Fan. Modified for AutoVerse: Khronos and 3D Commerce logo textures removed, geometry simplified and meshopt-compressed, textures converted to WebP. | GLB (glTF-Binary, generator RapidPipeline 3D Processor v7.1.0) | `/models/vehicle/khronos-carconcept.glb` | Khronos/3D Commerce logo textures removed (plate and emblem map solid black, tyre-side colour plain, sidewall normal logos flattened); gltf-transform optimize (meshopt, WebP <= 2048, simplify 0.0001; no join/flatten/instance/palette); node names re-verified | optimized | **Yes** |
| 2 | Kenney Car Kit 3.1: sedan / `vehicle` | **ready** | <https://kenney.nl/assets/car-kit> | Kenney (www.kenney.nl) | CC0 1.0 (<http://creativecommons.org/publicdomain/zero/1.0/>) | Yes | Yes | Yes | Not required (CC0). Optional: "Car Kit by Kenney (www.kenney.nl), CC0". | GLB with external texture Textures/colormap.png (kit also ships FBX and OBJ) | `/models/vehicle/kenney-car-kit.glb` | sedan.glb selected; external colormap.png embedded (gltf-transform copy); optimize (meshopt, WebP; no join/flatten/instance/palette); node names re-verified | optimized | **Yes** |
| 3 | Old Tyre (Poly Haven) / `other` | **ready** | <https://polyhaven.com/a/old_tyre> | MP | CC0 (<https://polyhaven.com/license>) | Yes | Yes | Yes | Not required (CC0). Optional: "Old Tyre by MP, Poly Haven (CC0)". | glTF + .bin + three 1k JPG textures (diffuse, normal, ARM) | `/models/other/polyhaven-old-tyre.glb` | .gltf + .bin + JPGs -> .glb (gltf-transform copy); optimize (meshopt, WebP; no join/flatten/instance/palette); node name re-verified | optimized | **Yes** |
| 4 | Engine Chevy Chevette 1977 / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/engine-chevy-chevette-1977-ef123ab4b01140179745751dab5d7864> | flow3d | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Engine Chevy Chevette 1977" (https://sketchfab.com/3d-models/engine-chevy-chevette-1977-ef123ab4b01140179745751dab5d7864) by flow3d is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Blender 2.83 (per description); Sketchfab archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 5 | Animated Engine V8 / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/animated-engine-v8-b0dbf778b81e4afba4edf11336e2a099> | meeww | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Animated Engine V8" (https://sketchfab.com/3d-models/animated-engine-v8-b0dbf778b81e4afba4edf11336e2a099) by meeww is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Blender, uploaded as Alembic .abc (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 6 | Low-poly animated engines / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/low-poly-animated-engines-243837fb3a40440485c8f8c39b6742ba> | Savalon (savalon) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Low-poly animated engines" (https://sketchfab.com/3d-models/low-poly-animated-engines-243837fb3a40440485c8f8c39b6742ba) by Savalon is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 7 | 4 stroke engine working piston and crank shaft / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/4-stroke-engine-working-piston-and-crank-shaft-624939477a4c4e368ba44d481a98792f> | ujjavalchauhan | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "4 stroke engine working piston and crank shaft" (https://sketchfab.com/3d-models/4-stroke-engine-working-piston-and-crank-shaft-624939477a4c4e368ba44d481a98792f) by ujjavalchauhan is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Blender (tags blender3d, bones); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 8 | Rigged 4-Cylinder Engine (FREE) / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/rigged-4-cylinder-engine-free-e14ebe68273d49a3becda6802270b4b0> | david.gnzlv | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Rigged 4-Cylinder Engine (FREE)" (https://sketchfab.com/3d-models/rigged-4-cylinder-engine-free-e14ebe68273d49a3becda6802270b4b0) by david.gnzlv is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Blender armature rig (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 9 | Inline-4 Engine Modelling & Rigging Study / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/inline-4-engine-modelling-rigging-study-652cf3def1ae40b7a6e546e62ed19778> | s1d.fx0 | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Inline-4 Engine Modelling & Rigging Study" (https://sketchfab.com/3d-models/inline-4-engine-modelling-rigging-study-652cf3def1ae40b7a6e546e62ed19778) by s1d.fx0 is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Blender (tags); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 10 | engine exploded view / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/engine-exploded-view-0a740cd20bfd4107a1e3c9fbcc5fe70b> | rondinellisophia | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "engine exploded view" (https://sketchfab.com/3d-models/engine-exploded-view-0a740cd20bfd4107a1e3c9fbcc5fe70b) by rondinellisophia is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 11 | Engine / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/engine-36c1f32d649c46df9f2f8b4d34cf32c7> | JuanG3D (juang3d) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Engine" (https://sketchfab.com/3d-models/engine-36c1f32d649c46df9f2f8b4d34cf32c7) by JuanG3D is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Moment of Inspiration 2, NURBS (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 12 | Piston and connecting rod / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/piston-and-connecting-rod-940d24ffb7864be898963391665fcc9f> | francobravo | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Piston and connecting rod" (https://sketchfab.com/3d-models/piston-and-connecting-rod-940d24ffb7864be898963391665fcc9f) by francobravo is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 13 | Spark Plug / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/spark-plug-306c0031ba8445a79897fa060791758a> | Vaughan.Staehr | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Spark Plug" (https://sketchfab.com/3d-models/spark-plug-306c0031ba8445a79897fa060791758a) by Vaughan.Staehr is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 14 | Camshaft / `engine` | candidate: requires sign-in | <https://sketchfab.com/3d-models/camshaft-1f1c66b214834f9887aab1ecb3111149> | IU Indianapolis University Library (IUI-UniversityLibrary) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Camshaft" (https://sketchfab.com/3d-models/camshaft-1f1c66b214834f9887aab1ecb3111149) by IU Indianapolis University Library is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | 3D scan (Creaform Go Scan 50), reverse-engineered in SolidWorks, edited in Maya (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 15 | Car Disc Brake / `braking` | candidate: requires sign-in | <https://sketchfab.com/3d-models/car-disc-brake-9e2440a2fa624b31abd0963902217407> | Joko_P (joko_p) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Car Disc Brake" (https://sketchfab.com/3d-models/car-disc-brake-9e2440a2fa624b31abd0963902217407) by Joko_P is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 16 | Brake Disk and Caliper / `braking` | candidate: requires sign-in | <https://sketchfab.com/3d-models/brake-disk-and-caliper-5feda9dbf20a49cf9fd29d550e55e4b9> | Vladi (vladivpg) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Brake Disk and Caliper" (https://sketchfab.com/3d-models/brake-disk-and-caliper-5feda9dbf20a49cf9fd29d550e55e4b9) by Vladi is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 17 | Brake Assembly / `braking` | candidate: requires sign-in | <https://sketchfab.com/3d-models/brake-assembly-d36d43ad176a45a18095c04b1754ea79> | Nieve5677 (niev) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Brake Assembly" (https://sketchfab.com/3d-models/brake-assembly-d36d43ad176a45a18095c04b1754ea79) by Nieve5677 is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 18 | [Free] Coilover Shock Absorber Damper / `suspension` | candidate: requires sign-in | <https://sketchfab.com/3d-models/free-coilover-shock-absorber-damper-92e61757780840a683abdd38c4e8a700> | Robert Prispilović (rprispil) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "[Free] Coilover Shock Absorber Damper" (https://sketchfab.com/3d-models/free-coilover-shock-absorber-damper-92e61757780840a683abdd38c4e8a700) by Robert Prispilović is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | 3ds Max + Substance Painter, 2K PBR (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 19 | MACHPERSON SUSPENSION (STRUD) / `suspension` | candidate: requires sign-in | <https://sketchfab.com/3d-models/machperson-suspension-strud-bd202ee134454402bf398ca906c8e2f5> | VR DESIGNER (vr.designer_09) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "MACHPERSON SUSPENSION (STRUD)" (https://sketchfab.com/3d-models/machperson-suspension-strud-bd202ee134454402bf398ca906c8e2f5) by VR DESIGNER is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | CAD-derived (tag cad); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 20 | Double Wishbone and Live Axle Suspension / `suspension` | candidate: requires sign-in | <https://sketchfab.com/3d-models/double-wishbone-and-live-axle-suspension-5cf0120b9bca4fd6a20c9357f7e5efaf> | BlackWΛVΞ (_BlackWAVE_) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Double Wishbone and Live Axle Suspension" (https://sketchfab.com/3d-models/double-wishbone-and-live-axle-suspension-5cf0120b9bca4fd6a20c9357f7e5efaf) by BlackWΛVΞ is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 21 | Chevy Impala *Rigged* By Frigon Tech / `vehicle` | candidate: requires sign-in | <https://sketchfab.com/3d-models/chevy-impala-rigged-by-frigon-tech-e1c7974b8cd34697a7d651fa73d02065> | Frigon Tech (frigontech), based on a model by Eques_inferno | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Chevy Impala *Rigged* By Frigon Tech" (https://sketchfab.com/3d-models/chevy-impala-rigged-by-frigon-tech-e1c7974b8cd34697a7d651fa73d02065) by Frigon Tech, based on "Chevrolet Impala 1967" (https://sketchfab.com/3d-models/chevrolet-impala-1967-bce35ef0c10d41fdb3f7d8c4225144d2) by Eques_inferno; both licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 22 | Rigged Car Mustang 1965 With Engine 3d model / `vehicle` | candidate: requires sign-in | <https://sketchfab.com/3d-models/rigged-car-mustang-1965-with-engine-3d-model-c2d4f0a6170d43f4a5a8303373ebb81a> | Godspeed (godspeedx14) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Rigged Car Mustang 1965 With Engine 3d model" (https://sketchfab.com/3d-models/rigged-car-mustang-1965-with-engine-3d-model-c2d4f0a6170d43f4a5a8303373ebb81a) by Godspeed is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 23 | Generic passenger car pack / `vehicle` | candidate: requires sign-in | <https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5> | Comrade1280 (comrade1280) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Generic passenger car pack" (https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5) by Comrade1280 is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 24 | Construct of the electric car Dubina Evo / `vehicle` | candidate: requires sign-in | <https://sketchfab.com/3d-models/construct-of-the-electric-car-dubina-evo-e27f1032f759436b95fbc851f9f68268> | Dubina (anton.dubina) | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Construct of the electric car Dubina Evo" (https://sketchfab.com/3d-models/construct-of-the-electric-car-dubina-evo-e27f1032f759436b95fbc851f9f68268) by Dubina is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Blender, scale 1.0 (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 25 | Driveshaft / `drivetrain` | candidate: requires sign-in | <https://sketchfab.com/3d-models/driveshaft-09b38796c78e49d6bbaf6b7fa63b856f> | PolyPhantom | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Driveshaft" (https://sketchfab.com/3d-models/driveshaft-09b38796c78e49d6bbaf6b7fa63b856f) by PolyPhantom is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 26 | rack and pinion / `steering` | candidate: requires sign-in | <https://sketchfab.com/3d-models/rack-and-pinion-9b199b652a874321980e0d2c19d5fd96> | ravindra.mohan09 | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "rack and pinion" (https://sketchfab.com/3d-models/rack-and-pinion-9b199b652a874321980e0d2c19d5fd96) by ravindra.mohan09 is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 27 | Mazda 787b / `vehicle` | candidate: requires sign-in | <https://www.blendkit.com/asset-gallery-detail/8afbb4b8-2406-4202-aea3-c4b463b3ab6d/> | Seatla Morake | CC0 1.0 (<https://creativecommons.org/publicdomain/zero/1.0/>) | Yes | Yes | Yes | Not required (CC0). Courtesy: "Mazda 787b" by Seatla Morake via BlenderKit/Blendkit. | Blender .blend (Cycles; unapplied modifiers: mirror, subsurf, solidify, wireframe, boolean, shrinkwrap); BlenderKit-generated glTF exists | `null` | None (not downloaded) | n/a | No |
| 28 | FourCylinderEngine (Fusion 360 CAD, per-part files) / `engine` | candidate: requires sign-in | <https://github.com/huggedd/FourCylinderEngine> | Serhii Studenets | MIT (<https://raw.githubusercontent.com/huggedd/FourCylinderEngine/main/LICENSE>) | Yes | Yes | Yes | **Required:** Copyright (c) 2025 Serhii Studenets. MIT License: include the copyright line and the MIT permission notice. | Autodesk Fusion 360 .f3d/.f3z (no glTF, STL or STEP); PDF drawings, PNG renders | `null` | None (not downloaded) | n/a | No |
| 29 | Hypoid Gear / `drivetrain` | rejected / not selected | <https://sketchfab.com/3d-models/hypoid-gear-6592b808326541dd8b887bcf3da44619> | C. Yamahata (cyamahat); CAD model by Dr Lunin (GrabCAD) | Labelled CC BY 4.0 on Sketchfab; underlying CAD licence unverified (<http://creativecommons.org/licenses/by/4.0/>) | Unclear | Unclear | Unclear | **Required:** "Hypoid Gear" (https://sketchfab.com/3d-models/hypoid-gear-6592b808326541dd8b887bcf3da44619) by C. Yamahata, CC BY 4.0; CAD model by Dr Lunin (https://grabcad.com/library/35-7-ratio-hypoid-gear-set-with-tooth-contact-localization-1), licence unverified | Blender animation of a GrabCAD CAD model by 'Dr Lunin' (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 30 | Manual Transmission/ gear box / `transmission` | rejected / not selected | <https://sketchfab.com/3d-models/manual-transmission-gear-box-811ce409dda746099924ac0b39d34140> | UnforgettableName | CC BY-NC 4.0 (<http://creativecommons.org/licenses/by-nc/4.0/>) | No | Yes | Unclear | **Required:** "Manual Transmission/ gear box" (https://sketchfab.com/3d-models/manual-transmission-gear-box-811ce409dda746099924ac0b39d34140) by UnforgettableName is licensed under CC BY-NC 4.0 (http://creativecommons.org/licenses/by-nc/4.0/) | unverified; archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 31 | RWD car suspension/chassis / `suspension` | rejected / not selected | <https://sketchfab.com/3d-models/rwd-car-suspensionchassis-108faf69976747c09a21968727a13255> | UnforgettableName | Sketchfab Free Standard (<https://sketchfab.com/licenses>) | Yes | Yes | Unclear | Not required under the Standard licence (help.sketchfab.com/en/articles/16152217); courtesy credit: "RWD car suspension/chassis" by UnforgettableName (Sketchfab) | made with '3D Modeling App' (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 32 | Alternator / `electrical` | rejected / not selected | <https://sketchfab.com/3d-models/alternator-e94842c63e6b4557a20f5751779c7e7f> | B0bik | CC BY 4.0 (<http://creativecommons.org/licenses/by/4.0/>) | Yes | Yes | Yes | **Required:** "Alternator" (https://sketchfab.com/3d-models/alternator-e94842c63e6b4557a20f5751779c7e7f) by B0bik is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) | Photogrammetry, RealityCapture, 200 photos (per description); archives glb/gltf/usdz/source | `null` | None (not downloaded) | n/a | No |
| 33 | Car Radiator PL / `cooling` | rejected / not selected | https://www.blenderkit.com/api/v1/search/?query=car+radiator+asset_type:model (asset id ed9a3b4c-37f1-4053-8afa-772d5ce11d7b; gallery page URL not verified) | Pierre-Louis Baril | BlenderKit Royalty Free (<https://www.blendkit.com/docs/licenses/licensing-faq/>) | Yes | Yes | No | Not formally required (the FAQ recommends crediting authors). | Blender .blend | `null` | None (not downloaded) | n/a | No |
| 34 | 2 Cylinder Engine (legacy glTF-Sample-Models) / `engine` | rejected / not selected | <https://github.com/KhronosGroupArchives/glTF-Sample-Models/tree/main/2.0/2CylinderEngine> | Unknown (original JT CAD source not stated; conversion credited to Okino Computer Graphics) | None stated: all rights reserved by default | No | No | No | - | GLB (JT -> COLLADA -> glTF; COLLADA2GLTF) | `null` | Downloaded to .asset-staging for read-only inspection only. | none | No |
| 35 | Gearbox Assy (legacy glTF-Sample-Models) / `transmission` | rejected / not selected | <https://github.com/KhronosGroupArchives/glTF-Sample-Models/tree/main/2.0/GearboxAssy> | Unknown (original JT CAD source not stated; conversion credited to Okino Computer Graphics) | None stated: all rights reserved by default | No | No | No | - | GLB (JT -> COLLADA -> glTF) | `null` | Downloaded to .asset-staging for read-only inspection only. | none | No |
| 36 | Buggy (legacy glTF-Sample-Models) / `vehicle` | rejected / not selected | <https://github.com/KhronosGroupArchives/glTF-Sample-Models/tree/main/2.0/Buggy> | Unknown (original JT CAD source not stated; conversion credited to Okino Computer Graphics) | None stated: all rights reserved by default | No | No | No | - | GLB (JT -> COLLADA -> glTF) | `null` | Downloaded to .asset-staging for read-only inspection only. | none | No |
| 37 | Cesium Milk Truck / `vehicle` | rejected / not selected | <https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMilkTruck> | Cesium | CC BY 4.0 (Cesium logo trademark excluded) (<https://creativecommons.org/licenses/by/4.0/legalcode>) | Yes | Yes | Yes | **Required:** "Cesium Milk Truck" © 2017 Cesium, CC BY 4.0. The Cesium logo is a trademark of Cesium. | GLB | `null` | Downloaded to .asset-staging for inspection only. | none | No |
| 38 | Toy Car / `vehicle` | rejected / not selected | <https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar> | Guido Odendahl (initial model, 2020); Eric Chadwick (extensions and scene composition, 2020) | CC0 1.0 (<https://creativecommons.org/publicdomain/zero/1.0/legalcode>) | Yes | Yes | Yes | Not required (CC0). | GLB | `null` | Downloaded to .asset-staging for inspection only. | none | No |
| 39 | ferrari.glb (three.js car materials example) / `vehicle` | rejected / not selected | <https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/ferrari.glb> | vicent091036 (per the three.js credit line) | Unknown/unverifiable (third-party model; not covered by the three.js MIT licence) | Unclear | Unclear | Unclear | **Required:** three.js credits it as: Ferrari 458 Italia model by vicent091036 | GLB (Draco-compressed; FBX2glTF) | `null` | Downloaded to .asset-staging for inspection only. | none | No |
| 40 | gears.glb (three.js TSL angular slicing example) / `other` | rejected / not selected | <https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/gears.glb> | Bruno Simon | MIT (three.js repository licence; per the verifier's correction) (<https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE>) | Yes | Yes | Yes | **Required:** gears.glb by Bruno Simon, from three.js (https://github.com/mrdoob/three.js), MIT License, Copyright © 2010-2026 three.js authors. Include the MIT permission notice. | GLB (Draco) | `null` | Downloaded to .asset-staging for inspection only. | none | No |
| 41 | Rusted Wheel Rim 01 (Poly Haven) / `other` | rejected / not selected | <https://polyhaven.com/a/rusted_wheel_rim_01> | John Hutcheson | CC0 (<https://polyhaven.com/license>) | Yes | Yes | Yes | Not required (CC0). | glTF + .bin + 1k JPG textures | `null` | Downloaded the 1k glTF set to .asset-staging for inspection only (2,597,489 bytes in total). | none | No |
| 42 | Portable Generator (Poly Haven) / `engine` | rejected / not selected | <https://polyhaven.com/a/portable_generator> | James Ray Cock | CC0 (<https://polyhaven.com/license>) | Yes | Yes | Yes | Not required (CC0). | glTF + .bin + 1k JPG textures | `null` | Downloaded the 1k glTF set to .asset-staging for inspection only (3,434,440 bytes in total). | none | No |
| 43 | crankshaft_cad (FreeCAD crankshaft) / `engine` | rejected / not selected | <https://github.com/Fouz-u/crankshaft_cad> | Fouz-u (GitHub user) | GPL-3.0 (<https://github.com/Fouz-u/crankshaft_cad/blob/main/LICENSE>) | Yes | Yes | Unclear | **Required:** GPL-3.0: keep the copyright and licence notices; derivatives must also be distributed under GPL-3.0. | FreeCAD .FCStd (crank shaft.FCStd, 154,477 bytes) | `null` | None (not downloaded) | n/a | No |
| 44 | Quaternius Cars Pack (8 cars) / `vehicle` | rejected / not selected | <https://quaternius.com/packs/cars.html> | Quaternius | CC0 (as stated on the pack page) (<https://creativecommons.org/publicdomain/zero/1.0/>) | Yes | Yes | Yes | Not required (CC0). | FBX, OBJ, Blend (no glTF listed) | `null` | None (not downloaded) | n/a | No |

---

## 3. Searches performed

**Sketchfab Data API v3.** All searches used `GET /v3/search?type=models&downloadable=true&sort_by=-likeCount&count=24&q=…`. Result counts are in brackets; 24 means the page was full.

- **Unfiltered:**
  - Vehicles: "car exploded" [24, mostly irrelevant], "car separate parts" [24, mostly irrelevant], "car rigged doors" [24], "car chassis" [24], "car disassembled" [24], "car doors open" [24], "car parts" [24].
  - Engines: "single cylinder engine" [24], "4 stroke engine" [24], "four stroke engine animation" [1], "engine piston crankshaft" [15], "car engine assembly" [24], "v8 engine" [24], "inline 4 engine" [24], "engine cutaway" [4], "cylinder head" [24], "camshaft valve" [5], "animated engine" [24], "engine animation" [24], "piston animation" [24, mostly pistols], "crankshaft" [24], "engine exploded" [15], "engine parts" [24], "engine block" [24], "spark plug" [24], "engine valve" [24], "four stroke" [16], "piston connecting rod" [19], "rigged engine" [24], "low poly engine" [24], "single cylinder" [24], "camshaft" [22].
  - Transmission and drivetrain: "manual gearbox" [24], "transmission gears" [24], "gearbox exploded" [0], "gearbox" [24], "clutch" [24], "gear box" [24], "5 speed gearbox" [13], "differential" [24], "driveshaft" [11], "differential gear" [24], "planetary gear" [24].
  - Brakes, suspension and steering: "disc brake caliper" [24], "brake assembly" [24], "brake disc" [24], "brake caliper" [24], "car suspension" [24], "double wishbone" [15], "macpherson strut" [5], "shock absorber" [24], "suspension assembly" [9], "coilover" [12], "wishbone suspension" [16], "steering rack" [24], "rack and pinion" [8].
  - Electrical and cooling: "alternator" [24], "radiator car" [24], "radiator" [24], "car radiator" [24].
- **With `license=by`:** "low poly car" [24], "car engine" [24], "car body" [24], "transmission" [24].
- **With `license=cc0`:**
  - "low poly car" [0], "sedan" [0].
  - "car" [24, all museum or biology scans, no cars].
  - "car engine" [1, the Science Museum catalytic converter].
  - "engine" [8, maritime and steam museum scans].
- **Lookups:** `GET /v3/models/<uid>` for 34 shortlisted uids (licence, user, faceCount, animationCount, description, materialCount), and `GET /v3/licenses`.

**Sketchfab terms and documentation:**

- These pages returned an empty body or HTTP 202 to both WebFetch and curl, and were not bypassed: <https://sketchfab.com/licenses>, <https://sketchfab.com/terms>, and the Data API and OAuth developer pages.
- Read: help articles 16152217 (Standard licence summary), 16152221 and 16152225 (both say the Store is closed), plus a web search on Free Standard redistribution.
- Read: <https://sketchfab.com/developers/download-api>, `/downloading-models` and `/guidelines`, all HTTP 200.
- Unauthenticated `GET https://api.sketchfab.com/v3/models/243837fb3a40440485c8f8c39b6742ba/download` returned HTTP 401 `Authentication credentials were not provided.`, which confirms that downloads need a token.
- Tried reading node names with the Sketchfab Viewer API `getNodeMap` on a temporary localhost page. The embed iframe did not load, so the attempt was abandoned and its temporary `.claude/launch.json` was removed.

**Other marketplaces:**

- CGTrader: read the terms and conditions (Royalty Free and free-model terms).
- Free3D: `/terms-and-conditions`, `/terms` and the home page all returned HTTP 403 from CloudFront, which was not bypassed. A web search found no first-party terms.
- BlenderKit/Blendkit:
  - The licences FAQ (`blenderkit.com/docs/licenses/` redirects with a 301 to `blendkit.com`).
  - A web search on Royalty Free redistribution.
  - Public search API queries: "engine" (non-automotive), "car engine" with `is_free:true` [33], "piston" [5, hydraulic], "gearbox" [3], "brake caliper" [34], "mazda 787b" (detail), "car radiator" (detail).
  - A HEAD request on the asset gallery page.

**GitHub and Khronos:**

- glTF-Sample-Assets:
  - `contents/Models` (162 entries; 2CylinderEngine, GearboxAssy and Buggy are absent, and requesting them returns 404).
  - README (its "Obsolete Interface" section lists removed unlicensed assets), `Models-issues.md` and `model-index.json`. A keyword filter over the index found CarConcept, CesiumMilkTruck, ChronographWatch, ClearCoatCarPaint, ToyCar and VirtualCity.
  - `metadata.json`, `LICENSE.md` and `README.body.md` for CarConcept, ToyCar and CesiumMilkTruck, and `LicenseRef-LegalMark-Khronos.txt`.
- Archived glTF-Sample-Models (its old name redirects with a 301 to KhronosGroupArchives, archived): `contents/2.0` (107 entries), plus the README of 2CylinderEngine, GearboxAssy, Buggy and ReciprocatingSaw and their file sizes.
- three.js:
  - `examples/webgl_materials_car.html`, which holds the Ferrari credit line.
  - `examples/models/gltf` (51 entries).
  - The commit history for `gears.glb` and `ferrari.glb`.
  - The Sketchfab API lookup for the Ferrari source, which returned 404.
  - Web searches on both models' licences.
- Repository searches through the GitHub API:
  - "four stroke engine three.js", "engine glb threejs piston", "piston crankshaft gltf", "car engine 3d model gltf".
  - "gearbox gltf", "disc brake 3d model glb", "car suspension three.js model", "exploded view engine three.js".
  - "crankshaft 3d model", "engine model glb", "car parts gltf", "vehicle glb cc0".
  - "piston animation three.js", "brake caliper three.js", "gearbox three.js", "differential gear three.js".
- Git trees inspected for model files and a LICENSE: alant-dev/four-stroke-engine-3d, Karthikk7293/buildverse, YASEILANEI/3D-Internal-Combustion-Engine-Interactive-Demo, Jaagrav/raycast-vehicle-engine, huggedd/FourCylinderEngine (and its `LICENSE`), git-Diptanshu/Crankshaft-Piston-Animation and Fouz-u/crankshaft_cad.
- Web searches for openly licensed single-cylinder, gearbox, disc-brake and suspension glTF models on GitHub.

**Free asset sites:**

- Kenney: the Car Kit page, then a HEAD and GET of the public zip (4,814,237 bytes).
- Poly Haven:
  - API `assets?t=models` (521 models), filtered for automotive keywords.
  - `/info` and `/files` for old_tyre, rusted_wheel_rim_01, portable_generator and covered_car.
  - The licence page.
- Quaternius: the cars pack page.
- Smithsonian 3D: `3d.si.edu` search and explore pages returned 403 to both WebFetch and curl, and `3d-api.si.edu` returned 404. None of this was bypassed. Three web searches were also run.
- Printables: model pages 104535 and 135305 returned 403. A web search was run for four-stroke engines made of separate STL parts.

**Independent licence check:** re-fetched the licence evidence for 33 of the 44 candidates. The verdicts are summarised in the manifest notes. Where a note says "not re-checked by the independent verifier", only the research pass looked at that licence.

---

## 4. How to add a Sketchfab model

Sketchfab's Download API documentation says that downloading needs an authenticated Sketchfab user, and the endpoint answers HTTP 401 without credentials (verified). AutoVerse never downloads at runtime: models are fetched once, offline, by a maintainer, then bundled.

1. **Get a token on your own Sketchfab account.** The documented method is an OAuth 2.0 access token sent as `Authorization: Bearer <token>`. See "Authenticating the user" at <https://sketchfab.com/developers/download-api/downloading-models>, which links to the Sketchfab Login (OAuth 2.0) docs. Sketchfab accounts also show a personal API token in their settings. Whether the download endpoint accepts it (`Authorization: Token <token>`) was **not verified**, because the Data API and OAuth doc pages were bot-gated. If that form returns 401, use an OAuth access token instead. Never commit a token.
2. **Export it in your shell only:**

   ```sh
   export SKETCHFAB_API_TOKEN='…'   # your own token; keep it out of .env files that are committed
   ```

3. **Re-check the licence** right before downloading, because licences can change:

   ```sh
   MODEL_UID=243837fb3a40440485c8f8c39b6742ba   # do not use UID: it is read-only in bash and zsh
   curl -s "https://api.sketchfab.com/v3/models/$MODEL_UID" | jq '{name, user: .user.username, license: .license.slug, url: .viewerUrl}'
   ```

   Accept `by` (CC BY) or `cc0` only. Reject `by-nc*`, `by-nd*` and `by-sa`, unless the project's licence strategy is reviewed first. Reject `st` and `free-st` as well.
4. **Request a temporary download link** using the documented endpoint:

   ```sh
   curl -s "https://api.sketchfab.com/v3/models/$MODEL_UID/download" \
     -H "Authorization: Bearer $SKETCHFAB_API_TOKEN" > /tmp/sf-download.json
   jq '.gltf' /tmp/sf-download.json   # { "url": "...", "size": ..., "expires": 300 }
   ```

   Per the docs, the JSON response holds short-lived links (`expires` is about 300 s) to a glTF zip archive (`scene.gltf`, `scene.bin`, `textures/`) and a USDZ when available. The archive URL needs no further authentication. Do not cache it.
5. **Download it into its own empty staging folder and convert it:**

   ```sh
   mkdir -p .asset-staging/sf-<id> && cd .asset-staging/sf-<id>
   curl -L -o model.zip "$(jq -r '.gltf.url' /tmp/sf-download.json)"
   unzip -q model.zip -d extracted
   npx -y @gltf-transform/cli@4 copy extracted/scene.gltf model.glb
   npx -y @gltf-transform/cli@4 inspect model.glb            # nodes, meshes, animations, bbox
   ```

   Treat the archive as untrusted data and never run anything inside it.
6. **Check part separation before going further.** Read the node tree, for example with `gltf-transform inspect`, or with a read-only JSON dump of `nodes[].name`. Confirm that the parts you need (piston, connecting rod, crankshaft, caliper, pads and so on) are separate, named nodes, and not one skinned mesh. Check for logos and badges in the textures and remove them; for branded vehicles, debadge them.
7. **Optimise without merging or flattening anything:**

   ```sh
   npx -y @gltf-transform/cli@4 optimize model.glb ../../public/models/<system>/<id>.glb \
     --join false --flatten false --instance false --palette false \
     --compress meshopt --texture-compress webp --texture-size 2048
   ```

   Inspect the result again and confirm that every node name you plan to map survived. Quantization may move a parent node's mesh into an unnamed child. That is fine, because the named group keeps its pivot.
8. **Update `public/models/manifest.json`.** Set:
   - `status: "ready"`, `localPath`, `processing`, `optimization: "optimized"`, `stats` and `framing` (up axis, size and front, read from `inspect`).
   - `componentMap`, using only node names you saw.
   - `license.attributionText`, in the form `"<title>" (<model url>) by <author> is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/)`, plus a modification notice if you changed the model.

   Then run `npm run validate:content` and add the credit to the app's credits page. Sketchfab's integration guidelines also ask apps to make clear that the models come from Sketchfab, so include the model link in the credit.

---

## 5. Licence caveats

- **CC BY 4.0:**
  - Credit the creator and link the source and licence, inside the app wherever the model is shown or on a credits page reachable from there.
  - Say when a model was modified. CC BY 4.0 §3(a)(1)(B) requires it; that is why Car Concept's attribution says "Modified for AutoVerse…".
  - CC BY grants **no trademark rights.**
- **CC0:** no conditions. Credit is courtesy only. CC0 also does not clear trademarks, so the Mazda 787b is still a Mazda.
- **NonCommercial (BY-NC) and NoDerivatives (BY-ND):** excluded.
  - NC blocks any commercial deployment of AutoVerse.
  - ND forbids the decimating, splitting and re-texturing we need.
  - The only gearbox candidate is BY-NC, which is why §1.3 is fully procedural.
- **ShareAlike (BY-SA):** excluded by default, because adapted models would have to be released under BY-SA.
- **Sketchfab Free Standard and Standard (`free-st`, `st`):** Sketchfab's help article says commercial use and derivatives are allowed without credit. Redistributing raw files in a public web bundle could not be verified, because the licence and terms pages were bot-gated. Treat these as not shippable until a human reads the terms.
- **Marketplace "royalty free" licences** usually allow use only when the model is embedded and cannot be extracted. A static web app serves raw `.glb` files that anyone can download, so these models do not fit.
  - **CGTrader** Royalty Free (§21A): products may not be given away as downloaded, and apps must take measures against extraction.
  - **BlenderKit** Royalty Free: assets "shouldn't be directly extractable in the distribution".
- **Free3D:** the terms could not be read (HTTP 403). Do not use Free3D models unless a human checks the licence.
- **GrabCAD and other derived works:** an uploader cannot relicense geometry they did not make. *Hypoid Gear* is rejected because its GrabCAD source needs the designer's permission for commercial use. Check the provenance of anything that says "model from …".
- **Unlicensed sample files:** no licence means all rights are reserved. This covers the legacy Khronos `2CylinderEngine`, `GearboxAssy` and `Buggy`, and three.js `ferrari.glb`. Code licences, such as the three.js MIT licence, do not cover third-party models committed to a repository.
- **GPL-3.0 CAD:** copyleft applies to derivatives, so it is not bundled.
- **Trademarks and logos:**
  - Car Concept's Khronos and 3D Commerce logos are excluded from its licence. They were removed: the licence-plate and emblem texture became solid black, the tyre-sidewall base colour became plain grey, and the logo sectors of the sidewall normal map were flattened. The originals are kept only in `.asset-staging/khronos-carconcept/work/original-logo-textures/`.
  - Debadge branded replicas (Chevrolet Impala, Ford Mustang, Mazda 787b, Chevrolet Chevette engine, Hitachi alternator), and keep brand names out of the UI except as plain description.
- **Platform-specific:** honour the `noai` tag on *Car Disc Brake* by not using it as AI training data. The CGTrader terms also forbid using free downloads for ML training.
