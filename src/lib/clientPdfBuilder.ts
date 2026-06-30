/**
 * 客户端 PDF 构建器 — 纯浏览器端合成，零依赖，不经过后端
 *
 * 与 cloud-functions/api/img2pdf.py 的 _build_pdf 逻辑一致，
 * 构建最小 PDF 1.4 格式，每页嵌入一张 JPEG 图片（DCTDecode）。
 */

const encoder = new TextEncoder()

/** 拼接多个 Uint8Array */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

/** xref entry: "XXXXXXXXXX 00000 n \n" = 20 bytes */
function xrefEntry(byteOffset: number): Uint8Array {
  const s = String(byteOffset).padStart(10, "0") + " 00000 n \n"
  return encoder.encode(s)
}

/** 将 HTMLImageElement 编码为 JPEG Uint8Array */
async function imageToJpeg(
  img: HTMLImageElement,
  quality = 0.92
): Promise<{ jpeg: Uint8Array; w: number; h: number }> {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  // 白色背景填充（处理透明通道）
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export 失败"))), "image/jpeg", quality)
  })

  const buf = await blob.arrayBuffer()
  return { jpeg: new Uint8Array(buf), w, h }
}

/**
 * 从一组 JPEG 数据构建最小 PDF 1.4
 * pages: [{jpeg: Uint8Array, w: number, h: number}]
 */
function buildPdf(pages: { jpeg: Uint8Array; w: number; h: number }[]): Uint8Array {
  const objects: Uint8Array[] = []

  // --- Object 1: Catalog ---
  objects.push(encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"))

  // --- Object 2: Pages ---
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")
  objects.push(encoder.encode(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`))

  // --- Page objects (3, 6, 9, ...) + Content stream + Image XObject ---
  for (let i = 0; i < pages.length; i++) {
    const { jpeg, w, h } = pages[i]
    const pageNum = 3 + i * 3
    const contentNum = pageNum + 1
    const imageNum = pageNum + 2

    // Page object
    objects.push(
      encoder.encode(
        `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentNum} 0 R /Resources << /XObject << /Im0 ${imageNum} 0 R >> >> >>\nendobj\n`
      )
    )

    // Content stream: draw image filling the page
    const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ`
    objects.push(
      encoder.encode(`${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`)
    )

    // Image XObject (JPEG / DCTDecode)
    objects.push(
      concat(
        encoder.encode(
          `${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
        ),
        jpeg,
        encoder.encode("\nendstream\nendobj\n")
      )
    )
  }

  // --- Assemble PDF ---
  const header = encoder.encode("%PDF-1.4\n")
  const offsets: number[] = []
  const parts: Uint8Array[] = [header]

  // Compute offsets while building the body
  let currentOffset = header.length
  for (const obj of objects) {
    offsets.push(currentOffset)
    parts.push(obj)
    currentOffset += obj.length
  }

  // --- xref table ---
  const xrefOffset = currentOffset
  const objCount = objects.length + 1
  const xrefParts: Uint8Array[] = [
    encoder.encode("xref\n"),
    encoder.encode(`0 ${objCount}\n`),
    encoder.encode("0000000000 65535 f \n"),
  ]

  for (const off of offsets) {
    xrefParts.push(xrefEntry(off))
  }

  // --- Trailer ---
  const trailer = encoder.encode(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return concat(...parts, ...xrefParts, trailer)
}

/**
 * 从 File/Blob 数组构建 PDF 并触发下载
 *
 * @param images 图片文件数组（支持 File 和 Blob）
 * @param filename 下载文件名，默认 "output.pdf"
 * @param onProgress 进度回调 (done, total)
 */
export async function buildAndDownloadPdf(
  images: (File | Blob)[],
  filename = "output.pdf",
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const pages: { jpeg: Uint8Array; w: number; h: number }[] = []

  for (let i = 0; i < images.length; i++) {
    const url = URL.createObjectURL(images[i])
    try {
      const img = await loadImage(url)
      const page = await imageToJpeg(img, 0.92)
      pages.push(page)
      onProgress?.(i + 1, images.length)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  if (pages.length === 0) {
    throw new Error("没有可处理的图片")
  }

  const pdfBytes = buildPdf(pages)
  const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" })

  // 触发浏览器下载
  const downloadUrl = URL.createObjectURL(pdfBlob)
  const a = document.createElement("a")
  a.href = downloadUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟释放 ObjectURL，确保下载已触发
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
}

/** 加载图片 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`图片加载失败`))
    img.src = src
  })
}

/**
 * 构建 PDF 并返回 Blob（不触发下载）
 */
export async function buildPdfBlob(
  images: (File | Blob)[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const pages: { jpeg: Uint8Array; w: number; h: number }[] = []

  for (let i = 0; i < images.length; i++) {
    const url = URL.createObjectURL(images[i])
    try {
      const img = await loadImage(url)
      const page = await imageToJpeg(img, 0.92)
      pages.push(page)
      onProgress?.(i + 1, images.length)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  if (pages.length === 0) {
    throw new Error("没有可处理的图片")
  }

  return new Blob([buildPdf(pages).buffer as ArrayBuffer], { type: "application/pdf" })
}
