// Run with: node --test
const test = require("node:test");
const assert = require("node:assert");
const { crc32, makeZip, readZip } = require("../zip.js");

const files = [
  { name: "data.json", bytes: new TextEncoder().encode('{"version":1}') },
  { name: "photos/2026-10-29_1.jpg", bytes: Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256) },
  { name: "empty.txt", bytes: new Uint8Array(0) },
];

test("crc32 matches the standard check value", () => {
  assert.strictEqual(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("a zip reads back exactly what went in", () => {
  const back = readZip(makeZip(files));
  assert.deepStrictEqual(back.map((f) => f.name), files.map((f) => f.name));
  for (let i = 0; i < files.length; i++) assert.deepStrictEqual(back[i].bytes, files[i].bytes);
});

test("a damaged file is caught", () => {
  const zip = makeZip(files);
  const photoStart = 30 + "data.json".length + files[0].bytes.length + 30 + files[1].name.length;
  zip[photoStart + 100] ^= 0xff; // flip some bits inside the photo
  assert.throws(() => readZip(zip), /damaged/);
});

test("something that isn't a zip is rejected", () => {
  assert.throws(() => readZip(new TextEncoder().encode("hello")), /isn't a backup/);
});
