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
  // A dropped File object carries no usable path of its own under
  // sandbox: true (the old File.path extension is gone) — webUtils is the
  // supported replacement and, unlike ipcRenderer.invoke, resolves
  // synchronously in the preload context.
  pathForFile: (file) => webUtils.getPathForFile(file),
  importImage: (path) => ipcRenderer.invoke('sf:importImage', path)
});
