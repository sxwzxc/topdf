/**
 * 图片压缩工具 — 避免大图导致后端 500 错误
 *
 * 策略：
 *  - 最长边 > 4096px → 等比缩小到 4096px
 *  - PNG / WebP → 转 JPEG（PDF 最终输出就是 JPEG，透明通道无意义）
 *  - 已合规的 JPEG → 跳过，避免二次压缩损失质量
 *  - 编辑器输出的 Blob（PNG） → 转 JPEG
 *  - GIF 动图 → 保持原样（尺寸超标则拒绝）
 *  - 单张 > 50MB → 拒绝
 */

const MAX_DIMENSION = 4096
const JPEG_QUALITY = 0.85
const MAX_FILE_SIZE = 50 * 1024 * 1024

export class ImageTooLargeError extends Error {
  constructor(actualSize: number) {
    const sizeMB = (actualSize / (1024 * 1024)).toFixed(1)
    super(`图片文件过大 (${sizeMB} MB)，单张图片不能超过 50 MB。请先压缩后再上传。`)
    this.name = "ImageTooLargeError"
  }
}

/** 是否需要转码（尺寸超标 或 非 JPEG/GIF） */
function needsTranscode(w: number, h: number, mimeType: string): boolean {
  return Math.max(w, h) > MAX_DIMENSION || (mimeType !== "image/jpeg" && mimeType !== "image/gif")
}

/** 加载图片到 Image 元素 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("图片加载失败，文件可能已损坏"))
    img.src = src
  })
}

/** 绘制图片到 canvas，可选缩放 */
function drawToCanvas(img: HTMLImageElement, targetW: number, targetH: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  // 白色背景（处理透明通道）
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.drawImage(img, 0, 0, targetW, targetH)
  return canvas
}

/** Canvas → JPEG Blob */
function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob 失败"))),
      "image/jpeg",
      JPEG_QUALITY
    )
  })
}

/** 核心转换：输入 objectUrl + 元数据 → 输出 blob + 文件名 */
async function compressFromUrl(
  objectUrl: string,
  originalName: string,
  originalType: string
): Promise<{ blob: Blob; fileName: string }> {
  const img = await loadImage(objectUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight

  // 不需要转码 → 原样返回
  if (!needsTranscode(w, h, originalType)) {
    const res = await fetch(objectUrl)
    return { blob: await res.blob(), fileName: originalName }
  }

  // GIF 尺寸超标 → 拒绝（Canvas 无法保留动图帧）
  if (originalType === "image/gif") {
    throw new Error(
      `GIF 尺寸过大 (${w}x${h})，最长边不能超过 ${MAX_DIMENSION}px。请先用图片工具缩小。`
    )
  }

  // 计算目标尺寸
  const longerSide = Math.max(w, h)
  const needsScale = longerSide > MAX_DIMENSION
  const scale = needsScale ? MAX_DIMENSION / longerSide : 1
  const targetW = Math.max(1, Math.round(w * scale))
  const targetH = Math.max(1, Math.round(h * scale))

  const canvas = drawToCanvas(img, targetW, targetH)
  const blob = await canvasToJpegBlob(canvas)

  const newName = originalName.replace(/\.[^.]+$/i, ".jpg")
  return { blob, fileName: newName }
}

/**
 * 压缩 File 对象。对已合规的 JPEG/GIF 直接返回原文件。
 */
export async function compressImage(file: File): Promise<File> {
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageTooLargeError(file.size)
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const { blob, fileName } = await compressFromUrl(objectUrl, file.name, file.type)
    return new File([blob], fileName, { type: blob.type })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * 压缩 Blob（编辑器输出通常是 PNG）。
 * 对小尺寸 JPEG 跳过，其余统一转 JPEG 并限制尺寸。
 */
export async function compressBlob(blob: Blob, fileName: string): Promise<File> {
  // 已是合规小 JPEG → 跳过
  if (blob.size < 5 * 1024 * 1024 && blob.type === "image/jpeg") {
    return new File([blob], fileName, { type: blob.type })
  }

  if (blob.size > MAX_FILE_SIZE) {
    throw new ImageTooLargeError(blob.size)
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const result = await compressFromUrl(objectUrl, fileName, blob.type)
    return new File([result.blob], result.fileName, { type: result.blob.type })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 批量压缩，带进度回调 */
export async function compressImages(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<File[]> {
  const results: File[] = []
  for (let i = 0; i < files.length; i++) {
    results.push(await compressImage(files[i]))
    onProgress?.(i + 1, files.length)
  }
  return results
}
