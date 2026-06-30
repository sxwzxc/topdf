"""
Python Cloud Function - Image to PDF Converter
api/img2pdf.py → POST /api/img2pdf

Supports two input modes:
  1. multipart/form-data with multiple file fields named image-0, image-1, ...
     → merges all images into a single PDF (one page per image).
  2. Raw image bytes in body (Content-Type: image/*)
     → converts a single image to PDF (backward compatible).

Limits:
  - Max image dimension: 4096px (auto-downscale)
  - Max input body size: 50 MB
  - Max decompression pixels: 200 million (Pillow safety threshold)

GET returns usage info.
"""
import base64
import cgi
import io
import json
from http.server import BaseHTTPRequestHandler

# 图片尺寸 / 大小限制
MAX_DIMENSION = 4096          # 最长边最大像素数
MAX_BODY_SIZE = 50 * 1024 * 1024  # 50 MB


def _resize_if_needed(img):
    """如果图片任意边长超过 MAX_DIMENSION，等比缩放到限制内。"""
    w, h = img.size
    longer = max(w, h)
    if longer <= MAX_DIMENSION:
        return img

    scale = MAX_DIMENSION / longer
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    # 使用高质量 LANCZOS 重采样
    return img.resize((new_w, new_h), img.Resampling.LANCZOS)


def _build_pdf(pages):
    """Build a minimal multi-page PDF with one JPEG image per page.

    pages: list of (jpeg_bytes, width_px, height_px)
    """
    objects = []

    # Object 1: Catalog
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")

    # Object 2: Pages root
    page_count = len(pages)
    # Each page occupies 3 object slots: page, content stream, image xobject
    # Page object numbers start at 3: 3,6,9,...
    kids = ["%d 0 R" % (3 + i * 3) for i in range(page_count)]
    objects.append(
        ("<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join(kids), page_count)).encode()
    )

    for jpeg, w, h in pages:
        # Page object — references the content stream and image xobject
        base = len(objects) + 1  # this page's object number
        objects.append(
            ("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "
             "/Contents %d 0 R "
             "/Resources << /XObject << /Im0 %d 0 R >> >> >>" % (w, h, base + 1, base + 2)).encode()
        )
        # Content stream: draw image filling the page
        content = ("q\n%d 0 0 %d 0 0 cm\n/Im0 Do\nQ" % (w, h)).encode()
        objects.append(
            ("<< /Length %d >>" % len(content)).encode()
            + b"\nstream\n" + content + b"\nendstream"
        )
        # Image XObject (JPEG / DCTDecode)
        objects.append(
            ("<< /Type /XObject /Subtype /Image /Width %d /Height %d "
             "/ColorSpace /DeviceRGB /BitsPerComponent 8 "
             "/Filter /DCTDecode /Length %d >>" % (w, h, len(jpeg))).encode()
            + b"\nstream\n" + jpeg + b"\nendstream"
        )

    # Assemble PDF
    pdf = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects):
        offsets.append(len(pdf))
        pdf += ("%d 0 obj\n" % (i + 1)).encode() + obj + b"\nendobj\n"

    xref_offset = len(pdf)
    obj_total = len(objects) + 1
    pdf += b"xref\n"
    pdf += ("0 %d\n" % obj_total).encode()
    pdf += b"0000000000 65535 f \n"
    for offset in offsets:
        pdf += ("%010d 00000 n \n" % offset).encode()

    pdf += b"trailer\n"
    pdf += ("<< /Size %d /Root 1 0 R >>\n" % obj_total).encode()
    pdf += b"startxref\n"
    pdf += ("%d\n" % xref_offset).encode()
    pdf += b"%%EOF"
    return pdf


class handler(BaseHTTPRequestHandler):
    """Convert one or more uploaded images to PDF using Pillow."""

    def do_GET(self):
        self._send_json(200, {
            "message": "Image to PDF converter",
            "route": "/api/img2pdf",
            "method": "POST",
            "usage": (
                "Multipart: POST multipart/form-data with file fields image-0, image-1, ... "
                "to merge all images into a single PDF. "
                "Or POST raw image bytes with Content-Type: image/* for a single image."
            ),
            "response": "application/pdf (download)",
        })

    def do_POST(self):
        try:
            # 请求体大小检查
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > MAX_BODY_SIZE:
                size_mb = content_length / (1024 * 1024)
                self._send_json(413, {
                    "error": (
                        "请求体过大 (%.1f MB)，上限为 50 MB。"
                        "请减少图片数量或先压缩图片。" % size_mb
                    )
                })
                return

            content_type = self.headers.get("Content-Type", "")

            if "multipart/form-data" in content_type:
                image_buffers = self._parse_multipart_images()
            else:
                image_buffers = self._parse_raw_image()

            if not image_buffers:
                self._send_json(400, {"error": "未接收到有效的图片数据"})
                return

            pdf_bytes = self._images_to_pdf(image_buffers)

            # EdgeOne 运行时会把 HTTP 响应体当作 UTF-8 文本处理，
            # 所有 >= 0x80 的字节（包括 JPEG 数据中的 0xFF）会被破坏，
            # 导致 PDF 空白。用 base64 编码整个 PDF 为纯 ASCII 文本绕过该问题，
            # 前端再解码还原。
            b64_bytes = base64.b64encode(pdf_bytes)
            b64_str = b64_bytes.decode("ascii")

            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(b64_str)))
            self.send_header("X-Powered-By", "Python Cloud Function")
            self.end_headers()
            self.wfile.write(b64_str.encode("ascii"))
        except ValueError as e:
            # 业务层错误（图片过大、格式不支持等）→ 400
            self._send_json(400, {"error": str(e)})
        except Exception as e:
            # 未预期的运行时错误 → 500
            self._send_json(500, {"error": "服务器内部错误: %s" % str(e)})

    def _parse_raw_image(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return []
        image_data = self.rfile.read(content_length)
        return [image_data]

    def _parse_multipart_images(self):
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            },
            keep_blank_values=True,
        )

        raw_items = []
        for key in form.keys():
            if not key.startswith("image"):
                continue
            item = form[key]
            if isinstance(item, list):
                for sub in item:
                    if getattr(sub, "filename", None):
                        raw_items.append((key, sub.file.read()))
            else:
                if getattr(item, "filename", None):
                    raw_items.append((key, item.file.read()))

        def _sort_key(kv):
            key = kv[0]
            try:
                parts = key.rsplit("-", 1)
                return (int(parts[-1]), key)
            except (ValueError, IndexError):
                return (9999, key)

        raw_items.sort(key=_sort_key)
        return [data for _, data in raw_items]

    @staticmethod
    def _images_to_pdf(image_buffers):
        """Convert images to a PDF by encoding each as JPEG and building the
        PDF structure manually. This avoids Pillow's built-in PDF saver, which
        produces corrupted image streams on some runtime environments."""
        from PIL import Image

        # 兼容旧版 Pillow：DecompressionBombError 在高版本才可从 PIL 顶层导入
        try:
            from PIL.Image import DecompressionBombError
        except ImportError:
            DecompressionBombError = ValueError  # 旧版的 DecompressionBombError 基类

        # 提高解压炸弹阈值，避免大分辨率图片误报（默认 ~89M 像素）
        Image.MAX_IMAGE_PIXELS = 200_000_000

        pages = []
        for i, buf in enumerate(image_buffers):
            try:
                img = Image.open(io.BytesIO(buf))
                # 自动缩放超大图片
                img = _resize_if_needed(img)

                if img.mode in ("RGBA", "LA"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1])
                    img = background
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                jpeg_buf = io.BytesIO()
                img.save(jpeg_buf, format="JPEG", quality=90)
                pages.append((jpeg_buf.getvalue(), img.width, img.height))
                img.close()
            except DecompressionBombError:
                raise ValueError(
                    "图片 #%d 分辨率过高，Pillow 安全策略阻止了解压。"
                    "请使用更小尺寸的图片或在前端先压缩。" % (i + 1)
                )
            except MemoryError:
                raise ValueError(
                    "图片 #%d 过大导致内存不足。"
                    "请使用更小尺寸的图片。" % (i + 1)
                )
            except OSError as e:
                raise ValueError("图片 #%d 无法读取或已损坏: %s" % (i + 1, str(e)))

        if not pages:
            raise ValueError("没有有效的图片可转换为 PDF。")

        return _build_pdf(pages)

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Powered-By", "Python Cloud Function")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
