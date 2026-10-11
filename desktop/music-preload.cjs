'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('musicLogin', {
  open: (platform, key) => ipcRenderer.invoke('music:login', platform, key),
  onResult: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('music:login-result', listener);
    return () => ipcRenderer.removeListener('music:login-result', listener);
  }
});
