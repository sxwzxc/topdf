"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Play, ExternalLink, Zap, ChevronDown, ChevronUp, FolderTree, Route, Layers, Upload, FileImage, Download, Loader2, X, ArrowUp, ArrowDown, ImagePlus, Pencil, GripVertical } from "lucide-react"
import ImageEditor from "@/components/ImageEditor"

interface ApiEndpoint {
  name: string
  method: string
  path: string
  file: string
  description: string
  category: "static" | "dynamic-single" | "dynamic-multi" | "catch-all" | "index"
}

const endpoints: ApiEndpoint[] = [
  {
    name: "Hello",
    method: "GET",
    path: "/hello",
    file: "cloud-functions/hello.py",
    description: "Static route — file name maps directly to path",
    category: "static",
  },
  {
    name: "List Posts",
    method: "GET",
    path: "/api/posts",
    file: "cloud-functions/api/posts/index.py",
    description: "index.py serves as the default handler for a directory",
    category: "index",
  },
  {
    name: "User by ID",
    method: "GET",
    path: "/api/users/u-42",
    file: "cloud-functions/api/users/[userId].py",
    description: "[userId] captures a single dynamic segment",
    category: "dynamic-single",
  },
  {
    name: "User's Post",
    method: "GET",
    path: "/api/users/u-42/posts/p-7",
    file: "cloud-functions/api/users/[userId]/posts/[postId].py",
    description: "Nested dynamic params: [userId] and [postId]",
    category: "dynamic-multi",
  },
  {
    name: "File Access",
    method: "GET",
    path: "/api/files/docs/guide/intro.md",
    file: "cloud-functions/api/files/[[path]].py",
    description: "[[path]] catches all remaining path segments",
    category: "catch-all",
  },
]

const categoryLabels: Record<string, string> = {
  "static": "Static Routes",
  "index": "Index Routes",
  "dynamic-single": "Single Dynamic Param [param]",
  "dynamic-multi": "Multiple Dynamic Params",
  "catch-all": "Catch-All Routes [[param]]",
}

const categoryOrder = ["static", "index", "dynamic-single", "dynamic-multi", "catch-all"]

export default function Home() {
  const [results, setResults] = useState<Record<string, { data: string; status: number } | null>>({})
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({})
  const [expandedCode, setExpandedCode] = useState<string | null>(null)

  // Image-to-PDF converter state (multi-image)
  const [images, setImages] = useState<{ id: string; file: File; url: string }[]>([])
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleApiCall = async (endpoint: ApiEndpoint) => {
    const key = endpoint.path
    setLoadingStates(prev => ({ ...prev, [key]: true }))
    const response = await fetch(endpoint.path)
    const data = await response.json()
    setResults(prev => ({ ...prev, [key]: { data: JSON.stringify(data, null, 2), status: response.status } }))
    setLoadingStates(prev => ({ ...prev, [key]: false }))
  }

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
      setConvertError("Please select image files only.")
      return
    }
    setImages(prev => [...prev, ...newItems])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const removeImage = (id: string) => {
    setImages(prev => {
      const target = prev.find(i => i.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter(i => i.id !== id)
    })
  }

  const moveImage = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    setImages(prev => {
      if (index < 0 || index >= prev.length || newIndex < 0 || newIndex >= prev.length) {
        return prev
      }
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOverItem = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) {
      setDragOverIndex(null)
      return
    }
    setDragOverIndex(index)
  }

  const handleDropItem = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    setImages(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const applyEdit = (id: string, blob: Blob, fileName: string) => {
    setImages(prev => {
      const target = prev.find(i => i.id === id)
      if (target) URL.revokeObjectURL(target.url)
      const editedFile = new File([blob], fileName, { type: blob.type })
      return prev.map(i =>
        i.id === id
          ? { ...i, file: editedFile, url: URL.createObjectURL(blob) }
          : i
      )
    })
    setEditingId(null)
  }

  const clearAll = () => {
    setImages(prev => {
      prev.forEach(i => URL.revokeObjectURL(i.url))
      return []
    })
    setConvertError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleConvert = async () => {
    if (images.length === 0) return
    setConverting(true)
    setConvertError(null)
    try {
      const formData = new FormData()
      images.forEach((img, idx) => {
        formData.append(`image-${idx}`, img.file, img.file.name)
      })

      const response = await fetch("/api/img2pdf", {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        let message = `Conversion failed (HTTP ${response.status})`
        try {
          const data = await response.json()
          if (data?.error) message = data.error
        } catch {
          // response wasn't JSON
        }
        throw new Error(message)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = images.length > 1 ? "merged.pdf" : "converted.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Conversion failed.")
    } finally {
      setConverting(false)
    }
  }

  const grouped = categoryOrder.map(cat => ({
    category: cat,
    label: categoryLabels[cat],
    items: endpoints.filter(e => e.category === cat),
  }))

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Grid Background */}
      <div className="grid-background" />

      {/* Background Gradient Orbs */}
      <div className="gradient-orb gradient-orb-primary w-[600px] h-[600px] -top-[200px] -left-[150px] animate-pulse-glow" />
      <div className="gradient-orb gradient-orb-secondary w-[400px] h-[400px] top-[40%] -right-[100px] animate-pulse-glow animation-delay-200" />

      {/* Python Pattern Decoration */}
      <svg className="python-pattern top-[15%] right-[10%]" viewBox="0 0 110 110" fill="currentColor">
        <path d="M54.5 0C26.55 0 28.3 12.23 28.3 12.23l.03 12.66h26.67v3.8H17.03S0 26.11 0 54.7c0 28.59 14.85 27.57 14.85 27.57h8.86V69.06s-.48-14.85 14.6-14.85h25.13s14.14.23 14.14-13.66V14.74S79.25 0 54.5 0zM40.17 8.52a4.67 4.67 0 110 9.34 4.67 4.67 0 010-9.34z"/>
      </svg>

      {/* Header */}
      <header className="header-border relative z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-end">
            <a
              href="https://github.com/TencentEdgeOne/python-handler-template"
              target="_blank"
              rel="noopener noreferrer"
              className="icon-glow text-gray-400 hover:text-[#3776AB] transition-colors p-2"
              aria-label="GitHub"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-16 relative z-10">
        <div className="max-w-4xl mx-auto space-y-10">
          {/* Hero Section */}
          <div className="text-center space-y-6 animate-fade-in-up">
            {/* Title */}
            <h1 className="text-5xl md:text-6xl font-bold leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#3776AB] via-[#5A9FD4] to-white">
                Python
              </span>
              <span className="text-white/70"> + EdgeOne Pages</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-gray-400 max-w-3xl mx-auto leading-relaxed">
              File-based routing for Python functions. Each <code className="text-[#3776AB] bg-[#3776AB]/10 px-1.5 py-0.5 rounded">.py</code> file
              in <code className="text-[#3776AB] bg-[#3776AB]/10 px-1.5 py-0.5 rounded">cloud-functions/</code> automatically
              maps to an HTTP endpoint.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up animation-delay-100">
            <a href="https://edgeone.ai/pages/new?from=github&template=python-handler-template" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="btn-primary px-8 py-6 text-lg rounded-lg cursor-pointer">
                <Zap className="w-5 h-5 mr-2" />
                One-Click Deployment
              </Button>
            </a>
            <a href="https://pages.edgeone.ai/document/python" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="btn-outline px-8 py-6 text-lg rounded-lg cursor-pointer">
                <ExternalLink className="w-5 h-5 mr-2" />
                View Documentation
              </Button>
            </a>
          </div>

          {/* Image to PDF Converter */}
          <Card className="glass-card border-0 animate-fade-in-up animation-delay-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-gray-400">
                <FileImage className="w-4 h-4 text-[#3776AB]" />
                Images → PDF Converter (Merge · Edit · Reorder)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`dropzone flex flex-col items-center justify-center gap-3 py-8 px-6 rounded-lg cursor-pointer transition-colors ${
                  isDragging ? "dropzone-active" : ""
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[#3776AB]/15 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-[#3776AB]" />
                </div>
                <p className="text-sm text-gray-300">
                  Click to upload or drag &amp; drop images
                </p>
                <p className="text-xs text-gray-500">
                  PNG, JPG, WEBP, GIF, BMP, etc. — multiple images are merged into one PDF
                </p>
              </div>

              {images.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-mono">
                      {images.length} image{images.length > 1 ? "s" : ""} selected · drag cards to reorder
                    </p>
                    <button
                      onClick={clearAll}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOverItem(e, idx)}
                        onDrop={(e) => handleDropItem(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`relative rounded-lg overflow-hidden bg-[#0d1117] border aspect-square group cursor-grab active:cursor-grabbing transition-colors ${
                          dragOverIndex === idx
                            ? "border-[#3776AB] ring-2 ring-[#3776AB]/40"
                            : "border-[#3776AB]/15"
                        } ${dragIndex === idx ? "opacity-40" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={`Image ${idx + 1}`}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        <div className="absolute top-1 left-1 flex items-center gap-1">
                          <span className="w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-[10px] text-white font-mono">
                            {idx + 1}
                          </span>
                          <GripVertical className="w-3.5 h-3.5 text-white/70 bg-black/40 rounded" />
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeImage(img.id)
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-500/80 flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
                          aria-label="Remove image"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        {/* Action toolbar */}
                        <div className="absolute bottom-1 left-1 right-1 flex justify-between items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingId(img.id)
                            }}
                            className="flex-1 h-6 rounded bg-black/70 hover:bg-[#3776AB]/80 flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer text-[10px] gap-1"
                            aria-label="Edit image"
                            title="Edit (rotate / crop / straighten)"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                moveImage(idx, -1)
                              }}
                              disabled={idx === 0}
                              className="w-6 h-6 rounded bg-black/70 hover:bg-[#3776AB]/80 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
                              aria-label="Move up"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                moveImage(idx, 1)
                              }}
                              disabled={idx === images.length - 1}
                              className="w-6 h-6 rounded bg-black/70 hover:bg-[#3776AB]/80 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
                              aria-label="Move down"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-lg border border-dashed border-[#3776AB]/25 hover:border-[#3776AB]/50 hover:bg-[#3776AB]/5 flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-[#3776AB] transition-colors cursor-pointer"
                      aria-label="Add more images"
                    >
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-xs">Add more</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-gray-500">
                      Hover a thumbnail to edit, move, or delete. Drag to reorder pages.
                    </p>
                    <Button
                      onClick={handleConvert}
                      disabled={converting}
                      className="btn-primary rounded cursor-pointer"
                    >
                      {converting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          {images.length > 1 ? "Merge to PDF" : "Convert to PDF"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {convertError && (
                <div className="px-3 py-2 rounded border border-red-500/30 bg-red-500/5 text-xs text-red-400">
                  {convertError}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image Editor Modal */}
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

          {/* File Structure Card */}
          <Card className="glass-card border-0 animate-fade-in-up animation-delay-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-gray-400">
                <FolderTree className="w-4 h-4 text-[#3776AB]" />
                File-Based Routing Structure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="file-tree text-sm leading-relaxed overflow-x-auto">
{`cloud-functions/
├── hello.py                              → GET /hello
├── api/
│   ├── posts/
│   │   └── index.py                      → GET /api/posts
│   ├── users/
│   │   ├── [userId].py                   → GET /api/users/:userId
│   │   └── [userId]/
│   │       └── posts/
│   │           └── [postId].py           → GET /api/users/:userId/posts/:postId
│   └── files/
│       └── [[path]].py                   → GET /api/files/*path (catch-all)`}
              </pre>
            </CardContent>
          </Card>

          {/* API Endpoints by Category */}
          <div className="space-y-6 animate-fade-in-up animation-delay-300">
            {grouped.map(group => (
              <div key={group.category} className="space-y-3">
                <h2 className="category-header">
                  {group.label}
                </h2>
                {group.items.map(endpoint => {
                  const key = endpoint.path
                  const result = results[key]
                  const isLoading = loadingStates[key]
                  const isExpanded = expandedCode === key

                  return (
                    <div key={key} className="route-card p-4 space-y-3">
                      {/* Endpoint header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="method-badge">
                              {endpoint.method}
                            </span>
                            <span className="font-mono text-sm text-gray-200">{endpoint.path}</span>
                          </div>
                          <p className="text-xs text-gray-500">{endpoint.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedCode(isExpanded ? null : key)}
                            className="text-xs text-gray-500 hover:text-[#3776AB] flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span className="font-mono">{endpoint.file.split("/").pop()}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          <Button
                            size="sm"
                            onClick={() => handleApiCall(endpoint)}
                            disabled={isLoading}
                            className="btn-primary rounded cursor-pointer"
                          >
                            {isLoading ? (
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                            ) : (
                              <Play className="w-3 h-3 mr-1" />
                            )}
                            Call
                          </Button>
                        </div>
                      </div>

                      {/* Expandable source file path */}
                      {isExpanded && (
                        <div className="bg-[#0d1117] rounded px-3 py-2 border border-[#3776AB]/10">
                          <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                            <svg className="w-4 h-4 text-[#3776AB]" viewBox="0 0 110 110" fill="currentColor">
                              <path d="M54.5 0C26.55 0 28.3 12.23 28.3 12.23l.03 12.66h26.67v3.8H17.03S0 26.11 0 54.7c0 28.59 14.85 27.57 14.85 27.57h8.86V69.06s-.48-14.85 14.6-14.85h25.13s14.14.23 14.14-13.66V14.74S79.25 0 54.5 0zM40.17 8.52a4.67 4.67 0 110 9.34 4.67 4.67 0 010-9.34z"/>
                            </svg>
                            {endpoint.file}
                          </p>
                        </div>
                      )}

                      {/* Result */}
                      {result && (
                        <div className="api-response">
                          <div className="px-3 py-2 border-b border-green-500/20">
                            <p className="text-xs text-gray-500 font-mono">
                              Response {result.status > 0 ? `(${result.status})` : ""}
                            </p>
                          </div>
                          <pre className="p-3 text-xs overflow-x-auto">
                            {result.data}
                          </pre>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-12">
            <div className="feature-card p-5 animate-fade-in-up animation-delay-100">
              <div className="w-10 h-10 mb-4 rounded-lg bg-[#3776AB]/15 flex items-center justify-center">
                <FolderTree className="w-5 h-5 text-[#3776AB]" />
              </div>
              <h3 className="font-semibold mb-2">File-Based Routing</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Intuitive routing based on file system structure
              </p>
            </div>

            <div className="feature-card p-5 animate-fade-in-up animation-delay-200">
              <div className="w-10 h-10 mb-4 rounded-lg bg-[#3776AB]/15 flex items-center justify-center">
                <Route className="w-5 h-5 text-[#FFD43B]" />
              </div>
              <h3 className="font-semibold mb-2">Dynamic Routes</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Support for params, nested params, and catch-all
              </p>
            </div>

            <div className="feature-card p-5 animate-fade-in-up animation-delay-300">
              <div className="w-10 h-10 mb-4 rounded-lg bg-[#3776AB]/15 flex items-center justify-center">
                <Layers className="w-5 h-5 text-[#FFD43B]" />
              </div>
              <h3 className="font-semibold mb-2">Pure Python</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                No framework overhead, standard BaseHTTPRequestHandler
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer-border relative z-10 mt-16">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <span>Powered by</span>
            <a 
              href="https://pages.edgeone.ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-[#3776AB] transition-colors flex items-center gap-1"
            >
              <img src="/eo-logo-blue.svg" alt="EdgeOne" width={16} height={16} />
              EdgeOne Pages
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
