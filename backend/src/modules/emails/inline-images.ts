import * as path from 'path';
import * as fs from 'fs';

interface InlineImageDocument {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}

// Only local upload URLs are candidates. Never fetch arbitrary URLs or resolve
// user-supplied paths against the server's filesystem.
export function uploadedImagePaths(html: string, uploadDir: string, appOrigin?: string): string[] {
  return [...new Set(imageSources(html).map(({ src }) => uploadPath(src, uploadDir, appOrigin)).filter((p): p is string => !!p))];
}

function imageSources(html: string) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].flatMap((tag) => {
    const src = /\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
    return src ? [{ tag: tag[0], src: src[1] ?? src[2] ?? src[3] }] : [];
  });
}

function uploadPath(src: string, uploadDir: string, appOrigin?: string): string | null {
  let pathname = src;
  if (/^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      if (!appOrigin || url.origin !== new URL(appOrigin).origin) return null;
      pathname = url.pathname;
    } catch { return null; }
  }
  // Multer stores uploaded images as UUID.ext directly under uploads/.
  const match = /^\/uploads\/([a-f\d-]{36}\.(?:png|jpe?g|gif|webp))(?:[?#].*)?$/i.exec(pathname);
  return match ? path.resolve(uploadDir, match[1]) : null;
}

/** Documents must already be scoped to the sending account's owner. */
export function embedUploadedImages(
  html: string,
  documents: InlineImageDocument[],
  uploadDir: string,
  appOrigin?: string,
) {
  const allowed = new Map(documents.map((doc) => [path.resolve(doc.filePath), doc]));
  const attachments: Array<{ filename: string; path: string; contentType: string; cid: string; contentDisposition: 'inline' }> = [];
  const seen = new Set<string>();
  let result = html;
  for (const { tag, src } of imageSources(html)) {
    const localPath = uploadPath(src, uploadDir, appOrigin);
    if (!localPath) continue;
    const doc = allowed.get(localPath);
    if (!doc || !/^image\/(png|jpeg|gif|webp)$/i.test(doc.mimeType)) {
      throw new Error('正文或签名图片不存在，或不属于当前发件账户，请重新上传');
    }
    if (!fs.existsSync(localPath)) throw new Error(`图片文件已丢失，请重新上传：${doc.fileName}`);
    const cid = `upload-${doc.id}@crm.inline`;
    if (!seen.has(doc.id)) {
      attachments.push({ filename: doc.fileName, path: localPath, contentType: doc.mimeType, cid, contentDisposition: 'inline' });
      seen.add(doc.id);
    }
    const replacedTag = tag.replace(/(\s+src\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `$1"cid:${cid}"`);
    result = result.replace(tag, replacedTag);
  }
  return { html: result, attachments };
}
