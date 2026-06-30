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
} from "lucide-react"

interface ImageEditorProps {
  imageSrc: string
  fileName: string
  onApply: (blob: Blob, fileName: string) => void
  onCancel: () => void
}

type Mode = "crop" | "correct"

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
    } else {
      correctApplyRef.current?.()
    }
  }

  // correct mode apply handler (set by CorrectPanel)
  const correctApplyRef = useRef<(() => void) | null>(null)

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
        ) : (
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
        )}
      </div>
    </div>
  )
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
 * 四点透视矫正：把源四边形 (TL, TR, BR, BL) 变换为正面矩形。
 * 使用双三角形仿射近似法（每个三角形用 canvas 仿射变换 + clip 绘制）。
 */
async function warpQuadrilateral(
  imageSrc: string,
  srcPts: [Pt, Pt, Pt, Pt]
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const [TL, TR, BR, BL] = srcPts
  const topLen = dist(TL, TR)
  const bottomLen = dist(BR, BL)
  const leftLen = dist(TL, BL)
  const rightLen = dist(TR, BR)
  const outW = Math.max(1, Math.round((topLen + bottomLen) / 2))
  const outH = Math.max(1, Math.round((leftLen + rightLen) / 2))

  const out = document.createElement("canvas")
  out.width = outW
  out.height = outH
  const ctx = out.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, outW, outH)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  const dstTL: Pt = { x: 0, y: 0 }
  const dstTR: Pt = { x: outW, y: 0 }
  const dstBR: Pt = { x: outW, y: outH }
  const dstBL: Pt = { x: 0, y: outH }

  // 两个三角形覆盖矩形
  warpTriangle(ctx, image, [TL, TR, BR], [dstTL, dstTR, dstBR])
  warpTriangle(ctx, image, [TL, BR, BL], [dstTL, dstBR, dstBL])

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png"
    )
  })
}

/**
 * 在 ctx 上绘制一个三角形区域：将 src 三角形仿射映射到 dst 三角形。
 * setTransform(a,b,c,d,e,f): X = a*x + c*y + e, Y = b*x + d*y + f
 */
function warpTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  src: [Pt, Pt, Pt],
  dst: [Pt, Pt, Pt]
) {
  const m = computeAffine(src, dst)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(dst[0].x, dst[0].y)
  ctx.lineTo(dst[1].x, dst[1].y)
  ctx.lineTo(dst[2].x, dst[2].y)
  ctx.closePath()
  ctx.clip()
  // setTransform 直接替换当前矩阵（非累积）
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
  ctx.drawImage(img, 0, 0)
  ctx.restore()
}

/**
 * 计算从 src 三点到 dst 三点的仿射变换，返回 setTransform 参数 [a,b,c,d,e,f]
 */
function computeAffine(
  src: [Pt, Pt, Pt],
  dst: [Pt, Pt, Pt]
): [number, number, number, number, number, number] {
  const [s0, s1, s2] = src
  const [d0, d1, d2] = dst
  const denom =
    (s0.x - s2.x) * (s1.y - s2.y) - (s1.x - s2.x) * (s0.y - s2.y)
  if (Math.abs(denom) < 1e-10) return [1, 0, 0, 1, 0, 0]
  const a =
    ((d0.x - d2.x) * (s1.y - s2.y) - (d1.x - d2.x) * (s0.y - s2.y)) / denom
  const c =
    ((d1.x - d2.x) * (s0.x - s2.x) - (d0.x - d2.x) * (s1.x - s2.x)) / denom
  const e = d0.x - a * s0.x - c * s0.y
  const b =
    ((d0.y - d2.y) * (s1.y - s2.y) - (d1.y - d2.y) * (s0.y - s2.y)) / denom
  const d =
    ((d1.y - d2.y) * (s0.x - s2.x) - (d0.y - d2.y) * (s1.x - s2.x)) / denom
  const f = d0.y - b * s0.x - d * s0.y
  return [a, b, c, d, e, f]
}
