/**
 * localStorage 介质：唯一持有浏览器本地存储访问能力的模块，按 key 存取字符串。
 *
 * @remarks
 * 本层不解析数据（不认识 GraphData / JSON 结构），只搬运字符串。
 * 介质异常在这里翻译成结果 reason，上层只见到判别联合，不感知 DOMException：
 * ETC —— 将来换 IndexedDB 只改本层。
 */

/** 写失败的成因。 */
export type WriteFailureReason = 'quota-exceeded' | 'unavailable' | 'unknown'

/**
 * 写入结果。
 *
 * @remarks
 * reason 的成因：
 * - quota-exceeded：配额溢出（QuotaExceededError）
 * - unavailable：存储介质不可用（访问 storage 本身抛异常，如隐私模式禁用）
 * - unknown：其余未归类的写入异常
 */
export type WriteResult = { ok: true } | { ok: false; reason: WriteFailureReason }

/**
 * 字符串读取结果。
 *
 * @remarks
 * 缺 `corrupted`——JSON 解析是数据类别层的职责，介质只负责取回原始字符串。
 */
export type MediumReadResult = { ok: true; value: string } | { ok: false; reason: 'missing' | 'unavailable' }

/** 读取 key 对应的字符串；key 不存在为 missing，介质访问失败为 unavailable。 */
export function readString(key: string): MediumReadResult {
    let value: string | null
    try {
        value = localStorage.getItem(key)
    } catch {
        return { ok: false, reason: 'unavailable' }
    }

    return value === null ? { ok: false, reason: 'missing' } : { ok: true, value }
}

/** 写入 key 对应的字符串，覆盖旧值。 */
export function writeString(key: string, value: string): WriteResult {
    try {
        localStorage.setItem(key, value)
        return { ok: true }
    } catch (error) {
        return { ok: false, reason: classifyWriteError(error) }
    }
}

/** 删除 key。key 不存在不是错误。 */
export function removeKey(key: string): WriteResult {
    try {
        localStorage.removeItem(key)
        return { ok: true }
    } catch (error) {
        return { ok: false, reason: classifyWriteError(error) }
    }
}

/**
 * 枚举结果。
 *
 * @remarks
 * 介质枚举遇异常时报 unavailable，**不降级为空列表**——空列表会把「读不到」伪装成「没有数据」。
 */
export type MediumListResult = { ok: true; value: string[] } | { ok: false; reason: 'unavailable' }

/**
 * 列出介质中全部 key。
 *
 * @remarks
 * 只返回 key，前缀方案由数据类别层解释。任一 key 读取异常即整体报 unavailable，
 * 不返回部分结果（部分结果同样会掩盖失败）。
 */
export function listKeys(): MediumListResult {
    const keys: string[] = []
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key !== null) keys.push(key)
        }
    } catch {
        return { ok: false, reason: 'unavailable' }
    }

    return { ok: true, value: keys }
}

/**
 * 清空全部介质 key，仅供测试隔离使用（生产路径不调用）。
 */
export function resetMediumForTests(): void {
    localStorage.clear()
}

/**
 * 把介质写入异常归类为 reason。
 *
 * @remarks
 * 配额溢出兼容旧 code：标准为 name === 'QuotaExceededError'，
 * 部分浏览器用 22（QUOTA_EXCEEDED_ERR）/ 1014（Firefox NS_ERROR_DOM_QUOTA_REACHED）。
 */
function classifyWriteError(error: unknown): WriteFailureReason {
    if (error instanceof DOMException) {
        if (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014) {
            return 'quota-exceeded'
        }
        if (error.name === 'SecurityError') return 'unavailable'
    }

    return 'unknown'
}
