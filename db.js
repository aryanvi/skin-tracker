// Everything to do with saving data on this device.
// It uses IndexedDB, a small database built into the browser.
// Nothing in this file talks to the internet.

const DB_NAME = "skin-tracker";
const DB_VERSION = 3;

// Version history:
//   1: "entries", one photo per day, keyed by date
//   2: "photos", any number of photos per day, each with its own id.
//      Version 1 photos are copied in. "entries" is left untouched as a
//      backup. (Export now exists, so it could be removed in a later version.)
//   3: "dayInfo", one record per day that has tags or was marked clear:
//      { date, tags: [...], status: "clear" }. Only adds a store; photos are untouched.

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs when the database is new or older than DB_VERSION.
    // It all happens in one transaction: if anything fails, nothing changes.
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;

      if (event.oldVersion < 1) {
        db.createObjectStore("entries", { keyPath: "date" });
        db.createObjectStore("meta"); // small settings, like the day tracking started
      }

      if (event.oldVersion < 2) {
        const photos = db.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
        photos.createIndex("date", "date");

        // Copy every version 1 photo into the new store
        tx.objectStore("entries").openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const { date, photo, takenAt } = cursor.value;
          photos.add({ date, photo, takenAt });
          cursor.continue();
        };
      }

      if (event.oldVersion < 3) {
        db.createObjectStore("dayInfo", { keyPath: "date" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // If a newer version of the app opens in another tab, step aside
      db.onversionchange = () => db.close();
      resolve(db);
    };
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

// Saves a photo { date, photo, takenAt } and returns its new id
function addPhoto(photo) {
  return run("photos", "readwrite", (store) => store.add(photo));
}

function getAllPhotos() {
  return run("photos", "readonly", (store) => store.getAll());
}

function deletePhoto(id) {
  return run("photos", "readwrite", (store) => store.delete(id));
}

// Tags and status for one day: { date, tags, status }
function getAllDayInfo() {
  return run("dayInfo", "readonly", (store) => store.getAll());
}

function putDayInfo(info) {
  return run("dayInfo", "readwrite", (store) => store.put(info));
}

function deleteDayInfo(date) {
  return run("dayInfo", "readwrite", (store) => store.delete(date));
}

function getMeta(key) {
  return run("meta", "readonly", (store) => store.get(key));
}

function setMeta(key, value) {
  return run("meta", "readwrite", (store) => store.put(value, key));
}
