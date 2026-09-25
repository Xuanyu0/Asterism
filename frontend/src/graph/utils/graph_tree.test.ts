/**
 * graph_tree.test.ts
 *
 * 功能：
 *     图谱树成员收集纯算法 collectDescendantIds 的单元测试。
 *     覆盖多级子树收集、跨树隔离、环防御（自环 / 互环）、rootId 不在集合时的返回。
 *
 * 规则：
 *     1. 只测纯算法，不涉及持久化 / store / 组件 —— 数据源与失败语义由各消费者自行测试。
 *     2. 入参为结构化类型（id + parentGraphId），自环 / 互环等坏数据由此直接构造。
 */

import type { GraphId } from '@my-project/graph-engine'

import { collectDescendantIds } from './graph_tree'

describe('collectDescendantIds', () => {
    test('收集根图与全部后代（多级），根图在首', () => {
        const tree = collectDescendantIds('r' as GraphId, [
            graph('r'),
            graph('a', 'r'),
            graph('b', 'a'),
            graph('c', 'a'),
        ])

        expect(tree[0]).toBe('r')
        expect(new Set(tree)).toEqual(new Set(['r', 'a', 'b', 'c']))
    })

    test('不收集其他图谱树的图', () => {
        const tree = collectDescendantIds('r' as GraphId, [
            graph('r'),
            graph('a', 'r'),
            graph('other-root'),
            graph('other-sub', 'other-root'),
        ])

        expect(tree).toEqual(['r', 'a'])
    })

    test('环防御：自环 / 互环坏数据不导致死循环，也不混入无关图', () => {
        const tree = collectDescendantIds('r' as GraphId, [
            graph('r'),
            graph('a', 'r'),
            graph('self', 'self'),
            graph('x', 'y'),
            graph('y', 'x'),
        ])

        expect(new Set(tree)).toEqual(new Set(['r', 'a']))
    })

    test('自环根：visited 防止同一图被重复入队（无 visited 会死循环）', () => {
        const tree = collectDescendantIds('r' as GraphId, [graph('r', 'r'), graph('a', 'r')])

        expect(new Set(tree)).toEqual(new Set(['r', 'a']))
    })

    test('rootId 不在集合中 → 仅含自身，不回退全量', () => {
        expect(collectDescendantIds('ghost' as GraphId, [graph('a', 'r')])).toEqual(['ghost'])
    })
})

function graph(id: string, parentGraphId?: string): { id: GraphId; parentGraphId?: GraphId } {
    return { id: id as GraphId, parentGraphId: parentGraphId as GraphId | undefined }
}
