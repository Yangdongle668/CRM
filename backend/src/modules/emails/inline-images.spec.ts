import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { embedUploadedImages, uploadedImagePaths } from './inline-images';

const filename = '12345678-1234-4234-8234-123456789abc.png';
const src = `/uploads/${filename}`;

test('body and signature share one CID attachment and keep their dimensions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-inline-'));
  const filePath = path.join(dir, filename);
  const content = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l0AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(filePath, content);
  try {
    const body = `<p>正文</p><img src="${src}" width="240" style="width:240px;height:auto;"><div data-role="signature"><img src='${src}' width="120"></div>`;
    const result = embedUploadedImages(body, [{ id: 'image-1', fileName: 'logo.png', filePath, mimeType: 'image/png' }], dir);
    assert.equal(result.attachments.length, 1);
    assert.equal((result.html.match(/cid:upload-image-1@crm.inline/g) || []).length, 2);
    assert.match(result.html, /width="240" style="width:240px;height:auto;"/);
    assert.match(result.html, /width="120"/);
    // Build the actual MIME message Nodemailer sends, then parse it as a mailbox would.
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const mail = await transport.sendMail({ from: 'from@example.com', to: 'to@example.com', subject: 'inline image', html: result.html, attachments: result.attachments });
    const parsed = await simpleParser(mail.message, { skipImageLinks: true });
    assert.equal(parsed.attachments.length, 1);
    assert.equal(parsed.attachments[0].contentDisposition, 'inline');
    assert.equal(parsed.attachments[0].cid, 'upload-image-1@crm.inline');
    assert.deepEqual(parsed.attachments[0].content, content);
    assert.match(String(parsed.html), /cid:upload-image-1@crm.inline/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only local or same-origin upload images become filesystem candidates', () => {
  const dir = path.resolve('uploads');
  const html = `<img src="${src}"><img src="https://crm.example${src}"><img src="https://other.example${src}"><img src="file:///etc/passwd"><img src="/uploads/../../.env"><img src="/uploads/a.html"><a href="${src}">link</a>`;
  assert.deepEqual(uploadedImagePaths(html, dir, 'https://crm.example'), [path.join(dir, filename)]);
  assert.deepEqual(uploadedImagePaths(`<img src="https://other.example${src}">`, dir), []);
});

test('rejects an upload that was not returned by the owner-scoped document query', () => {
  assert.throws(() => embedUploadedImages(`<img src="${src}">`, [], path.resolve('uploads')), /不属于当前发件账户/);
});

test('rejects missing files and non-image documents instead of sending broken images', () => {
  const dir = path.resolve('uploads');
  const doc = { id: 'missing', fileName: 'missing.png', filePath: path.join(dir, filename), mimeType: 'image/png' };
  assert.throws(() => embedUploadedImages(`<img src="${src}">`, [doc], dir), /图片文件已丢失/);
  assert.throws(() => embedUploadedImages(`<img src="${src}">`, [{ ...doc, mimeType: 'text/html' }], dir), /请重新上传/);
});

test('keeps ordinary remote, data and CID images unchanged without filesystem access', () => {
  const html = '<img src="https://example.com/logo.png"><img src="data:image/png;base64,AA=="><img src="cid:existing"><p>plain text</p>';
  assert.deepEqual(embedUploadedImages(html, [], path.resolve('uploads')), { html, attachments: [] });
});
