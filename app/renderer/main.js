// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { createI18n } from './i18n/i18n.js';
import { mountShell, mountBackdrop } from './components/shell.js';

const dictionaries = {
  de: await (await fetch('./i18n/de.json')).json(),
  en: await (await fetch('./i18n/en.json')).json()
};

const settings = await window.sf.settings.all();
const i18n = createI18n(dictionaries, settings.language);

mountBackdrop(['#2a3a5c', '#4a2f52', '#20404a']);
mountShell(document.getElementById('app'), (k) => i18n.t(k));
