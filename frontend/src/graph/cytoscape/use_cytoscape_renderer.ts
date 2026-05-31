/**
 * use_cytoscape_renderer.ts
 *
 * 功能：
 *     1. 创建 / 销毁 Cytoscape 实例
 *     2. 接收 CyElement[] 并同步到 Cytoscape
 *
 * 权限边界：
 *     - 不能读写 graph_store / draft_store / ui_store
 *     - 只能读投影 CyElements
 */

import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import type { Ref } from 'vue'
import type { CyElements } from './graph_element_mapper'
import { createCytoscapeStyle } from './cytoscape_style'

export function useCytoscapeRenderer(
    containerRef: Ref<HTMLElement | null>,
) {
    let cy: Core | null = null

    function mount(): void {
        if (!containerRef.value) {
            return
        }

        cy = cytoscape({
            container: containerRef.value,
            elements: [],
            style: createCytoscapeStyle(),
            layout: {
                name: 'preset',
            },
        })

        cy.resize()
        cy.fit()
    }

    function syncElements(elements: CyElements): void {
        if (!cy) {
            return
        }

        cy.json({
            elements,
        })

        cy.resize()
        cy.fit()
    }


    function destroy(): void {
        if (!cy) {
            return
        }

        cy.destroy()
        cy = null
    }

    function getInstance(): Core | null {
        return cy
    }

    return {
        mount,
        syncElements,
        destroy,
        getInstance,
    }
}
