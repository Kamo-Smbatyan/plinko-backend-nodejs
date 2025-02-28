const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

var sockets = {};
var io;

const createSocketServer = (app, sendStatus) => {
  const server = http.createServer(app);
  io = socketIo(server, {
    cors: { },
  });

  io.on("connection", (socket) => {
    socket.on("connect user", (msg) => {
      socket.userId = msg.userId;
      sockets[msg.userId] = socket;
      sendStatus(socket);
    });

    socket.on("disconnect", () => {});
  });

  server.listen(process.env.SOCKET_PORT, () => {
    console.log(`Socket server listening on port: ${process.env.SOCKET_PORT}`);
  });

  return io;
};

module.exports = {
  createSocketServer,
};
