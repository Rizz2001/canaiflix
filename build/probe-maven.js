var https = require('https');

var candidates = [
  'https://repo1.maven.org/maven2/com/google/android/exoplayer/exoplayer-core/2.18.7/exoplayer-core-2.18.7.aar',
  'https://dl.google.com/dl/android/maven2/com/google/android/exoplayer/exoplayer-core/2.18.7/exoplayer-core-2.18.7.aar',
  'https://maven.google.com/com/google/android/exoplayer/exoplayer-core/2.18.7/exoplayer-core-2.18.7.aar',
  'https://repo1.maven.org/maven2/com/google/android/exoplayer/exoplayer/r1.5.16/exoplayer-r1.5.16.aar',
  'https://repo1.maven.org/maven2/com/google/android/exoplayer/exoplayer/r1.5.16/exoplayer-r1.5.16.jar',
  'https://jcenter.bintray.com/com/google/android/exoplayer/exoplayer/r1.5.16/exoplayer-r1.5.16.aar',
  'https://repo1.maven.org/maven2/androidx/media3/media3-exoplayer/1.0.2/media3-exoplayer-1.0.2.aar'
];

function head(u, cb) {
  var req = https.request(u, { method: 'HEAD', timeout: 15000 }, function (res) {
    cb(res.statusCode + ' ' + (res.headers['content-length'] || '?') + ' bytes');
  });
  req.on('error', function (e) { cb('ERROR ' + e.code); });
  req.on('timeout', function () { req.destroy(); cb('TIMEOUT'); });
  req.end();
}

(function next(i) {
  if (i >= candidates.length) return;
  head(candidates[i], function (r) {
    console.log(r + '  <-  ' + candidates[i].replace('https://', ''));
    next(i + 1);
  });
})(0);
