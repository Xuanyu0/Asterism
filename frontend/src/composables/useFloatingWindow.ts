/**
 * 说明：
 *
 *     浮空窗状态模块级单例。承载 default 工具交互会话中的浮空窗数据。
 *     window 级常驻 pointerdown 监听；窗打开时容器外点击即关闭。
 *
 * 调用契约：
 *
 *     1. 必须在 Pinia 安装后首次调用（close 内部使用 graphStore）。
 *     2. 后续调用返回同一实例。
 */

import { shallowRef, type Ref } from 'vue'

import type { NodeData, EdgeData } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'

/**
 * 说明：
 *
 *     useFloatingWindow 返回的浮空窗单例 API。
 *
 * 调用契约：
 *
 *     1. 同一时刻至多一个容器注册（组件挂载/卸载时切换）。
 */
interface FloatingWindowAPI {
    /** 当前浮空窗展示数据。null = 无浮空窗。 */
    floatingData: Ref<NodeData | EdgeData | null>

    /**
     * 说明：
     *
     *     写入浮空窗展示数据。
     *
     * 参数：
     *
     *     data — 要展示的节点或边数据。
     */
    open(data: NodeData | EdgeData): void

    /**
     * 说明：
     *
     *     关闭浮空窗：置空展示数据，并清空画布级校验结果（迁移自 ui_store 的联动行为）。
     *
     * 调用契约：
     *
     *     1. 置空是幂等的——无浮空窗时调用同样安全；但清校验是真实副作用，
     */
    close(): void

    /**
     * 说明：
     *
     *     注册/注销浮空窗根元素。组件挂载时传入元素，卸载时传入 null。
     *
     * 调用契约：
     *
     *     1. 幂等——重复注册同一元素 / 重复注销无副作用。
     */
    registerContainer(el: HTMLElement | null): void
}

let singleton: FloatingWindowAPI | null = null

/**
 * 说明：
 *
 *     获取浮空窗模块级单例（懒创建）。
 *
 * 调用契约：
 *
 *     1. 单例创建时即绑定 window pointerdown 监听（常驻），此后所有点击按
 *        外部点击规则处理——状态全部存于单例，监听回调不持有组件状态。
 *     2. 必须在 Pinia 安装后调用（close 内部使用 graphStore）。
 */
export function useFloatingWindow(): FloatingWindowAPI {
    if (!singleton) {
        singleton = createFloatingWindow()
    }
    return singleton
}

function createFloatingWindow(): FloatingWindowAPI {
    // shallowRef 保持 raw：浮空窗数据源自 graphView（shallowRef 下已 raw），
    // 避免 ref 深代理重新包装——default_tool 提交时无需 toRaw 解包
    const floatingData = shallowRef<NodeData | EdgeData | null>(null)
    let containerEl: HTMLElement | null = null

    function open(data: NodeData | EdgeData): void {
        floatingData.value = data
    }

    function close(): void {
        useGraphStore().clearValidationResult()

        floatingData.value = null
    }
    function registerContainer(el: HTMLElement | null): void {
        containerEl = el
    }

    // 外部点击规则：窗打开时，容器内点击不处理；容器未注册或点击在容器外一律关闭。
    // 监听随单例常驻，不随组件生命周期销毁——组件侧仅通过 registerContainer 上报容器。
    window.addEventListener('pointerdown', (event: PointerEvent) => {
        // 未开窗时点击画布不应误清错误通知
        if (floatingData.value === null) {
            return
        }

        // 内部点击判定：点击落在容器或其子孙元素上 = 用户在浮空窗内编辑，不关闭。
        // 用 contains 而非 === 是因为子元素（输入框/按钮等）均属内部点击；
        // instanceof Node 收窄 target 类型——contains 只接受 Node，
        // window 等非节点目标直接落入"外部点击"分支。
        const target = event.target
        if (
            containerEl &&
            target instanceof Node &&
            containerEl.contains(target)
        ) {
            return
        }

        close()
    })

    return {
        floatingData,
        open,
        close,
        registerContainer,
    }
}
