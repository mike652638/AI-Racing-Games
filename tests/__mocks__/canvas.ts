/**
 * CanvasRenderingContext2D / HTMLCanvasElement 测试替身。
 *
 * 覆盖 renderer.ts 实际调用的全部 ctx 方法（fillRect/beginPath/moveTo/lineTo/closePath/
 * fill/save/restore/translate/rect/clip/drawImage/arc/rotate/createLinearGradient/createRadialGradient/
 * addColorStop/setTransform/getImageData），
 * 以及 GameLoop 集成测试用到的元素方法（addEventListener/appendChild/setPointerCapture）；
 * 通过 __calls 记录各方法调用次数、__args 记录各方法调用实参（二者一一对应），
 * 供"渲染输出稳定/确实发生绘制/坐标整数对齐"断言使用。
 */

/** ctx 方法调用计数（键为方法名） */
export interface MockCanvasCallCounts {
  [method: string]: number
}

/** ctx 方法调用实参记录（键为方法名，值为每次调用的实参数组，按调用顺序追加） */
export interface MockCanvasArgRecords {
  [method: string]: unknown[][]
}

/** mock 上下文：在 CanvasRenderingContext2D 基础上附加调用计数与实参记录 */
export interface MockCanvasRenderingContext2D extends CanvasRenderingContext2D {
  __calls: MockCanvasCallCounts
  __args: MockCanvasArgRecords
}

/** mock canvas：在 HTMLCanvasElement 基础上附加上下文引用 */
export interface MockCanvas extends HTMLCanvasElement {
  __ctx: MockCanvasRenderingContext2D
}

export function createMockCanvas(width = 800, height = 600): MockCanvas {
  const calls: MockCanvasCallCounts = {}
  const argRecords: MockCanvasArgRecords = {}
  const record = (method: string, args: unknown[]): void => {
    calls[method] = (calls[method] ?? 0) + 1
    const list = argRecords[method] ?? []
    list.push(args)
    argRecords[method] = list
  }
  const noop = (): void => undefined

  /** 当前 fillStyle（getter/setter 供 fillRect 快照记录每次调用时的颜色） */
  let currentFillStyle: string | CanvasGradient = ''

  /**
   * fillRect 颜色快照：字符串原样记录；渐变等对象统一为占位符。
   * 渐变对象为每次 createLinearGradient 新建的独立实例（函数引用不同），
   * 跨 canvas 的 toEqual 序列比较会因此失败（renderer-state drawingArgs），故规范化。
   */
  function normalizeFillStyle(value: string | CanvasGradient): string {
    return typeof value === 'string' ? value : '<gradient>'
  }

  const ctx = {
    __calls: calls,
    __args: argRecords,
    get fillStyle(): string | CanvasGradient {
      return currentFillStyle
    },
    set fillStyle(value: string | CanvasGradient) {
      currentFillStyle = value
    },
    strokeStyle: '',
    lineWidth: 1,
    // fillRect 记录 5 元组 [x, y, w, h, fillStyle]：追加颜色快照供"颜色 + 位置"断言使用
    // （既有断言只取索引 0-3，追加第 5 项向后兼容）
    fillRect: (...args: unknown[]): void => record('fillRect', [...args, normalizeFillStyle(currentFillStyle)]),
    beginPath: (...args: unknown[]): void => record('beginPath', args),
    moveTo: (...args: unknown[]): void => record('moveTo', args),
    lineTo: (...args: unknown[]): void => record('lineTo', args),
    closePath: (...args: unknown[]): void => record('closePath', args),
    fill: (...args: unknown[]): void => record('fill', args),
    stroke: (...args: unknown[]): void => record('stroke', args),
    save: (...args: unknown[]): void => record('save', args),
    restore: (...args: unknown[]): void => record('restore', args),
    translate: (...args: unknown[]): void => record('translate', args),
    rect: (...args: unknown[]): void => record('rect', args),
    clip: (...args: unknown[]): void => record('clip', args),
    drawImage: (...args: unknown[]): void => record('drawImage', args),
    arc: (...args: unknown[]): void => record('arc', args),
    rotate: (...args: unknown[]): void => record('rotate', args),
    createLinearGradient: (...args: unknown[]): { addColorStop: (offset: number, color: string) => void } => {
      record('createLinearGradient', args)
      return {
        addColorStop: (offset: number, color: string): void => record('addColorStop', [offset, color]),
      }
    },
    createRadialGradient: (...args: unknown[]): { addColorStop: (offset: number, color: string) => void } => {
      record('createRadialGradient', args)
      return {
        addColorStop: (offset: number, color: string): void => record('addColorStop', [offset, color]),
      }
    },
    setTransform: (...args: unknown[]): void => record('setTransform', args),
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
