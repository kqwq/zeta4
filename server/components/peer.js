import serverCommands from "../commands/server.js"
import { RoomManager } from "./roomManager.js"
import { FileManager } from "./fileManager.js"

let peers = []
let fileManager = new FileManager()
let roomManager = new RoomManager()

/**
 * 
 * @param {*} denoProcess 
 * @param {*} recipient 
 * @param {*} message 
 */
function clientToDeno(room, recipient, message) {
  room?.denoProcess.stdin.write(recipient + " " + message + "\n");
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

    // Change on-close event
    this.peer.removeAllListeners('close')
    this.peer.on('close', () => this.onClose());

    // Update globe data if needed
    if (ipInfo.isNewIpAddress) {
      fileManager.cacheGlobeData()
    }
  }

  send(data) {
    if (this.peer.destroyed) return
    this.peer.send(data);
  }

  async onData(data) {
    // Log data
    data = data.toString()

    // Find command
    var commandName, args, cmd;
    if (data.startsWith('^')) { // Caret command (to deno process)
      ///console.log("Caret command", data, this.room?.repr(), !!this.room?.denoProcess);
      clientToDeno(this.room, this.uid, data.slice(1));
      return
    } else if (data.startsWith('!')) { // Band command (to server)
      fileManager.log(this.uid, data)
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
      fileManager.log(this.uid, e)
    }
  }

  async onClose() {
    this.room?.removePlayer(this);
    console.log(`Peer closed!`);
    peers = peers.filter(x => x != this) /// change to peers.splice(peers.indexOf(this), 1) ??
  }
}

export { Peer }

