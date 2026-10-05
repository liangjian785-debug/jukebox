/**
 * Socket.io 封装：收到 state:update 整体替换本地状态
 */
import { io } from 'socket.io-client';

export function connectSocket(onState) {
  const socket = io();
  socket.on('state:update', (state) => onState(state));
  socket.on('disconnect', () => console.warn('socket disconnected'));
  socket.on('connect', () => console.log('socket connected'));
  return socket;
}
