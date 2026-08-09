// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** Build the three-column frame and hand back its empty regions. */
export function mountShell(root, t) {
  root.innerHTML = `
    <section class="panel" id="layers"><h2>${t('layers.title')}</h2><div id="layer-list"></div></section>
    <section class="panel" id="preview"><div id="preview-body"></div></section>
    <section class="panel" id="inspector"><h2>${t('inspector.title')}</h2><div id="inspector-body"></div></section>
    <section class="panel" id="footer"><div id="footer-body"></div></section>
  `;
  return {
    layers: root.querySelector('#layer-list'),
    preview: root.querySelector('#preview-body'),
    inspector: root.querySelector('#inspector-body'),
    footer: root.querySelector('#footer-body')
  };
}

/** Three blurred blobs behind the glass, tinted from the effect's own colours. */
export function mountBackdrop(colours) {
  let node = document.getElementById('backdrop');
  if (!node) {
    node = document.createElement('div');
    node.id = 'backdrop';
    node.innerHTML = '<div></div><div></div><div></div>';
    document.body.prepend(node);
  }
  const spots = [['6%', '4%'], ['52%', '38%'], ['24%', '62%']];
  node.querySelectorAll('div').forEach((blob, i) => {
    blob.style.left = spots[i][0];
    blob.style.top = spots[i][1];
    blob.style.background = colours[i] ?? '#243049';
  });
}
