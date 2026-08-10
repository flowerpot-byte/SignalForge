// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
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
  openProject: () => ipcRenderer.invoke('sf:openProject')
});
