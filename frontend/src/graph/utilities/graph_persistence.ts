/**
 * 功能：
 *     提供 GraphData 的本地持久化能力。
 *     当前阶段使用 localStorage 保存、读取、删除单个知识图谱。
 *
 * 总体结构：
 *     1. 统一定义本地存储 key 的生成规则。
 *     2. 提供保存图谱 saveGraph()。
 *     3. 提供读取图谱 loadGraph()。
 *     4. 提供删除图谱 deleteGraph()。
 *
 * 外部如何使用：
 *     graph_store.ts 不直接操作 localStorage。
 *     graph_store.ts 只调用本文件暴露的函数。
 *
 *     示例：
 *         saveGraph(currentGraph)
 *         const graph = loadGraph(graphId)
 *         deleteGraph(graphId)
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

const GRAPH_STORAGE_PREFIX = 'graph'

/**
 * 功能：
 *     根据 GraphId 生成 localStorage 中使用的唯一 key。
 *
 * 规则：
 *     1. 同一个 GraphId 永远生成同一个 key。
 *     2. 不同 GraphId 必须生成不同 key。
 *     3. 外部模块不应该自己拼接 key，必须通过本函数统一生成。
 *
 * 使用：
 *     const storageKey = createGraphStorageKey(graphId)
 */
function createGraphStorageKey(graphId: GraphId): string {
    return `${GRAPH_STORAGE_PREFIX}:${graphId}`
}

/**
 * 功能：
 *     将一个完整 GraphData 保存到浏览器 localStorage。
 *
 * 规则：
 *     1. 保存单位是完整 GraphData，不保存局部节点或局部边。
 *     2. graph.id 是持久化 key 的唯一依据。
 *     3. 如果同一个 graph.id 已经存在旧数据，本函数会覆盖旧数据。
 *     4. 本函数只负责保存，不负责校验图是否合法。
 *     5. 调用本函数前，调用方应确保 GraphData 已经过 Validator 或 Store Runtime 处理。
 *
 * 使用：
 *     saveGraph(currentGraph)
 */
export function saveGraph(graph: GraphData): void {
    const storageKey = createGraphStorageKey(graph.id)
    const serializedGraph = JSON.stringify(graph)

    localStorage.setItem(storageKey, serializedGraph)
}

/**
 * 功能：
 *     根据 GraphId 从浏览器 localStorage 读取一个 GraphData。
 *
 * 规则：
 *     1. 如果找不到对应 GraphData，返回 null。
 *     2. 如果 localStorage 中的数据不是合法 JSON，返回 null。
 *     3. 本函数只负责反序列化，不负责完整图校验。
 *     4. 读取后是否接受该图，应该由调用方决定。
 *
 * 使用：
 *     const graph = loadGraph(graphId)
 *
 *     if (graph) {
 *         graphStore.setCurrentGraph(graph)
 *     }
 */
export function loadGraph(graphId: GraphId): GraphData | null {
    const storageKey = createGraphStorageKey(graphId)
    const serializedGraph = localStorage.getItem(storageKey)

    if (!serializedGraph) {
        return null
    }

    try {
        return JSON.parse(serializedGraph) as GraphData
    } catch {
        return null
    }
}

/**
 * 功能：
 *     根据 GraphId 删除 localStorage 中保存的 GraphData。
 *
 * 规则：
 *     1. 只删除对应 GraphId 的图谱数据。
 *     2. 如果对应 GraphData 不存在，本函数不会报错。
 *     3. 本函数不会修改 graph_store.currentGraph。
 *     4. 调用方如果需要同步当前运行时状态，需要自己处理。
 *
 * 使用：
 *     deleteGraph(graphId)
 */
export function deleteGraph(graphId: GraphId): void {
    const storageKey = createGraphStorageKey(graphId)

    localStorage.removeItem(storageKey)
}

/**
 * 功能：
 *
 *     扫描 localStorage 中所有已保存图谱的 GraphId 列表。
 *
 * 规则：
 *
 *     1. 只返回 key 前缀匹配 `GRAPH_STORAGE_PREFIX` 的条目。
 *     2. 不反序列化 GraphData——调用方按需逐条 loadGraph。
 *     3. 返回的 ID 列表无序。
 *
 * 使用：
 *
 *     const ids = listSavedGraphIds()
 *     for (const id of ids) {
 *         const graph = loadGraph(id)
 *         registerGraph(registry, graph)
 *     }
 */
export function listSavedGraphIds(): GraphId[] {
    const ids: GraphId[] = []
    const prefix = `${GRAPH_STORAGE_PREFIX}:`

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) {
            ids.push(key.slice(prefix.length))
        }
    }

    return ids
}
