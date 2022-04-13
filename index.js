const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/src/index.html');
});

app.get('/start_game', (req, res) => {
  res.sendFile(__dirname + '/src/start_game.html');
});

app.get('/game', (req, res) => {
  res.sendFile(__dirname + '/src/game.html');
});

app.use(express.static('public'));


server.listen(3000, () => {
  console.log('listening on *:3000');
});

let characters = [];
let narrators = [];
let visitors = [];
let currentRole = null;
let currentUserId = null;
let chatHistory = [];


io.on('connection', (socket) => {

  let userId = socket.id;
  let userRole = socket.handshake.query.role;
  let userData = {};

  /** Если первый игрок в игре, он сразу ходит **/
  if(currentRole === null) {
    currentRole = userRole;
  }

  /*** Если не первый, но сейчас никто не ходит */
  if(currentUserId === null) {
    currentUserId = userId;
  }

  /*** Меняется информация о комнате */
  if(socket.handshake.query.role === 'character') {
    userData = {
      userId: userId,
      userRole: userRole,
      name: socket.handshake.query.name,
      description: socket.handshake.query.description
    };
    characters.push(userData);
  } else if(socket.handshake.query.role === 'narrator') {
    userData = {
      userId: userId,
    };
    narrators.push(userData);
  } else {
    visitors.push(userData);
  }

  socket.on('disconnect', () => {
    let nextUserData = null;
    if(userRole === 'character') {
      if(currentUserId === userId) {
        if( characters.length > 1) {
          nextUserData = characters[
            characters.map(e => e.userId).indexOf(userId) + 1 % characters.length
          ];
        }
      }
      characters = characters.filter(e => e.userId !== userId);
    } else if(userRole === 'narrator') {
      if(currentUserId === userId) {
        if(narrators.length > 1) {
          nextUserData = narrators[
          narrators.map(e => e.userId).indexOf(userId) + 1 % narrators.length
              ];
        }
      }
      narrators = narrators.filter(e => e.userId !== userId);
    } else {
      visitors = visitors.filter(e => e.userId !== userId);
    }

    if(nextUserData) {
      currentUserId = nextUserData.userId;
    } else {
      if(currentUserId === userId) {
        currentUserId = null;
      }
    }

    io.emit('player disconnect', {
      /*** с игроком прощаются ***/
      userData: userData,
      /*** информация об изменении в комнате ***/
      currentUserId: currentUserId,
      currentRole: currentRole,
      narrators: narrators,
      characters: characters
    });

  });

  socket.on('chat message', (msg) => {
    if(currentUserId === userId) {
      let nextUser = null;
      if(currentRole === 'character') {
        currentRole = 'narrator'
        nextUser = narrators[0];
        characters.push(characters.shift())
      } else if(currentRole === 'narrator') {
        currentRole = 'character';
        nextUser = characters[0];
        narrators.push(narrators.shift())
      }

      /*** Передаем сообщение следующему пользователю ***/
      if(nextUser) {
        currentUserId = nextUser.userId;
      } else {
        currentUserId = null;
      }

      let message = {
        'title': msg,
        'type': userRole,
        /*** информация об изменении в комнате ***/
        currentUserId: currentUserId,
        currentRole: currentRole,
        narrators: narrators,
        characters: characters
      };
      if(userRole === 'character') {
        message.name = userData.name;
      }
      chatHistory.push(message);
      if(chatHistory.length > 50) {
        chatHistory.shift();
      }

      io.emit('chat message', message);
    }
  });

  io.emit('player connect', {
    /*** игрок приветствуется другими ***/
    userData: userData,
    /*** информация о комнате ***/
    currentUserId: currentUserId,
    currentRole: currentRole,
    narrators: narrators,
    characters: characters
  });
  io.to(userId).emit('chat history',chatHistory);

});