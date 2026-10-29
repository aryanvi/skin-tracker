// Everything to do with saving data on this device.
// It uses IndexedDB, a small database built into the browser.
// Nothing in this file talks to the internet.

const DB_NAME = "skin-tracker";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Runs only the first time, to create the "tables"
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("entries", { keyPath: "date" }); // one breakout photo per day
      db.createObjectStore("meta"); // small settings, like the day tracking started
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const dbReady = openDb();

// Helper: run one read or write and wait until it's finished
async function run(storeName, mode, action) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

function saveEntry(entry) {
  return run("entries", "readwrite", (store) => store.put(entry));
}

function getAllEntries() {
  return run("entries", "readonly", (store) => store.getAll());
}

function deleteEntry(date) {
  return run("entries", "readwrite", (store) => store.delete(date));
}

function getMeta(key) {
  return run("meta", "readonly", (store) => store.get(key));
}

function setMeta(key, value) {
  return run("meta", "readwrite", (store) => store.put(value, key));
}
