/**
 * 功能：
 *
 *     cytoscape-canvas 扩展的 TS 类型声明。
 */

declare module 'cytoscape-canvas' {
    const cytoscapeCanvas: cytoscape.Ext
    export default cytoscapeCanvas
}

declare namespace cytoscape {
    interface CyCanvasInstance {
        getCanvas(): HTMLCanvasElement
        resetTransform(ctx: CanvasRenderingContext2D): void
        setTransform(ctx: CanvasRenderingContext2D): void
        clear(ctx: CanvasRenderingContext2D): void
    }

    interface CyCanvasOptions {
        zIndex?: number
    }

    interface Core {
        cyCanvas(options?: CyCanvasOptions): CyCanvasInstance
    }
}
