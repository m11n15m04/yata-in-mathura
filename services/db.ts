import { ClientEntry, BackgroundImage } from '../types';

const DB_NAME = 'YatraDB';
const DB_VERSION = 2;
const STORE_NAME = 'clients';
const BG_STORE_NAME = 'backgrounds';

// Open the database
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this browser environment."));
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error("IndexedDB Open Error:", (event.target as any).error);
        reject(new Error("Failed to open database."));
      };

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(BG_STORE_NAME)) {
          db.createObjectStore(BG_STORE_NAME, { keyPath: 'id' });
        }
      };
    } catch (e) {
      reject(e);
    }
  });
};

export const dbService = {
  // Get all records
  getAllClients: async (): Promise<ClientEntry[]> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          // Sort by timestamp descending (newest first)
          const results = request.result as ClientEntry[];
          if (results) {
            results.sort((a, b) => b.timestamp - a.timestamp);
            resolve(results);
          } else {
            resolve([]);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("IndexedDB load failed, falling back to empty list:", e);
      throw e; 
    }
  },

  // Add or Update a record
  saveClient: async (client: ClientEntry): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(client);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  // Delete a record
  deleteClient: async (id: number): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  // --- Maintenance / Storage Management ---

  // Removes photos from records older than 'days'
  stripOldPhotos: async (days: number = 30): Promise<number> => {
    const db = await openDB();
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let count = 0;

      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry = cursor.value as ClientEntry;
          if (entry.timestamp < cutoff && entry.clientPhoto) {
            const updatedEntry = { ...entry, clientPhoto: undefined }; // Remove photo
            cursor.update(updatedEntry);
            count++;
          }
          cursor.continue();
        } else {
          resolve(count);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  // Delete records older than 'days'
  deleteOldRecords: async (days: number = 365): Promise<number> => {
    const db = await openDB();
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let count = 0;

      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry = cursor.value as ClientEntry;
          if (entry.timestamp < cutoff) {
            cursor.delete();
            count++;
          }
          cursor.continue();
        } else {
          resolve(count);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  // --- Background Images ---

  getAllBackgrounds: async (): Promise<BackgroundImage[]> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(BG_STORE_NAME)) {
          resolve([]);
          return;
        }
        const transaction = db.transaction(BG_STORE_NAME, 'readonly');
        const store = transaction.objectStore(BG_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as BackgroundImage[]);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("Failed to load backgrounds", e);
      return [];
    }
  },

  saveBackground: async (bg: BackgroundImage): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(BG_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(BG_STORE_NAME);
        const request = store.put(bg);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  clearBackgrounds: async (): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(BG_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(BG_STORE_NAME);
        const request = store.clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  }
};