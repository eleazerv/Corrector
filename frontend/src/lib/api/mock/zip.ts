/**
 * Lists the entries of a ZIP file by reading its central directory. The mock server only
 * needs names and sizes (it never decompresses), so this avoids pulling in a zip library.
 */
export interface ZipEntry {
  name: string;
  size: number;
  isDir: boolean;
}

const EOCD = 0x06054b50;
const CDH = 0x02014b50;

export async function listZipEntries(file: Blob): Promise<ZipEntry[] | null> {
  const buf = new DataView(await file.arrayBuffer());
  const len = buf.byteLength;
  if (len < 22) return null;

  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (buf.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const count = buf.getUint16(eocd + 10, true);
  let p = buf.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (p + 46 > len || buf.getUint32(p, true) !== CDH) return null;
    const size = buf.getUint32(p + 24, true);
    const nameLen = buf.getUint16(p + 28, true);
    const extraLen = buf.getUint16(p + 30, true);
    const commentLen = buf.getUint16(p + 32, true);
    const name = decoder.decode(new Uint8Array(buf.buffer, buf.byteOffset + p + 46, nameLen));
    entries.push({ name, size, isDir: name.endsWith("/") });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
