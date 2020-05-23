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
    this.handleClueChange = this.handleClueChange.bind(this);
    this.handleClueSubmit = this.handleClueSubmit.bind(this);
    this.handleReadyChange = this.handleReadyChange.bind(this);
    this.handleTeamChange = this.handleTeamChange.bind(this);
  }

  handleTeamChange(event) {
    this.setState({teamId: event.target.value});
    this.props.onTeamChange(event.target.value);
  }

  handleClueChange(clues) {
    this.props.onClueChange(clues);
  }

  handleNameChange(event) {
    this.props.onNameChange(event.target.value);
    this.setState({name: event.target.value});
  }

  handleClueSubmit(event) {
    if (event.target.clue.value.trim().length === 0)
      return event.preventDefault();
    const clues = this.state.clues.slice();
    clues.push({ clue: event.target.clue.value.trim(), clueId: hat() });
    this.handleClueChange(clues);
    this.setState({clues: clues});
    event.target.clue.value = '';
    event.preventDefault();
  }

  handleReadyChange(event) {
    const newReady = !this.state.ready;
    this.setState({ ready: newReady });
    this.props.onReady(newReady);
  }

  deleteClue(clueId, event) {
    // no clue deleting if we're ready!
    if (this.state.ready)
      return event.preventDefault();

    let clues = this.state.clues.slice().filter((c) => { return c.clueId !== clueId; });
    this.handleClueChange(clues);
    this.setState({clues: clues});
    event.preventDefault();
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
          Team: {this.props.teams.map((t) => { return <div key={t.teamId}><input type="radio" onChange={this.handleTeamChange} value={t.teamId} name="teamname" defaultChecked={t.teamId===this.state.teamId} disabled={this.state.ready ? 'disabled' : ''} /> {t.name}</div> }) }
        </label>
      </form>
      <form onSubmit={this.handleClueSubmit}>
        <label>
          Add a clue:
          <input type="text" name="clue" disabled={this.state.ready ? 'disabled' : ''} />
        </label>
        <input type="submit" value="Add" disabled={this.state.ready ? 'disabled' : ''}/>
        <ul>{ this.state.clues.map((c) => { return <li key={c.clueId}>{c.clue} (<a href="#" onClick={this.deleteClue.bind(this, c.clueId)}>x</a>)</li>; }) } </ul>
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
            .map((p) => { return <li key={p.playerId}>{p.ready ? '✔️' : '⏳'} {p.name}{clueCount[p.playerId]}</li> })
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
        ready: false
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
    this.onWSEvent = this.onWSEvent.bind(this);
    this.onReady = this.onReady.bind(this);
    this.onTeamChange = this.onTeamChange.bind(this);

    this.socket = io('http://127.0.0.1:3000');
    this.socket.on('connect', function(){ console.log('connected'); });
    this.socket.on('event', this.onWSEvent);
    this.socket.on('disconnect', function(){ console.log('disconnected'); });
  }

  playerUpdate(players, playerId, field, value) {
    for(let i = 0; i < players.length; i++) {
      if (players[i].playerId === playerId)
        players[i][field] = value;
    }
    return players;
  }

  onNameChange(name) {
    localStorage.playerName = name;
    this.setState({ players: this.playerUpdate(this.state.players.slice(), this.state.playerId, 'name', name) });
    // @TODO: send ws event
  }

  onTeamChange(teamId) {
    this.setState({ players: this.playerUpdate(this.state.players.slice(), this.state.playerId, 'teamId', teamId) });
    // @TODO: send ws event
  }

  onClueChange(clues) {
    clues = clues.map((c) => { return { clue: c, playerId: this.state.playerId}; });
    this.setState({clues: clues});
    // @TODO: send ws event
  }

  onReady(ready) {
    this.setState({ players: this.playerUpdate(this.state.players.slice(), this.state.playerId, 'ready', ready) });
    // @TODO: send ready signal
  }

  onTurnStart() {

  }

  onWSEvent(data) {
    /*
    ALL_READY
    PLAYER_CHANGE (name or team or ready)
    TEAM_CHANGE (score or name)
    NEW_PLAYER
    LOST_PLAYER
    CLUE_LIST_UPDATE
    PLAYER_START
    PLAYER_END
    ROUND_START
    ROUND_END
    */
  }


  render() {
    const player = this.state.players.filter((p) => { return p.playerId === this.state.playerId})[0];

    let content;
    if (this.state.inLobby) {
      content = (
        <div>
          <Lobby onNameChange={this.onNameChange} onTeamChange={this.onTeamChange} onClueChange={this.onClueChange} onReady={this.onReady} teams={this.state.teams} player={player} />
          <TeamList showClues={true} showScore={false} clues={this.state.clues} teams={this.state.teams} players={this.state.players} />
        </div>
      );
    }
    else {
      content = (
        <div>
          <TeamList showClues={false} showScore={true} teams={this.state.teams} players={this.state.players}  />
        </div>
      )
    }
    return (
      <div className="App">
        { content }
      </div>
    );
  }
}

localStorage.playerId = localStorage.playerId || hat();
localStorage.playerName = localStorage.playerName || 'no name';

ReactDOM.render(<App />, document.getElementById('root'));
