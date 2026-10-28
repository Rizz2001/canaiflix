var http = require('http');
var url = require('url');

var target = process.argv[2];
var uas = {
  'stagefright (UA nativo Android 4.4)': 'stagefright/1.2 (Linux;Android 4.4.4)',
  'VLC': 'VLC/3.0.20 LibVLC/3.0.20',
  'Chrome 30 (WebView)': 'Mozilla/5.0 (Linux; Android 4.4.4) AppleWebKit/537.36 Chrome/30.0.0.0 Mobile Safari/537.36',
  'ExoPlayer': 'ExoPlayerLib/1.5.16',
  'sin User-Agent': null
};

function probe(name, ua, cb0) {
  var called = false;
  var cb = function () { if (called) return; called = true; cb0(); };
  var u = url.parse(target);
  var headers = { 'Accept': '*/*', 'Connection': 'close' };
  if (ua) headers['User-Agent'] = ua;
  var req = http.request({ host: u.hostname, port: u.port, path: u.path, method: 'GET', headers: headers, timeout: 12000 }, function (res) {
    var chunks = [];
    var size = 0;
    res.on('data', function (d) {
      if (size < 400) { chunks.push(d); size += d.length; }
      if (size >= 400) { req.destroy(); }
    });
    var done = function () {
      var body = Buffer.concat(chunks).toString('latin1').replace(/[^\x20-\x7e\n]/g, '.').slice(0, 160).replace(/\n/g, ' | ');
      console.log('[' + name + '] HTTP ' + res.statusCode + ' | tipo=' + res.headers['content-type'] + (res.headers.location ? ' | redirige a: ' + res.headers.location.replace(/\/\/[^\/]+@/, '//***@') : ''));
      console.log('     cuerpo: ' + body);
      cb();
    };
    res.on('end', done);
    res.on('close', done);
  });
  var finished = false;
  req.on('error', function (e) { if (finished) return; finished = true; console.log('[' + name + '] ERROR: ' + e.code + ' ' + e.message); cb(); });
  req.on('timeout', function () { if (finished) return; finished = true; console.log('[' + name + '] TIMEOUT'); req.destroy(); cb(); });
  req.end();
}

var names = Object.keys(uas);
(function next(i) {
  if (i >= names.length) return;
  probe(names[i], uas[names[i]], function () { next(i + 1); });
})(0);
