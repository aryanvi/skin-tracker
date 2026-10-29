// Makes and reads simple zip files for the backup.
// Files are "stored" (not compressed): photos are JPEGs, which are already
// compressed, so squeezing them again would gain almost nothing.
// Works in the browser and in Node (for tests). No internet, no libraries.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

// A checksum stored with each file, so a damaged backup is noticed
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name: "data.json", bytes: Uint8Array }] -> one Uint8Array, the zip
function makeZip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const directory = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.bytes);
    const size = file.bytes.length;

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // "local file header"
    header.setUint16(4, 20, true); // zip version needed
    header.setUint16(8, 0, true); // stored
    header.setUint32(14, crc, true);
    header.setUint32(18, size, true);
    header.setUint32(22, size, true);
    header.setUint16(26, name.length, true);
    parts.push(new Uint8Array(header.buffer), name, file.bytes);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); // "central directory entry"
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(10, 0, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, size, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(new Uint8Array(entry.buffer), name);

    offset += 30 + name.length + size;
  }

  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // "end of central directory"
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);

  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// One Uint8Array (a zip made by makeZip) -> [{ name, bytes }].
// Throws if it isn't a zip we can read or a file is damaged.
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = [];
  let at = 0;

  while (at + 4 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
    if (view.getUint16(at + 8, true) !== 0) throw new Error("This zip is compressed, which backups never are");
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const nameStart = at + 30;
    const dataStart = nameStart + nameLength + extraLength;
    if (dataStart + size > bytes.length) throw new Error("This backup is cut short");

    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const data = bytes.slice(dataStart, dataStart + size);
    if (crc32(data) !== crc) throw new Error(`${name} is damaged`);
    files.push({ name, bytes: data });
    at = dataStart + size;
  }

  if (!files.length) throw new Error("This isn't a backup file");
  return files;
}

// Lets Node load this file for testing. Browsers ignore it.
if (typeof module !== "undefined") {
  module.exports = { crc32, makeZip, readZip };
}
