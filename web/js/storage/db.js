/**
 * CanaimaFlix - Motor de Base de Datos IndexedDB de Alto Rendimiento
 * Diseñado específicamente para manejar 20.000+ canales sin sobrecargar la RAM de 1 GB.
 */

const DB_NAME = 'CanaimaFlixDB';
const DB_VERSION = 1;

class DatabaseManager {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.useMemoryFallback = false;
    this.memoryStore = {
      sources: [],
      channels: [],
      history: []
    };
  }

  /**
   * Inicializa la base de datos con sus almacenes e índices optimizados
   */
  async init() {
    if (this.isReady) return this.db || this.memoryStore;

    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) {
          console.warn('IndexedDB no soportado, activando memoria.');
          this.useMemoryFallback = true;
          this.isReady = true;
          return resolve(this.memoryStore);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          if (!db.objectStoreNames.contains('sources')) {
            const sourceStore = db.createObjectStore('sources', { keyPath: 'id' });
            sourceStore.createIndex('dateAdded', 'dateAdded', { unique: false });
          }

          if (!db.objectStoreNames.contains('channels')) {
            const channelStore = db.createObjectStore('channels', { keyPath: 'id' });
            channelStore.createIndex('sourceId', 'sourceId', { unique: false });
            channelStore.createIndex('type', 'type', { unique: false });
            channelStore.createIndex('groupTitle', 'groupTitle', { unique: false });
            channelStore.createIndex('favorite', 'favorite', { unique: false });
            channelStore.createIndex('name', 'name', { unique: false });
          }

          if (!db.objectStoreNames.contains('history')) {
            const historyStore = db.createObjectStore('history', { keyPath: 'channelId' });
            historyStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isReady = true;
          resolve(this.db);
        };

        request.onerror = (event) => {
          console.warn('IndexedDB restringido en file://, activando fallback en memoria:', event.target.error);
          this.useMemoryFallback = true;
          this.isReady = true;
          resolve(this.memoryStore);
        };
      } catch (err) {
        console.warn('Excepción en IndexedDB, activando fallback en memoria:', err);
        this.useMemoryFallback = true;
        this.isReady = true;
        resolve(this.memoryStore);
      }
    });
  }

  /**
   * Inserta canales en lotes (batch) controlados para no saturar memoria ni bloquear la UI
   * @param {Array} channels - Lista de canales
   * @param {Function} [onProgress] - Callback de progreso (guardados, total)
   */
  async saveChannelsBatch(channels, onProgress) {
    if (!this.isReady) await this.init();

    if (this.useMemoryFallback) {
      channels.forEach(ch => {
        const idx = this.memoryStore.channels.findIndex(c => c.id === ch.id);
        if (idx >= 0) this.memoryStore.channels[idx] = ch;
        else this.memoryStore.channels.push(ch);
      });
      if (onProgress) onProgress(channels.length, channels.length);
      return;
    }

    const BATCH_SIZE = 500;
    const total = channels.length;
    let saved = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = channels.slice(i, i + BATCH_SIZE);
      
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(['channels'], 'readwrite');
        const store = tx.objectStore('channels');

        for (const ch of chunk) {
          store.put(ch);
        }

        tx.oncomplete = () => {
          saved += chunk.length;
          if (onProgress) onProgress(saved, total);
          resolve();
        };

        tx.onerror = (e) => reject(e.target.error);
      });

      // Breve pausa para liberar el event loop y permitir repintado del navegador en KitKat
      await new Promise((r) => setTimeout(r, 4));
    }
  }

  /**
   * Guarda o actualiza los metadatos de una fuente de lista
   */
  async saveSource(source) {
    if (!this.isReady) await this.init();
    if (this.useMemoryFallback) {
      const idx = this.memoryStore.sources.findIndex(s => s.id === source.id);
      if (idx >= 0) this.memoryStore.sources[idx] = source;
      else this.memoryStore.sources.push(source);
      return source;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sources'], 'readwrite');
      tx.objectStore('sources').put(source);
      tx.oncomplete = () => resolve(source);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todas las fuentes registradas
   */
  async getSources() {
    if (!this.isReady) await this.init();
    if (this.useMemoryFallback) {
      return [...this.memoryStore.sources];
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sources'], 'readonly');
      const req = tx.objectStore('sources').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Consulta paginada de canales usando cursores de IndexedDB o memoria
   */
  async getChannels({ type = null, groupTitle = null, favorite = false, search = '', offset = 0, limit = 50 }) {
    if (!this.isReady) await this.init();

    if (this.useMemoryFallback) {
      const normalizedSearch = search.trim().toLowerCase();
      let filtered = this.memoryStore.channels.filter(item => {
        if (type && item.type !== type) return false;
        if (groupTitle && item.groupTitle !== groupTitle) return false;
        if (favorite && !item.favorite) return false;
        if (normalizedSearch && !item.name.toLowerCase().includes(normalizedSearch)) return false;
        return true;
      });
      return filtered.slice(offset, offset + limit);
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['channels'], 'readonly');
      const store = tx.objectStore('channels');
      let index = null;
      let range = null;

      if (favorite) {
        index = store.index('favorite');
        range = IDBKeyRange.only(1);
      } else if (type) {
        index = store.index('type');
        range = IDBKeyRange.only(type);
      } else if (groupTitle) {
        index = store.index('groupTitle');
        range = IDBKeyRange.only(groupTitle);
      }

      const results = [];
      let skipped = 0;
      const normalizedSearch = search.trim().toLowerCase();

      const cursorRequest = index ? index.openCursor(range) : store.openCursor();

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(results);
          return;
        }

        const item = cursor.value;
        let matches = true;

        if (type && item.type !== type) matches = false;
        if (groupTitle && item.groupTitle !== groupTitle) matches = false;
        if (favorite && !item.favorite) matches = false;
        if (normalizedSearch && !item.name.toLowerCase().includes(normalizedSearch)) matches = false;

        if (matches) {
          if (skipped < offset) {
            skipped++;
          } else {
            results.push(item);
            if (results.length >= limit) {
              resolve(results);
              return;
            }
          }
        }

        cursor.continue();
      };

      cursorRequest.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Alterna el estado de favorito de un canal
   */
  async toggleFavorite(channelId) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['channels'], 'readwrite');
      const store = tx.objectStore('channels');
      const req = store.get(channelId);

      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          item.favorite = item.favorite ? 0 : 1;
          store.put(item);
          tx.oncomplete = () => resolve(item.favorite);
        } else {
          resolve(0);
        }
      };

      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Registra o actualiza el progreso en el historial
   */
  async saveHistory(channel, currentTime, duration) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['history'], 'readwrite');
      const store = tx.objectStore('history');
      const record = {
        channelId: channel.id,
        name: channel.name,
        logo: channel.logo,
        streamUrl: channel.streamUrl,
        type: channel.type,
        currentTime: currentTime || 0,
        duration: duration || 0,
        progressPercent: duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0,
        updatedAt: Date.now()
      };
      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene los elementos recientes del historial
   */
  async getHistory(limit = 10) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['history'], 'readonly');
      const store = tx.objectStore('history');
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []).sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(items.slice(0, limit));
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene las categorías / grupos únicos con su conteo
   */
  async getCategories(type = 'live') {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['channels'], 'readonly');
      const index = tx.objectStore('channels').index('type');
      const range = IDBKeyRange.only(type);
      const groupsMap = {};

      const req = index.openCursor(range);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const group = cursor.value.groupTitle || 'General';
          groupsMap[group] = (groupsMap[group] || 0) + 1;
          cursor.continue();
        } else {
          const list = Object.keys(groupsMap).map(name => ({
            name,
            count: groupsMap[name]
          })).sort((a, b) => b.count - a.count);
          resolve(list);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }
}

window.dbManager = new DatabaseManager();
