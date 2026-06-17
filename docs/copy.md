






    operation: GraphOperation,      // 正向操作
    reversalData: ReversalData      // 逆转所需的前状态快照
}

撤销第 $k$ 步：用 reversalData 构造逆操作，执行 apply(G_k, op^{-1})，不需要从 $G_0$ 重放。撤销是 $O(1)$ 的。

回退到任意历史点：从最近的基线快照重放到目标步数。

这和 Phase 1 的 undoStack 在概念上一致——都是保存操作前的状态来支持 Ctrl+Z。区别是这里把逆转数据作为操作日志的固有部分持久化，而不是存在前端 store 的临时数组里。

---
你的方向我完全同意。需要我后续补到开发指南时，尽管说。