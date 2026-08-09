// Probe 4: which browser engine is this, and does it have what the engine needs?
// Deliberately written in old-fashioned ES5 so it cannot die on a syntax the
// host does not know — that would tell us nothing.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const effects = process.argv[2];

const html = `<head>
  <title>ZZ 4 Motorcheck</title>
  <meta description="Probe 4: reports the engine and the features SignalForge relies on. Open the Konsole." />
  <meta publisher="SignalForge" />
</head>
<body style="margin:0;padding:0;background:#000">
  <canvas id="exCanvas" width="320" height="200"></canvas>
</body>
<script>
  var c = document.getElementById('exCanvas');
  var ctx = c.getContext('2d');
  var lines = [];

  function report(name, value) {
    lines.push(name + ' = ' + value);
    console.log('SF-PROBE ' + name + ' = ' + value);
  }

  function has(name, fn) {
    var result;
    try { result = fn() ? 'YES' : 'NO'; } catch (e) { result = 'THREW: ' + e; }
    report(name, result);
    return result === 'YES';
  }

  report('userAgent', navigator.userAgent);
  report('vendor', navigator.vendor);

  // The pieces the SignalForge engine actually depends on.
  has('structuredClone', function () { return typeof structuredClone === 'function'; });
  has('canvas.getImageData', function () { return typeof ctx.getImageData === 'function'; });
  has('canvas.putImageData', function () { return typeof ctx.putImageData === 'function'; });
  has('canvas.createImageData', function () { return typeof ctx.createImageData === 'function'; });
  has('createElement canvas', function () { return !!document.createElement('canvas').getContext('2d'); });
  has('Float32Array', function () { return typeof Float32Array === 'function'; });
  has('Map', function () { return typeof Map === 'function'; });
  has('Promise', function () { return typeof Promise === 'function'; });
  has('Image + onload', function () { return typeof Image === 'function'; });
  has('imageSmoothingQuality', function () { return 'imageSmoothingQuality' in ctx; });
  has('ctx.filter', function () { return 'filter' in ctx; });
  has('globalCompositeOperation multiply', function () {
    ctx.globalCompositeOperation = 'multiply';
    var ok = ctx.globalCompositeOperation === 'multiply';
    ctx.globalCompositeOperation = 'source-over';
    return ok;
  });
  has('optional chaining + nullish', function () { return eval('(function(){var o=null;return (o?.x ?? 7)===7;})()'); });
  has('video element has play()', function () {
    return typeof document.createElement('video').play === 'function';
  });

  // Paint the verdict so it is visible without opening the console:
  // green stripe per YES, red per NO, top to bottom.
  var frame = 0;
  function update() {
    window.requestAnimationFrame(update);
    frame++;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 320, 200);
    var h = 200 / lines.length;
    for (var i = 0; i < lines.length; i++) {
      var ok = lines[i].indexOf('= YES') > 0;
      var bad = lines[i].indexOf('= NO') > 0 || lines[i].indexOf('THREW') > 0;
      ctx.fillStyle = ok ? '#00c000' : (bad ? '#c00000' : '#404040');
      ctx.fillRect(0, i * h, 300, h - 1);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(300, (frame * 2) % 200, 20, 10);
  }
  window.requestAnimationFrame(update);
</script>`;

writeFileSync(join(effects, 'ZZ-4-Motorcheck.html'), html, 'utf8');
console.log('probe 4 written');
