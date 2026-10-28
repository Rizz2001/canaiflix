var fs = require('fs');
var path = require('path');
var dir = path.join(__dirname, 'idb_dump');
var urls = {};
var hosts = {};
var exts = {};

fs.readdirSync(dir).forEach(function (f) {
  if (!/\.(log|ldb|bak)$/.test(f)) return;
  var buf = fs.readFileSync(path.join(dir, f)).toString('latin1');
  var re = /https?:\/\/[\x21-\x7e]{8,300}/g;
  var m;
  while ((m = re.exec(buf))) {
    var u = m[0].replace(/[^\x21-\x7e].*$/, '');
    if (/unsplash|imgur|googleapis|ejemplo/.test(u)) continue;
    urls[u] = 1;
  }
});

var list = Object.keys(urls);
list.forEach(function (u) {
  try {
    var h = u.replace(/^https?:\/\//, '').split('/')[0];
    hosts[h] = (hosts[h] || 0) + 1;
    var last = u.split('?')[0].split('/').pop();
    var ext = last.indexOf('.') > -1 ? last.split('.').pop().toLowerCase() : '(sin extension)';
    if (ext.length > 6) ext = '(otro)';
    exts[ext] = (exts[ext] || 0) + 1;
  } catch (e) {}
});

console.log('Total URLs unicas no-demo:', list.length);
console.log('Extensiones:', JSON.stringify(exts));
console.log('Hosts (top 10):', JSON.stringify(Object.keys(hosts).sort(function (a, b) { return hosts[b] - hosts[a]; }).slice(0, 10).map(function (h) { return h + ' x' + hosts[h]; })));
console.log('--- Muestra (ocultando credenciales) ---');
list.slice(0, 12).forEach(function (u) {
  console.log(u.replace(/(\/live\/|\/movie\/|\/series\/)[^\/]+\/[^\/]+\//, '$1***/***/').replace(/(username|password)=[^&]+/g, '$1=***'));
});
