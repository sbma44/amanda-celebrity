const React = require('react');
const ReactDOM = require('react-dom');
const hat = require('hat');

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

  handleClueChange() {
    this.props.onClueChange(this.state.clues);
  }

  handleNameChange(event) {
    this.props.onNameChange(event.target.value);
    this.setState({name: event.target.value});
  }

  handleSubmit(event) {
    let clues = this.state.clues.slice();
    clues.push(event.target.clue.value.trim());
    this.setState({clues: clues});
    this.handleClueChange();
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
    this.setState({clues: clues});
    this.handleClueChange();
    event.preventDefault();
  }

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <label>
          Your name:
          <input type="text" value={this.state.name} onChange={this.handleNameChange} disabled={this.state.ready ? 'disabled' : ''}/>
        </label>
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
    this.props.score = this.props.score || false;
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
    this.props.players.forEach(p => {
      teams[p.team].push(p);

      if (!this.props.showClues)
        clueCount[p.playerId] = '';
      else
        clueCount[p.playerId] = '(' + this.props.clues.filter(c => c.playerId === p.playerId).length + ')';
    });

    return teams.map((t, i) => {(
      <div>
        <h3>{t.name}{this.props.score ? '- (' + this.props.score[i] + ')' : ''}</h3>
        <ul>{t.players.map(p => { <li key={p.playerId}>{p.name}{clueCount[p.playerId]}</li> })}</ul>
      </div>
    )});
  }
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      inLobby: true,
      playerId: localStorage.playerId,
      playerName: localStorage.playerName,
      players: [{ id: localStorage.playerId, name: '', team: 0 }],
      teamNames: ['Red', 'Blue'],
      clues: [],
      gameState: props.gameState
    };
    
    this.onNameChange = this.onNameChange.bind(this);
    this.onClueChange = this.onClueChange.bind(this);
    this.onTurnStart = this.onTurnStart.bind(this);
    this.onWSEvent = this.onWSEvent.bind(this);
    this.onReady = this.onReady.bind(this);
  }

  onNameChange(name) {
    localStorage.playerName = name;
    this.setState({playerName: name});
    // @TODO: send ws event
  }

  onClueChange(clues) {
    clues = clues.map((c) => { return { clue: c, playerId: this.state.playerId}; });
    this.setState({clues: clues});
    // @TODO: send ws event
  }

  onTurnStart() {

  }

  onWSEvent() {
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
    if (this.state.inLobby) 
      content = (
        <div>
          <Lobby onNameChange={this.onNameChange} onClueChange={this.onClueChange} onReady={this.onReady} />
          <TeamList showClues={true} clues={this.state.clues} teamNames={this.state.teamNames} players={this.state.players} />
        </div>
      );
    else
      content = (
        <div>
          <TeamList showClues={false} teamNames={this.state.teamNames} players={this.state.players} score={this.state.score} />
        </div>
      )
      content = this.props.gameState.teams.map(t => <Team id={t.id} name={t.name} players={t.players} key={t.id} />);

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