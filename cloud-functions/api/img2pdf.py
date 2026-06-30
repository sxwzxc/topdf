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
        """Convert images to a PDF by encoding each as JPEG and building the
        PDF structure manually. This avoids Pillow's built-in PDF saver, which
        produces corrupted image streams on some runtime environments."""
        from PIL import Image

        pages = []
        for buf in image_buffers:
            img = Image.open(io.BytesIO(buf))
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

        return _build_pdf(pages)

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Powered-By", "Python Cloud Function")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
