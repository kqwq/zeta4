

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
    exec: (args, denoProcess, peerContext) => {
      // Check if peer has a denoProcess
      for (const p of peerContext) {
        if (p.denoProcess) {
          p.peer.send(`~${args}`);
        }
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
        if (true||p.uid === recipientUid) {
          p.peer.send("^" + message);
          return
        }
      }
    }
  },


]