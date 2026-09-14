import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { head, put } from '@vercel/blob';

const [source, auditPath, receiptPath] = process.argv.slice(2);
if (!source || !auditPath || !receiptPath) throw new Error('Usage: upload-hd-assets.mjs <extracted archive> <audit.json> <receipts.json>');
const token = process.env.MORPHEUS_GAMEDB_BLOB_TOKEN;
const origin = process.env.NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN;
if (!token || !origin) throw new Error('Public GameDB token and origin are required.');
const destination = await head('GameDB/Deck1/introMOV.mp4', { token });
if (new URL(destination.url).origin !== new URL(origin).origin) throw new Error('Token does not belong to the configured public GameDB store');
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const prefix = Array.isArray(audit) ? 'HD/rife-x2-v1/' : audit.prefix;
if (!['HD/rife-x2-v1/', 'HD/spatial-x2-v1/'].includes(prefix)) throw new Error('Unknown HD rail');
let entries;
if (Array.isArray(audit)) {
  const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8'));
  const accepted = new Set(audit.filter(a => a.issues.length === 0).map(a => a.path));
  const selectedEntries = manifest.sources.filter(s => accepted.has(s.path)).flatMap(s => Object.entries(s.outputs));
  for (const [alias, canonical] of Object.entries(manifest.aliases)) {
    const match = selectedEntries.find(([name]) => name === canonical);
    if (match) selectedEntries.push([alias, match[1]]);
  }
  entries = selectedEntries;
} else {
  entries = Object.entries(audit.files);
}
let receipts = [];
try { receipts = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const previous = new Map(receipts.map(r => [r.pathname, r]));
let index = 0;
let failed = false;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (!failed && index < entries.length) {
    const [name, metadata] = entries[index++];
    try {
      if (!name.startsWith('GameDB/') || name.split('/').includes('..')) throw new Error('Invalid archive path');
      const pathname = `${prefix}${name}`;
      const local = resolve(source, name);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(local)) hash.update(chunk);
      if (hash.digest('hex') !== metadata.sha256) throw new Error(`Hash mismatch: ${name}`);
      const recorded = previous.get(pathname);
      if (recorded) {
        const current = await head(recorded.url, { token });
        if (current.etag !== recorded.etag || current.size !== metadata.bytes || recorded.sha256 !== metadata.sha256) throw new Error(`Resume mismatch: ${name}`);
        continue;
      }
      let blob;
      try {
        blob = await put(pathname, name.endsWith('.png') ? readFileSync(local) : Readable.toWeb(createReadStream(local)), {
          token, access: 'public', addRandomSuffix: false, allowOverwrite: false,
          contentType: name.endsWith('.png') ? 'image/png' : name.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
          cacheControlMaxAge: 31536000,
        });
      } catch (error) {
        if (!String(error.message).includes('This blob already exists')) throw error;
        // A request can finish remotely before its receipt is saved. Verify bytes
        // before adopting that object; never overwrite an uncertain result.
        const existing = await head(pathname, { token });
        if (new URL(existing.url).origin !== new URL(origin).origin) throw new Error('Unexpected resume origin');
        const response = await fetch(existing.url);
        if (!response.ok) throw new Error(`Resume download failed: ${name}`);
        const remoteHash = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
        if (remoteHash !== metadata.sha256 || existing.size !== metadata.bytes) throw new Error(`Unrecorded object differs: ${name}`);
        blob = existing;
      }
      if (new URL(blob.url).origin !== new URL(origin).origin) throw new Error('Upload destination differs from configured GameDB origin');
      const verified = await head(blob.url, { token });
      if (verified.size !== metadata.bytes || verified.etag !== blob.etag) throw new Error(`Uploaded metadata mismatch: ${name}`);
      receipts.push({ ...blob, size: metadata.bytes, sha256: metadata.sha256 });
      writeFileSync(receiptPath, JSON.stringify(receipts, null, 2) + '\n');
      if (receipts.length % 25 === 0) console.log(`${receipts.length}/${entries.length} uploaded and verified`);
    } catch (error) { failed = true; throw error; }
  }
}));
console.log(`Complete: ${receipts.length} HD files`);
