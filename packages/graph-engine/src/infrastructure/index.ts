/**
 * infrastructure/index.ts
 *
 * 功能：
 *     infrastructure 层统一出口。被 engine/src/index.ts re-export。
 */

export {
    createRegistry,
    registerGraph,
    getGraph,
    hasGraph,
    unregisterGraph,
    listGraphs,
} from './graph_registry'

export { searchNodes } from './search'

export { constrainPosition, hasCollisionAt } from './collision'

export {
    positionOnCircle,
    snapOrbit,
    distributeOnTiers,
    distributeOnLine,
    scatterInCircle,
    computeTierSpacing,
} from './placement'
