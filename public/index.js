const React = require('react');
const ReactDOM = require('react-dom');
const hat = require('hat');
const io = require('socket.io-client');

class Lobby extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      name: '',
      clues: [],
      ready: false
    };

    this.handleNameChange = this.handleNameChange.bind(this);
    this.handleClueChange = this.handleClueChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleReadyChange = this.handleReadyChange.bind(this);
  }

  handleClueChange(clues) {
    this.props.onClueChange(clues);
  }

  handleNameChange(event) {
    this.props.onNameChange(event.target.value);
    this.setState({name: event.target.value});
  }

  handleSubmit(event) {
    let clues = this.state.clues.slice();
    clues.push(event.target.clue.value.trim());
    this.handleClueChange(clues);
    this.setState({clues: clues});
    event.target.clue.value = '';
    event.preventDefault();
  }

  handleReadyChange(event) {
    this.setState({ ready: !this.state.ready });
    this.props.onReady(this.state.ready);
  }

  deleteClue(index, event) {
    let clues = this.state.clues.slice();
    if ((index >= 0) && (index < clues.length))
      clues.splice(index, 1);
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
      </form>
      <form onSubmit={this.handleSubmit}>
        <label>
          Add a clue:
          <input type="text" name="clue" disabled={this.state.ready ? 'disabled' : ''} />
        </label>
        <input type="submit" value="Add" disabled={this.state.ready ? 'disabled' : ''}/>
        <ul>{ this.state.clues.map((c, i) => { return <li key={i}>{c} (<a href="#" onClick={this.deleteClue.bind(this, i)}>x</a>)</li>; }) } </ul>
        <label>
          Ready?
          <input type="checkbox" onChange={this.handleReadyChange} />
        </label>
      </form>
      </div>
   );
  }
}

function Player(props) {
  const c = ['player'];
  if (!!props.active) c.push('active');
  if (!!props.ready) c.push('ready');
  return (<div className={ c.join(' ') } key={props.id}>{props.name}</div>);
}

class TeamList extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    const clueCount = {};
    const teams = [];
    teams.push({
      name: this.props.teamNames[0],
      players: []
    });
    teams.push({
      name: this.props.teamNames[1],
      players: []
    });
    this.props.players.forEach((p) => {
      teams[p.team].players.push(p);

      if (!this.props.showClues) {
        clueCount[p.playerId] = '';
      }
      else {
        const playerClues = this.props.clues.filter((c) => { return c.playerId === p.playerId; });
        clueCount[p.playerId] = ' (' + playerClues.length + ' clues)';
      }
    });


    const teamOut = teams.map((t, i) => { return (
      <div key={i}>
        <h3>{t.name}{this.props.score ? '- (' + this.props.score + ')' : ''}</h3>
        <ul>{t.players.map((p) => { return <li key={p.playerId}>{p.name}{clueCount[p.playerId]}</li> })}</ul>
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
      playerId: localStorage.playerId,
      playerName: localStorage.playerName,
      players: [{ playerId: localStorage.playerId, name: 'unnamed', team: 0 }],
      teamNames: ['Red', 'Blue'],
      score: [0, 0],
      clues: [],
      gameState: props.gameState
    };

    this.onNameChange = this.onNameChange.bind(this);
    this.onClueChange = this.onClueChange.bind(this);
    this.onTurnStart = this.onTurnStart.bind(this);
    this.onWSEvent = this.onWSEvent.bind(this);
    this.onReady = this.onReady.bind(this);

    this.socket = io('http://127.0.0.1:3000');
    this.socket.on('connect', function(){ console.log('connected'); });
    this.socket.on('event', this.onWSEvent);
    this.socket.on('disconnect', function(){ console.log('disconnected'); });
  }

  onNameChange(name) {
    localStorage.playerName = name;
    const players = this.state.players.slice();
    for(let i = 0; i < players.length; i++) {
      if (players[i].playerId === this.state.playerId)
        players[i].name = name;
    }
    this.setState({ players: players, playerName: name});
    // @TODO: send ws event
  }

  onClueChange(clues) {
    clues = clues.map((c) => { return { clue: c, playerId: this.state.playerId}; });
    this.setState({clues: clues});
    // @TODO: send ws event
  }

  onTurnStart() {

  }

  onWSEvent(data) {
    /*
    ALL_READY
    PLAYER_NAME_CHANGE
    TEAM_NAME_CHANGE
    NEW_PLAYER
    LOST_PLAYER
    CLUE_LIST_UPDATE
    PLAYER_START
    PLAYER_END
    ROUND_START
    ROUND_END
    SCORE_CHANGE
    */
  }

  onReady() {
    // @TODO: send ready status
  }

  render() {
    let content;
    if (this.state.inLobby) {
      content = (
        <div>
          <Lobby onNameChange={this.onNameChange} onClueChange={this.onClueChange} onReady={this.onReady} />
          <TeamList showClues={true} clues={this.state.clues} teamNames={this.state.teamNames} score={false} players={this.state.players} />
        </div>
      );
    }
    else {
      content = (
        <div>
          <TeamList showClues={false} teamNames={this.state.teamNames} players={this.state.players} score={this.state.score} />
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
