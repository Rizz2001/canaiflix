/**
 * CanaimaFlix - Motor de Almacenamiento (Compatible ES5 con Chromium 30 / KitKat)
 */

var DB_NAME = 'CanaimaFlixDB';
var DB_VERSION = 1;

function DatabaseManager() {
  this.db = null;
  this.isReady = false;
  this.useMemoryFallback = false;
  this.memoryStore = {
    sources: [],
    channels: [],
    history: []
  };
}

DatabaseManager.prototype.init = function() {
  var self = this;
  if (this.isReady) {
    return Promise.resolve(this.db || this.memoryStore);
  }

  return new Promise(function(resolve) {
    try {
      if (!window.indexedDB) {
        self.useMemoryFallback = true;
        self.isReady = true;
        return resolve(self.memoryStore);
      }

      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains('sources')) {
          var sourceStore = db.createObjectStore('sources', { keyPath: 'id' });
          sourceStore.createIndex('dateAdded', 'dateAdded', { unique: false });
        }
        if (!db.objectStoreNames.contains('channels')) {
          var channelStore = db.createObjectStore('channels', { keyPath: 'id' });
          channelStore.createIndex('sourceId', 'sourceId', { unique: false });
          channelStore.createIndex('type', 'type', { unique: false });
          channelStore.createIndex('groupTitle', 'groupTitle', { unique: false });
          channelStore.createIndex('favorite', 'favorite', { unique: false });
          channelStore.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('history')) {
          var historyStore = db.createObjectStore('history', { keyPath: 'channelId' });
          historyStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = function(event) {
        self.db = event.target.result;
        self.isReady = true;
        resolve(self.db);
      };

      request.onerror = function() {
        self.useMemoryFallback = true;
        self.isReady = true;
        resolve(self.memoryStore);
      };
    } catch (e) {
      self.useMemoryFallback = true;
      self.isReady = true;
      resolve(self.memoryStore);
    }
  });
};

DatabaseManager.prototype.saveChannelsBatch = function(channels, onProgress) {
  var self = this;
  return this.init().then(function() {
    if (self.useMemoryFallback) {
      for (var i = 0; i < channels.length; i++) {
        var ch = channels[i];
        var found = false;
        for (var j = 0; j < self.memoryStore.channels.length; j++) {
          if (self.memoryStore.channels[j].id === ch.id) {
            self.memoryStore.channels[j] = ch;
            found = true;
            break;
          }
        }
        if (!found) self.memoryStore.channels.push(ch);
      }
      if (onProgress) onProgress(channels.length, channels.length);
      return Promise.resolve();
    }

    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['channels'], 'readwrite');
      var store = tx.objectStore('channels');
      for (var k = 0; k < channels.length; k++) {
        store.put(channels[k]);
      }
      tx.oncomplete = function() {
        if (onProgress) onProgress(channels.length, channels.length);
        resolve();
      };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.saveSource = function(source) {
  var self = this;
  return this.init().then(function() {
    if (self.useMemoryFallback) {
      self.memoryStore.sources.push(source);
      return Promise.resolve(source);
    }
    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['sources'], 'readwrite');
      tx.objectStore('sources').put(source);
      tx.oncomplete = function() { resolve(source); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.getSources = function() {
  var self = this;
  return this.init().then(function() {
    if (self.useMemoryFallback) {
      return Promise.resolve(self.memoryStore.sources);
    }
    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['sources'], 'readonly');
      var store = tx.objectStore('sources');
      var list = [];
      var cursorReq = store.openCursor();
      cursorReq.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          list.push(cursor.value);
          cursor.continue();
        } else {
          resolve(list);
        }
      };
      cursorReq.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.getChannels = function(opts) {
  var self = this;
  opts = opts || {};
  var sourceId = opts.sourceId || null;
  var type = opts.type || null;
  var groupTitle = opts.groupTitle || null;
  var favorite = !!opts.favorite;
  var search = (opts.search || '').trim().toLowerCase();
  var offset = opts.offset || 0;
  var limit = (opts.limit !== undefined && opts.limit !== null) ? opts.limit : 50;

  return this.init().then(function() {
    if (self.useMemoryFallback) {
      var filtered = self.memoryStore.channels.filter(function(item) {
        if (sourceId && sourceId !== 'all' && item.sourceId !== sourceId) return false;
        if (type && item.type !== type) return false;
        if (groupTitle && groupTitle !== 'all' && item.groupTitle !== groupTitle) return false;
        if (favorite && !item.favorite) return false;
        if (search && item.name.toLowerCase().indexOf(search) === -1) return false;
        return true;
      });
      return Promise.resolve(limit > 0 ? filtered.slice(offset, offset + limit) : filtered.slice(offset));
    }

    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['channels'], 'readonly');
      var store = tx.objectStore('channels');
      var results = [];
      var skipped = 0;

      // Optimización con índice si se especifica sourceId o type
      var cursorRequest;
      if (sourceId && sourceId !== 'all' && store.indexNames && store.indexNames.contains('sourceId')) {
        var sourceIndex = store.index('sourceId');
        cursorRequest = sourceIndex.openCursor(IDBKeyRange.only(sourceId));
      } else if (type && store.indexNames && store.indexNames.contains('type')) {
        var typeIndex = store.index('type');
        cursorRequest = typeIndex.openCursor(IDBKeyRange.only(type));
      } else {
        cursorRequest = store.openCursor();
      }

      cursorRequest.onsuccess = function(event) {
        var cursor = event.target.result;
        if (!cursor) {
          resolve(results);
          return;
        }

        var item = cursor.value;
        var matches = true;
        if (sourceId && sourceId !== 'all' && item.sourceId !== sourceId) matches = false;
        if (type && item.type !== type) matches = false;
        if (groupTitle && groupTitle !== 'all' && item.groupTitle !== groupTitle) matches = false;
        if (favorite && !item.favorite) matches = false;
        if (search && item.name.toLowerCase().indexOf(search) === -1) matches = false;

        if (matches) {
          if (skipped < offset) {
            skipped++;
          } else {
            results.push(item);
            if (limit > 0 && results.length >= limit) {
              resolve(results);
              return;
            }
          }
        }
        cursor.continue();
      };
      cursorRequest.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.getGroups = function(sourceId) {
  var self = this;
  return this.init().then(function() {
    if (self.useMemoryFallback) {
      var map = {};
      for (var i = 0; i < self.memoryStore.channels.length; i++) {
        var ch = self.memoryStore.channels[i];
        if (!sourceId || sourceId === 'all' || ch.sourceId === sourceId) {
          var g = ch.groupTitle || 'General';
          map[g] = (map[g] || 0) + 1;
        }
      }
      var res = [];
      for (var k in map) {
        if (map.hasOwnProperty(k)) res.push({ name: k, count: map[k] });
      }
      res.sort(function(a, b) { return b.count - a.count; });
      return Promise.resolve(res);
    }

    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['channels'], 'readonly');
      var store = tx.objectStore('channels');
      var groupMap = {};

      var req;
      if (sourceId && sourceId !== 'all' && store.indexNames && store.indexNames.contains('sourceId')) {
        req = store.index('sourceId').openCursor(IDBKeyRange.only(sourceId));
      } else {
        req = store.openCursor();
      }

      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          var item = cursor.value;
          var grp = item.groupTitle || 'General';
          groupMap[grp] = (groupMap[grp] || 0) + 1;
          cursor.continue();
        } else {
          var list = [];
          for (var key in groupMap) {
            if (groupMap.hasOwnProperty(key)) {
              list.push({ name: key, count: groupMap[key] });
            }
          }
          list.sort(function(a, b) { return b.count - a.count; });
          resolve(list);
        }
      };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.getChannelCount = function(opts) {
  var self = this;
  opts = opts || {};
  var sourceId = opts.sourceId || null;
  var type = opts.type || null;
  var groupTitle = opts.groupTitle || null;
  var favorite = !!opts.favorite;
  var search = (opts.search || '').trim().toLowerCase();

  return this.init().then(function() {
    if (self.useMemoryFallback) {
      var count = 0;
      for (var i = 0; i < self.memoryStore.channels.length; i++) {
        var it = self.memoryStore.channels[i];
        if (sourceId && sourceId !== 'all' && it.sourceId !== sourceId) continue;
        if (type && it.type !== type) continue;
        if (groupTitle && groupTitle !== 'all' && it.groupTitle !== groupTitle) continue;
        if (favorite && !it.favorite) continue;
        if (search && it.name.toLowerCase().indexOf(search) === -1) continue;
        count++;
      }
      return Promise.resolve(count);
    }

    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['channels'], 'readonly');
      var store = tx.objectStore('channels');

      // Optimización directa si solo es contar por lista completa
      if (sourceId && sourceId !== 'all' && !type && (!groupTitle || groupTitle === 'all') && !favorite && !search && store.indexNames && store.indexNames.contains('sourceId')) {
        var countReq = store.index('sourceId').count(IDBKeyRange.only(sourceId));
        countReq.onsuccess = function() { resolve(countReq.result); };
        countReq.onerror = function(e) { reject(e.target.error); };
        return;
      }

      var req;
      if (sourceId && sourceId !== 'all' && store.indexNames && store.indexNames.contains('sourceId')) {
        req = store.index('sourceId').openCursor(IDBKeyRange.only(sourceId));
      } else if (type && store.indexNames && store.indexNames.contains('type')) {
        req = store.index('type').openCursor(IDBKeyRange.only(type));
      } else {
        req = store.openCursor();
      }

      var total = 0;
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          var item = cursor.value;
          var matches = true;
          if (sourceId && sourceId !== 'all' && item.sourceId !== sourceId) matches = false;
          if (type && item.type !== type) matches = false;
          if (groupTitle && groupTitle !== 'all' && item.groupTitle !== groupTitle) matches = false;
          if (favorite && !item.favorite) matches = false;
          if (search && item.name.toLowerCase().indexOf(search) === -1) matches = false;

          if (matches) total++;
          cursor.continue();
        } else {
          resolve(total);
        }
      };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.deleteSource = function(sourceId) {
  var self = this;
  return this.init().then(function() {
    if (self.useMemoryFallback) {
      self.memoryStore.sources = self.memoryStore.sources.filter(function(s) { return s.id !== sourceId; });
      self.memoryStore.channels = self.memoryStore.channels.filter(function(c) { return c.sourceId !== sourceId; });
      return Promise.resolve();
    }

    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['sources', 'channels'], 'readwrite');
      var sourceStore = tx.objectStore('sources');
      var channelStore = tx.objectStore('channels');

      sourceStore.delete(sourceId);

      var channelIndex = channelStore.index('sourceId');
      var req = channelIndex.openCursor(IDBKeyRange.only(sourceId));
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = function() { resolve(); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.getSourcesWithStats = function() {
  var self = this;
  return this.getSources().then(function(sources) {
    if (sources.length === 0) return Promise.resolve([]);

    return new Promise(function(resolve) {
      if (self.useMemoryFallback) {
        var res = sources.map(function(s) {
          var count = self.memoryStore.channels.filter(function(c) { return c.sourceId === s.id; }).length;
          s.channelCount = count;
          return s;
        });
        return resolve(res);
      }

      var tx = self.db.transaction(['channels'], 'readonly');
      var channelStore = tx.objectStore('channels');
      var index = channelStore.index('sourceId');
      var remaining = sources.length;

      sources.forEach(function(s) {
        var countReq = index.count(IDBKeyRange.only(s.id));
        countReq.onsuccess = function() {
          s.channelCount = countReq.result || 0;
          remaining--;
          if (remaining === 0) {
            resolve(sources);
          }
        };
        countReq.onerror = function() {
          s.channelCount = 0;
          remaining--;
          if (remaining === 0) {
            resolve(sources);
          }
        };
      });
    });
  });
};

DatabaseManager.prototype.toggleFavorite = function(channelId) {
  var self = this;
  return this.init().then(function() {
    if (self.useMemoryFallback) {
      for (var i = 0; i < self.memoryStore.channels.length; i++) {
        if (self.memoryStore.channels[i].id === channelId) {
          self.memoryStore.channels[i].favorite = self.memoryStore.channels[i].favorite ? 0 : 1;
          return Promise.resolve(self.memoryStore.channels[i].favorite);
        }
      }
      return Promise.resolve(0);
    }

    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['channels'], 'readwrite');
      var store = tx.objectStore('channels');
      var req = store.get(channelId);
      req.onsuccess = function() {
        var item = req.result;
        if (item) {
          item.favorite = item.favorite ? 0 : 1;
          store.put(item);
          tx.oncomplete = function() { resolve(item.favorite); };
        } else {
          resolve(0);
        }
      };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.saveHistory = function(channel, currentTime, duration) {
  var self = this;
  var record = {
    channelId: channel.id,
    name: channel.name,
    logo: channel.logo,
    streamUrl: channel.streamUrl,
    type: channel.type,
    currentTime: currentTime || 0,
    duration: duration || 0,
    updatedAt: Date.now()
  };

  return this.init().then(function() {
    if (self.useMemoryFallback) {
      self.memoryStore.history.push(record);
      return Promise.resolve(record);
    }
    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['history'], 'readwrite');
      tx.objectStore('history').put(record);
      tx.oncomplete = function() { resolve(record); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  });
};

DatabaseManager.prototype.getHistory = function(limit) {
  var self = this;
  limit = limit || 10;
  return this.init().then(function() {
    if (self.useMemoryFallback) {
      return Promise.resolve(self.memoryStore.history.slice(0, limit));
    }
    return new Promise(function(resolve, reject) {
      var tx = self.db.transaction(['history'], 'readonly');
      var store = tx.objectStore('history');
      var items = [];
      var cursorReq = store.openCursor();
      cursorReq.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          items.sort(function(a, b) { return b.updatedAt - a.updatedAt; });
          resolve(items.slice(0, limit));
        }
      };
      cursorReq.onerror = function(e) { reject(e.target.error); };
    });
  });
};

window.dbManager = new DatabaseManager();
