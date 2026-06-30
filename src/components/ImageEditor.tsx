"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { Button } from "@/components/ui/button"
import {
  RotateCw,
  RotateCcw,
  Check,
  X,
  Crop as CropIcon,
  Scan,
  RefreshCw,
  Palette,
} from "lucide-react"

interface ImageEditorProps {
  imageSrc: string
  fileName: string
  onApply: (blob: Blob, fileName: string) => void
  onCancel: () => void
}

type Mode = "crop" | "correct" | "enhance"

const ASPECTS: { label: string; value: number | undefined }[] = [
  { label: "自由", value: undefined },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
]

export default function ImageEditor({
  imageSrc,
  fileName,
  onApply,
  onCancel,
}: ImageEditorProps) {
  const [mode, setMode] = useState<Mode>("crop")
  const [applying, setApplying] = useState(false)

  // crop mode state
  const [rotation, setRotation] = useState(0)
  const [rotatedSrc, setRotatedSrc] = useState(imageSrc)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [aspect, setAspect] = useState<number | undefined>(undefined)
  const imgRef = useRef<HTMLImageElement>(null)

  const rotateBy = (deg: number) => {
    setRotation((prev) => (prev + deg + 360) % 360)
  }

  // 重新生成旋转后的图片（带防抖，避免拖动滑块时频繁计算）
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      if (rotation === 0) {
        if (!cancelled) setRotatedSrc(imageSrc)
        return
      }
      try {
        const url = await rotateImage(imageSrc, rotation)
        if (!cancelled) setRotatedSrc(url)
      } catch (err) {
        console.error("旋转失败", err)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [rotation, imageSrc])

  // 旋转或比例变化时重置裁剪框为居中 80%
  useEffect(() => {
    setCrop({ unit: "%", x: 10, y: 10, width: 80, height: 80 })
    setCompletedCrop(undefined)
  }, [rotatedSrc, aspect])

  const onImageLoad = useCallback(() => {
    // 图片载入后无需额外处理，裁剪框由 effect 设置
  }, [])

  const handleApply = async () => {
    if (mode === "crop") {
      if (!completedCrop || !imgRef.current) return
      setApplying(true)
      try {
        const blob = await getCroppedBlob(imgRef.current, completedCrop)
        const baseName = fileName.replace(/\.[^.]+$/, "")
        onApply(blob, `${baseName}-edited.png`)
      } catch (err) {
        console.error("裁剪失败", err)
        setApplying(false)
      }
    } else if (mode === "correct") {
      correctApplyRef.current?.()
    } else if (mode === "enhance") {
      enhanceApplyRef.current?.()
    }
  }

  // correct / enhance mode apply handler (set by respective panels)
  const correctApplyRef = useRef<(() => void) | null>(null)
  const enhanceApplyRef = useRef<(() => void) | null>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      if (e.key === "Enter" && !applying) handleApply()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applying, mode, completedCrop])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in-up">
      <div className="editor-panel w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
            <CropIcon className="w-4 h-4 text-[#3776AB] shrink-0" />
            <span className="font-medium">编辑图片</span>
            <span className="text-xs text-slate-400 font-mono truncate">· {fileName}</span>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setMode("crop")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              mode === "crop"
                ? "text-[#3776AB] border-b-2 border-[#3776AB] bg-[#3776AB]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <CropIcon className="w-3.5 h-3.5" />
            裁剪 / 旋转
          </button>
          <button
            onClick={() => setMode("correct")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              mode === "correct"
                ? "text-[#3776AB] border-b-2 border-[#3776AB] bg-[#3776AB]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            四点矫正
          </button>
          <button
            onClick={() => setMode("enhance")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              mode === "enhance"
                ? "text-[#3776AB] border-b-2 border-[#3776AB] bg-[#3776AB]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            色彩修正
          </button>
        </div>

        {/* Body */}
        {mode === "crop" ? (
          <>
            <div className="relative w-full h-[50vh] min-h-[300px] bg-slate-100 flex items-center justify-center overflow-hidden">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
                keepSelection
                minWidth={20}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={rotatedSrc}
                  onLoad={onImageLoad}
                  alt="待裁剪"
                  style={{ maxHeight: "50vh", maxWidth: "100%", display: "block" }}
                  draggable={false}
                />
              </ReactCrop>
            </div>

            <div className="px-4 py-3 space-y-3 border-t border-slate-200">
              {/* Aspect ratio */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 w-12">比例</span>
                {ASPECTS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => setAspect(a.value)}
                    className={`aspect-chip ${aspect === a.value ? "aspect-chip-active" : ""}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* Rotation */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-12">旋转</span>
                <button
                  onClick={() => rotateBy(-90)}
                  className="editor-icon-btn"
                  aria-label="逆时针 90°"
                  title="逆时针 90°"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => rotateBy(90)}
                  className="editor-icon-btn"
                  aria-label="顺时针 90°"
                  title="顺时针 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={0.5}
                  value={rotation > 180 ? rotation - 360 : rotation}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setRotation((v + 360) % 360)
                  }}
                  className="editor-range flex-1"
                />
                <span className="text-xs text-slate-600 font-mono w-12 text-right">
                  {(rotation > 180 ? rotation - 360 : rotation).toFixed(1)}°
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                拖动框线或四角调整裁剪区域，拖动框内移动位置。
              </p>

              <ActionBar
                onCancel={onCancel}
                onApply={handleApply}
                applying={applying}
                applyDisabled={!completedCrop}
              />
            </div>
          </>
        ) : mode === "correct" ? (
          <CorrectPanel
            imageSrc={imageSrc}
            fileName={fileName}
            onApply={onApply}
            onCancel={onCancel}
            applying={applying}
            registerApply={(fn) => {
              correctApplyRef.current = fn
            }}
            setApplying={setApplying}
          />
        ) : (
          <EnhancePanel
            imageSrc={imageSrc}
            fileName={fileName}
            onApply={onApply}
            onCancel={onCancel}
            applying={applying}
            registerApply={(fn) => {
              enhanceApplyRef.current = fn
            }}
            setApplying={setApplying}
          />
        )}
      </div>
    </div>
  )
}

/* ---------------- Enhance Panel (色彩修正 / 文档增强) ---------------- */

interface EnhancePanelProps {
  imageSrc: string
  fileName: string
  onApply: (blob: Blob, fileName: string) => void
  onCancel: () => void
  registerApply: (fn: () => void) => void
  applying: boolean
  setApplying: (v: boolean) => void
}

function EnhancePanel({
  imageSrc,
  fileName,
  onApply,
  onCancel,
  registerApply,
  applying,
  setApplying,
}: EnhancePanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [grayscale, setGrayscale] = useState(false)
  const [contrast, setContrast] = useState(70)   // 0-100, 默认偏高
  const [sharpen, setSharpen] = useState(40)      // 0-100
  const [brightness, setBrightness] = useState(50) // 0-100, 50=不调整
  const imgRef = useRef<HTMLImageElement>(null)

  // 载入原图后自动生成预览
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const img = await loadImage(imageSrc)
        if (cancelled) return
        const url = await enhanceDocument(img, {
          grayscale,
          contrast: contrast / 100,
          sharpen: sharpen / 100,
          brightness: brightness / 100,
        })
        if (!cancelled) setPreviewUrl(url)
      } catch (err) {
        console.error("增强预览失败", err)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [imageSrc, grayscale, contrast, sharpen, brightness])

  const doApply = async () => {
    if (!previewUrl) return
    setApplying(true)
    try {
      // 从预览 data URL 中提取 blob
      const res = await fetch(previewUrl)
      const blob = await res.blob()
      const baseName = fileName.replace(/\.[^.]+$/, "")
      onApply(blob, `${baseName}-enhanced.png`)
    } catch (err) {
      console.error("色彩修正失败", err)
      setApplying(false)
    }
  }

  useEffect(() => {
    registerApply(doApply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl])

  return (
    <>
      <div className="relative w-full h-[45vh] min-h-[280px] bg-slate-100 flex items-center justify-center overflow-hidden">
        {/* 原图 / 增强后对比：顶部原图，底部增强 */}
        <div className="flex flex-col w-full h-full">
          <div className="flex-1 flex items-center justify-center bg-slate-100 border-b border-slate-200 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="原图"
              className="max-h-full max-w-full object-contain opacity-80"
              draggable={false}
            />
            <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/50 text-[10px] text-white font-medium">
              原图
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center bg-white relative">
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="增强后"
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#3776AB]/80 text-[10px] text-white font-medium">
                  增强后
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-400">处理中...</span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 border-t border-slate-200">
        {/* 黑白模式 */}
        <label className="flex items-center gap-3 cursor-pointer">
          <span className="text-xs text-slate-500 w-12">黑白</span>
          <button
            onClick={() => setGrayscale(p => !p)}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              grayscale ? "bg-[#3776AB]" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                grayscale ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-xs text-slate-400">{grayscale ? "灰度" : "彩色"}</span>
        </label>

        {/* 对比度 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-12">对比度</span>
          <input
            type="range"
            min={0}
            max={100}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
            className="editor-range flex-1"
          />
          <span className="text-xs text-slate-600 font-mono w-8 text-right">{contrast}</span>
        </div>

        {/* 锐化 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-12">锐化</span>
          <input
            type="range"
            min={0}
            max={100}
            value={sharpen}
            onChange={(e) => setSharpen(Number(e.target.value))}
            className="editor-range flex-1"
          />
          <span className="text-xs text-slate-600 font-mono w-8 text-right">{sharpen}</span>
        </div>

        {/* 亮度偏移 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-12">亮度</span>
          <input
            type="range"
            min={0}
            max={100}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="editor-range flex-1"
          />
          <span className="text-xs text-slate-600 font-mono w-8 text-right">{brightness}</span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          自动白平衡 + 直方图拉伸模拟扫描效果。对比度越高背景越白文字越黑。
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 h-9 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-sm"
          >
            取消
          </button>
          <Button
            onClick={doApply}
            disabled={applying || !previewUrl}
            className="btn-primary rounded cursor-pointer"
          >
            {applying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                处理中...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                应用
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}

/* ---------------- Image Enhancement Functions ---------------- */

interface EnhanceOptions {
  grayscale: boolean
  contrast: number   // 0..1+
  sharpen: number    // 0..1
  brightness: number // 0..1, 0.5 = no change
}

/**
 * 文档扫描风格增强：白平衡 → 直方图拉伸 → 锐化 → 可选灰度
 * 返回 data URL (PNG)
 */
async function enhanceDocument(
  img: HTMLImageElement,
  opts: EnhanceOptions
): Promise<string> {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = imageData.data

  // 1. 白平衡：每通道独立直方图拉伸（2%~98% 分位 → 0~255）
  autoWhiteBalance(pixels, w, h, opts.contrast)

  // 2. 亮度偏移
  if (opts.brightness !== 0.5) {
    adjustBrightness(pixels, opts.brightness)
  }

  // 3. 锐化 (Unsharp Mask)
  if (opts.sharpen > 0.01) {
    unsharpMask(imageData, w, h, opts.sharpen)
  }

  // 4. 灰度转换
  if (opts.grayscale) {
    toGrayscale(pixels)
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL("image/png")
}

/** 每通道独立直方图拉伸：取各通道的 low~high 分位，映射到 0~255 */
function autoWhiteBalance(pixels: Uint8ClampedArray, w: number, h: number, contrast: number) {
  const total = w * h

  // 构建每通道直方图
  const histR = new Uint32Array(256)
  const histG = new Uint32Array(256)
  const histB = new Uint32Array(256)

  for (let i = 0; i < total; i++) {
    const off = i * 4
    histR[pixels[off]]++
    histG[pixels[off + 1]]++
    histB[pixels[off + 2]]++
  }

  // 找 2% 和 98% 分位（受 contrast 参数调节）
  const lowPct = Math.max(0, 0.02 - contrast * 0.03)  // 0% ~ 2%
  const highPct = Math.min(1, 0.98 + contrast * 0.02)  // 98% ~ 100%

  const lowR = percentileFromHist(histR, total, lowPct)
  const highR = percentileFromHist(histR, total, highPct)
  const lowG = percentileFromHist(histG, total, lowPct)
  const highG = percentileFromHist(histG, total, highPct)
  const lowB = percentileFromHist(histB, total, lowPct)
  const highB = percentileFromHist(histB, total, highPct)

  // 拉伸映射
  for (let i = 0; i < total; i++) {
    const off = i * 4
    pixels[off] = stretch(pixels[off], lowR, highR)
    pixels[off + 1] = stretch(pixels[off + 1], lowG, highG)
    pixels[off + 2] = stretch(pixels[off + 2], lowB, highB)
  }
}

/** 亮度调整：>0.5 提亮，<0.5 压暗 */
function adjustBrightness(pixels: Uint8ClampedArray, level: number) {
  // level 0..1, 0.5 = no change
  const factor = 1 + (level - 0.5) * 0.8  // ±40 % 范围
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = pixels[i + c] * factor
      pixels[i + c] = clamp(v, 0, 255)
    }
  }
}

/** Unsharp Mask 锐化 */
function unsharpMask(imageData: ImageData, w: number, h: number, amount: number) {
  const src = new Uint8Array(imageData.data)
  const strength = amount * 2.5  // 0..1 → 0..2.5

  // 3×3 高斯模糊核近似
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
            const ki = (dy + 1) * 3 + (dx + 1)
            blur += src[ni] * k[ki]
          }
        }
        blur /= kSum
        const original = src[idx + c]
        // unsharp: sharp = original + (original - blur) * strength
        imageData.data[idx + c] = clamp(original + (original - blur) * strength, 0, 255)
      }
    }
  }
}

/** 转为灰度（亮度加权） */
function toGrayscale(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    pixels[i] = pixels[i + 1] = pixels[i + 2] = Math.round(gray)
  }
}

function percentileFromHist(hist: Uint32Array, total: number, pct: number): number {
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
  return clamp(Math.round(((v - low) / (high - low)) * 255), 0, 255)
}

/* ---------------- Correct Panel (四点透视矫正) ---------------- */

interface CorrectPanelProps {
  imageSrc: string
  fileName: string
  onApply: (blob: Blob, fileName: string) => void
  onCancel: () => void
  registerApply: (fn: () => void) => void
  applying: boolean
  setApplying: (v: boolean) => void
}

type Pt = { x: number; y: number } // normalized 0..1 relative to displayed image

function CorrectPanel({
  imageSrc,
  fileName,
  onApply,
  onCancel,
  registerApply,
  applying,
  setApplying,
}: CorrectPanelProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [pts, setPts] = useState<Pt[]>([
    { x: 0.08, y: 0.08 },
    { x: 0.92, y: 0.08 },
    { x: 0.92, y: 0.92 },
    { x: 0.08, y: 0.92 },
  ])
  const [dragging, setDragging] = useState<number | null>(null)

  // load natural size
  useEffect(() => {
    const img = new Image()
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = imageSrc
  }, [imageSrc])

  // global pointer handlers while dragging
  useEffect(() => {
    if (dragging === null) return
    const move = (e: PointerEvent) => {
      const el = imgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      setPts((prev) =>
        prev.map((p, i) =>
          i === dragging ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : p
        )
      )
    }
    const up = () => setDragging(null)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [dragging])

  const reset = () =>
    setPts([
      { x: 0.08, y: 0.08 },
      { x: 0.92, y: 0.08 },
      { x: 0.92, y: 0.92 },
      { x: 0.08, y: 0.92 },
    ])

  const doApply = async () => {
    if (imgSize.w === 0) return
    setApplying(true)
    try {
      const srcPts = pts.map((p) => ({
        x: p.x * imgSize.w,
        y: p.y * imgSize.h,
      })) as [Pt, Pt, Pt, Pt]
      const blob = await warpQuadrilateral(imageSrc, srcPts)
      const baseName = fileName.replace(/\.[^.]+$/, "")
      onApply(blob, `${baseName}-corrected.png`)
    } catch (err) {
      console.error("矫正失败", err)
      setApplying(false)
    }
  }

  // register apply handler to parent
  useEffect(() => {
    registerApply(doApply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, imgSize])

  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(i)
  }

  return (
    <>
      <div className="relative w-full h-[50vh] min-h-[300px] bg-slate-100 flex items-center justify-center overflow-hidden">
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt="待矫正"
            className="block max-h-[50vh] max-w-full mx-auto select-none"
            draggable={false}
          />
          {/* polygon overlay */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polygon
              points={pts.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill="rgba(55,118,171,0.12)"
              stroke="#3776AB"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            {/* edges midpoint hint lines */}
            {pts.map((p, i) => {
              const n = pts[(i + 1) % 4]
              const mx = (p.x + n.x) * 50
              const my = (p.y + n.y) * 50
              return (
                <circle
                  key={i}
                  cx={mx}
                  cy={my}
                  r={0.6}
                  fill="rgba(255,255,255,0.4)"
                />
              )
            })}
          </svg>
          {/* four handles */}
          {pts.map((p, i) => (
            <div
              key={i}
              onPointerDown={onPointerDown(i)}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-[#3776AB] border-2 border-white cursor-grab active:cursor-grabbing touch-none shadow-lg z-10"
            >
              <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-bold pointer-events-none">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 border-t border-slate-200">
        <p className="text-xs text-slate-500 leading-relaxed">
          拖动四个角点框选目标区域（如文档、白板、屏幕），应用后将自动透视矫正为正面视图。
        </p>
        <div className="flex justify-end items-center gap-2 pt-1">
          <button
            onClick={reset}
            className="editor-icon-btn"
            title="重置点位"
            aria-label="重置点位"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="ml-1.5 text-xs">重置</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="px-4 h-9 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-sm"
          >
            取消
          </button>
          <Button
            onClick={doApply}
            disabled={applying}
            className="btn-primary rounded cursor-pointer"
          >
            {applying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                处理中...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                应用
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}

/* ---------------- Action Bar ---------------- */

function ActionBar({
  onCancel,
  onApply,
  applying,
  applyDisabled,
}: {
  onCancel: () => void
  onApply: () => void
  applying: boolean
  applyDisabled: boolean
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        onClick={onCancel}
        className="px-4 h-9 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-sm"
      >
        取消
      </button>
      <Button
        onClick={onApply}
        disabled={applying || applyDisabled}
        className="btn-primary rounded cursor-pointer"
      >
        {applying ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            处理中...
          </>
        ) : (
          <>
            <Check className="w-4 h-4 mr-2" />
            应用
          </>
        )}
      </Button>
    </div>
  )
}

/* ---------------- Image helpers ---------------- */

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * 旋转图片任意角度，返回 data URL（画布按旋转后包围盒尺寸）。
 */
async function rotateImage(src: string, rotation: number): Promise<string> {
  const image = await loadImage(src)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")

  const rad = (rotation * Math.PI) / 180
  const bBoxWidth =
    Math.abs(image.width * Math.cos(rad)) +
    Math.abs(image.height * Math.sin(rad))
  const bBoxHeight =
    Math.abs(image.width * Math.sin(rad)) +
    Math.abs(image.height * Math.cos(rad))

  canvas.width = Math.round(bBoxWidth)
  canvas.height = Math.round(bBoxHeight)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  return canvas.toDataURL("image/png")
}

/**
 * 根据 react-image-crop 的像素裁剪区域，从已渲染的 img 上裁剪输出 PNG blob。
 * completedCrop 为相对显示尺寸的像素坐标，需缩放到原始分辨率。
 */
async function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop
): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")

  const w = Math.max(1, Math.round(crop.width * scaleX))
  const h = Math.max(1, Math.round(crop.height * scaleY))
  canvas.width = w
  canvas.height = h
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    w,
    h
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png"
    )
  })
}

/**
 * 四点透视矫正：通过 Homography / DLT 求解 3×3 透视矩阵，
 * 逐像素反向映射 + 双线性插值，输出正面矩形。
 *
 * 替代原先的双三角形仿射近似 —— 仿射无法表达透视消失点，
 * 导致矫正结果严重失真。
 */
async function warpQuadrilateral(
  imageSrc: string,
  srcPts: [Pt, Pt, Pt, Pt]
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const [TL, TR, BR, BL] = srcPts

  // 输出矩形尺寸：取对边平均长度
  const outW = Math.max(1, Math.round((dist(TL, TR) + dist(BL, BR)) / 2))
  const outH = Math.max(1, Math.round((dist(TL, BL) + dist(TR, BR)) / 2))

  // 目标：把源四点映射到目标矩形的四角
  const dst: [Pt, Pt, Pt, Pt] = [
    { x: 0, y: 0 },         // TL → (0, 0)
    { x: outW, y: 0 },      // TR → (W, 0)
    { x: outW, y: outH },   // BR → (W, H)
    { x: 0, y: outH },      // BL → (0, H)
  ]

  const H = computeHomography(srcPts, dst)       // src → dst 的 3×3 矩阵
  const Hinv = invertHomography(H)                // dst → src 的逆矩阵（反向映射用）

  // 在屏幕外 canvas 上绘制原图，便于逐像素读取
  const srcCanvas = document.createElement("canvas")
  srcCanvas.width = image.naturalWidth
  srcCanvas.height = image.naturalHeight
  const srcCtx = srcCanvas.getContext("2d")!
  srcCtx.drawImage(image, 0, 0)
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)

  // 输出 canvas
  const out = document.createElement("canvas")
  out.width = outW
  out.height = outH
  const outCtx = out.getContext("2d")!
  const outData = outCtx.createImageData(outW, outH)

  const sw = srcCanvas.width
  const sh = srcCanvas.height
  const srcPixels = srcData.data
  const dstPixels = outData.data

  // 逐像素反向映射
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      // 齐次坐标 [u, v, 1] 经 Hinv 映射回源图坐标
      const w = Hinv[6] * u + Hinv[7] * v + Hinv[8]
      const sx = (Hinv[0] * u + Hinv[1] * v + Hinv[2]) / w
      const sy = (Hinv[3] * u + Hinv[4] * v + Hinv[5]) / w

      const di = (v * outW + u) * 4

      // 边界检查
      if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) {
        // 超出源图范围 → 白色
        dstPixels[di] = 255
        dstPixels[di + 1] = 255
        dstPixels[di + 2] = 255
        dstPixels[di + 3] = 255
        continue
      }

      // 双线性插值
      const fx = Math.floor(sx)
      const fy = Math.floor(sy)
      const dx = sx - fx
      const dy = sy - fy

      const i00 = (fy * sw + fx) * 4
      const i10 = (fy * sw + (fx + 1)) * 4
      const i01 = ((fy + 1) * sw + fx) * 4
      const i11 = ((fy + 1) * sw + (fx + 1)) * 4

      for (let c = 0; c < 3; c++) {
        const v00 = srcPixels[i00 + c]
        const v10 = srcPixels[i10 + c]
        const v01 = srcPixels[i01 + c]
        const v11 = srcPixels[i11 + c]
        const top = v00 + (v10 - v00) * dx
        const bot = v01 + (v11 - v01) * dx
        dstPixels[di + c] = Math.round(top + (bot - top) * dy)
      }
      dstPixels[di + 3] = 255
    }
  }

  outCtx.putImageData(outData, 0, 0)

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png"
    )
  })
}

/* ---------------- Homography helpers ---------------- */

/**
 * DLT（直接线性变换）求解 4 对点的透视变换矩阵 H（3×3）。
 * H 将 src → dst（即 dst ~ H × src）。
 * 返回 9 个元素的列主序数组 [h11,h21,h31, h12,h22,h32, h13,h23,h33]。
 */
function computeHomography(
  src: [Pt, Pt, Pt, Pt],
  dst: [Pt, Pt, Pt, Pt]
): number[] {
  // 构建 8×9 矩阵 A，每对点提供两行方程
  const A: number[] = []
  for (let i = 0; i < 4; i++) {
    const x = src[i].x
    const y = src[i].y
    const u = dst[i].x
    const v = dst[i].y
    // 行 2i   : [-x, -y, -1, 0, 0, 0, x*u, y*u, u]
    A.push(-x, -y, -1, 0, 0, 0, x * u, y * u, u)
    // 行 2i+1 : [0, 0, 0, -x, -y, -1, x*v, y*v, v]
    A.push(0, 0, 0, -x, -y, -1, x * v, y * v, v)
  }

  // SVD 求解 A·h = 0 的最小二乘解（等于 A^T·A 的最小特征值对应特征向量）
  // 用幂迭代法求 9×9 矩阵 A^T·A 的最小特征向量
  const h = solveNullspace(A, 9)
  return h
}

/**
 * 矩阵求逆：计算 H 的逆矩阵，用于反向映射（dst → src）。
 */
function invertHomography(H: number[]): number[] {
  // 3x3 矩阵求逆公式
  const det =
    H[0] * (H[4] * H[8] - H[5] * H[7]) -
    H[1] * (H[3] * H[8] - H[5] * H[6]) +
    H[2] * (H[3] * H[7] - H[4] * H[6])

  if (Math.abs(det) < 1e-15) return [1, 0, 0, 0, 1, 0, 0, 0, 1] // 退化为单位矩阵

  const invDet = 1 / det
  return [
    (H[4] * H[8] - H[5] * H[7]) * invDet,
    (H[2] * H[7] - H[1] * H[8]) * invDet,
    (H[1] * H[5] - H[2] * H[4]) * invDet,
    (H[5] * H[6] - H[3] * H[8]) * invDet,
    (H[0] * H[8] - H[2] * H[6]) * invDet,
    (H[2] * H[3] - H[0] * H[5]) * invDet,
    (H[3] * H[7] - H[4] * H[6]) * invDet,
    (H[1] * H[6] - H[0] * H[7]) * invDet,
    (H[0] * H[4] - H[1] * H[3]) * invDet,
  ]
}

/**
 * 幂迭代法求解 A^T·A 最小特征值对应的特征向量。
 * A 以行主序存储，rows = 8, cols = 9。
 */
function solveNullspace(A: number[], n: number): number[] {
  // 构造 B = A^T·A
  const B = new Array(n * n).fill(0)
  const rows = 8
  for (let i = 0; i < rows; i++) {
    const ai = i * n
    for (let p = 0; p < n; p++) {
      for (let q = 0; q < n; q++) {
        B[p * n + q] += A[ai + p] * A[ai + q]
      }
    }
  }

  // 幂迭代找最大特征值
  let v = new Array(n).fill(0).map((_, i) => i === n - 1 ? 1 : Math.random() * 0.01)
  for (let iter = 0; iter < 30; iter++) {
    // v = B · v
    const next = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        next[i] += B[i * n + j] * v[j]
      }
    }
    // 归一化
    let norm = 0
    for (let i = 0; i < n; i++) norm += next[i] * next[i]
    norm = Math.sqrt(norm)
    if (norm < 1e-15) break
    for (let i = 0; i < n; i++) next[i] /= norm
    v = next
  }

  // 最大特征向量已得到。对于最小特征值，我们对 B 做平移后再次迭代
  // B' = B - λ_max·I，则 B' 的最小特征值对应 λ_min - λ_max
  // 更简单：直接对 B 的逆做幂迭代。但这里用交替投影法。
  // 实际上，用 SVD via Jacobi 或直接调 numeric 库更稳妥。
  // 简化方案：对 B 平移后重新幂迭代找最小特征向量
  const lambdaMax = dot(v, matVecMul(B, n, v))
  // B_shifted = B - lambdaMax * I
  const Bs = B.slice()
  for (let i = 0; i < n; i++) Bs[i * n + i] -= lambdaMax

  // 用原 v 的值（非零）初始化，做幂迭代找 Bs 的最大特征向量模长最大（对应 λ ≈ lambdaMax - lambdaMin 的绝对值最大）
  // Bs 的所有特征值 ≤ 0，所以绝对值最大的 = 最负的 = λ_min - λ_max
  // 带符号：选一个与 v 正交的初始向量
  let w = new Array(n).fill(0).map(() => Math.random() - 0.5)
  // 正交化（去除 v 分量）
  const vDotW = dot(w, v)
  for (let i = 0; i < n; i++) w[i] -= vDotW * v[i]
  const normW = Math.sqrt(dot(w, w))
  for (let i = 0; i < n; i++) w[i] /= normW

  for (let iter = 0; iter < 40; iter++) {
    const next = matVecMul(Bs, n, w)
    // 再次正交化（去 v 分量）
    const proj = dot(next, v)
    for (let i = 0; i < n; i++) next[i] -= proj * v[i]
    const nrm = Math.sqrt(dot(next, next))
    if (nrm < 1e-15) break
    for (let i = 0; i < n; i++) next[i] /= nrm
    w = next
  }

  return w
}

function matVecMul(M: number[], n: number, v: number[]): number[] {
  const r = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      r[i] += M[i * n + j] * v[j]
    }
  }
  return r
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
