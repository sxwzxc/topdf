"""
Python Cloud Function - Image to PDF Converter
api/img2pdf.py → POST /api/img2pdf

Receives raw image bytes in the request body (Content-Type: image/*)
and returns a PDF containing that image.
"""
import io
import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    """Convert an uploaded image to PDF using Pillow."""

    def do_GET(self):
        """Return usage info."""
        self._send_json(200, {
            "message": "Image to PDF converter",
            "route": "/api/img2pdf",
            "method": "POST",
            "usage": "POST raw image bytes with Content-Type: image/*",
            "response": "application/pdf (download)",
        })

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._send_json(400, {"error": "No image data received"})
                return

            image_data = self.rfile.read(content_length)

            from PIL import Image

            img = Image.open(io.BytesIO(image_data))

            # PDF does not support alpha; flatten onto a white background.
            if img.mode == "RGB":
                pass
            elif img.mode in ("RGBA", "LA"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1])
                img = background
            else:
                img = img.convert("RGB")

            pdf_buffer = io.BytesIO()
            img.save(pdf_buffer, format="PDF", resolution=100.0)
            pdf_bytes = pdf_buffer.getvalue()

            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header(
                "Content-Disposition", 'attachment; filename="converted.pdf"'
            )
            self.send_header("Content-Length", str(len(pdf_bytes)))
            self.send_header("X-Powered-By", "Python Cloud Function")
            self.end_headers()
            self.wfile.write(pdf_bytes)
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Powered-By", "Python Cloud Function")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
