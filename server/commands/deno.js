let whitelistedDomains = [
  "https://www.khanacademy.org/api/",
  "https://upload.wikimedia.org/",
  "https://wikimedia.org/",
];

import fetch from "node-fetch";
import fs from "fs";

/**
 * In this command list, it is VERY important to send a message beginning with the caret sign (^)
 * to signal the multiverse client to send the message directly to its iframe scope.
 * 
 * All commands are annomous, so you can't know who sent the command.
 */

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
      room.sendToDenoProcess('room', room.repr());
    }
  },
  {
    name: 'ping',
    exec: (args, room) => {
      room.sendToDenoProcess('ping', "pong");
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
        let recipient = room.getPlayerByUid(recipientUid);
        if (recipient) {
          sendToClient(recipient, message);
        } else {
          room.sendToDenoProcess('send', `Could not find player with uid ${recipientUid}`);
        }
      }
    }
  },
  {
    name: 'fetch',
    exec: (args, room) => {
      let url = args
      for (let domain of whitelistedDomains) {
        // Check if the url is whitelisted
        if (url.startsWith(domain)) {
          // Fetch the url
          fetch(url).then(res => {
            res.text().then(text => {
              // Send the text to the client
              room.sendToDenoProcess('fetch', {
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

  },
  {
    name: 'set-item',
    exec: (args, room) => {
      let [item, value] = args.split(/ (.+)/s);
      room.setItem(item, value);
    }
  },
  {
    name: 'get-item',
    exec: (args, room) => {
      let [item] = args.split(/ (.+)/s);
      room.sendToDenoProcess('get-item', room.getItem(item));
    }
  },
  {
    name: 'get-howto-list',
    exec: async(args, room) => {
      // List of files under the "howto" folder
      let clientFiles = await fs.promises.readdir("./howto/client");
      let serverFiles = await fs.promises.readdir("./howto/server");
      let files = [...clientFiles.map(f => `client/${f}`), ...serverFiles.map(f => `server/${f}`)];

      // Get the file names
      room.sendToDenoProcess('get-howto-list', files);
    }
  },
  {
    name: 'get-howto',
    exec: (args, room) => {
      (async () => {
        // Get the file name, remove newline, prevent directory traversal
        let fileName = args.replace(/\n/g, "").replace(/\.\./g, "");
        let code
        try {
          code = await fs.promises.readFile(`./howto/${fileName}`, 'utf8');
        } catch (e) {
          room.sendToDenoProcess('get-howto', `Could not find file ${fileName}`);
          return
        }
        room.sendToDenoProcess('get-howto', {
          fileName: fileName,
          code: code
        });
      })();
    }
  },


]