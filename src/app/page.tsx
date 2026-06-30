"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Upload, Download, Loader2, X, ArrowUp, ArrowDown,
  ImagePlus, ChevronDown, ChevronUp,
  Play, FolderTree, FileImage, Monitor, Sparkles,
} from "lucide-react"
import ImageEditor from "@/components/ImageEditor"
import { compressImage, compressBlob, ImageTooLargeError } from "@/lib/imageCompressor"
import { buildAndDownloadPdf } from "@/lib/clientPdfBuilder"
import { enhanceImageFile } from "@/lib/imageEnhancer"

export default function Home() {
  const [images, setImages] = useState<{ id: string; file: File; url: string }[]>([])
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [compressingCount, setCompressingCount] = useState({ done: 0, total: 0 })
  const [applyingEdit, setApplyingEdit] = useState(false)
  const [clientConverting, setClientConverting] = useState(false)
  const [enhanceColors, setEnhanceColors] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [apiResults, setApiResults] = useState<Record<string, { data: string; status: number } | null>>({})
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({})
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = async (fileList: FileList | null) => {
    setConvertError(null)
    if (!fileList || fileList.length === 0) return

    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith("image/"))
    if (imageFiles.length === 0) {
      setConvertError("请只选择图片文件。")
      return
    }

    setCompressing(true)
    setCompressingCount({ done: 0, total: imageFiles.length })

    const newItems: { id: string; file: File; url: string }[] = []
    const errors: string[] = []

    for (let i = 0; i < imageFiles.length; i++) {
      const f = imageFiles[i]
      try {
        const compressed = await compressImage(f)
        newItems.push({
          id: `${f.name}-${compressed.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: compressed,
          url: URL.createObjectURL(compressed),
        })
      } catch (err) {
        if (err instanceof ImageTooLargeError) {
          errors.push(err.message)
        } else {
          errors.push(`"${f.name}" 压缩失败`)
        }
      }
      setCompressingCount({ done: i + 1, total: imageFiles.length })
    }

    setCompressing(false)

    if (errors.length > 0) {
      setConvertError(errors.join("；"))
    }
    if (newItems.length > 0) {
      setImages(prev => [...prev, ...newItems])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (compressing) return
    addFiles(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (compressing) return
    addFiles(e.dataTransfer.files)
  }

  const removeImage = (id: string) => {
    setImages(prev => {
      const t = prev.find(i => i.id === id)
      if (t) URL.revokeObjectURL(t.url)
      return prev.filter(i => i.id !== id)
    })
  }

  const moveImage = (index: number, dir: -1 | 1) => {
    setImages(prev => {
      const ni = index + dir
      if (index < 0 || index >= prev.length || ni < 0 || ni >= prev.length) return prev
      const next = [...prev]
      const [m] = next.splice(index, 1)
      next.splice(ni, 0, m)
      return next
    })
  }

  const handleDragStart = (i: number) => setDragIndex(i)
  const handleDragOverItem = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === i) { setDragOverIndex(null); return }
    setDragOverIndex(i)
  }
  const handleDropItem = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === i) { setDragIndex(null); setDragOverIndex(null); return }
    setImages(prev => {
      const next = [...prev]
      const [m] = next.splice(dragIndex, 1)
      next.splice(i, 0, m)
      return next
    })
    setDragIndex(null)
    setDragOverIndex(null)
  }
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null) }

  const applyEdit = async (id: string, blob: Blob, fileName: string) => {
    setApplyingEdit(true)
    try {
      const compressed = await compressBlob(blob, fileName)
      setImages(prev => {
        const target = prev.find(i => i.id === id)
        if (target) URL.revokeObjectURL(target.url)
        return prev.map(i => i.id === id ? { ...i, file: compressed, url: URL.createObjectURL(compressed) } : i)
      })
      setEditingId(null)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "编辑后的图片压缩失败")
    } finally {
      setApplyingEdit(false)
    }
  }

  const clearAll = () => {
    setImages(prev => { prev.forEach(i => URL.revokeObjectURL(i.url)); return [] })
    setConvertError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleConvert = async () => {
    if (images.length === 0) return
    setConverting(true)
    setConvertError(null)
    try {
      // 色彩优化
      let files = images.map(i => i.file)
      if (enhanceColors) {
        const enhanced: File[] = []
        for (const f of files) {
          enhanced.push(await enhanceImageFile(f))
        }
        files = enhanced
      }

      const formData = new FormData()
      files.forEach((f, idx) => formData.append(`image-${idx}`, f, f.name))
      const res = await fetch("/api/img2pdf", { method: "POST", body: formData })
      if (!res.ok) {
        let msg = `转换失败 (HTTP ${res.status})`
        try { const d = await res.json(); if (d?.error) msg = d.error } catch { /* not json */ }
        throw new Error(msg)
      }
      const b64 = (await res.text()).trim()
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = images.length > 1 ? "merged.pdf" : "converted.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "转换失败。")
    } finally {
      setConverting(false)
    }
  }

  const handleClientConvert = async () => {
    if (images.length === 0) return
    setClientConverting(true)
    setConvertError(null)
    try {
      let files = images.map(i => i.file)
      if (enhanceColors) {
        const enhanced: File[] = []
        for (const f of files) {
          enhanced.push(await enhanceImageFile(f))
        }
        files = enhanced
      }
      const filename = images.length > 1 ? "merged.pdf" : "converted.pdf"
      await buildAndDownloadPdf(files, filename)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "客户端合成失败")
    } finally {
      setClientConverting(false)
    }
  }

  const callApi = async (path: string) => {
    setLoadingStates(p => ({ ...p, [path]: true }))
    const res = await fetch(path)
    const data = await res.json()
    setApiResults(p => ({ ...p, [path]: { data: JSON.stringify(data, null, 2), status: res.status } }))
    setLoadingStates(p => ({ ...p, [path]: false }))
  }

  const apiEndpoints = [
    { path: "/hello", file: "cloud-functions/hello.py", desc: "静态路由 — 文件名直接映射为路径" },
    { path: "/api/posts", file: "cloud-functions/api/posts/index.py", desc: "index.py 作为目录的默认处理函数" },
    { path: "/api/users/u-42", file: "cloud-functions/api/users/[userId].py", desc: "[userId] 捕获单个动态路径段" },
    { path: "/api/users/u-42/posts/p-7", file: "cloud-functions/api/users/[userId]/posts/[postId].py", desc: "嵌套动态参数" },
    { path: "/api/files/docs/guide/intro.md", file: "cloud-functions/api/files/[[path]].py", desc: "[[path]] 捕获剩余路径段" },
  ]

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-700 antialiased">
      {/* ── 背景光效 ── */}
      <div className="gradient-orb gradient-orb-1" />
      <div className="gradient-orb gradient-orb-2" />
      <div className="gradient-orb gradient-orb-3" />
      <div className="dot-pattern" />

      {/* ── 署名 (右上角固定) ── */}
      <div className="fixed top-4 right-4 z-50 animate-signature-in select-none pointer-events-none">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full 
          bg-white/60 backdrop-blur-md border border-slate-200/50 shadow-sm
          text-[11px] font-medium text-slate-400 tracking-wide
          hover:bg-white/80 hover:border-slate-300 hover:text-slate-500 hover:shadow transition-all duration-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-signature-dot" />
          made by <span className="text-slate-500 font-semibold">sxw</span>
        </span>
      </div>

      {/* ── Header (毛玻璃) ── */}
      <header className="sticky top-0 z-20 glass-nav">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg width="20" height="20" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M7 5h12l6 6v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                <path d="M19 5v6h6" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                <rect x="10" y="13" width="12" height="10" rx="1.5" fill="none" stroke="white" strokeWidth="1.5"/>
                <path d="M10 19l3-3 2.5 2 3-2 3.5 3v2H10z" fill="white" opacity="0.7"/>
                <circle cx="20.5" cy="15.5" r="1" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-800">图片转 PDF</span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-xs font-semibold text-blue-600 border border-blue-100">
              <Sparkles className="w-3 h-3" />免费在线
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center text-[10px] font-medium text-slate-300 select-none tracking-wide">
              made by <span className="ml-0.5 text-slate-400 font-semibold">sxw</span>
            </span>
            <a href="https://github.com/sxwzxc/topdf" target="_blank" rel="noopener noreferrer"
               className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-xl hover:bg-slate-100" aria-label="GitHub">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 max-w-3xl mx-auto px-5 py-10 space-y-8 animate-fade-in-up">

        {/* ── Hero ── */}
        <div className="text-center max-w-lg mx-auto pb-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            图片转 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-blue-600">PDF</span>
          </h1>
          <p className="mt-3 text-base text-slate-500 leading-relaxed">
            拖拽上传 · 在线编辑 · 一键合成 — 免费 · 安全 · 无需注册
          </p>
        </div>

        {/* ── 主卡片 (毛玻璃) ── */}
        <Card className="glass-card rounded-3xl overflow-hidden shadow-lg">
          <div className="gradient-line" />
          <CardHeader className="pb-2 pt-6 px-6">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5 text-slate-500">
              <FileImage className="w-5 h-5 text-blue-500" />
              <span>上传图片</span>
              <span
                className={`ml-auto text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-semibold ${images.length > 1 ? "" : "hidden"}`}
              >
                {images.length} 页
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5 px-6 pb-6">
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />

            {/* Drop zone */}
            <div
              onClick={() => { if (!compressing) fileInputRef.current?.click() }}
              onDragOver={e => { e.preventDefault(); if (!compressing) setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`dropzone flex flex-col items-center justify-center gap-3 py-14 px-6 transition-all ${compressing ? "opacity-40 pointer-events-none" : "cursor-pointer"} ${isDragging && !compressing ? "dropzone-active" : ""}`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                isDragging ? "bg-blue-500 shadow-xl shadow-blue-500/30 scale-110" : "bg-blue-50"
              }`}>
                {compressing ? (
                  <Loader2 className={`w-6 h-6 animate-spin ${isDragging ? "text-white" : "text-blue-500"}`} />
                ) : (
                  <Upload className={`w-6 h-6 transition-colors ${isDragging ? "text-white" : "text-blue-500"}`} />
                )}
              </div>
              <p className={`text-base font-semibold transition-colors ${isDragging ? "text-blue-600" : "text-slate-600"}`}>
                {compressing
                  ? `压缩中... (${compressingCount.done}/${compressingCount.total})`
                  : isDragging ? "松开鼠标以上传" : "点击或拖拽图片到这里"}
              </p>
              <p className={`text-sm transition-colors ${isDragging ? "text-blue-400" : "text-slate-400"}`}>
                支持 JPG · PNG · WEBP · GIF · BMP · 单张最大 50MB
              </p>
            </div>

            {/* 缩略图 */}
            {images.length > 0 && (
              <div className="space-y-4 stagger">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">点击编辑 · 拖拽排序</p>
                  <button
                    onClick={clearAll}
                    disabled={compressing}
                    className="text-sm text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors cursor-pointer font-medium"
                  >
                    清空全部
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto pr-1">
                  {images.map((img, idx) => (
                    <div
                      key={img.id}
                      draggable
                      onClick={() => setEditingId(img.id)}
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOverItem(e, idx)}
                      onDrop={e => handleDropItem(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`thumb-item group cursor-pointer active:cursor-grabbing
                        ${dragOverIndex === idx ? "thumb-item-drag-over" : ""}
                        ${dragIndex === idx ? "thumb-item-dragging" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={`第 ${idx + 1} 张图片`}
                           className="w-full h-full object-cover pointer-events-none" />

                      {/* 序号 */}
                      <div className="absolute top-2 left-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-900/70 backdrop-blur-md flex items-center justify-center text-[11px] text-white font-semibold">
                          {idx + 1}
                        </span>
                      </div>

                      {/* 删除 */}
                      <button
                        onClick={e => { e.stopPropagation(); removeImage(img.id) }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-white/90 hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all shadow-md cursor-pointer backdrop-blur-sm"
                        aria-label="删除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      {/* 排序按钮 */}
                      <div className="absolute bottom-2 left-2 right-2 flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          onClick={e => { e.stopPropagation(); moveImage(idx, -1) }}
                          disabled={idx === 0}
                          className="w-6 h-6 rounded-lg bg-white/90 hover:bg-blue-50 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors shadow-md cursor-pointer backdrop-blur-sm"
                          aria-label="上移"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); moveImage(idx, 1) }}
                          disabled={idx === images.length - 1}
                          className="w-6 h-6 rounded-lg bg-white/90 hover:bg-blue-50 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors shadow-md cursor-pointer backdrop-blur-sm"
                          aria-label="下移"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* 添加更多 */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={compressing}
                    className="thumb-item disabled:opacity-30 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50/50 cursor-pointer border-dashed border-2 border-slate-200"
                    aria-label="添加更多图片"
                  >
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-xs font-semibold">添加</span>
                  </button>
                </div>

                {/* 操作按钮 */}
                <div className="flex flex-col gap-3 pt-2">
                  {convertError && (
                    <div className="px-4 py-3 rounded-2xl border border-red-200 bg-red-50 text-sm text-red-600 font-medium">
                      {convertError}
                    </div>
                  )}
                  {/* 色彩优化开关 */}
                  <label className="flex items-center gap-3 px-1 cursor-pointer select-none group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={enhanceColors}
                        onChange={(e) => setEnhanceColors(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
                        enhanceColors ? "bg-blue-500" : "bg-slate-300"
                      }`}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                          enhanceColors ? "translate-x-4" : "translate-x-0"
                        }`} />
                      </div>
                    </div>
                    <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      优化为扫描效果
                    </span>
                  </label>
                  <Button
                    onClick={handleConvert}
                    disabled={converting || compressing || applyingEdit || clientConverting}
                    className="w-full h-14 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-base rounded-2xl cursor-pointer shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300"
                  >
                    {converting ? (
                      <><Loader2 className="w-5 h-5 mr-2.5 animate-spin" />转换中...</>
                    ) : (
                      <><Download className="w-5 h-5 mr-2.5" />{images.length > 1 ? "合并为 PDF" : "转为 PDF"}</>
                    )}
                  </Button>
                  <Button
                    onClick={handleClientConvert}
                    disabled={clientConverting || converting || compressing || applyingEdit}
                    className="w-full h-13 bg-white/80 backdrop-blur hover:bg-white text-slate-600 font-semibold text-sm rounded-2xl border border-slate-200/60 hover:border-slate-300 cursor-pointer transition-all duration-200 shadow-sm"
                  >
                    {clientConverting ? (
                      <><Loader2 className="w-5 h-5 mr-2.5 animate-spin" />合成中...</>
                    ) : (
                      <><Monitor className="w-4 h-4 mr-2.5" />客户端合成 PDF</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 特性卡片 ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Upload, label: "拖拽上传", desc: "批量添加图片", tint: "card-tint-lavender", iconBg: "from-violet-50 to-purple-100", iconColor: "text-violet-500" },
            { icon: FileImage, label: "裁剪矫正", desc: "透视 + 色彩修正", tint: "card-tint-mint", iconBg: "from-emerald-50 to-teal-100", iconColor: "text-emerald-500" },
            { icon: Download, label: "一键导出", desc: "高质量 PDF", tint: "card-tint-pink", iconBg: "from-rose-50 to-pink-100", iconColor: "text-rose-500" },
          ].map(({ icon: Icon, label, desc, tint, iconBg, iconColor }) => (
            <div key={label}
              className={`card-solid rounded-2xl p-5 flex flex-col items-center gap-2 text-center cursor-default ${tint}`}
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconBg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <span className="text-sm font-bold text-slate-700">{label}</span>
              <span className="text-xs text-slate-400 leading-tight">{desc}</span>
            </div>
          ))}
        </div>

        {/* ── API 文档 ── */}
        <button
          onClick={() => setShowAdvanced(p => !p)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-slate-400 hover:text-slate-500 transition-colors cursor-pointer"
        >
          <span>API 文档</span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 animate-fade-in">
            <div className="card-solid rounded-2xl p-5">
              <div className="flex items-center gap-2.5 mb-3.5">
                <FolderTree className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-slate-500">文件路由</span>
              </div>
              <pre className="text-xs text-slate-500 font-mono leading-relaxed overflow-x-auto">{`cloud-functions/
├── hello.py                       → GET /hello
├── api/
│   ├── posts/index.py             → GET /api/posts
│   ├── users/[userId].py          → GET /api/users/:id
│   ├── img2pdf.py                 → POST /api/img2pdf
│   └── files/[[path]].py          → GET /api/files/*path`}</pre>
            </div>

            {apiEndpoints.map(ep => {
              const res = apiResults[ep.path]
              const loading = loadingStates[ep.path]
              const isExpanded = expandedCode === ep.path
              return (
                <div key={ep.path} className="card-solid rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="method-badge shrink-0">GET</span>
                      <span className="text-sm font-mono text-slate-700 truncate">{ep.path}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedCode(isExpanded ? null : ep.path)}
                        className="text-slate-400 hover:text-blue-500 transition-colors cursor-pointer p-1"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <Button size="sm" onClick={() => callApi(ep.path)} disabled={loading}
                              className="h-9 px-4 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-xs rounded-xl cursor-pointer border border-slate-200 font-semibold">
                        {loading ? <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                          : <Play className="w-3 h-3" />}
                        <span className="ml-1.5">调用</span>
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-slate-100 pt-4">
                      <p className="text-[11px] text-slate-400 font-mono mb-1.5">{ep.file}</p>
                      <p className="text-xs text-slate-500">{ep.desc}</p>
                    </div>
                  )}
                  {res && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <p className="text-[11px] text-slate-400 font-mono mb-1.5">响应 ({res.status})</p>
                      <pre className="text-xs text-emerald-700 font-mono whitespace-pre-wrap break-all bg-emerald-50/50 rounded-xl p-4">{res.data}</pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 text-center py-10 text-sm text-slate-400 border-t border-slate-100 mt-6">
        <p>
          由{" "}
          <a href="https://pages.edgeone.ai" target="_blank" rel="noopener noreferrer"
            className="text-slate-500 hover:text-blue-500 transition-colors font-semibold">
            EdgeOne Pages
          </a>
          {" "}提供动力 · 图片本地处理，安全无忧
        </p>
      </footer>

      {/* ── 编辑器弹窗 ── */}
      {editingId && (() => {
        const target = images.find(i => i.id === editingId)
        if (!target) return null
        return (
          <ImageEditor
            imageSrc={target.url}
            fileName={target.file.name}
            onApply={(blob, fileName) => applyEdit(target.id, blob, fileName)}
            onCancel={() => setEditingId(null)}
          />
        )
      })()}
    </div>
  )
}
