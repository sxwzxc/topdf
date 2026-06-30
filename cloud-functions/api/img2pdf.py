"""
Python Cloud Function - Image to PDF Converter
api/img2pdf.py → POST /api/img2pdf

Supports two input modes:
  1. multipart/form-data with multiple file fields named image-0, image-1, ...
     → merges all images into a single PDF (one page per image).
  2. Raw image bytes in body (Content-Type: image/*)
     → converts a single image to PDF (backward compatible).

GET returns usage info.
"""
import cgi
import io
import json
from http.server import BaseHTTPRequestHandler


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
            content_type = self.headers.get("Content-Type", "")

            if "multipart/form-data" in content_type:
                image_buffers = self._parse_multipart_images()
            else:
                image_buffers = self._parse_raw_image()

            if not image_buffers:
                self._send_json(400, {"error": "No valid image data received"})
                return

            pdf_bytes = self._images_to_pdf(image_buffers)

            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header(
                "Content-Disposition", 'attachment; filename="merged.pdf"'
            )
            self.send_header("Content-Length", str(len(pdf_bytes)))
            self.send_header("X-Powered-By", "Python Cloud Function")
            self.end_headers()
            self.wfile.write(pdf_bytes)
        except Exception as e:
            self._send_json(500, {"error": str(e)})

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
        from PIL import Image

        pil_images = []
        try:
            for buf in image_buffers:
                img = Image.open(io.BytesIO(buf))
                if img.mode == "RGB":
                    pass
                elif img.mode in ("RGBA", "LA"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1])
                    img = background
                else:
                    img = img.convert("RGB")
                pil_images.append(img)

            pdf_buffer = io.BytesIO()
            first = pil_images[0]
            rest = pil_images[1:] if len(pil_images) > 1 else []
            first.save(
                pdf_buffer,
                format="PDF",
                resolution=100.0,
                save_all=True,
                append_images=rest,
            )
            return pdf_buffer.getvalue()
        finally:
            for img in pil_images:
                try:
                    img.close()
                except Exception:
                    pass

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Powered-By", "Python Cloud Function")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
