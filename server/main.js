

import { TurnListener } from "./components/connector.js"
import { Peer, pingLoop } from "./components/peer.js"

// Start TURN server
let turnListner = new TurnListener()
turnListner.start()

// Pipe Peer object from connector.js to peer.js
turnListner.onNewPeer((uid, peer, ipInfo) => {
  console.log("New peer connected:", uid, ipInfo.ip)
  new Peer(uid, peer, ipInfo)
})
 
// Start ping loop
  console.log("bruh")
pingLoop()