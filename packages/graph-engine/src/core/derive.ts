/**
 * 节点 form / abstractionLevel 的派生函数实现。
 *
 * 两个派生值均不持久化，读取时计算；权威源为 childGraphId（子图结构）。
 * 契约签名见 types/graph_data.ts 的 DeriveNodeForm / DeriveAbstractionLevel。
 */

import type {
    DeriveAbstractionLevel,
    DeriveNodeForm,
    GraphData,
    GraphId,
    KnowledgeNodeData,
} from '../types/graph_data'

/**
 * 推导节点 form（原子 / 抽象）。
 *
 * @remarks
 * 派生规则：`form === 'abstract'` ⟺ `childGraphId !== undefined`，
 * 权威源是子图结构（childGraphId）而非存储字段。O(1)。
 *
 * 实现声明为契约类型 DeriveNodeForm（graph_data.ts），签名不兼容时编译报错。
 */
export const deriveNodeForm: DeriveNodeForm = (node) =>
    node.childGraphId !== undefined ? 'abstract' : 'atomic'

/**
 * 推导节点 abstractionLevel：内部最大子图层数。
 *
 * @remarks
 * 知识节点沿 childGraphId 链递归推导：
 * 1. 无 childGraphId → 0（原子节点）
 * 2. 有 childGraphId 但子图不可达（lookupGraph 返回 undefined）→ 1（链中断防御）
 * 3. 子图可达 → 子图内所有知识节点 abstractionLevel 最大值 + 1（空子图 → 0 + 1 = 1）
 *
 * 引用节点解引用源节点推导（几何跟随原节点）：
 * - sourceGraphId / sourceNodeId 不可达 → 0（防御）
 * - 源节点为知识节点 → 与源节点自身推导一致
 *
 * 递归内部仅 knowledge 节点参与层级——引用节点（沟通节点）跳过，
 * 否则沟通节点指向父图，解引用会回到当前子图造成环。
 *
 * @param lookupGraph - 跨图查询函数。给定 graphId 返回对应 GraphData；未注册返回 undefined
 * @param node - 知识节点或引用节点（NodeData）
 * @returns 节点的 abstractionLevel（≥ 0）
 * @throws 当 childGraphId 链成环时抛错（数据损坏）
 *
 * 实现声明为契约类型 DeriveAbstractionLevel（graph_data.ts），签名不兼容时编译报错。
 */
export const deriveAbstractionLevel: DeriveAbstractionLevel = (
    lookupGraph,
    node,
) => {
    if (node.role === 'reference') {
        const sourceGraph = lookupGraph(node.sourceGraphId)
        const sourceNode = sourceGraph?.nodes.find(
            (n) => n.id === node.sourceNodeId,
        )
        // 源节点不可达（图未注册 / 源节点缺失 / 源节点非知识节点）→ 0，链中断防御
        if (sourceNode === undefined || sourceNode.role !== 'knowledge') {
            return 0
        }
        return deriveLevel(sourceNode, lookupGraph, new Set<GraphId>())
    } else {
        return deriveLevel(node, lookupGraph, new Set<GraphId>())
    }
    }
    

/**
 * 沿 childGraphId 链递归推导 abstractionLevel 的私有实现。仅处理知识节点。
 *
 * @param current - 当前知识节点
 * @param lookupGraph - 跨图查询函数
 * @param onPath - 当前推导路径上已访问的 graphId 集合（环检测）
 * @returns 当前节点的 abstractionLevel（≥ 0）
 * @throws 当 childGraphId 链成环时抛错（数据损坏）
 */
function deriveLevel(
    current: KnowledgeNodeData,
    lookupGraph: (graphId: GraphId) => GraphData | undefined,
    onPath: Set<GraphId>,
): number {
    const childGraphId = current.childGraphId
    if (childGraphId === undefined) return 0

    // 环检测：该子图已在当前推导路径上，说明 childGraphId 链成环（数据损坏）
    if (onPath.has(childGraphId)) {
        throw new Error(
            `deriveAbstractionLevel: childGraphId 链成环（graphId: ${childGraphId}）`,
        )
    }
    onPath.add(childGraphId)

    const childGraph = lookupGraph(childGraphId)
    let maxChildLevel = 0
    if (childGraph !== undefined) {
        for (const childNode of childGraph.nodes) {
            // 引用节点跳过：解引用会回到父图造成环
            if (childNode.role !== 'knowledge') continue
            const level = deriveLevel(childNode, lookupGraph, onPath)
            if (level > maxChildLevel) maxChildLevel = level
        }
    }

    onPath.delete(childGraphId)
    return maxChildLevel + 1
}
