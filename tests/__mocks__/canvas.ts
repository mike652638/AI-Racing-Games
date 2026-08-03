/**
 * CanvasRenderingContext2D / HTMLCanvasElement 测试替身。
 *
 * 覆盖 renderer.ts 实际调用的全部 ctx 方法（fillRect/beginPath/moveTo/lineTo/closePath/
 * fill/save/restore/translate/rect/clip/drawImage/arc/setTransform/getImageData），
 * 以及 GameLoop 集成测试用到的元素方法（addEventListener/appendChild/setPointerCapture）；
 * 通过 __calls 记录各方法调用次数，供"渲染输出稳定/确实发生绘制"断言使用。
 */

/** ctx 方法调用计数（键为方法名） */
export interface MockCanvasCallCounts {
  [method: string]: number
}

/** mock 上下文：在 CanvasRenderingContext2D 基础上附加调用计数 */
export interface MockCanvasRenderingContext2D extends CanvasRenderingContext2D {
  __calls: MockCanvasCallCounts
}

/** mock canvas：在 HTMLCanvasElement 基础上附加上下文引用 */
export interface MockCanvas extends HTMLCanvasElement {
  __ctx: MockCanvasRenderingContext2D
}

export function createMockCanvas(width = 800, height = 600): MockCanvas {
  const calls: MockCanvasCallCounts = {}
  const record = (method: string): void => {
    calls[method] = (calls[method] ?? 0) + 1
  }
  const noop = (): void => undefined

  const ctx = {
    __calls: calls,
    fillStyle: '',
    fillRect: (): void => record('fillRect'),
    beginPath: (): void => record('beginPath'),
    moveTo: (): void => record('moveTo'),
    lineTo: (): void => record('lineTo'),
    closePath: (): void => record('closePath'),
    fill: (): void => record('fill'),
    save: (): void => record('save'),
    restore: (): void => record('restore'),
    translate: (): void => record('translate'),
    rect: (): void => record('rect'),
    clip: (): void => record('clip'),
    drawImage: (): void => record('drawImage'),
    arc: (): void => record('arc'),
    setTransform: (): void => record('setTransform'),
    getImageData: () => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    }),
  } as unknown as MockCanvasRenderingContext2D

  let currentWidth = width
  let currentHeight = height
  const canvas = {
    __ctx: ctx,
    getContext: (): MockCanvasRenderingContext2D => ctx,
    get width(): number {
      return currentWidth
    },
    set width(value: number) {
      currentWidth = value
    },
    get height(): number {
      return currentHeight
    },
    set height(value: number) {
      currentHeight = value
    },
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    setPointerCapture: noop,
  } as unknown as MockCanvas

  return canvas
}
