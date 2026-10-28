// Diagnostico de streams (Fase 0): lee URLs del volcado de IndexedDB (UTF-16),
// clasifica formatos y prueba un canal en vivo y una pelicula con varios User-Agent.
// Las credenciales nunca se imprimen.
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var url = require('url');

var dir = path.join(__dirname, 'idb_dump');
var urls = {};

fs.readdirSync(dir).forEach(function (f) {
  if (!/\.(log|ldb)$/.test(f)) return;
  var b = fs.readFileSync(path.join(dir, f));
  [b.toString('latin1'), b.toString('utf16le'), b.slice(1).toString('utf16le')].forEach(function (s) {
    var re = /https?:\/\/[\x21-\x7e]{8,400}/g;
    var m;
    while ((m = re.exec(s))) {
      var u = m[0].replace(/[^\x21-\x7e].*$/, '');
      if (/unsplash|imgur|googleapis|ejemplo|\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u)) continue;
      urls[u] = 1;
    }
  });
});

function mask(u) {
  return u
    .replace(/(\/(?:live|movie|series)\/)[^\/]+\/[^\/]+\//, '$1***/***/')
    .replace(/(username|password)=[^&]+/g, '$1=***')
    .replace(/\/\/[^\/@]+@/, '//***@');
}

var list = Object.keys(urls);
var hosts = {}, kinds = {}, exts = {};
list.forEach(function (u) {
  var h = u.replace(/^https?:\/\//, '').split('/')[0];
  hosts[h] = (hosts[h] || 0) + 1;
  var kind = /\/live\//.test(u) ? 'live' : /\/movie\//.test(u) ? 'movie' : /\/series\//.test(u) ? 'series' : 'otro';
  kinds[kind] = (kinds[kind] || 0) + 1;
  var last = u.split('?')[0].split('/').pop();
  var ext = last.indexOf('.') > -1 ? last.split('.').pop().toLowerCase() : '(sin extension)';
  if (ext.length > 6) ext = '(otro)';
  exts[ext] = (exts[ext] || 0) + 1;
});

console.log('URLs unicas de stream:', list.length);
console.log('Tipos:', JSON.stringify(kinds));
console.log('Extensiones:', JSON.stringify(exts));
console.log('Hosts:', JSON.stringify(Object.keys(hosts).sort(function (a, b) { return hosts[b] - hosts[a]; }).slice(0, 8).map(function (h) { return h + ' x' + hosts[h]; })));

var uas = {
  'stagefright (nativo 4.4)': 'stagefright/1.2 (Linux;Android 4.4.4)',
  'VLC': 'VLC/3.0.20 LibVLC/3.0.20',
  'Chrome 30 (WebView)': 'Mozilla/5.0 (Linux; Android 4.4.4) AppleWebKit/537.36 Chrome/30.0.0.0 Mobile Safari/537.36',
  'ExoPlayer': 'ExoPlayerLib/2.18.7',
  'sin User-Agent': null
};

function probe(target, name, ua, cb) {
  var u = url.parse(target);
  var lib = u.protocol === 'https:' ? https : http;
  var headers = { 'Accept': '*/*', 'Connection': 'close' };
  if (ua) headers['User-Agent'] = ua;
  var done = false;
  var finish = function (msg) { if (done) return; done = true; console.log('  [' + name + '] ' + msg); cb(); };
  var req = lib.request({ host: u.hostname, port: u.port, path: u.path, method: 'GET', headers: headers, timeout: 12000 }, function (res) {
    var size = 0, chunks = [];
    var end = function () {
      var buf = Buffer.concat(chunks);
      var sync = buf.length > 0 && buf[0] === 0x47 ? ' | MPEG-TS (sync 0x47)' : '';
      var head = buf.toString('latin1', 0, 60).replace(/[^\x20-\x7e]/g, '.');
      finish('HTTP ' + res.statusCode + ' | ' + res.headers['content-type'] + (res.headers.location ? ' | -> ' + mask(res.headers.location) : '') + sync + ' | ' + head.slice(0, 40));
    };
    res.on('data', function (d) { chunks.push(d); size += d.length; if (size > 4000) req.destroy(); });
    res.on('end', end);
    res.on('close', end);
  });
  req.on('error', function (e) { finish('ERROR ' + e.code); });
  req.on('timeout', function () { finish('TIMEOUT'); req.destroy(); });
  req.end();
}

function isStream(u) {
  if (/\.(m3u)(\?|$)/i.test(u)) return false;
  if (/(wikimedia|pluto\.tv\/|i\.ibb\.co|jmp2\.uk|github|raw\.githubusercontent)/i.test(u)) return false;
  return /\.(m3u8|ts|mpd|mp4|mkv)(\?|$)/i.test(u) || /:\d{2,5}\//.test(u) || /\/live\//.test(u);
}
function safe(u) {
  var p = url.parse(u);
  var last = (p.pathname || '').split('/').pop().replace(/\d+/g, '#');
  return p.protocol + '//' + p.host + '/.../' + last;
}
var seenHost = {};
var samples = [];
list.filter(isStream).forEach(function (u) {
  var h = url.parse(u).host;
  if (!seenHost[h] && samples.length < 6) { seenHost[h] = 1; samples.push(u); }
});
console.log('Streams candidatos (no imagen/lista):', list.filter(isStream).length);

(function nextSample(i) {
  if (i >= samples.length) return;
  console.log('\nMuestra: ' + safe(samples[i]));
  var names = Object.keys(uas);
  (function nextUa(j) {
    if (j >= names.length) return nextSample(i + 1);
    probe(samples[i], names[j], uas[names[j]], function () { nextUa(j + 1); });
  })(0);
})(0);
