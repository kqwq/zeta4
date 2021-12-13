import denoCommands from "../commands/deno.js"
import { spawn } from "child_process";
import fs from "fs";

const hidePersonalFilename = (filename) => {
  return filename.replace(/file:\/\/\/C:\/Users\/Student\/Code\/KA2\/zeta4\/server\/deno\//g, '')
}

class Room {
  constructor(roomManager, name, isMaintenance, players, maxPlayers) {
    this.id = roomManager.getNextRoomId();
    this.roomManager = roomManager;
    this.name = name;
    this.isMaintenance = isMaintenance || false;
    this.players = [];
    this.maxPlayers = maxPlayers || Infinity;
    this.denoProcess = null;
    this.scriptOutput = ""; // The output of the script. Limit is 50,000 characters per 6 seconds
    this.lastActivity = Date.now();
    this.startServer()
    this.addPlayers(players);
  }

  sendToDenoProcess(command, response) {
    if (!this.denoProcess) return
    this.denoProcess.stdin.write("server " + JSON.stringify({ command, response }) + "\n");
  }

  onDenoData(dataLines) {
    for (let data of dataLines.split("\n")) {
      if (data.length === 0) continue
      var cmd, args, commandName;
      if (data.startsWith("!")) {
        data = data.slice(1);
        [ commandName, args ] = data.split(/ (.+)/s)
        commandName = commandName.replace(/\n/g, '')
        args = args || "";
        cmd = denoCommands.find(x => x.name == commandName)
      } else {
        args = data
        cmd = denoCommands.find(x => x.name == "*")
      }
      if (cmd) {
        try {
          cmd.exec(args, this) // args, room
        } catch (e) {
          this.sendToTerminal(`There was an error executing the command: ${commandName}`)
          this.sendToTerminal(e)
        }
      } else {
        this.sendToTerminal("\x1b[31mUnknown command: " + commandName + "\x1B[0m")
      }
    }
  }

  appendToScriptOutput(data) {
    let dateNow = Date.now()
    let timeSinceLastActivity = dateNow - this.lastActivity
    if (timeSinceLastActivity > 6000) {
      this.scriptOutput = ""
      this.lastActivity = dateNow
    }
    this.scriptOutput += data
    if (this.scriptOutput.length > 50000) { // If program is spamming the terminal, shut it down
      for (let peer of this.players) {
        peer.send("alert Internal error: Deno process is spamming the terminal. Shutting down.")
      }
      this.removeAllPlayers()
      this.sendToTerminal("\x1b[31mDeno process killed due to excessive output\x1B[0m")
    }
  }

  sendToTerminal(message) {
    if (this.isMaintenance) {
      let firstPlayer = this.players?.[0]
      if (firstPlayer) {
        this.players[0]?.send("~" + message + "\n")
      }
    }
  }

  startServer() {
    // Create instance of Deno
    let that = this;
    let denoPath = "./storage/deno"
    let projectName = this.name
    let denoProjPath = `${denoPath}/${projectName}`
    let child = spawn('deno', ['run', '--v8-flags=--max-old-space-size=256', `${denoProjPath}/server.js`])
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', function (data) {
      let str = data.toString()
      // that.appendToScriptOutput(str) // Detect spamming (disabled because shared-canvas uses a ton of data)
      that.onDenoData(str);
    });
    child.stderr.on('data', function (err) {
      if (that.isMaintenance) {
        let str = err.toString()
        let firstPlayer = that.players[0]
        that.appendToScriptOutput(str)
        firstPlayer.send("~" + hidePersonalFilename(str))
      }
    });
    child.on('close', function (code) {
      if (that.isMaintenance) {
        let firstPlayer = that.players[0]
        if (firstPlayer) {
          firstPlayer.send(`~Process finished with exit code ${code}\n`)
          firstPlayer.send(`deno-terminal-end ${code}`)
        }
      }
      that.removeAllPlayers()
    });
    child.on('error', function (err) {
      console.log(err)
    });

    // Add the game to the list of games
    this.denoProcess = child;

    // Look up max players
    (async () => {
      let res = await fs.promises.readFile(`${denoProjPath}/info.json`, 'utf8')
      this.maxPlayers = JSON.parse(res).maxPlayers || Infinity
    })()
  }

  getPlayerByUid(uid) {
    return this.players.find(p => p.uid == uid)
  }

  addPlayer(player) {
    player.room = this;
    this.players.push(player);
    this.sendToDenoProcess("player-join", player.uid);
    ///this.sendToTerminal(`\x1b[31m${player.uid} has joined the room\x1B[0m`)
  }

  addPlayers(players) {
    for (let player of players) {
      this.addPlayer(player);
    }
  }

  removePlayer(player) {
    if (!player.peer.destroyed) {
      player.send("leave-room")
    }
    this.sendToDenoProcess("player-leave", player.uid);
    ///this.sendToTerminal(`\x1b[31m${player.uid} left the room\x1B[0m`)
    player.room = null;
    this.players.splice(this.players.indexOf(player), 1);
    if (this.players.length === 0) {
      if (this.isMaintenance) {
        player.send("deno-terminal-end 1")
      }
      this.killDenoProcess()
      this.removeSelf()
    }
  }

  removeAllPlayers() {
    this.players.forEach(p => this.removePlayer(p))
  }

  killDenoProcess() {
    this.denoProcess?.kill()
  }

  removeSelf() {
    this.roomManager.rooms.splice(this.roomManager.rooms.indexOf(this), 1);
  }

  repr() {
    return {
      id: this.id,
      name: this.name,
      isMaintenance: this.isMaintenance,
      players: this.players.map(p => p.uid),
      maxPlayers: this.maxPlayers,
    }
  }

}


class RoomManager {
  constructor() {
    this.rooms = []
    this.nextRoomId = 0
  }

  /**
   * Get the room id of the next room created by this.createRoom().
   * @param {bool} doNotInrement - If true, the next room id will not be incremented. 
   * @returns Room id
   */
  getNextRoomId(doNotInrement) {
    if (doNotInrement) return "room-" + this.nextRoomId
    return "room-" + this.nextRoomId++
  }

  /**
   * Create a new room with the project name and players. If maintenance is true, the room will be in maintenance mode. This means other players cannot join.
   * @param {string} projectName 
   * @param {bool} isMaintenance 
   * @param {Peer[]} players 
   * @returns The room created or false if the room is in maintenance mode.
   */
  createRoom(projectName, isMaintenance, players, maxPlayers) {
    if (isMaintenance) {
      // If the game is in maintenance mode, remove all rooms with the same name
      this.removeRooms(projectName)
    } else {
      // If there is a room with the same name and it is not in maintenance mode, prevent the room from being created
      if (this.getRooms(projectName).filter(r => !r.isMaintenance).length > 0) {
        return false
      }
    }
    let room = new Room(this, projectName, isMaintenance, players, maxPlayers)
    this.rooms.push(room)
    return room
  }

  /**
   * Return a list of rooms with the project name.
   * @param {string} projectName 
   * @returns {Room[]}
   */
  getRooms(projectName) {
    return this.rooms.filter(r => r.name === projectName)
  }

  /**
   * Remove all rooms with the project name.
   * @param {string} projectName 
   */
  removeRooms(projectName) {
    for (let i = 0; i < this.rooms.length; i++) {
      if (this.rooms[i].name === projectName) {
        this.rooms[i].removeAllPlayers() // Automatically kills the deno process and removes itself from this.rooms
        i--;
      }
    }
  }

  

  /**
   * Remove player from their current room.
   * @param {Peer} player 
   */
  removePlayer(player) {
    player.playing?.removePlayer(player)
    player.playing = null
  }

  /**
   * Add player to the room with the project name, if it exists.
   *  If a room doesn't exist, create it.
   *  If all rooms are full, create a new room.
   * @param {Peer} player 
   * @param {string} projectName 
   */
  addPlayer(player, projectName) {
    let rooms = this.getRooms(projectName).filter(r => !r.isMaintenance)
    if (rooms.length === 0) { // If no room exists, create one
      this.createRoom(projectName, false, [player])
    } else {
      for (let room of rooms) {
        if (room.players.length < room.maxPlayers) {
          room.addPlayer(player)
          return
        }
      }
      this.createRoom(projectName, false, [player])
    }
  }

  repr() {
    return {
      rooms: this.rooms.map(r => r.repr()),
      nextRoomId: this.nextRoomId
    }
  }
}


export { RoomManager }