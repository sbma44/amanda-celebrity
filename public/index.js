const React = require('react');
const ReactDOM = require('react-dom');
const hat = require('hat');
const io = require('socket.io-client');

class Lobby extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      name: this.props.player.name,
      teamId: this.props.player.teamId,
      clues: [],
      ready: false
    };

    this.handleNameChange = this.handleNameChange.bind(this);
    this.handleClueSubmit = this.handleClueSubmit.bind(this);
    this.deleteClue = this.deleteClue.bind(this);
    this.handleReadyChange = this.handleReadyChange.bind(this);
    this.handlePlayerTeamChange = this.handlePlayerTeamChange.bind(this);
  }

  handlePlayerTeamChange(event) {
    this.props.onPlayerTeamChange(event.target.value);
    this.setState({teamId: event.target.value});
  }

  handleNameChange(event) {
    this.props.onNameChange(event.target.value);
    this.setState({name: event.target.value});
  }

  handleClueSubmit(event) {
    event.preventDefault();
    if (event.target.clue.value.trim().length === 0)
      return;
    const clues = this.state.clues.slice();
    clues.push({ clueId: hat(), clue: event.target.clue.value.trim(), playerId: this.props.player.playerId });
    this.props.onClueChange(clues);
    this.setState({clues: clues});
    event.target.clue.value = '';
  }

  handleReadyChange(event) {
    const newReady = !this.state.ready;
    this.setState({ ready: newReady });
    this.props.onReady(newReady);
  }

  deleteClue(clueId, event) {
    // no clue deleting if we're ready!
    if (this.state.ready) {
      return event.preventDefault();
    }
    else {
      let clues = this.state.clues.slice().filter((c) => { return c.clueId !== clueId; });
      this.props.onClueChange(clues);
      this.setState({clues: clues});
      event.preventDefault();
    }
  }

  render() {
    return (
      <div>
      <form onSubmit={(e) => { return e.preventDefault(); }}>
        <label>
          Your name:
          <input type="text" value={this.state.name} onChange={this.handleNameChange} disabled={this.state.ready ? 'disabled' : ''}/>
        </label>
        <label>
          Team: {this.props.teams.map((t) => { return <div key={t.teamId}><input type="radio" onChange={this.handlePlayerTeamChange} value={t.teamId} name="teamname" defaultChecked={t.teamId===this.state.teamId} disabled={this.state.ready ? 'disabled' : ''} /> {t.name}</div> }) }
        </label>
      </form>
      <form onSubmit={this.handleClueSubmit}>
        <label>
          Add a clue:
          <input type="text" name="clue" disabled={this.state.ready ? 'disabled' : ''} />
        </label>
        <input type="submit" value="Add" disabled={this.state.ready ? 'disabled' : ''}/>
        <ul>{ this.state.clues
          .filter((c) => { return c.playerId === this.props.player.playerId; })
          .map((c) => { return <li key={c.clueId}>{c.clue} (<a href="#" onClick={this.deleteClue.bind(this, c.clueId)}>x</a>)</li>; })
        } </ul>
        <label>
          Ready?
          <input type="checkbox" onChange={this.handleReadyChange} />
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
      if (!this.props.showClues) {
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
        <h3>{t.name}{this.props.showScore ? '- (' + t.score + ')' : ''}</h3>
        <ul>{
          this.props.players
            .filter((p) => { return p.teamId === t.teamId; })
            .map((p) => { return <li key={p.playerId} className={p.active ? 'player active' : 'player inactive'}>{p.ready ? '✔️' : '⏳'} {p.name}{clueCount[p.playerId]}</li> })
        }</ul>
      </div>
    )});
    return <div className="teamList">{teamOut}</div>;
  }
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      inLobby: true,
      round: 0,
      playerId: localStorage.playerId,
      players: [{
        playerId: localStorage.playerId,
        name: localStorage.playerName,
        teamId: 'team-0' ,
        ready: false,
        active: true
      }],
      teams: [
        {name: 'Red', color: '#ffaaaa', teamId: 'team-0', score: 0},
        {name: 'Blue', color: '#aaaaff', teamId: 'team-1', score: 0}
      ],
      clues: []
    };

    this.onNameChange = this.onNameChange.bind(this);
    this.onClueChange = this.onClueChange.bind(this);
    this.onTurnStart = this.onTurnStart.bind(this);
    this.onWSConnect = this.onWSConnect.bind(this);
    this.onWSDisconnect = this.onWSDisconnect.bind(this);    
    this.onReady = this.onReady.bind(this);
    this.onPlayerTeamChange = this.onPlayerTeamChange.bind(this);
    this.wrapMessage = this.wrapMessage.bind(this);
    this.getPlayer = this.getPlayer.bind(this);

    this.onWSPlayerChange = this.onWSPlayerChange.bind(this)
    this.onWSClueChange = this.onWSClueChange.bind(this);
    this.onWSTeamChange = this.onWSTeamChange.bind(this);

    this.socket = io('http://127.0.0.1:3000');
    this.socket.on('connect', this.onWSConnect);
    this.socket.on('PLAYER_CHANGE', this.onWSPlayerChange);
    this.socket.on('TEAM_CHANGE', this.onWSTeamChange);
    this.socket.on('CLUE_CHANGE', this.onWSClueChange);
    this.socket.on('disconnect', this.onWSDisconnect);
  }

  playerUpdate(players, playerId, field, value) {
    for(let i = 0; i < players.length; i++) {
      if (players[i].playerId === playerId)
        players[i][field] = value;
    }
    return players;
  }

  wrapMessage(message) {
    return { sender: this.state.playerId, message: message };
  }

  getPlayer() {
    return this.state.players.filter((p) => { return p.playerId === this.state.playerId; })[0];
  }

  onNameChange(name) {
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

  onTurnStart() {

  }


  // === WEBSOCKET EVENT HANDLERS ===

  onWSConnect() {
    console.log('connected');
    this.socket.emit('PLAYER_CHANGE', this.wrapMessage(this.getPlayer()));
  }

  onWSPlayerChange(message) {
    const players = this.state.players.slice();

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

    this.setState({ players: players });
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
    Object.keys(message.clues).forEach(clueId => {
      clues.push(message.clues[clueId]);
    });

    // delete any orphaned clues
    clues = clues.filter(c => (incomingClueIds.indexOf(c.clueId) !== -1) || (c.playerId === this.state.playerId));

    this.setState({ clues: clues });
  }

  onWSTeamChange(message) {
    // team count won't change so this one is simpler
    const teams = this.state.teams.slice();

    for(let i = 0; i < teams.length; i++) {
      teams[i] = message.teams[teams[i].teamId];
    }

    this.setState({ teams: teams });
  }

  /*
  ALL_READY
  PLAYER_ADD
  PLAYER_REMOVE
  >PLAYER_CHANGE (name or team or ready)
  >TEAM_CHANGE (score or name)
  >CLUE_CHANGE
  PLAYER_START_TURN
  PLAYER_END_TURN
  ROUND_START
  ROUND_END
  */


  onWSDisconnect() {

  }


  render() {    
    const player = this.state.players.filter((p) => { return p.playerId === this.state.playerId})[0];
    if (this.state.round === 0) {
      return (
        <div className="App">
          <Lobby onNameChange={this.onNameChange} onPlayerTeamChange={this.onPlayerTeamChange} onClueChange={this.onClueChange} onReady={this.onReady} teams={this.state.teams} player={player} />
          <TeamList showClues={true} showScore={false} clues={this.state.clues} teams={this.state.teams} players={this.state.players} />
        </div>
      );
    }
    else {
      return (
        <div className="App">
          <TeamList showClues={false} showScore={true} teams={this.state.teams} players={this.state.players}  />
          {/* <GameBoard /> */}
        </div>
      )
    }
  }
}

localStorage.playerId = localStorage.playerId || hat();
localStorage.playerName = localStorage.playerName || 'no name';

ReactDOM.render(<App />, document.getElementById('root'));