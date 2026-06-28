/**
 * infrastructure/index.ts
 *
 * 功能：
 *     infrastructure 层统一出口。被 engine/src/index.ts re-export。
 */

export { searchNodes } from './search'

export { hasCollisionAt, hasCollisionInDrafts } from './collision'

export {
    positionOnCircle,
    snapOrbit,
    distributeOnTiers,
    distributeOnLine,
    scatterInCircle,
    computeTierSpacing,
} from './placement'
