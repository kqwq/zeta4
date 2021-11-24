

import serverCommands from "../commands/server.js"
import { RoomManager } from "./roomManager.js"
import { FileManager } from "./fileManager.js"

let peers = []
let roomManager = new RoomManager()
let fileManager = new FileManager()

/**
 * 
 * @param {*} denoProcess 
 * @param {*} recipient 
 * @param {*} message 
 */
function clientToDeno(room, recipient, message) {
  room?.denoProcess.stdin.write("@" + recipient + " " + message + "\n");
}


class Peer {
  constructor(uid, peer, ipInfo) {
    peers.push(this)
    this.uid = uid;
    this.peer = peer;
    this.room = null;
    this.ipInfo = ipInfo;

    // Change on-data event
    this.peer.removeAllListeners('data')
    this.peer.on('data', (data) => this.onData(data));
  }

  send(data) {
    this.peer.send(data);
  }

  async onData(data) {
    // Log data
    data = data.toString()
    fileManager.log(this.uid, data)

    // Find command
    var commandName, args, cmd;
    if (data.startsWith('^')) { // Caret command (to deno process)
      ///console.log("Caret command", data, this.room?.repr(), !!this.room?.denoProcess);
      clientToDeno(this.room, this.uid, data.slice(1));
      return
    } else if (data.startsWith('!')) { // Band command (to server)
      data = data.slice(1);
      [commandName, args] = data.split(/ (.+)/s)
      cmd = serverCommands.find(x => x.name == commandName) // Global commands takes priority over game commands
      if (!cmd) {
        this.send(`unknown-command ${commandName} ${args}`)
        return
      }
    } 

    // Execute command
    try {
      if (cmd) await cmd.exec(args, this, peers, roomManager, fileManager)
    } catch (e) {
      console.log(`There was an error executing the command: ${commandName}`)
      console.log(e)
      fileManager.logError(this.uid, e)
    }
  }
}

export { Peer }

