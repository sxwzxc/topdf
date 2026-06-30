"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Upload, Download, Loader2, X, ArrowUp, ArrowDown,
  ImagePlus, Pencil, GripVertical, ChevronDown, ChevronUp,
  Play, FolderTree, Route, Layers, FileImage,
} from "lucide-react"
import ImageEditor from "@/components/ImageEditor"

export default function Home() {
  // Image-to-PDF converter state
  const [images, setImages] = useState<{ id: string; file: File; url: string }[]>([])
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [apiResults, setApiResults] = useState<Record<string, { data: string; status: number } | null>>({})
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({})
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = (fileList: FileList | null) => {
    setConvertError(null)
    if (!fileList || fileList.length === 0) return
    const newItems = Array.from(fileList)
      .filter(f => f.type.startsWith("image/"))
      .map(file => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
      }))
    if (newItems.length === 0) {
      setConvertError("请只选择图片文件。")
      return
    }
    setImages(prev => [...prev, ...newItems])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
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

  const applyEdit = (id: string, blob: Blob, fileName: string) => {
    setImages(prev => {
      const t = prev.find(i => i.id === id)
      if (t) URL.revokeObjectURL(t.url)
      const f = new File([blob], fileName, { type: blob.type })
      return prev.map(i => i.id === id ? { ...i, file: f, url: URL.createObjectURL(blob) } : i)
    })
    setEditingId(null)
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
      const formData = new FormData()
      images.forEach((img, idx) => formData.append(`image-${idx}`, img.file, img.file.name))
      const res = await fetch("/api/img2pdf", { method: "POST", body: formData })
      if (!res.ok) {
        let msg = `转换失败 (HTTP ${res.status})`
        try { const d = await res.json(); if (d?.error) msg = d.error } catch { /* not json */ }
        throw new Error(msg)
      }
      // 后端用 base64 编码 PDF 以绕过 EdgeOne 运行时对非 ASCII 字节的破坏
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
    { path: "/api/users/u-42/posts/p-7", file: "cloud-functions/api/users/[userId]/posts/[postId].py", desc: "嵌套动态参数：[userId] 与 [postId]" },
    { path: "/api/files/docs/guide/intro.md", file: "cloud-functions/api/files/[[path]].py", desc: "[[path]] 捕获剩余所有路径段" },
  ]

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-[#080808]/90 backdrop-blur-md border-b border-[#1f1f1f]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Inline SVG logo */}
            <svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="32" height="32" rx="6" fill="#3776AB"/>
              <path d="M7 5h12l6 6v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M19 5v6h6" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              <rect x="10" y="13" width="12" height="10" rx="1.5" fill="none" stroke="white" strokeWidth="1.5"/>
              <path d="M10 19l3-3 2.5 2 3-2 3.5 3v2H10z" fill="white" opacity="0.7"/>
              <circle cx="20.5" cy="15.5" r="1" fill="white"/>
            </svg>
            <span className="font-semibold text-base tracking-tight">图片转 PDF</span>
          </div>
          <a href="https://github.com/sxwzxc/topdf" target="_blank" rel="noopener noreferrer"
             className="text-gray-500 hover:text-white transition-colors p-1" aria-label="GitHub">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
            </svg>
          </a>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── Converter Card ── */}
        <Card className="border border-[#1f1f1f] bg-[#0f0f0f] rounded-2xl overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-gray-400">
              <FileImage className="w-4 h-4 text-[#3776AB]" />
              <span>图片转 PDF</span>
              <span
                className={`ml-auto text-xs bg-[#3776AB]/20 text-[#3776AB] px-2 py-0.5 rounded-full font-mono ${images.length > 1 ? "" : "hidden"}`}
              >
                {images.length} 页
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 px-4 pb-4">
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`dropzone flex flex-col items-center justify-center gap-2 py-10 px-4 rounded-xl cursor-pointer transition-all ${isDragging ? "dropzone-active" : ""}`}
            >
              <div className="w-11 h-11 rounded-full bg-[#3776AB]/15 flex items-center justify-center">
                <Upload className="w-5 h-5 text-[#3776AB]" />
              </div>
              <p className="text-sm text-gray-300 font-medium">点击或拖拽图片到这里</p>
              <p className="text-xs text-gray-500">支持 JPG · PNG · WEBP · GIF · BMP</p>
            </div>

            {/* Thumbnails */}
            {images.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    拖拽排序 · 悬停编辑
                  </p>
                  <button onClick={clearAll} className="text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer">
                    清空
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto pr-0.5">
                  {images.map((img, idx) => (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOverItem(e, idx)}
                      onDrop={e => handleDropItem(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`relative rounded-lg overflow-hidden bg-[#161616] border aspect-square group cursor-grab active:cursor-grabbing transition-all
                        ${dragOverIndex === idx ? "border-[#3776AB] ring-2 ring-[#3776AB]/40 scale-95" : "border-[#2a2a2a]"}
                        ${dragIndex === idx ? "opacity-30" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={`第 ${idx + 1} 页`}
                           className="w-full h-full object-cover pointer-events-none" />

                      {/* Page number */}
                      <div className="absolute top-1 left-1 flex gap-0.5">
                        <span className="w-5 h-5 rounded-full bg-black/80 flex items-center justify-center text-[9px] text-white font-mono leading-none">
                          {idx + 1}
                        </span>
                        <GripVertical className={`w-3.5 h-3.5 text-white/60 ${images.length > 1 ? "" : "hidden"}`} />
                      </div>

                      {/* Delete */}
                      <button
                        onClick={e => { e.stopPropagation(); removeImage(img.id) }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-red-500/80 flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
                        aria-label="删除"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>

                      {/* Bottom toolbar */}
                      <div className="absolute bottom-1 left-1 right-1 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); setEditingId(img.id) }}
                          className="flex-1 h-5 mr-0.5 rounded bg-black/80 hover:bg-[#3776AB]/80 flex items-center justify-center text-[9px] text-gray-300 hover:text-white transition-colors cursor-pointer gap-0.5"
                          aria-label="编辑"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          编辑
                        </button>
                        <div className="flex gap-0.5">
                          <button
                            onClick={e => { e.stopPropagation(); moveImage(idx, -1) }}
                            disabled={idx === 0}
                            className="w-5 h-5 rounded bg-black/80 hover:bg-[#3776AB]/80 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
                            aria-label="上移"
                          >
                            <ArrowUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); moveImage(idx, 1) }}
                            disabled={idx === images.length - 1}
                            className="w-5 h-5 rounded bg-black/80 hover:bg-[#3776AB]/80 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
                            aria-label="下移"
                          >
                            <ArrowDown className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add more tile */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border border-dashed border-[#2a2a2a] hover:border-[#3776AB]/50 hover:bg-[#3776AB]/5 flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-[#3776AB] transition-colors cursor-pointer"
                    aria-label="添加更多图片"
                  >
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[10px]">添加</span>
                  </button>
                </div>

                {/* Action bar */}
                <div className="flex flex-col gap-2">
                  {convertError && (
                    <div className="px-3 py-2 rounded-lg border border-red-500/25 bg-red-500/5 text-xs text-red-400">
                      {convertError}
                    </div>
                  )}
                  <Button
                    onClick={handleConvert}
                    disabled={converting}
                    className="w-full h-11 bg-[#3776AB] hover:bg-[#2d6290] text-white font-medium rounded-xl cursor-pointer transition-colors"
                  >
                    {converting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />转换中...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />{images.length > 1 ? "合并为 PDF" : "转为 PDF"}</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Advanced (API Docs — collapsible) ── */}
        <button
          onClick={() => setShowAdvanced(p => !p)}
          className="w-full flex items-center justify-between px-1 py-1 text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
        >
          <span>API 文档</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAdvanced && (
          <div className="space-y-3">
            {/* File structure */}
            <Card className="border border-[#1a1a1a] bg-[#0c0c0c] rounded-xl overflow-hidden">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs flex items-center gap-2 text-gray-500">
                  <FolderTree className="w-3.5 h-3.5 text-[#3776AB]" />
                  文件路由
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <pre className="text-[11px] text-gray-500 font-mono leading-relaxed overflow-x-auto">{`cloud-functions/
├── hello.py                       → GET /hello
├── api/
│   ├── posts/index.py             → GET /api/posts
│   ├── users/[userId].py          → GET /api/users/:id
│   ├── img2pdf.py                 → POST /api/img2pdf
│   └── files/[[path]].py          → GET /api/files/*path`}</pre>
              </CardContent>
            </Card>

            {/* API endpoints */}
            {apiEndpoints.map(ep => {
              const res = apiResults[ep.path]
              const loading = loadingStates[ep.path]
              const isExpanded = expandedCode === ep.path
              return (
                <div key={ep.path} className="rounded-xl border border-[#1a1a1a] bg-[#0c0c0c] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="method-badge shrink-0">GET</span>
                      <span className="text-xs font-mono text-gray-300 truncate">{ep.path}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setExpandedCode(isExpanded ? null : ep.path)}
                        className="text-[10px] text-gray-600 hover:text-[#3776AB] transition-colors cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <Button size="sm" onClick={() => callApi(ep.path)} disabled={loading}
                              className="h-7 px-2.5 bg-[#161616] hover:bg-[#1f1f1f] text-gray-400 hover:text-white text-[10px] rounded-lg cursor-pointer border border-[#2a2a2a]">
                        {loading ? <div className="w-2.5 h-2.5 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                          : <Play className="w-2.5 h-2.5" />}
                        <span className="ml-1">调用</span>
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-2">
                      <p className="text-[10px] text-gray-600 font-mono mb-1">{ep.file}</p>
                      <p className="text-[10px] text-gray-500">{ep.desc}</p>
                    </div>
                  )}
                  {res && (
                    <div className="border-t border-[#1a1a1a] px-3 py-2">
                      <p className="text-[10px] text-gray-600 font-mono mb-1">响应 {res.status > 0 ? `(${res.status})` : ""}</p>
                      <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap break-all">{res.data}</pre>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Features */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: FolderTree, label: "文件路由", color: "#3776AB" },
                { icon: Route, label: "动态路由", color: "#FFD43B" },
                { icon: Layers, label: "纯 Python", color: "#FFD43B" },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="rounded-xl border border-[#1a1a1a] bg-[#0c0c0c] p-3 flex flex-col items-center gap-1.5 text-center">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <span className="text-[10px] text-gray-500 leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-6 text-[10px] text-gray-700">
        由 <a href="https://pages.edgeone.ai" target="_blank" rel="noopener noreferrer"
          className="hover:text-[#3776AB] transition-colors">EdgeOne Pages</a> 提供动力
      </footer>

      {/* ── Image Editor Modal ── */}
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
