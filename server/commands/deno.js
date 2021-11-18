let whitelistedDomains = [
  "https://www.khanacademy.org/api/",
  "https://upload.wikimedia.org/",
  "https://wikimedia.org/",
];

import fetch from "node-fetch";

/**
 * In this command list, it is VERY important to send a message beginning with the caret sign (^)
 * to signal the multiverse client to send the message directly to its iframe scope.
 */

function serverToDeno(denoProcess, command, response) {
  denoProcess.stdin.write("@server " + JSON.stringify({ command, response }) + "\n");
}
function clientToDeno(denoProcess, recipient, message) {
  denoProcess.stdin.write("@" + recipient + " " + message + "\n");
}

export default [
  {
    name: '*',
    exec: (args, denoProcess, peers) => {
      // If testing, send gray text to the client
      if (denoProcess.isTesting) {
        // \x07 is shorthand for the bell character, but I'm using it to signal a "\x1b[31m[DEBUG]\x1b[0m " message
        let output = args.split("\n").filter(line => !!line.length).map(line => "\x07" + line).join("\n");
        peers[0].peer.send("~" + output + "\n");
      }
    }
  },
  {
    name: 'room',
    exec: (args, denoProcess) => {
      serverToDeno(denoProcess, 'room', {"empty": true});
    }
  },
  {
    name: 'ping-server',
    exec: (args, denoProcess) => {
      serverToDeno(denoProcess, 'ping-server', "pong");
    }
  },
  {
    name: 'send',
    exec: (args, denoProcess, peers) => {
      let [recipientUid, message] = args.split(/ (.+)/s)
      if (recipientUid.startsWith('@')) {
        recipientUid = recipientUid.slice(1);
      }
      for (let p of peers) {
        if (p?.peer?.send && (p.uid === recipientUid || recipientUid === "everyone")) {
          p.peer.send("^" + message);
        }
      }
    }
  },
  {
    name: 'fetch',
    exec: (args, denoProcess, peers) => {
      let url = args
      for (let domain of whitelistedDomains) {
        // Check if the url is whitelisted
        if (url.startsWith(domain)) {
          // Fetch the url
          fetch(url).then(res => {
            res.text().then(text => {
              // Send the text to the client
              serverToDeno(denoProcess, 'fetch', {
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