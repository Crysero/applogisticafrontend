// socket/socket.js
import { io } from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_API_URL); // usa a URL do seu .env

socket.on('connect', () => {
  console.log('✅ Conectado ao WebSocket');
});

socket.on('connect_error', (err) => {
  console.error('❌ Erro de conexão:', err.message);
});

export default socket;
