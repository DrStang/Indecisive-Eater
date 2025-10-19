const net = require('net');
const { SocksClient } = require('socks');

const LOCAL_PORT = 3306;
const TARGET_HOST = '100.66.175.61';
const TARGET_PORT = 3306;
const SOCKS_HOST = 'localhost';
const SOCKS_PORT = 1055;

const server = net.createServer(async (clientSocket) => {
  console.log('New connection to proxy');
  
  try {
    const info = await SocksClient.createConnection({
      proxy: {
        host: SOCKS_HOST,
        port: SOCKS_PORT,
        type: 5
      },
      command: 'connect',
      destination: {
        host: TARGET_HOST,
        port: TARGET_PORT
      }
    });

    const { socket } = info;
    
    clientSocket.pipe(socket);
    socket.pipe(clientSocket);
    
    clientSocket.on('error', (err) => console.error('Client socket error:', err));
    socket.on('error', (err) => console.error('SOCKS socket error:', err));
    
  } catch (err) {
    console.error('Error creating SOCKS connection:', err);
    clientSocket.destroy();
  }
});

server.listen(LOCAL_PORT, '0.0.0.0', () => {
  console.log(`MySQL proxy listening on 0.0.0.0:${LOCAL_PORT}`);
});
