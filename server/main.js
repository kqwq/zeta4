

import { TurnListener } from "./components/connector.js"
import { Peer } from "./components/peer.js"

let turnListner = new TurnListener()

turnListner.start()

// Pipe Peer object from ./connector.js to ./peer.js
turnListner.onNewPeer((peer, uid) => {
  new Peer(peer, uid)
})
 