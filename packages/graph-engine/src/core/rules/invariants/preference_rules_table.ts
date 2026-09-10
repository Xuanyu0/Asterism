/**
 * 图不变量偏好规则的默认开关表。
 *
 * @remarks
 * 无前端 UI 阶段手动开关偏好规则的唯一入口：把某 code 的值改为 `false` 即关闭对应偏好
 * 规则（`true` / 缺省 = 执行）。check_invariants.ts 以本表为偏好规则的唯一开关数据源。
 * 硬性不变量不在此表：恒跑、缺席配置面（见 structural.ts）。
 *
 * 每条开关的规则内容见行内注释；触发阈值常量定义于 preferences.ts
 * （NODE_LABEL_MAX_LENGTH / EDGE_LABEL_MAX_LENGTH / SUMMARY_MAX_LENGTH / NODE_*_LIMIT），
 * 调整阈值请改那里，本表只控制规则启停。
 */

/**
 * 偏好规则开关配置：key 为偏好规则 code，value 为 true 执行、false 跳过。
 *
 * @remarks
 * 只作用于偏好规则（硬性规则恒跑、缺席配置面）。key 与 PREFERENCE_RULES 注册 code 对应，
 * 亦允许携带任意额外 code——执行侧按 `table[code] ?? true` 查询，缺省开启。
 */
export interface PreferenceRulesTable {
    [ruleCode: string]: boolean
}

/**
 * 默认偏好开关表：7 个偏好 code 默认全部开启。
 */
export const DEFAULT_PREFERENCE_RULES_TABLE: PreferenceRulesTable = {
    NODE_LABEL_TOO_LONG: true, // 节点标签过长（> 20 字，阈值 NODE_LABEL_MAX_LENGTH）
    NODE_SUMMARY_TOO_LONG: true, // 节点摘要 / 启发上下文摘要过长（> 80 字，阈值 SUMMARY_MAX_LENGTH）
    EDGE_LABEL_TOO_LONG: true, // 边标签过长（> 20 字，阈值 EDGE_LABEL_MAX_LENGTH）
    VIRTUAL_NODE_TOO_MANY_VIRTUAL_NEIGHBORS: true, // 虚节点连接超过 1 个虚邻居（视觉歧义）
    NODE_COUNT_SOFT_LIMIT_EXCEEDED: true, // 节点数超过 NODE_SOFT_LIMIT（当前 50），建议抽象（info）
    NODE_COUNT_WARNING_LIMIT_EXCEEDED: true, // 节点数超过 NODE_WARNING_LIMIT（当前 100），强烈建议抽象（warning）
    NODE_COUNT_HARD_LIMIT_EXCEEDED: true, // 节点数超过 NODE_HARD_LIMIT（当前 150），禁止继续添加（error）
}
