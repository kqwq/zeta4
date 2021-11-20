

import serverCommands from "../commands/server.js"

let peers = []
let games;

class Peer {
  constructor(uid, peer) {
    peers.push(this)
    this.uid = uid;
    this.peer = peer;
    this.peer.on('data', this.onData);
    this.playing = null;
  }

  send(data) {
    this.peer.send(data);
  }

  onData(data) {
    data = data.toString()
    console.log("peer.js: onData: data:", data);
    console.log(peers.length, "peers");


    // Find command
    var commandName, args, cmd;
    data = data.toString()
    if (data.startsWith('^')) { // If came from iframe
      // Find game that this peer is playing
      let game = games.find(g => g.name === this.playing)
      if (game) {
        clientToDeno(game.denoProcess, this.uid, data.slice(1))
      } else {
        this.send(`~\x1b[31mPlayer ${this.uid} is not in a project!\x1b[0m\n`)
      }
      return
    }
    if (data.startsWith('!')) { // If command format
      console.log(`s: ${data}`);
      data = data.slice(1);
      [commandName, args] = data.split(/ (.+)/s)
      cmd = serverCommands.find(x => x.name == commandName) // Global commands takes priority over game commands
      if (!cmd) {
        console.log(`Unknown command: ${commandName}`, args)
        this.send(`unknown-command ${commandName} ${args}`)
        return
      }
    } else { // If wildcard format
      args = data
      cmd = serverCommands.find(x => x.name == "*")
    }

    // Execute command
    try {
      cmd.exec(args, this, peers, games)
    } catch (e) {
      console.log(`There was an error executing the command: ${commandName}`)
      console.log(e)
    }
  }
}

export { Peer }

