const React = require('react');
const ReactDOM = require('react-dom');
const hat = require('hat');
const io = require('socket.io-client');

const testMode = /fresh-user-(\d)/;

class Lobby extends React.Component {
  constructor(props) {
    super(props);

    this.handleNameChange = this.handleNameChange.bind(this);
    this.handleClueSubmit = this.handleClueSubmit.bind(this);
    this.deleteClue = this.deleteClue.bind(this);
    this.handleReadyChange = this.handleReadyChange.bind(this);
    this.handlePlayerTeamChange = this.handlePlayerTeamChange.bind(this);
  }

  handlePlayerTeamChange(event) {
    this.props.onPlayerTeamChange(event.target.value);
  }

  handleNameChange(event) {
    this.props.onNameChange(event.target.value);
  }

  handleClueSubmit(event) {
    event.preventDefault();
    const clueText = event.target.clue.value.trim();
    if (event.target.clue.value.trim().length === 0)
      return;
    event.target.clue.value = '';
    const clues = this.props.clues.slice();
    // no duplicates! (from the same person (unless they make a minor textual alteration))
    if (clues.filter(c => (c.playerId === this.props.player.playerId)).map(c => c.clue).indexOf(clueText) !== -1)
      return;
    clues.push({ clueId: hat(), clue: clueText, playerId: this.props.player.playerId });
    this.props.onClueChange(clues);
  }

  handleReadyChange(event) {
    const newReady = !this.props.player.ready;

    // confirm if we're staring at game start
    if (newReady && this.props.players.every(p => (p.playerId === this.props.player.playerId) || p.ready))
      if (!window.confirm('Everyone else is ready! Clicking ok will start the game.'))
        return event.preventDefault();

    this.props.onReady(newReady);
  }

  deleteClue(clueId, event) {
    // no clue deleting if we're ready!
    if (this.props.player.ready) {
      return event.preventDefault();
    }
    else {
      let clues = this.props.clues.slice().filter((c) => { return c.clueId !== clueId; });
      this.props.onClueChange(clues);
      event.preventDefault();
    }
  }

  render() {
    return (
      <div>
      <form onSubmit={(e) => { return e.preventDefault(); }}>
        <label>
          Your name:
          <input type="text" value={this.props.player.name} onChange={this.handleNameChange} disabled={this.props.player.ready ? 'disabled' : ''}/>
        </label>
        <label>
          Team: {this.props.teams.map((t) => {
            return (<div key={t.teamId}>
              <input type="radio" onChange={this.handlePlayerTeamChange} value={t.teamId} name="teamname" checked={t.teamId===this.props.player.teamId} disabled={this.props.player.ready ? 'disabled' : ''} /> {t.name}
              </div>);
            }) }
        </label>
      </form>
      <form onSubmit={this.handleClueSubmit}>
        <label>
          Add a clue:
          <input type="text" name="clue" disabled={this.props.player.ready ? 'disabled' : ''} />
        </label>
        <input type="submit" value="Add" disabled={this.props.player.ready ? 'disabled' : ''}/>
        <ul>{ this.props.clues
          .filter((c) => { return c.playerId === this.props.player.playerId; })
          .map((c) => { return <li key={c.clueId}>{c.clue} (<a href="#" onClick={this.deleteClue.bind(this, c.clueId)}>x</a>)</li>; })
        } </ul>
        <label>
          Ready?
          <input type="checkbox" onChange={this.handleReadyChange} checked={this.props.player.ready}/>
        </label>
      </form>
      </div>
   );
  }
}

class TeamList extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    const clueCount = {};
    this.props.players.forEach((p) => {
      if (this.props.round > 0) {
        clueCount[p.playerId] = '';
      }
      else {
        const playerClues = this.props.clues.filter((c) => { return c.playerId === p.playerId; });
        clueCount[p.playerId] = ' (' + playerClues.length + ' clues)';
      }
    });

    const teamOut = this.props.teams.map((t) => {
      return (
      <div key={t.teamId}>
        <h3>{t.name}{this.props.round > 0 ? ` - ${t.score}` : ''}</h3>
        <ul>{
          this.props.players
            .filter((p) => { return p.teamId === t.teamId; })
            .sort((a, b) => a.playerId < b.playerId)
            .map((p) => {
              const cls = ['player', `round-${this.props.round}`, p.active ? 'active' : 'inactive'];
              if (this.props.whoseTurnIsIt && this.props.whoseTurnIsIt === p.playerId)
                cls.push('its-their-turn');
              return (<li key={p.playerId} className={cls.join(' ')}>
                <span className="readiness">{p.ready ? '✔️' : '⏳'} </span>{p.name}{clueCount[p.playerId]}
              </li>);
            })
        }</ul>
      </div>
    )});
    return <div className="teamList">{teamOut}</div>;
  }
}

class GameBoard extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      skips: this.props.skips,
      timerStart: null,
      remaining: 0
    };

    this.scoreClue = this.scoreClue.bind(this);
    this.skipClue = this.skipClue.bind(this);
    this.startTurn = this.startTurn.bind(this);
  }

  componentWillUnmount() {
    if(this.timer)
      clearInterval(this.timer);
  }

  scoreClue() {
    this.props.nextClue(true);
  }

  skipClue() {
    let skips = this.state.skips;
    if (skips > 0) {
      this.props.nextClue(false);
      this.setState({skips: skips - 1});
    }
  }

  startTurn() {
    this.props.startTurn(this.startTimer.bind(this));
  }

  startTimer() {
    console.log('startTimer fired');
    this.setState({ timerStart: +new Date() });
    this.timer = setInterval(this.tick.bind(this), 100);
  }

  tick() {
    let remaining = Math.max(0, 60 - ((+new Date() - this.state.timerStart) / 1000.0));
    this.setState({remaining: remaining});
    if (remaining === 0) {
      clearInterval(this.timer);
      this.props.endTurn();
    }
  }

  render() {
    let whoseTurnIsIt = this.props.whoseTurnIsIt && this.props.players.filter(p => p.playerId === this.props.whoseTurnIsIt);
    whoseTurnIsIt = whoseTurnIsIt && whoseTurnIsIt.length > 0 ? `${whoseTurnIsIt[0].name}'s turn` : 'idk whose turn it is';
    const clue = this.props.activeClueId ? this.props.clues.filter(c => (c.clueId === this.props.activeClueId))[0] : false;
    const remainingSkips = `skip (${this.state.skips} remain)`;
    if (this.props.whoseTurnIsIt === this.props.playerId) {
      if (clue) {
        return (<div>
          <div id="timer">{this.state.remaining.toFixed(1)}</div>
          <div id="clue">{clue.clue}</div>
          <div>
            <input type="button" value="GOT IT" onClick={this.scoreClue} />
            <input type="button" value={remainingSkips} onClick={this.skipClue} disabled={this.state.skips > 0 ? '' : 'disabled'} />
          </div>
        </div>);
      }
      else {
        return (<div>
          <h2>It's your turn!</h2>
          <input type="button" value="START TURN" onClick={this.startTurn} />
          <input type="button" value="Skip me" onClick={this.props.skipTurn} />
        </div>);
      }
    }
    else {
      return <div>{whoseTurnIsIt}</div>;
    }
  }
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      inLobby: true,
      round: 0,
      whoseTurnIsIt: null,
      activeClueId: null,
      playerId: window.playerId,
      players: [{
        playerId: window.playerId,
        name: window.playerName,
        teamId: 'team-0',
        ready: false,
        active: true,
        turn: 0
      }],
      teams: [],
      clues: [],
      heartbeat: false
    };

    // convenience
    this.wrapMessage = this.wrapMessage.bind(this);
    this.getPlayer = this.getPlayer.bind(this);

    // lobby
    this.onNameChange = this.onNameChange.bind(this);
    this.onClueChange = this.onClueChange.bind(this);
    this.onWSConnect = this.onWSConnect.bind(this);
    this.onWSDisconnect = this.onWSDisconnect.bind(this);
    this.onReady = this.onReady.bind(this);
    this.onPlayerTeamChange = this.onPlayerTeamChange.bind(this);

    // gameboard
    this.nextClue = this.nextClue.bind(this);
    this.startTurn = this.startTurn.bind(this);
    this.endTurn = this.endTurn.bind(this);
    this.skipTurn = this.skipTurn.bind(this);

    // ws
    this.socket = io('http://127.0.0.1:3000');
    this.socket.on('connect', this.onWSConnect);
    this.socket.on('disconnect', this.onWSDisconnect);
    this.onWSInit = this.onWSInit.bind(this);
    this.socket.on('INIT', this.onWSInit);
    this.onWSPlayerChange = this.onWSPlayerChange.bind(this)
    this.socket.on('PLAYER_CHANGE', this.onWSPlayerChange);
    this.onWSClueChange = this.onWSClueChange.bind(this);
    this.socket.on('CLUE_CHANGE', this.onWSClueChange);
    this.onWSTeamChange = this.onWSTeamChange.bind(this);
    this.socket.on('TEAM_CHANGE', this.onWSTeamChange);
    this.onWSRoundSet = this.onWSRoundSet.bind(this);
    this.socket.on('ROUND_SET', this.onWSRoundSet);
  }

  componentWillUnmount() {
    if (this.heartbeat)
      clearInterval(this.heartbeat);
  }

  playerUpdate(players, playerId, field, value) {
    for(let i = 0; i < players.length; i++) {
      if (players[i].playerId === playerId)
        players[i][field] = value;
    }
    return players;
  }

  wrapMessage(message) {
    return { sender: this.state.playerId, message: message || null };
  }

  getPlayer() {
    const p = this.state.players.filter((p) => { return p.playerId === this.state.playerId; });
    if (p && p.length > 0) {
      p[0].active = true; // always mark ourselves active
      return p[0];
    }
    else {
      return null;
    }
  }

  onNameChange(name) {
    if (!testMode.test(location.href))
      localStorage.playerName = name;
    this.setState({ players: this.playerUpdate(this.state.players.slice(), this.state.playerId, 'name', name) });
    this.socket.emit('PLAYER_CHANGE', this.wrapMessage(this.getPlayer()));
  }

  onPlayerTeamChange(teamId) {
    this.setState({ players: this.playerUpdate(this.state.players.slice(), this.state.playerId, 'teamId', teamId) });
    this.socket.emit('PLAYER_CHANGE', this.wrapMessage(this.getPlayer()));
  }

  onClueChange(clues) {
    // don't touch other players' clues; keep our own if IDs still present
    const survivingPlayerClueIds = clues.map(c => c.clueId);
    const newClues = this.state.clues.filter((c) => {
      return (c.playerId !== this.state.playerId) || (survivingPlayerClueIds.indexOf(c.clueId) !== -1);
    });
    // add any new ones
    const newClueIds = newClues.map(c => c.clueId);
    clues.forEach((c) => {
      if (newClueIds.indexOf(c.clueId) === -1)
        newClues.push(c);
    });
    this.setState({clues: newClues});
    this.socket.emit('CLUE_CHANGE', this.wrapMessage(newClues));
  }

  onReady(ready) {
    this.setState({ players: this.playerUpdate(this.state.players.slice(), this.state.playerId, 'ready', ready) });
    this.socket.emit('PLAYER_CHANGE', this.wrapMessage(this.getPlayer()));
  }

  startTurn(callback) {
    this.startTurnCallback = callback;
    this.socket.emit('START_TURN', this.wrapMessage());
  }

  endTurn() {
    this.socket.emit('END_TURN', this.wrapMessage());
  }

  nextClue(gotIt) {
    this.socket.emit('NEXT_CLUE', this.wrapMessage({gotIt: gotIt, clueId: this.state.activeClueId}));
  }

  skipTurn() {
    this.socket.emit('SKIP_TURN', this.wrapMessage());
  }

  // === WEBSOCKET EVENT HANDLERS ===

  onWSConnect() {
    this.socket.emit('HELLO', this.wrapMessage());
    let hb = (() => { this.socket.emit('HEARTBEAT', this.wrapMessage())}).bind(this);
    this.heartbeat = setInterval(hb, 2000);
  }

  onWSInit(gameState) {
    const newState = {
      round: gameState.round,
      whoseTurnIsIt: gameState.whoseTurnIsIt,
      activeClueId: gameState.activeClueId,
      clues: Object.values(gameState.clues),
      teams: Object.values(gameState.teams),
      players: Object.values(gameState.players)
    };

    // add ourselves if the server doesn't yet have us
    if (!gameState.players[this.state.playerId]) {
      const player = this.getPlayer();
      if (player) {
        newState.players.push(player)
        this.socket.emit('PLAYER_CHANGE', this.wrapMessage(player));
      }
    }

    this.setState(newState);
  }

  onWSPlayerChange(message) {
    let players = this.state.players.slice();

    // delete any pruned players (except ourselves)
    const pruned = Object.values(message.players).filter(p => p.playerId !== this.state.playerId && p.prune).map(p => p.playerId);

    // overwrite current player list with what we received by matching IDs
    for(let i = 0; i < players.length; i++) {
      if (message.players[players[i].playerId]) {
        const playerId = players[i].playerId;
        players[i] = message.players[playerId];
        delete message.players[playerId];
      }
    }
    // add unmatched players
    Object.keys(message.players).forEach(playerId => {
      players.push(message.players[playerId]);
    });

    // prune & sort
    players = players
      .filter(p => pruned.indexOf(p.playerId) === -1)
      .sort((a, b) => a.playerId < b.playerId);

    console.log('===onWSPlayerChange===', message, JSON.stringify(players, null, 2));

    // sort players
    this.setState({players: players});
  }

  onWSClueChange(message) {
    let clues = this.state.clues.slice();

    const incomingClueIds = Object.keys(message.clues);

    // overwrite current clue list by ID
    for(let i = 0; i < clues.length; i++) {
      if (message.clues[clues[i].clueId]) {
        const clueId = clues[i].clueId;
        clues[i] = message.clues[clueId];
        delete message.clues[clueId];
      }
    }

    // add unmatched clues
    Object.values(message.clues).forEach(clue => {
      clues.push(clue);
    });

    // delete any orphaned clues
    clues = clues.filter(c => (incomingClueIds.indexOf(c.clueId) !== -1) || (c.playerId === this.state.playerId));

    this.setState({clues: clues});
  }

  onWSRoundSet(message) {
    console.log('got ROUND_SET');
    const lastRound = this.state.round;
    console.log(message);
    this.setState(message);

    // call the timer start upon receipt of the clue change
    if (this.startTurnCallback) {
      console.log('firing callback');
      this.startTurnCallback();
      this.startTurnCallback = false;
    }

    // @TODO: trigger animation on round change
    // if (newState.round !== lastRound) {
    // }
  }

  onWSTeamChange(message) {
    // check for an empty message; if there is one, share our teams
    if (Object.keys(message.teams).length === 0) {
      this.socket.emit('TEAM_CHANGE', this.wrapMessage(this.state.teams));
    }
    else {
      // otherwise use the server data
      // team count won't change so this one is simpler
      const teams = this.state.teams.slice();
      for(let i = 0; i < teams.length; i++) {
        teams[i] = message.teams[teams[i].teamId] || teams[i];
      }
      this.setState({teams: teams});
    }
  }

  onWSDisconnect() {

  }

  render() {
    if (this.state.round === 0) {
      return (
        <div className="App">
          <Lobby onNameChange={this.onNameChange} onPlayerTeamChange={this.onPlayerTeamChange} onClueChange={this.onClueChange} onReady={this.onReady} teams={this.state.teams} player={this.getPlayer()} clues={this.state.clues} players={this.state.players} />
          <TeamList round={this.state.round} clues={this.state.clues} teams={this.state.teams} players={this.state.players} />
        </div>
      );
    }
    else {
      return (
        <div className="App">
          <TeamList round={this.state.round} teams={this.state.teams} players={this.state.players} whoseTurnIsIt={this.state.whoseTurnIsIt} />
          <GameBoard
            players={this.state.players}
            playerId={this.state.playerId}
            clues={this.state.clues}
            round={this.state.round}
            whoseTurnIsIt={this.state.whoseTurnIsIt}
            activeClueId={this.state.activeClueId}
            skips={3 - this.state.round}
            startTurn={this.startTurn}
            endTurn={this.endTurn}
            nextClue={this.nextClue}
            skipTurn={this.skipTurn}
            />
        </div>
      )
    }
  }
}

// annoying title animation
const ANIMATION_INTERVAL = 500;
let offset = 0;
const annoyingWindowAnimation = window.setInterval(() => {
  let title = 'CELEBRITY';
  offset = (offset + 1) % title.length;
  document.title = title.slice(0, offset) + '_' + title.slice(offset + 1);
}, ANIMATION_INTERVAL);

// test users
const names = 'Kriston Amanda Spencer Sommer Yglz Brian Jeff'.split(' ');
if (testMode.test(location.href)) {
  window.playerName = names[parseInt(location.href.match(testMode)[1])];
  window.playerId = window.playerName;
}
else {
  localStorage.playerId = localStorage.playerId || hat();
  localStorage.playerName = localStorage.playerName || 'no name';
  window.playerId = localStorage.playerId;
  window.playerName = localStorage.playerName;
}

ReactDOM.render(<App />, document.getElementById('root'));