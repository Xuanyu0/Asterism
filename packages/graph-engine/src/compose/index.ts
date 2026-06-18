/**
 * compose/index.ts
 *
 * 功能：
 *     compose 层统一出口。arrangement（Step 7）和 cognitive（Step 8）
 *     的模块由对应 Step 填充。被 engine/src/index.ts re-export。
 */

export type { DraftPosition, ComposeIssue, ComposeResult } from './types'

export { applyBatch } from './pipeline'
export type { BatchOptions, PerOpResult, BatchResult } from './pipeline'

// arrangement
export { moveNode } from './arrangement/move'
export { adjustDistance, adjustOrbit } from './arrangement/adjust'
export type { DraftOrbitPosition } from './arrangement/adjust'
export { orbit } from './arrangement/orbit'
export type { OrbitParams } from './arrangement/orbit'
export { pathLayout } from './arrangement/path'
export type { PathParams } from './arrangement/path'

// cognitive
export { deconstruct } from './cognitive/deconstruct'
export type { DeconstructParams } from './cognitive/deconstruct'
export { diverge } from './cognitive/diverge'
export type { DivergeParams } from './cognitive/diverge'
export { induce } from './cognitive/induce'
export type { InduceParams } from './cognitive/induce'
export { internalize } from './cognitive/internalize'
export type { InternalizeParams } from './cognitive/internalize'
