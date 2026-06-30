"use client"

import { useCallback, useEffect, useState } from "react"
import Cropper, { Area } from "react-easy-crop"
import { Button } from "@/components/ui/button"
import { RotateCw, RotateCcw, Check, X, Crop as CropIcon } from "lucide-react"

interface ImageEditorProps {
  imageSrc: string
  fileName: string
  onApply: (blob: Blob, fileName: string) => void
  onCancel: () => void
}

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
]

export default function ImageEditor({ imageSrc, fileName, onApply, onCancel }: ImageEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [aspect, setAspect] = useState<number | null>(null)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [applying, setApplying] = useState(false)

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  const rotateBy = (deg: number) => {
    setRotation(prev => (prev + deg + 360) % 360)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      if (e.key === "Enter" && !applying) handleApply()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applying, croppedAreaPixels, rotation, zoom, aspect])

  const handleApply = async () => {
    if (!croppedAreaPixels) return
    setApplying(true)
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, rotation)
      const baseName = fileName.replace(/\.[^.]+$/, "")
      const ext = blob.type === "image/jpeg" ? "jpg" : "png"
      onApply(blob, `${baseName}-edited.${ext}`)
    } catch (err) {
      console.error("Edit failed", err)
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in-up">
      <div className="editor-panel w-full max-w-3xl rounded-xl border border-[#3776AB]/30 bg-[#0a0a0a] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3776AB]/15">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <CropIcon className="w-4 h-4 text-[#3776AB]" />
            <span>Edit Image</span>
            <span className="text-xs text-gray-600 font-mono truncate max-w-[200px]">· {fileName}</span>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cropper area */}
        <div className="relative w-full h-[55vh] min-h-[320px] bg-[#0d1117]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect ?? undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            restrictPosition={false}
          />
        </div>

        {/* Controls */}
        <div className="px-4 py-3 space-y-3 border-t border-[#3776AB]/15">
          {/* Aspect ratio */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 w-16">Aspect</span>
            {ASPECTS.map(a => (
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
            <span className="text-xs text-gray-500 w-16">Rotate</span>
            <button
              onClick={() => rotateBy(-90)}
              className="editor-icon-btn"
              aria-label="Rotate 90° counter-clockwise"
              title="Rotate -90°"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => rotateBy(90)}
              className="editor-icon-btn"
              aria-label="Rotate 90° clockwise"
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={rotation > 180 ? rotation - 360 : rotation}
              onChange={e => {
                const v = Number(e.target.value)
                setRotation((v + 360) % 360)
              }}
              className="editor-range flex-1"
            />
            <span className="text-xs text-gray-400 font-mono w-12 text-right">
              {(rotation > 180 ? rotation - 360 : rotation).toFixed(1)}°
            </span>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16">Zoom</span>
            <input
              type="range"
              min={1}
              max={5}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="editor-range flex-1"
            />
            <span className="text-xs text-gray-400 font-mono w-12 text-right">
              {zoom.toFixed(2)}x
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={onCancel}
              className="btn-outline rounded cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={applying || !croppedAreaPixels}
              className="btn-primary rounded cursor-pointer"
            >
              {applying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Apply
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Generate a cropped (and rotated) image blob from the source image
 * based on the pixel crop area returned by react-easy-crop.
 */
async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")

  if (!ctx) throw new Error("Canvas 2D context unavailable")

  const rotRad = (rotation * Math.PI) / 180

  // Compute bounding box of the rotated image
  const bBoxWidth =
    Math.abs(image.width * Math.cos(rotRad)) + Math.abs(image.height * Math.sin(rotRad))
  const bBoxHeight =
    Math.abs(image.width * Math.sin(rotRad)) + Math.abs(image.height * Math.cos(rotRad))

  canvas.width = Math.round(bBoxWidth)
  canvas.height = Math.round(bBoxHeight)

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rotRad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  // Crop out the selected region into a second canvas
  const out = document.createElement("canvas")
  const outCtx = out.getContext("2d")
  if (!outCtx) throw new Error("Canvas 2D context unavailable")

  const w = Math.max(1, Math.round(pixelCrop.width))
  const h = Math.max(1, Math.round(pixelCrop.height))
  out.width = w
  out.height = h

  outCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    w,
    h
  )

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png"
    )
  })
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
