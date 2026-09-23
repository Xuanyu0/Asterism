/**
 * 视图状态类别：上次活跃根图 ID 的键方案与存取。
 *
 * @remarks
 * 本步骤从旧持久化实现原样搬入（键名 `last-active-root-id` 与行为不变），
 * §2 收编导航卡片位置时才改造键结构与 API 形状。
 */

import type { GraphId } from '@my-project/graph-engine'

import { readString, removeKey, writeString, type WriteResult } from '../medium/local_storage'

const LAST_ACTIVE_ROOT_KEY = 'last-active-root-id'

/**
 * 持久化用户最近一次使用的根图 ID。
 *
 * @remarks
 * 由 loadGraphToView 在加载成功后调用，启动时 restoreLastActiveRootId 据此恢复上次视图。
 * 只存储根图 ID，不校验对应图是否存在。
 *
 * @param rootId - 根图 ID
 * @returns 写入结果；失败时 reason 可判别。
 */
export function saveLastActiveRootId(rootId: GraphId): WriteResult {
    return writeString(LAST_ACTIVE_ROOT_KEY, rootId)
}

/**
 * 读取用户最近一次使用的根图 ID。
 *
 * @returns 从未保存过或介质不可用时为 null；不校验对应 GraphData 是否存在或合法。
 */
export function loadLastActiveRootId(): GraphId | null {
    const stored = readString(LAST_ACTIVE_ROOT_KEY)
    return stored.ok ? (stored.value as GraphId) : null
}

/**
 * 清除记录的最后活跃根图 ID。
 *
 * @remarks
 * 由 deleteGraphTree 在删除根图后调用，防止启动时尝试恢复已不存在的根图。
 * 只清标记，不删除任何 GraphData。
 *
 * @returns 删除结果；失败时 reason 可判别。
 */
export function clearLastActiveRootId(): WriteResult {
    return removeKey(LAST_ACTIVE_ROOT_KEY)
}
