const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 3000;

const TIC = 100;

server.listen(port, function () {
    console.log('Server listening at port %d', port);
});

// you're going to want some files, huh?
app.use(express.static('public'));

var gameState = {
  round: 0,
  whoseTurnIsIt: null,
  activeClueId: null,
  clues: {},
  teams: {
    'team-0': {name: 'Red', color: '#ffaaaa', teamId: 'team-0', score: 0},
    'team-1': {name: 'Blue', color: '#aaaaff', teamId: 'team-1', score: 0}
  },
  players: {},
  timeouts: {}
};

function sendTeamUpdate(senderId) {
  if (!gameState.timeouts.TEAM_CHANGE) {
    setTimeout(((s) => {
      io.emit('TEAM_CHANGE', { source: s, teams: gameState.teams });
      gameState.timeouts.TEAM_CHANGE = false;
    }).bind(this, senderId), TIC);
  }
}

function sendClueUpdate(senderId) {
  if (!gameState.timeouts.CLUE_CHANGE) {
    setTimeout(((s) => {
      io.emit('CLUE_CHANGE', { source: s, clues: gameState.clues });
      gameState.timeouts.CLUE_CHANGE = false;
    }).bind(this, senderId), TIC);
  }
}

function sendPlayerUpdate(senderId) {
  if (!gameState.timeouts.PLAYER_CHANGE) {
    setTimeout(((s) => {
      // if everyone's ready, increment the round and start the game!
      if ((gameState.round === 0) && (Object.keys(gameState.players).every(p => gameState.players[p].ready))) {
        // mark all clues as unused
        Object.keys(gameState.clues).forEach(clueId => {
          gameState.clues[clueId].used = 0;
        });
        gameState.round = 1;

        // initial player should be first player from team 0
        const data = {source: s, round: gameState.round};
        if (Object.keys(gameState.teams).length > 0) {
          const firstTeam = Object.keys(gameState.teams).sort()[0];
          const wtii = Object.values(gameState.players).filter(p => p.teamId === firstTeam).sort((a, b) => a.playerId < b.playerId)[0];
          if (wtii) {
            gameState.whoseTurnIsIt = wtii.playerId;
            data.whoseTurnIsIt = wtii.playerId;
            data.activeClueId = gameState.activeClueId;
          }
        }
        io.emit('ROUND_SET', data);
      }

      io.emit('PLAYER_CHANGE', { source: s, players: gameState.players });
      gameState.timeouts.PLAYER_CHANGE = false;
    }).bind(this, senderId), TIC);
  }
}

function heartbeat(playerId) {
  if (gameState.players[playerId]) {
    gameState.players[playerId].lastSeen = +new Date();
    gameState.players[playerId].active = true;
  }
}

// must call before advancing player's .turn property
function nextPlayer(sameTeam) {
  sameTeam = !!sameTeam;
  if (sameTeam) {
    const eligiblePlayerIds = Object.values(gameState.players)
      .filter(p => (p.teamId === gameState.players[gameState.whoseTurnIsIt].teamId) && (p.turn === gameState.players[gameState.whoseTurnIsIt].turn))
      .map(p => p.playerId)
      .sort((a, b) => a < b);

    const currentidx = eligiblePlayerIds.indexOf(gameState.whoseTurnIsIt);
    if (currentidx >= 0) {
      return eligiblePlayerIds[(currentidx + 1) % eligiblePlayerIds.length];
    }
  }
  else {
    const teamIds = Object.values(gameState.teams)
      .map(t => t.teamId)
      .sort((a, b) => a < b);
    const nextTeamId = teamIds[(teamIds.indexOf(gameState.players[gameState.whoseTurnIsIt].teamId) + 1) % teamIds.length];

    if (nextTeamId) {
      const eligiblePlayerIds = Object.values(gameState.players)
        .filter(p => (p.teamId === nextTeamId) && (p.turn === gameState.players[gameState.whoseTurnIsIt].turn))
        .map(p => p.playerId)
        .sort((a, b) => a < b);
      if (eligiblePlayerIds.length > 0)
        return eligiblePlayerIds[0];
    }
  }
  // something failed (no eligible players?)
  return false;
}

setInterval(() => {
  // prune inactive players
  const PRUNE_THRESHOLD = gameState.round === 0 ? 30000 : 600000; // 1m in lobby, 10m otherwise
  const deleteMe = [];
  Object.keys(gameState.players).forEach(playerId => {
    if (gameState.players[playerId].prune && gameState.players[playerId].prune < (+new Date() - 30000))
      deleteMe.push(playerId);
    if (!gameState.players[playerId].active && !gameState.players[playerId].prune && (gameState.players[playerId].lastSeen < (+new Date() - PRUNE_THRESHOLD)))
    gameState.players[playerId].prune = +new Date();
  });
  deleteMe.forEach(playerId => {
    delete gameState.players[playerId];
  });
  if (Object.values(gameState.players).some(p => p.prune))
    sendPlayerUpdate(null);
}, TIC * 10);

io.on('connection', function (socket) {

  // on connection, catch the user up
  socket.emit('INIT', gameState);

  socket.on('HELLO', (data) => {
    heartbeat(data.sender);
    console.log(`- HELLO from ${data.sender}`);
  });

  socket.on('HEARTBEAT', (data) => {
    heartbeat(data.sender);
  });

  socket.on('PLAYER_CHANGE', (data) => {
    const sender = data.sender;
    const player = data.message;
    socket.playerId = player.playerId;
    heartbeat(player.playerId);
    gameState.players[player.playerId] = player;
    gameState.players[player.playerId].lastSeen = +new Date();

    sendPlayerUpdate(sender);
  });

  socket.on('TEAM_CHANGE', (data) => {
    const senderId = data.sender;
    heartbeat(senderId);
    data.message.forEach(t => {
      gameState.teams[t.teamId] = t;
      gameState.teams[t.teamId].lastSeen = +new Date();
    });
    sendTeamUpdate(senderId);
  });

  socket.on('CLUE_CHANGE', (data) => {
    // no clue changes after the lobby phase
    if (gameState.round > 0)
      return;

    // the sender is source of truth for their own clues but they can't touch other people's
    const senderId = data.sender;
    const submittedClues = data.message;
    heartbeat(senderId);

    // delete any sender's clues that are in our list but not in the submitted list
    const senderClues = submittedClues.filter(c => (c.playerId === senderId));
    const deleteMe = [];
    Object.keys(gameState.clues).forEach(clueId => {
      if ((gameState.clues[clueId].playerId === senderId) && (senderClues.indexOf(clueId) === -1))
        deleteMe.push(clueId);
    });
    deleteMe.forEach(clueId => {
      delete gameState.clues[clueId];
    });

    // overwrite/add all of the sender's clues
    senderClues.forEach(clue => {
      gameState.clues[clue.clueId] = clue;
    });

    // set used to 0 for every clue
    Object.keys(gameState.clues).forEach(clueId => {
      gameState.clues[clueId].used = 0;
    });

    // update everyone
    sendClueUpdate(senderId);
  });

  socket.on('START_TURN', (data) => {
    const playerId = data.sender;
    heartbeat(playerId);
    const remainingClues = Object.values(gameState.clues).filter(clue => clue.used < gameState.round);
    gameState.activeClueId = remainingClues[Math.floor(Math.random() * remainingClues.length)].clueId;
    io.emit('ROUND_SET', {activeClueId: gameState.activeClueId});
  });

  socket.on('END_TURN', (data) => {
    const playerId = data.sender; // player who just completed their turn
    // reset active clue ID
    gameState.activeClueId = null;

    // determine if there's an eligible player on other team
    // THIS HAS TO HAPPEN BEFORE ADVANCING THE CURRENT PLAYER'S TURN
    const nextPlayerId = nextPlayer(false);

    // increment this player's turn count
    gameState.players[playerId].turn += 1;

    // if no eligible player, increment round
    if (nextPlayerId) {
      gameState.whoseTurnIsIt = nextPlayerId;
    }
    else {
      gameState.round += 1;
      gameState.whoseTurnIsIt = nextPlayer(false);
    }

    io.emit('ROUND_SET', {round: gameState.round, activeClueId: gameState.activeClueId, whoseTurnIsIt: gameState.whoseTurnIsIt});;
  });

  socket.on('NEXT_CLUE', (data) => {
    const senderId = data.sender;
    heartbeat(senderId);
    const gotIt = data.message.gotIt;
    const gottenClueId = data.message.clueId;
    if (gotIt) {
      // score for team, send team update
      gameState.teams[gameState.players[senderId].teamId].score += 1;
      gameState.clues[gameState.activeClueId].used += 1;
      sendTeamUpdate(senderId);
      sendClueUpdate(senderId, false);
    }
    // check for round completion
    const remainingClues = Object.values(gameState.clues).filter(clue => clue.used < gameState.round);
    if (remainingClues.length === 0) {
      // round over!
      const nextPlayerId = nextPlayer(false);
      gameState.activeClueId = null;
      gameState.round += 1;
      gameState.players[gameState.whoseTurnIsIt].turn += 1;
      gameState.whoseTurnIsIt = nextPlayerId;
      sendPlayerUpdate(senderId);
    }
    else {
      let clueIdx = Math.floor(Math.random() * remainingClues.length);
      // redraw if we get the same clue and there are others left
      while ((remainingClues.length > 1) && (remainingClues[clueIdx].clueId === gameState.activeClueId))
        clueIdx = Math.floor(Math.random() * remainingClues.length);
      gameState.activeClueId = remainingClues[clueIdx].clueId;
    }
    io.emit('ROUND_SET', {round: gameState.round, activeClueId: gameState.activeClueId, whoseTurnIsIt: gameState.whoseTurnIsIt});
  });

  socket.on('SKIP_TURN', (data) => {
    // find next player on the same team and set whoseTurnIsIt to them, update w/ ROUND_SET
    const playerId = data.sender;
    heartbeat(playerId);

    const nextPlayerId = nextPlayer(true);
    if (nextPlayerId) {
      gameState.whoseTurnIsIt = nextPlayerId;
      gameState.activeClueId = null;
      io.emit('ROUND_SET', {activeClueId: gameState.activeClueId, whoseTurnIsIt: gameState.whoseTurnIsIt});
    }
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (gameState.players[socket.playerId])
    gameState.players[socket.playerId].active = false;
    if (!gameState.timeouts.PLAYER_CHANGE) {
      setTimeout(((s) => {
        io.emit('PLAYER_CHANGE', {source: s, players: gameState.players});
        gameState.timeouts.PLAYER_CHANGE = false;
      }).bind(this, socket.playerId), TIC);
    }
  });
});