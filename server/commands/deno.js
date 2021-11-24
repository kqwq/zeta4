let whitelistedDomains = [
  "https://www.khanacademy.org/api/",
  "https://upload.wikimedia.org/",
  "https://wikimedia.org/",
];

import fetch from "node-fetch";

/**
 * In this command list, it is VERY important to send a message beginning with the caret sign (^)
 * to signal the multiverse client to send the message directly to its iframe scope.
 * 
 * All commands are annomous, so you can't know who sent the command.
 */

function sendToDenoProcess(room, command, response) {
  room.denoProcess.stdin.write("@server " + JSON.stringify({ command, response }) + "\n");
}
function clientToDeno(room, recipient, message) {
  room.denoProcess.stdin.write("@" + recipient + " " + message + "\n");
}
function sendToClient(recipientPeer, message) {
  recipientPeer.send(`^${message}`);
}

export default [
  // exec (args, room) {
  {
    name: '*',
    exec: (args, room) => {
      // If testing, send gray text to the client
      if (room.isMaintenance) {
        // \x07 is shorthand for the bell character, but I'm using it to signal a "\x1b[31m[DEBUG]\x1b[0m " message
        let output = args.split("\n").filter(line => !!line.length).map(line => "\x07" + line).join("\n");
        room.sendToTerminal(output)
      }
    }
  },
  {
    name: 'room',
    exec: (args, room) => {
      sendToDenoProcess(room, 'room', room.repr());
    }
  },
  {
    name: 'ping',
    exec: (args, room) => {
      sendToDenoProcess(room, 'ping', "pong");
    }
  },
  {
    /**
     * This command is used to send a message to a specific player.
     * The message is sent to the client's iframe scope.
     * Format is "^<recipient> <message>"
     * Special recipient options:
     * - "all" | "everyone" sends the message to everyone
     * - "all-except-me" sends the message to all players except the sender
     * - "all-except-<uid>" sends the message to all players except the player with the specified uid
     * - "random" sends the message to a random player
     * - "random-except-me" sends the message to a random player except the sender
     * - "random-except-<uid>" sends the message to a random player except the player with the specified uid
     */
    name: 'send',
    exec: (args, room) => {
      let [recipientUid, message] = args.split(/ (.+)/s)
      if (recipientUid.startsWith('@')) {
        recipientUid = recipientUid.slice(1);
      }
      if (recipientUid == "me") {
        sendToClient(peer, message);
      } else if (recipientUid === "all" || recipientUid === "everyone") {
        room.players.forEach(p => {
          sendToClient(p, message);
        });
      } else if (recipientUid === "all-except-me") {
        room.players.forEach(p => {
          if (p.uid !== peer.uid) {
            sendToClient(p, message);
          }
        });
      } else if (recipientUid.startsWith("all-except-")) {
        let specifiedUid = recipientUid.slice(10);
        room.players.forEach(p => {
          if (p.uid !== specifiedUid) {
            sendToClient(p, message);
          }
        });
      } 
      // else if (recipientUid === "random") {
      //   let randomPlayer = rm.players[Math.floor(Math.random() * rm.players.length)];
      //   sendToClient(peer, randomPlayer, message);
      // } else if (recipientUid === "random-except-me") {
      //   let randomPlayer = [...rm.players].filter(p => p.uid !== peer.uid)[Math.floor(Math.random() * rm.players.length)];
      //   sendToClient(peer, randomPlayer, message);
      // } else if (recipientUid.startsWith("random-except-")) {
      //   let specifiedUid = recipientUid.slice(15);
      //   let randomPlayer = [...rm.players].filter(p => p.uid !== specifiedUid)[Math.floor(Math.random() * rm.players.length)];
      //   sendToClient(peer, randomPlayer, message);
      // } 
      else {
        let recipient = rm.getPlayerByUid(recipientUid);
        if (recipient) {
          sendToClient(recipient, message);
        } else {
          sendToDenoProcess(room, 'send', `Could not find player with uid ${recipientUid}`);
        }
      }
    }
  },
  {
    name: 'fetch',
    exec: (args, peer, rm) => {
      let url = args
      for (let domain of whitelistedDomains) {
        // Check if the url is whitelisted
        if (url.startsWith(domain)) {
          // Fetch the url
          fetch(url).then(res => {
            res.text().then(text => {
              // Send the text to the client
              sendToDenoProcess(denoProcess, 'fetch', {
                text: text,
                url: url,
                status: res.status,
                statusText: res.statusText
              });
            });
          });
          return
        }
      }
    }

  }


]