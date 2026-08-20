/**
 * 功能：
 *
 *     提供 GraphData 的本地持久化能力。
 *     当前阶段使用 localStorage 保存、读取、删除单个知识图谱。
 *
 * 总体结构：
 *
 *     1. 统一定义本地存储 key 的生成规则。
 *     2. 提供保存图谱 saveGraph()。
 *     3. 提供读取图谱 loadGraph()。
 *     4. 提供删除图谱 deleteGraph()。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'
import type { PersistenceAdapter } from '@my-project/graph-engine'

const GRAPH_STORAGE_PREFIX = 'graph'

/**
 * 功能：
 *
 *     根据 GraphId 生成 localStorage 中使用的唯一 key。
 *
 * 规则：
 *
 *     1. 同一个 GraphId 永远生成同一个 key。
 *     2. 不同 GraphId 必须生成不同 key。
 *     3. 外部模块不应该自己拼接 key，必须通过本函数统一生成。
 */
function createGraphStorageKey(graphId: GraphId): string {
    return `${GRAPH_STORAGE_PREFIX}:${graphId}`
}

/**
 * 功能：
 *
 *     将一个完整 GraphData 保存到浏览器 localStorage。
 *
 * 规则：
 *
 *     1. 保存单位是完整 GraphData，不保存局部节点或局部边。
 *     2. graph.id 是持久化 key 的唯一依据。
 *     3. 如果同一个 graph.id 已经存在旧数据，本函数会覆盖旧数据。
 *     4. 本函数只负责保存，不负责校验图是否合法。
 *     5. 调用本函数前，调用方应确保 GraphData 已经过 Validator 或 Store Runtime 处理。
 */
export function saveGraph(graph: GraphData): void {
    const storageKey = createGraphStorageKey(graph.id)
    const serializedGraph = JSON.stringify(graph)

    localStorage.setItem(storageKey, serializedGraph)
}

/**
 * 说明：
 *
 *     loadGraph 的返回判别联合，使"图不存在"（正常状态）与"图损坏"（系统异常）在信号层面可区分。
 */
export type LoadGraphResult =
    | { ok: true; graph: GraphData }
    | { ok: false; reason: 'missing' | 'corrupted' }

/**
 * 功能：
 *
 *     根据 GraphId 从浏览器 localStorage 读取一个 GraphData。
 *
 * 规则：
 *
 *     1. key 不存在（missing）→ `{ ok: false, reason: 'missing' }`。
 *     2. localStorage 中的数据不是合法 JSON（corrupted，JSON.parse 抛异常）→ `{ ok: false, reason: 'corrupted' }`。
 *     3. 反序列化成功 → `{ ok: true, graph }`。
 *     4. 本函数只负责反序列化，不负责完整图校验。
 *     5. 读取后是否接受该图，应该由调用方决定。
 */
export function loadGraph(graphId: GraphId): LoadGraphResult {
    const storageKey = createGraphStorageKey(graphId)
    const serializedGraph = localStorage.getItem(storageKey)

    if (!serializedGraph) {
        return { ok: false, reason: 'missing' }
    }

    try {
        return { ok: true, graph: JSON.parse(serializedGraph) as GraphData }
    } catch {
        return { ok: false, reason: 'corrupted' }
    }
}

/**
 * 功能：
 *
 *     根据 GraphId 删除 localStorage 中保存的 GraphData。
 *
 * 规则：
 *
 *     1. 只删除对应 GraphId 的图谱数据。
 *     2. 如果对应 GraphData 不存在，本函数不会报错。
 *     3. 本函数不会修改 graph_store.graphView。
 *     4. 调用方如果需要同步当前运行时状态，需要自己处理。
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
 * **已知问题**：
 *
 *     本函数全量扫描 localStorage 中所有 `graph:` 条目，不区分根图/子图、
 *     不按项目隔离。当前单用户场景下运行效果正常，但若存在多套独立图谱
 *     （如"数学"+"编程"两个根图），此函数会将两套图的全部节点混合返回。
 *     registry、findCommonLayer、diverge 跨图搜索等下游均受影响。
 *
 * 规则：
 *
 *     1. 只返回 key 前缀匹配 `GRAPH_STORAGE_PREFIX` 的条目。
 *     2. 不反序列化 GraphData——调用方按需逐条 loadGraph。
 *     3. 返回的 ID 列表无序。
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

/**
 * 功能：
 *
 *     扫描 localStorage 中所有已保存图谱，仅返回 kind === 'root' 的图 ID.
 *
 *     本函数是 useLifecycleAdapter.restoreLastRootTree 的下层依赖。启动时注册表仅包含根图，
 *     子图在需要时通过惰性加载（getGraphById / makeLookup）按需注册。
 *
 * 规则：
 *
 *     1. 只扫描前缀匹配 `GRAPH_STORAGE_PREFIX` 的条目。
 *     2. 需要反序列化 GraphData 以读取 kind 字段——开销大于 listSavedGraphIds。
 *     3. 不会注册或修改 graphRegistry。
 *     4. 返回的 ID 列表无序。
 */
export function listRootGraphIds(): GraphId[] {
    const allIds = listSavedGraphIds()
    const rootIds: GraphId[] = []

    for (const id of allIds) {
        const result = loadGraph(id)
        if (result.ok && result.graph.kind === 'root') {
            rootIds.push(id)
        }
    }

    return rootIds
}

const LAST_ACTIVE_ROOT_KEY = 'last-active-root-id'

/**
 * 功能：
 *
 *     将用户最近一次使用的根图 ID 持久化到 localStorage。
 *
 *     启动时 useLifecycleAdapter.restoreLastRootTree 通过此值确定注入哪个根图到注册表。
 *
 * 规则：
 *
 *     1. 只存储根图 ID，不存储子图或其它类型图的 ID。
 *     2. 由 loadGraphToView 在加载成功后自动调用。
 *     3. 如果同一个 rootId 已存在旧值，本函数会覆盖。
 */
export function saveLastActiveRootId(rootId: GraphId): void {
    localStorage.setItem(LAST_ACTIVE_ROOT_KEY, rootId)
}

/**
 * 功能：
 *
 *     从 localStorage 读取用户最近一次使用的根图 ID。
 *
 * 规则：
 *
 *     1. 如果从未保存过 lastActiveRootId，返回 null。
 *     2. 本函数只返回 ID 字符串，不校验对应的 GraphData 是否存在或合法。
 *     3. 调用方（useLifecycleAdapter.restoreLastRootTree）需自行 loadGraph 并验证 kind === 'root'。
 */
export function loadLastActiveRootId(): GraphId | null {
    return localStorage.getItem(LAST_ACTIVE_ROOT_KEY) as GraphId | null
}

/**
 * 功能：
 *
 *     清除 localStorage 中记录的最后活跃根图 ID。
 *
 * 规则：
 *
 *     1. 由 deleteRootGraphTree 在删除根图后调用——
 *        防止 useLifecycleAdapter.restoreLastRootTree 启动时尝试加载已不存在的根图。
 *     2. 本函数只清除标记，不删除任何 GraphData。
 */
export function clearLastActiveRootId(): void {
    localStorage.removeItem(LAST_ACTIVE_ROOT_KEY)
}

/**
 * 功能：
 *
 *     localStorage 持久化适配器。实现引擎 PersistenceAdapter 接口契约。
 *
 * 规则：
 *
 *     1. 所有方法返回 Promise——引擎接口要求异步，当前实现为同步包装。
 *     2. Phase 3 切换 Supabase 时只需替换此对象，调用方（graph_store）无需修改。
 */
export const localStorageAdapter: PersistenceAdapter = {
    async load(graphId: GraphId): Promise<GraphData | null> {
        // 引擎 PersistenceAdapter 契约保持 GraphData | null，此处桥接判别联合为 null 语义。
        const result = loadGraph(graphId)
        return result.ok ? result.graph : null
    },

    async save(graph: GraphData): Promise<void> {
        saveGraph(graph)
    },

    async delete(graphId: GraphId): Promise<void> {
        deleteGraph(graphId)
    },

    async list(): Promise<GraphData[]> {
        const ids = listSavedGraphIds()

        return ids
            .map((id) => loadGraph(id))
            .filter(
                (result): result is LoadGraphResult & { ok: true } => result.ok,
            )
            .map((result) => result.graph)
    },
}
