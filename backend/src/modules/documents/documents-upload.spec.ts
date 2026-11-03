import 'reflect-metadata';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Module } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

test('real multipart upload stores local file bytes and returns a usable preview URL', async () => {
  // Database and authentication are isolated; HTTP, Multer and disk writes are real.
  const previousCwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-upload-'));
  let stored: any;
  @Module({
    controllers: [DocumentsController],
    providers: [
      DocumentsService,
      { provide: PrismaService, useValue: { document: { create: async ({ data }: any) => (stored = { id: 'test-document', ...data }) } } },
    ],
  })
  class UploadTestModule {}
  Reflect.defineMetadata(GUARDS_METADATA, [], DocumentsController);
  process.chdir(dir);
  const app = await NestFactory.create(UploadTestModule, { logger: ['error'] });
  try {
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'owner-1', role: 'SALES' };
      next();
    });
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new TransformInterceptor());
    app.use('/uploads', express.static(path.join(dir, 'uploads')));
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const content = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l0AAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.append('file', new Blob([content], { type: 'image/png' }), 'local-image.png');
    form.append('category', 'email-inline-image');
    const response = await fetch(`${origin}/api/documents/upload`, { method: 'POST', body: form });
    assert.equal(response.status, 201);
    const body: any = await response.json();
    assert.equal(body.data.id, 'test-document');
    assert.match(body.data.url, /^\/uploads\/[a-f\d-]{36}\.png$/);
    assert.equal(stored.ownerId, 'owner-1');
    assert.equal(stored.category, 'email-inline-image');
    assert.deepEqual(fs.readFileSync(stored.filePath), content);
    const preview = await fetch(`${origin}${body.data.url}`);
    assert.equal(preview.status, 200);
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), content);

    // Ordinary attachments use the same working upload route.
    const attachment = new FormData();
    attachment.append('file', new Blob(['attachment contents'], { type: 'text/plain' }), 'notes.txt');
    attachment.append('category', 'email-attachment');
    assert.equal((await fetch(`${origin}/api/documents/upload`, { method: 'POST', body: attachment })).status, 201);
    assert.equal(stored.category, 'email-attachment');
    assert.equal(fs.readFileSync(stored.filePath, 'utf8'), 'attachment contents');
  } finally {
    await app.close();
    process.chdir(previousCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
