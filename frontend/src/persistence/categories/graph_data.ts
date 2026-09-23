/**
 * 图数据类别：自持 `graph:<id>` 键方案与 GraphData 序列化，委托介质存取。
 *
 * @remarks
 * 本层不知道介质是谁（不引用 storage API），只把 key + 字符串交给 medium/。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { listKeys, readString, removeKey, writeString, type WriteResult } from '../medium/local_storage'

const GRAPH_KEY_PREFIX = 'graph'
const GRAPH_KEY_SEPARATOR = ':'

/**
 * 图数据读取结果。
 *
 * @remarks
 * `missing`（key 不存在，正常状态）与 `corrupted`（JSON 解析失败，系统异常）在信号层面可区分。
 */
export type ReadResult<T> = { ok: true; value: T } | { ok: false; reason: 'missing' | 'corrupted' | 'unavailable' }

/** 序列化后的单条图数据：key 与 value 均为介质形态，供协调层批量提交。 */
export interface SerializedGraph {
    key: string
    value: string
}

/**
 * 根据 GraphId 从持久化读取一个 GraphData。
 *
 * @remarks
 * 只负责反序列化，不负责完整图校验；读取后是否接受该图由调用方决定。
 *
 * @param graphId - 目标图谱 ID
 * @returns 成功为 `{ ok: true, value }`；key 不存在为 missing，JSON 解析失败为 corrupted。
 */
export function loadGraph(graphId: GraphId): ReadResult<GraphData> {
    const stored = readString(createGraphStorageKey(graphId))
    if (!stored.ok) {
        return stored
    }

    try {
        return { ok: true, value: JSON.parse(stored.value) as GraphData }
    } catch {
        return { ok: false, reason: 'corrupted' }
    }
}

/**
 * 扫描持久化中所有已保存图谱的 GraphId 列表。
 *
 * @remarks
 * 只返回 key 前缀匹配 `graph:` 的条目，不反序列化 GraphData；调用方按需逐条 loadGraph。
 * 介质枚举失败报 unavailable，**不返回空列表**——空列表会掩盖读取失败（用户会以为数据没了）。
 * 返回的 ID 列表无序。
 *
 * @returns 成功 `{ ok: true, value }`；介质不可用 `{ ok: false, reason: 'unavailable' }`。
 */
export function listGraphIds(): ReadResult<GraphId[]> {
    const listed = listKeys()
    if (!listed.ok) {
        return listed
    }

    const prefix = `${GRAPH_KEY_PREFIX}${GRAPH_KEY_SEPARATOR}`
    const ids: GraphId[] = []

    for (const key of listed.value) {
        if (key.startsWith(prefix)) ids.push(key.slice(prefix.length) as GraphId)
    }

    return { ok: true, value: ids }
}

/**
 * 扫描持久化中所有已保存图谱，仅返回 kind === 'root' 的图 ID。
 *
 * @remarks
 * 待归位：反序列化全库图以读 kind 属域查询而非存储职责，混在类别层会让「抽取」与「归位」
 * 互相污染，故本步骤原样搬入、暂不归位。
 *
 * 规则：
 * 1. 需要反序列化 GraphData——开销大于 listGraphIds。
 * 2. 不会注册或修改 graphRegistry；返回的 ID 列表无序。
 * 3. 单图 missing / corrupted 跳过（原语义）；介质不可用则整体失败，不掩盖。
 *
 * @returns 成功 `{ ok: true, value }`；枚举或读取遇介质不可用 `{ ok: false, reason: 'unavailable' }`。
 */
export function listRootGraphIds(): ReadResult<GraphId[]> {
    const listed = listGraphIds()
    if (!listed.ok) {
        return listed
    }

    const rootIds: GraphId[] = []

    for (const graphId of listed.value) {
        const result = loadGraph(graphId)
        if (!result.ok) {
            if (result.reason === 'unavailable') return result
            continue
        }
        if (result.value.kind === 'root') rootIds.push(graphId)
    }

    return { ok: true, value: rootIds }
}

/**
 * 序列化全部待写图（在内存中先组装齐）。JSON 序列化属本类别职责，故由本函数产出介质形态。
 */
export function serializeGraphs(graphs: GraphData[]): SerializedGraph[] {
    return graphs.map((graph) => ({
        key: createGraphStorageKey(graph.id),
        value: JSON.stringify(graph),
    }))
}

/** 写入一条已序列化的图数据，覆盖同 id 旧值。 */
export function persistGraphEntry(entry: SerializedGraph): WriteResult {
    return writeString(entry.key, entry.value)
}

/** 删除一条图数据；对应图不存在不是错误。 */
export function removeGraphEntry(graphId: GraphId): WriteResult {
    return removeKey(createGraphStorageKey(graphId))
}

function createGraphStorageKey(graphId: GraphId): string {
    return `${GRAPH_KEY_PREFIX}${GRAPH_KEY_SEPARATOR}${graphId}`
}
