// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * The whole surface the window can reach. Every entry is named here on
 * purpose: nothing gets to the renderer that is not on this list.
 */
contextBridge.exposeInMainWorld('sf', {
  version: () => ipcRenderer.invoke('sf:version'),
  settings: {
    all: () => ipcRenderer.invoke('sf:settings:all'),
    set: (key, value) => ipcRenderer.invoke('sf:settings:set', key, value)
  },
  effectsTarget: () => ipcRenderer.invoke('sf:effectsTarget'),
  chooseFolder: () => ipcRenderer.invoke('sf:chooseFolder'),
  chooseCover: () => ipcRenderer.invoke('sf:chooseCover'),
  // The renderer hands over the dropped File object itself, never a path
  // string: only this preload script (not the sandboxed, isolated renderer
  // world) is trusted to turn that File into a real filesystem path, via
  // webUtils.getPathForFile. A script running in the renderer cannot forge a
  // File that resolves to an arbitrary path of its choosing — a synthetic
  // `new File([...], 'x.png')` has no disk backing and getPathForFile
  // returns '' for it, which the main-process handler below rejects the same
  // way it rejects any other failed import. This is what keeps
  // sf:importImage from being an arbitrary-file-read primitive despite
  // sandbox: true isolating the renderer from Node.
  importImage: (file) => ipcRenderer.invoke('sf:importImage', webUtils.getPathForFile(file)),
  // Same rule as importImage, from the other end: the renderer hands over a
  // document and gets a document back, and never names a file. Which file is
  // written or read is decided solely by the dialog the main process opens
  // (see app/main.js) — there is no parameter here for a renderer to put a
  // path into, so sf:saveProject cannot be turned into "write this anywhere"
  // and sf:openProject cannot be turned into "read anything".
  saveProject: (doc) => ipcRenderer.invoke('sf:saveProject', doc),
  openProject: () => ipcRenderer.invoke('sf:openProject'),
  // The question asked before unsaved work is thrown away. Only words travel
  // out — the window knows the language, the main process owns the dialog —
  // and one of 'save' | 'discard' | 'cancel' comes back. Nothing here names a
  // file either: whether anything is opened at all is still decided by the
  // window, and by which file, still only by the dialog sf:openProject opens.
  confirmDiscard: (texts) => ipcRenderer.invoke('sf:confirmDiscard', texts),
  // And the same rule again for the export: a document goes out, a result
  // comes back. `options` carries one thing only — whether the user has
  // answered "yes, overwrite it" — so there is nowhere here for a renderer
  // to put a path. The folder is chosen in the main process (the detected
  // one, or the one the folder dialog returned), and the path in the result
  // is there to be shown, not to be sent back.
  exportEffect: (doc, options) => ipcRenderer.invoke('sf:exportEffect', doc, { force: options?.force === true }),
  // The library: the effects folder, read back. Same rule once more, and this
  // is the channel group where it matters most, because these three are the
  // only ones that carry a NAME at all. What travels out is a leaf name the
  // window was given by `list` and nothing else — no folder, no path, no
  // separator — and the main process never joins it onto anything: it looks the
  // name up in a fresh listing and uses the string the filesystem handed back
  // (findEffect in src/main/effects-library.js). So this cannot be turned into
  // "read that file over there", and none of the three writes anything at all.
  library: {
    list: () => ipcRenderer.invoke('sf:library:list'),
    cover: (file) => ipcRenderer.invoke('sf:library:cover', String(file)),
    open: (file) => ipcRenderer.invoke('sf:library:open', String(file))
  }
});
