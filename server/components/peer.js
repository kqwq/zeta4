import serverCommands from "../commands/server.js"
import { RoomManager } from "./roomManager.js"
import { FileManager } from "./fileManager.js"

let peers = []
let fileManager = new FileManager()
let roomManager = new RoomManager(fileManager)

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
    this.lastCaretCommand = new Date(0);

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

    // Ping loop
    this.awaitingPing = false;
  }

  send(data) {
    if (this.peer.destroyed) return
    this.peer.send(data);
  }

  async onData(data) {
    data = data.toString()

    console.log("Received:", data)
    
    // Find command
    var commandName, args, cmd;
    if (data.startsWith('^')) { // Caret command (to deno process)
      let dateNow = new Date()
      if (dateNow - this.lastCaretCommand > 1000 * 60) {
        this.lastCaretCommand = dateNow
        fileManager.log(this.uid, data) // Log caret command in 60+ second intervals
      }
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

function pingEachPeer() {
  peers.forEach(peer => {
    if (peer.awaitingPing) {
      console.log("Peer is still awaiting ping, disconnecting...", peers.length)
      peer?.peer?.destroy()
    } else {
      peer.awaitingPing = true
      peer.send('ping')
    }
  })
}

function pingLoop() {
  return;

  // DO NOT ENFFORCE YET, WAIT FOR CDNJS TO UPDATE
  setInterval(pingEachPeer, 1000 * 5) // Ping each peer every 5 seconds
}

export { Peer, pingLoop }

