const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 3000;

const TIC = 250;

server.listen(port, function () {
    console.log('Server listening at port %d', port);
});
  
  // Routing
  app.use(express.static('public'));
  
  // Chatroom
  var players = {};
  var teams = {};
  var clues = {};
  var timeouts = {};
  var numUsers = 0;
  
  io.on('connection', function (socket) {
    var addedUser = false;

    socket.on('PLAYER_CHANGE', (data) => {
      const sender = data.sender;
      const player = data.message;
      socket.playerId = player.playerId;
      players[player.playerId] = player;
      players[player.playerId].lastSeen = +new Date();


      // @TODO: move this to a setInterval task
      // prune inactive players
      Object.keys(players).forEach(playerId => {
        if (!players[playerId].active && (players[playerId].lastSeen < (+new Date() - (5 * 60 * 1000))))
          delete players[playerId];
      });
      deleteMe.forEach(playerId => {
        delete players[playerId];
      });

      if (!timeouts.PLAYER_CHANGE) {
        setTimeout(((s) => {
          io.emit('PLAYER_CHANGE', { source: s, players: players });
          timeouts.PLAYER_CHANGE = false;
        }).bind(this, sender), TIC);
      }        
    });

    socket.on('TEAM_CHANGE', (data) => {
      const sender = data.sender;
      const team = data.message;                
      teams[team.teamId] = team;
      teams[team.teamId].lastSeen = +new Date();
      if (!timeouts.TEAM_CHANGE) {
        setTimeout(((s) => {
          io.emit('TEAM_CHANGE', { source: s, teams: teams });
          timeouts.TEAM_CHANGE = false;
        }).bind(this, sender), TIC);
      }        
    });

    socket.on('CLUE_CHANGE', (data) => {
      // the sender is source of truth for their own clues but they can't touch other people's
      const sender = data.sender;
      const submittedClues = data.message;

      // delete any sender's clues that are in our list but not in the submitted list
      const senderClues = submittedClues.filter(c => (c.playerId === sender));
      const deleteMe = [];
      Object.keys(clues).forEach(clueId => {
        if ((clues[clueId].playerId === sender) && (senderClues.indexOf(clueId) === -1))
          deleteMe.push(clueId);
      });
      deleteMe.forEach(clueId => {
        delete clues[clueId];
      });

      // overwrite/add all of the sender's clues
      senderClues.forEach(clue => {
        clues[clue.clueId] = clue;
      });
      
      // update everyone
      if (!timeouts.CLUE_CHANGE) {
        setTimeout(((s) => {
          io.emit('CLUE_CHANGE', { source: s, clues: clues });
          timeouts.CLUE_CHANGE = false;
        }).bind(this, sender), TIC);
      }  
    });
  
    // when the client emits 'add user', this listens and executes
    socket.on('add user', function (username) {
      if (addedUser) return;
  
      // we store the username in the socket session for this client
      socket.username = username;
      ++numUsers;
      addedUser = true;
      socket.emit('login', {
        numUsers: numUsers
      });
      // echo globally (all clients) that a person has connected
      socket.broadcast.emit('user joined', {
        username: socket.username,
        numUsers: numUsers
      });
    });
  
    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
      players[socket.playerId].active = false;
      if (!timeouts.PLAYER_CHANGE) {
        setTimeout(((s) => {
          io.emit('PLAYER_CHANGE', { source: s, players: players });
          timeouts.PLAYER_CHANGE = false;
        }).bind(this, socket.playerId), TIC);
      }   
    });
  });
