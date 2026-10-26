# File uploads

A dynamic code can serve a file instead of redirecting to a URL. This is useful for sharing a menu, flyer or document that isn't published anywhere else.

File uploads are **off by default**. The server only accepts uploads after an administrator turns them on, and the hosted Studio on GitHub Pages never offers them because it has no server.

## Enabling uploads

```bash
QRFORGE_FILE_UPLOADS=enabled
QRFORGE_FILE_DIR=/data/files        # where files are stored
QRFORGE_FILE_MAX_BYTES=10485760     # largest accepted file (10 MiB)
QRFORGE_FILE_QUOTA_BYTES=104857600  # storage per user (100 MiB), 0 for unlimited
```

| Variable | Default | Description |
| --- | --- | --- |
| `QRFORGE_FILE_UPLOADS` | `disabled` | `enabled` or `disabled`. |
| `QRFORGE_FILE_DIR` | `data/files` (`/data/files` in Docker) | Directory for stored files. Created on start if missing. |
| `QRFORGE_FILE_MAX_BYTES` | `10485760` | Largest accepted file, between 1 KiB and 1 GiB. |
| `QRFORGE_FILE_QUOTA_BYTES` | `104857600` | Total storage per user. Administrators are exempt. `0` removes the limit. |

When uploads are enabled, the dashboard shows a **Link / File** switch on new dynamic codes. With uploads disabled, the upload endpoints return 404 and existing file codes show a "not found" page until uploads are turned back on.

Files are stored on local disk, so every instance must share the same directory. Include it in your [backups](./self-hosting#backups).

## Accepted files

PDF, PNG, JPEG, GIF, WebP, plain text, CSV, and Word, Excel and PowerPoint documents (`.docx`, `.xlsx`, `.pptx`).

The extension must be on that list and the file's contents must match it, so an HTML page renamed to `.pdf` is rejected. Formats that a browser can open as a web page, such as HTML, SVG and XML, are never accepted.

## How scanning works

Scanning a file code returns the file from the code's short link (`/r/{slug}`) with `Content-Disposition: attachment`, so phones download it rather than opening it as a page. Everything else about dynamic codes still applies:

- Passwords, expiry and disabling work exactly as they do for links.
- Scans are counted in [analytics](./analytics). Resumed downloads (`Range` requests) are not counted twice.
- Replacing the file keeps the same printed code.

## API

Upload the file first, then create or update a code with its `file_id`:

```bash
curl -X POST https://qr.example.com/api/v1/files \
  -H "Authorization: Bearer $QRFORGE_API_KEY" \
  -F "file=@menu.pdf"
# → { "id": "file_…", "name": "menu.pdf", "content_type": "application/pdf", "size": 48213, … }

curl -X POST https://qr.example.com/api/v1/qrcodes \
  -H "Authorization: Bearer $QRFORGE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "name": "Lunch menu", "file_id": "file_…" }'
```

A code has either a `destination` or a `file_id`. Setting one on an existing code replaces the other, and the code's `qr_type` changes between `url` and `file` to match.

| Endpoint | Description |
| --- | --- |
| `POST /files` | Upload a file as `multipart/form-data` in a field named `file`. |
| `GET /files` | List your files, with `used_bytes` and `quota_bytes`. |
| `GET /files/{id}` | File details. |
| `DELETE /files/{id}` | Delete a file. Returns `409 file_in_use` while a code still serves it. |

## Cleanup

A file is deleted automatically when no code uses it any more, for example after its code is deleted or given a different file. Uploads that are never attached to a code are removed after 24 hours.
