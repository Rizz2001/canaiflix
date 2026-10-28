/**
 * CanaimaFlix - Parser M3U en Streaming / Chunks
 * Diseñado para procesar archivos de 20.000+ canales en dispositivos de 1 GB RAM.
 */

class M3UStreamParser {
  /**
   * Determina el tipo de contenido (live, movie, series) basado en metadatos y URL
   */
  static classifyStream(name, groupTitle, url) {
    const combined = `${name} ${groupTitle} ${url}`.toLowerCase();

    // Detección de Series (ej. S01E05, T1E03, Temporada 1, Capitulo 4)
    if (/s\d+e\d+|t\d+e\d+|temporada|capitulo|episode|series/i.test(combined)) {
      return 'series';
    }

    // Detección de Películas (VOD, terminaciones en .mp4, .mkv, .avi o palabras clave)
    if (/pel[ií]cula|movie|cinema|vod|\.mp4|\.mkv|\.avi/i.test(combined)) {
      return 'movie';
    }

    // Por defecto es canal de TV en vivo
    return 'live';
  }

  /**
   * Extrae atributos de una línea #EXTINF
   */
  static parseExtinfLine(line) {
    const info = {
      name: '',
      logo: '',
      groupTitle: 'General',
      tvgId: ''
    };

    // Separar la parte de atributos del nombre (después de la última coma)
    const commaIndex = line.lastIndexOf(',');
    if (commaIndex !== -1) {
      info.name = line.substring(commaIndex + 1).trim();
    }

    // Regex para extraer atributos clave="valor" o clave=valor
    const tvgLogoMatch = line.match(/tvg-logo=["']?([^"' ]+)["']?/i);
    if (tvgLogoMatch) info.logo = tvgLogoMatch[1];

    const groupTitleMatch = line.match(/group-title=["']?([^"']+)["']?/i);
    if (groupTitleMatch) info.groupTitle = groupTitleMatch[1].trim();

    const tvgIdMatch = line.match(/tvg-id=["']?([^"']+)["']?/i);
    if (tvgIdMatch) info.tvgId = tvgIdMatch[1].trim();

    const tvgNameMatch = line.match(/tvg-name=["']?([^"']+)["']?/i);
    if (tvgNameMatch && !info.name) info.name = tvgNameMatch[1].trim();

    return info;
  }

  /**
   * Parsea un texto M3U completo o por fragmentos guardando directamente en IndexedDB
   * @param {string} text - Contenido M3U
   * @param {string} sourceId - ID de la fuente
   * @param {Function} onProgress - Callback (totalParseados, loteGuardado)
   */
  static async parseAndSave(text, sourceId, onProgress) {
    // 1. Eliminar BOM UTF-8 si existe
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.substring(1);
    }

    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;
    let currentExtinf = null;
    let batch = [];
    let channelIndex = 0;
    const BATCH_SIZE = 400;

    for (let i = 0; i < totalLines; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentExtinf = this.parseExtinfLine(line);
      } else if (line.startsWith('#EXTVLCOPT:') || line.startsWith('#EXTHTTP:')) {
        // Directivas de cabeceras o agentes (soportadas para VLC)
        continue;
      } else if (!line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://'))) {
        channelIndex++;
        const name = (currentExtinf && currentExtinf.name) ? currentExtinf.name : `Canal ${channelIndex}`;
        const groupTitle = (currentExtinf && currentExtinf.groupTitle) ? currentExtinf.groupTitle : 'General';
        const logo = (currentExtinf && currentExtinf.logo) ? currentExtinf.logo : '';
        const type = this.classifyStream(name, groupTitle, line);

        const channel = {
          id: `${sourceId}_${channelIndex}`,
          sourceId,
          name,
          logo,
          streamUrl: line,
          groupTitle,
          type,
          favorite: 0,
          tvgId: currentExtinf ? currentExtinf.tvgId : '',
          createdAt: Date.now()
        };

        batch.push(channel);
        currentExtinf = null;

        // Guardado por lotes para mantener memoria RAM baja
        if (batch.length >= BATCH_SIZE) {
          await window.dbManager.saveChannelsBatch(batch);
          if (onProgress) onProgress(channelIndex);
          batch = [];
          // Ceder el hilo de ejecución para que el UI no se congele
          await new Promise((r) => setTimeout(r, 2));
        }
      }
    }

    // Guardar remanente
    if (batch.length > 0) {
      await window.dbManager.saveChannelsBatch(batch);
      if (onProgress) onProgress(channelIndex);
      batch = [];
    }

    return channelIndex;
  }
}

window.M3UStreamParser = M3UStreamParser;
