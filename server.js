const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 3000;

const TIC = 100;

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
var round = 0;
var whoseTurnIsIt = null;
var activeClue = null;

io.on('connection', function (socket) {

  // on connection, catch the user up (players unnecessary; client initiates that event to share its data)
  const roundState = { source: null, round: round };
  if (whoseTurnIsIt)
    roundState.whoseTurnIsIt = whoseTurnIsIt;
  socket.emit('ROUND_SET', roundState);
  socket.emit('TEAM_CHANGE', { source: null, teams: teams });
  socket.emit('CLUE_CHANGE', { source: null, clues: clues });
  socket.emit('PLAYER_CHANGE', { source: null, players: players });

  socket.on('PLAYER_CHANGE', (data) => {
    const sender = data.sender;
    const player = data.message;
    socket.playerId = player.playerId;
    players[player.playerId] = player;
    players[player.playerId].lastSeen = +new Date();

    // @TODO: move this to a setInterval task
    // prune inactive players
    const deleteMe = [];
    Object.keys(players).forEach(playerId => {
      if (!players[playerId].active && (players[playerId].lastSeen < (+new Date() - (5 * 60 * 1000))))
        delete players[playerId];
    });
    deleteMe.forEach(playerId => {
      delete players[playerId];
    });

    if (!timeouts.PLAYER_CHANGE) {
      setTimeout(((s) => {
        // if everyone's ready, increment the round and start the game!
        if ((round === 0) && (Object.keys(players).every(p => players[p].ready))) {
          // mark all clues as unused
          Object.keys(clues).forEach(clueId => {
            clues[clueId].count = 0;
          });
          round = 1;

          // initial player should be first player from team 0
          const data = {source: s, round: round};
          if (Object.keys(teams).length > 0) {
            const firstTeam = Object.keys(teams).sort()[0];
            const wtii = Object.values(players).filter(p => p.teamId === firstTeam).sort((a, b) => a.playerId < b.playerId)[0];
            if (wtii) {
              whoseTurnIsIt = wtii.playerId;
              data.whoseTurnIsIt = whoseTurnIsIt;
              data.activeClue = activeClue;
            }
          }
          io.emit('ROUND_SET', data);
        }

        io.emit('PLAYER_CHANGE', { source: s, players: players });
        timeouts.PLAYER_CHANGE = false;
      }).bind(this, sender), TIC);
    }
  });

  socket.on('TEAM_CHANGE', (data) => {
    const sender = data.sender;
    data.message.forEach(t => {
      teams[t.teamId] = t;
      teams[t.teamId].lastSeen = +new Date();
    });
    if (!timeouts.TEAM_CHANGE) {
      setTimeout(((s) => {
        io.emit('TEAM_CHANGE', { source: s, teams: teams });
        timeouts.TEAM_CHANGE = false;
      }).bind(this, sender), TIC);
    }
  });

  socket.on('CLUE_CHANGE', (data) => {
    // no clue changes after the lobby phase
    if (round > 0)
      return;

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

  socket.on('START_TURN', (data) => {
    const playerId = data.sender;
    // pick next clue
  });

  socket.on('NEXT_CLUE', (data) => {
    const sender = data.sender;
    const gotIt = data.message;
    if (gotIt) {
      // score for team, send team update
    }
    // pick next clue
  });

  socket.on('SKIP_TURN', (data) => {
    // find next player on the same turn and set whoseTurnIsIt to them, update w/ ROUND_SET
    const playerId = data.sender;
    const eligiblePlayerIds = Object.values(players)
      .filter(p => p.teamId === players[playerId].teamId)
      .map(p => p.playerId)
      .sort((a, b) => a < b)

    const currentidx = eligiblePlayerIds.indexOf(playerId);
    if (currentidx >= 0) {
      whoseTurnIsIt = eligiblePlayerIds[(currentidx + 1) % eligiblePlayerIds.length];
      activeClue = null;
      io.emit('ROUND_SET', {round: round, whoseTurnIsIt: whoseTurnIsIt, activeClue: activeClue});
    }
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (players[socket.playerId])
      players[socket.playerId].active = false;
    if (!timeouts.PLAYER_CHANGE) {
      setTimeout(((s) => {
        io.emit('PLAYER_CHANGE', { source: s, players: players });
        timeouts.PLAYER_CHANGE = false;
      }).bind(this, socket.playerId), TIC);
    }
  });
});