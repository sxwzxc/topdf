/**
 * 图片增强工具 — 将拍照图片优化为类扫描文档效果
 * 白平衡 + 直方图拉伸 + 锐化
 */

/** 加载 File → HTMLImageElement */
function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = URL.createObjectURL(file)
  })
}

/** 每通道独立直方图拉伸：取 2%~98% 分位 → 0~255 */
function autoWhiteBalance(
  pixels: Uint8ClampedArray,
  total: number,
  contrast: number
) {
  const histR = new Uint32Array(256)
  const histG = new Uint32Array(256)
  const histB = new Uint32Array(256)

  for (let i = 0; i < total; i++) {
    const off = i * 4
    histR[pixels[off]]++
    histG[pixels[off + 1]]++
    histB[pixels[off + 2]]++
  }

  const lowPct = Math.max(0, 0.02 - contrast * 0.03)
  const highPct = Math.min(1, 0.98 + contrast * 0.02)

  const lowR = percentile(histR, total, lowPct)
  const highR = percentile(histR, total, highPct)
  const lowG = percentile(histG, total, lowPct)
  const highG = percentile(histG, total, highPct)
  const lowB = percentile(histB, total, lowPct)
  const highB = percentile(histB, total, highPct)

  for (let i = 0; i < total; i++) {
    const off = i * 4
    pixels[off] = stretch(pixels[off], lowR, highR)
    pixels[off + 1] = stretch(pixels[off + 1], lowG, highG)
    pixels[off + 2] = stretch(pixels[off + 2], lowB, highB)
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

function stretch(v: number, low: number, high: number): number {
  if (high <= low) return v
  return Math.min(255, Math.max(0, Math.round(((v - low) / (high - low)) * 255)))
}

/** 3×3 Unsharp Mask 锐化 */
function unsharpMask(data: ImageData, w: number, h: number, amount: number) {
  const src = new Uint8Array(data.data)
  const strength = amount * 2.5
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const kSum = 16

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        let blur = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ni = ((y + dy) * w + (x + dx)) * 4 + c
            blur += src[ni] * k[(dy + 1) * 3 + (dx + 1)]
          }
        }
        blur /= kSum
        const original = src[idx + c]
        const val = original + (original - blur) * strength
        data.data[idx + c] = Math.min(255, Math.max(0, val))
      }
    }
  }
}

/**
 * 增强单张图片，返回新的 File（PNG 格式）
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
  const total = w * h

  // 1. 白平衡 + 直方图拉伸
  autoWhiteBalance(imageData.data, total, 0.7)

  // 2. 锐化
  unsharpMask(imageData, w, h, 0.4)

  ctx.putImageData(imageData, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const name = file.name.replace(/\.[^.]+$/i, "-enhanced.png")
          resolve(new File([blob], name, { type: "image/png" }))
        } else {
          reject(new Error("增强失败"))
        }
      },
      "image/png"
    )
  })
}
