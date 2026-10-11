'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  state: () => ipcRenderer.invoke('desktop:state'),
  quit: () => ipcRenderer.invoke('desktop:quit'),
  updateCheck: () => ipcRenderer.invoke('desktop:update-check'),
  updateDownload: () => ipcRenderer.invoke('desktop:update-download'),
  updateRelease: () => ipcRenderer.invoke('desktop:update-release'),
  loginCheck: () => ipcRenderer.invoke('desktop:login-check'),
  password: (oldKey, newKey) => ipcRenderer.invoke('desktop:password', oldKey, newKey),
  port: port => ipcRenderer.invoke('desktop:port', port),
  setup: key => ipcRenderer.invoke('desktop:setup', key),
  restart: () => ipcRenderer.invoke('desktop:restart'),
  resume: () => ipcRenderer.invoke('desktop:resume'),
  open: page => ipcRenderer.invoke('desktop:open', page),
  copy: () => ipcRenderer.invoke('desktop:copy'),
  folder: kind => ipcRenderer.invoke('desktop:folder', kind),
  onState: callback => ipcRenderer.on('desktop:state', (_event, state) => callback(state))
});
