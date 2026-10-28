/**
 * CanaimaFlix - Parser M3U en Streaming por Lotes (Compatible ES5 para Android 4.4 KitKat)
 * Procesa listas de 20.000+ canales en bloques asíncronos sin bloquear el hilo principal ni saturar la RAM.
 */

var M3UStreamParser = {
  classifyStream: function(name, groupTitle, url) {
    var combined = (name + ' ' + groupTitle + ' ' + url).toLowerCase();
    if (/s\d+e\d+|t\d+e\d+|temporada|capitulo|episode|series/i.test(combined)) {
      return 'series';
    }
    if (/pel[ií]cula|movie|cinema|vod|\.mp4|\.mkv|\.avi/i.test(combined)) {
      return 'movie';
    }
    return 'live';
  },

  parseExtinfLine: function(line) {
    var info = {
      name: '',
      logo: '',
      groupTitle: 'General',
      tvgId: ''
    };

    var commaIndex = line.lastIndexOf(',');
    if (commaIndex !== -1) {
      info.name = line.substring(commaIndex + 1).trim();
    }

    // tvg-name como respaldo del nombre
    var tvgNameMatch = line.match(/tvg-name=["']?([^"',]+)["']?/i);
    if (!info.name && tvgNameMatch) {
      info.name = tvgNameMatch[1].trim();
    }

    // tvg-logo
    var tvgLogoMatch = line.match(/tvg-logo=["']?([^"']+)["']?/i);
    if (tvgLogoMatch) {
      info.logo = tvgLogoMatch[1].trim();
    }

    // group-title
    var groupTitleMatch = line.match(/group-title=["']?([^"']+)["']?/i);
    if (groupTitleMatch) {
      info.groupTitle = groupTitleMatch[1].trim();
    }

    // tvg-id
    var tvgIdMatch = line.match(/tvg-id=["']?([^"']+)["']?/i);
    if (tvgIdMatch) {
      info.tvgId = tvgIdMatch[1].trim();
    }

    return info;
  },

  /**
   * Parsea el texto M3U e inserta en IndexedDB en bloques de 300 canales para no saturar memoria.
   */
  parseAndSave: function(text, sourceId, onProgress) {
    var self = this;
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.substring(1);
    }

    var lines = text.split(/\r?\n/);
    var totalLines = lines.length;
    var currentExtinf = null;
    var channelIndex = 0;
    var channels = [];

    for (var i = 0; i < totalLines; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (line.indexOf('#EXTINF:') === 0) {
        currentExtinf = self.parseExtinfLine(line);
      } else if (line.indexOf('#EXTGRP:') === 0 && currentExtinf) {
        // Soporte estándar IPTV para la directiva #EXTGRP:
        var extGrp = line.substring(8).trim();
        if (extGrp) currentExtinf.groupTitle = extGrp;
      } else if (line.indexOf('#') !== 0 && line.length > 3) {
        // Línea de transmisión válida (cualquier URL o protocolo)
        channelIndex++;
        var name = (currentExtinf && currentExtinf.name) ? currentExtinf.name : ('Canal ' + channelIndex);
        var groupTitle = (currentExtinf && currentExtinf.groupTitle) ? currentExtinf.groupTitle : 'General';
        var logo = (currentExtinf && currentExtinf.logo) ? currentExtinf.logo : '';
        var type = self.classifyStream(name, groupTitle, line);

        channels.push({
          id: sourceId + '_' + channelIndex,
          sourceId: sourceId,
          name: name,
          logo: logo,
          streamUrl: line,
          groupTitle: groupTitle,
          type: type,
          favorite: 0,
          createdAt: Date.now()
        });

        currentExtinf = null;
      }
    }

    // Inserción en bloques asíncronos de 300 canales
    var CHUNK_SIZE = 300;
    var totalChannels = channels.length;
    var currentIndex = 0;

    return new Promise(function(resolve, reject) {
      if (totalChannels === 0) {
        resolve(0);
        return;
      }

      function processNextChunk() {
        var chunk = channels.slice(currentIndex, currentIndex + CHUNK_SIZE);
        if (chunk.length === 0) {
          if (onProgress) onProgress(totalChannels, totalChannels);
          resolve(totalChannels);
          return;
        }

        window.dbManager.saveChannelsBatch(chunk).then(function() {
          currentIndex += chunk.length;
          if (onProgress) onProgress(currentIndex, totalChannels);
          setTimeout(processNextChunk, 10);
        }).catch(function(err) {
          reject(err);
        });
      }

      processNextChunk();
    });
  }
};

window.M3UStreamParser = M3UStreamParser;
