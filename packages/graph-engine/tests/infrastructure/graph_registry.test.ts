/**
 * graph_registry.test.ts
 *
 * Map CRUD、多图并存、覆盖注册、注销不存在 ID。
 */

import { describe, it, expect } from 'vitest'
import type { GraphId } from '../../src/types/graph_data'
import { createRegistry, registerGraph, getGraph, hasGraph, unregisterGraph, listGraphs } from '../../src/infrastructure/graph_registry'
import { assembleGraph, createNode } from '../test_case_factory'

describe('graph_registry', () => {
    it('createRegistry 创建空注册表', () => {
        const r = createRegistry()
        expect(listGraphs(r)).toHaveLength(0)
    })

    it('registerGraph + getGraph 往返', () => {
        const r = createRegistry()
        const g = assembleGraph({ id: 'g1' as GraphId, nodes: [], edges: [] })
        registerGraph(r, g)
        expect(hasGraph(r, 'g1' as GraphId)).toBe(true)
        expect(getGraph(r, 'g1' as GraphId)).toBe(g)
    })

    it('registerGraph 覆盖已存在图', () => {
        const r = createRegistry()
        const g1 = assembleGraph({ id: 'g1' as GraphId, nodes: [], edges: [], title: 'v1' })
        const g2 = assembleGraph({ id: 'g1' as GraphId, nodes: [], edges: [], title: 'v2' })
        registerGraph(r, g1)
        registerGraph(r, g2)
        expect(getGraph(r, 'g1' as GraphId)!.title).toBe('v2')
    })

    it('unregisterGraph 移除', () => {
        const r = createRegistry()
        const g = assembleGraph({ id: 'g1' as GraphId, nodes: [], edges: [] })
        registerGraph(r, g)
        unregisterGraph(r, 'g1' as GraphId)
        expect(hasGraph(r, 'g1' as GraphId)).toBe(false)
    })

    it('unregisterGraph 不存在 ID 时返回 false', () => {
        const r = createRegistry()
        expect(unregisterGraph(r, 'g-x' as GraphId)).toBe(false)
    })

    it('listGraphs 返回全部图', () => {
        const r = createRegistry()
        registerGraph(r, assembleGraph({ id: 'g1' as GraphId, nodes: [], edges: [] }))
        registerGraph(r, assembleGraph({ id: 'g2' as GraphId, nodes: [], edges: [] }))
        expect(listGraphs(r)).toHaveLength(2)
    })
})
