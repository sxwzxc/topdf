/**
 * 图片增强工具 — 模拟复印机效果
 * 灰度转换 → 极端直方图拉伸 → 强锐化
 */

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = URL.createObjectURL(file)
  })
}

/** 转为灰度（亮度加权），单通道直方图统计 */
function toGrayHistogram(pixels: Uint8ClampedArray, total: number) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < total; i++) {
    const off = i * 4
    const gray = Math.round(0.299 * pixels[off] + 0.587 * pixels[off + 1] + 0.114 * pixels[off + 2])
    pixels[off] = pixels[off + 1] = pixels[off + 2] = gray
    hist[gray]++
  }
  return hist
}

/** 直方图拉伸：取 low%~high% 分位 → 0~255（单通道） */
function stretchGray(pixels: Uint8ClampedArray, total: number, hist: Uint32Array, lowPct: number, highPct: number) {
  const low = percentile(hist, total, lowPct)
  const high = percentile(hist, total, highPct)
  if (high <= low) return
  for (let i = 0; i < total; i++) {
    const off = i * 4
    const v = Math.min(255, Math.max(0, Math.round(((pixels[off] - low) / (high - low)) * 255)))
    pixels[off] = pixels[off + 1] = pixels[off + 2] = v
  }
}

function percentile(hist: Uint32Array, total: number, pct: number): number {
  const target = pct * total
  let cum = 0
  for (let i = 0; i < 256; i++) {
    cum += hist[i]
    if (cum >= target) return i
  }
  return 255
}

/** Unsharp Mask 锐化（仅处理灰度，加强版） */
function unsharpMaskStrong(data: ImageData, w: number, h: number) {
  const src = new Uint8Array(data.data)
  const strength = 1.8
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const kSum = 16

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4
      let blur = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          blur += src[((y + dy) * w + (x + dx)) * 4] * k[(dy + 1) * 3 + (dx + 1)]
        }
      }
      blur /= kSum
      const v = Math.min(255, Math.max(0, src[idx] + (src[idx] - blur) * strength))
      data.data[idx] = data.data[idx + 1] = data.data[idx + 2] = Math.round(v)
    }
  }
}

/**
 * 复印机风格增强：灰度 + 极端对比度 + 强锐化
 * 效果：白底黑字，背景干净，文字锐利，类似扫描/复印输出
 */
export async function enhanceImageFile(file: File): Promise<File> {
  const img = await fileToImage(file)
  const w = img.naturalWidth
  const h = img.naturalHeight

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = imageData.data
  const total = w * h

  // 1. 转灰度 + 统计直方图
  const hist = toGrayHistogram(pixels, total)

  // 2. 极端直方图拉伸 (1%~99%) → 背景强制变白、文字强制变黑
  stretchGray(pixels, total, hist, 0.01, 0.99)

  // 3. 强锐化
  unsharpMaskStrong(imageData, w, h)

  ctx.putImageData(imageData, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const name = file.name.replace(/\.[^.]+$/i, "-scanned.png")
          resolve(new File([blob], name, { type: "image/png" }))
        } else {
          reject(new Error("增强失败"))
        }
      },
      "image/png"
    )
  })
}
