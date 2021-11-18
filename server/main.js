import Turn from 'node-turn'
import fs, { existsSync } from 'fs'
import { createProgram, updateProgram } from './ka_utils.js'
import fetch from 'node-fetch'
import wrtc from 'wrtc'
import Peer from 'simple-peer'
import dotenv from 'dotenv'
import serverCommands from "./commands/server.js"

// config.json tools
dotenv.config()
function editConfig(key, value) {
  let config = JSON.parse(fs.readFileSync('config.json'))
  config[key] = value
  fs.writeFileSync('config.json', JSON.stringify(config, null, 2))
}
function getConfig(key) {
  let config = JSON.parse(fs.readFileSync('config.json'))
  return config[key]
}

// atob
function atob(str) {
  return Buffer.from(str, 'base64').toString('binary')
}

// ipdb.json tools
if (!existsSync('ipdb.json')) {
  fs.writeFileSync('ipdb.json', JSON.stringify([], null, 2))
}

// uid tools
let guestNumber = 0;
function leftPad(num, size){  
  return ('000000000' + num).substr(-size); 
}


// schema name: peerContext
let peers = [
  // {
  //   uid: "guest-12345", // Unique user id
  //   ipInfo: {...}, // Includes ip address, geolocation, etc
  //   connectionStep: 0, // (0=not connected, 1=connecting, 2=answered, 3=fully connected)
  //   offerLineNumber: offerLineNumber, // Line number of the offer answer
  //   peer: Peer,
  //   offer: {...}, // Signal offer from client
  //   answer: {...}, // Signal answer from server
  //   playing: "among-us-proj" // Currently playing
  //
  //   /* Temporary */
  //   _packetsFingerprint: "cf9a", // Fingerprint of the packets received
  //   _packets: [ // Array of offer packets received
  //     {
  //       index: 3, // Index of the offer packet (0-15, not hex)
  //       content: "...", // Up to 494 characters long
  //     }
  //   ],
  //   _packetsLength: 5,
  // }
]

// schema name: gameContext
let games = [
  // {
  //   name: "among-us-proj",
  //   players: [ "guest-12345", "squishypill" ], // Array of player uids
  //   denoProcess: DenoProcess, // Deno process
  //   started: Date, // Date the game started
  // }
]

// Manual input
var manualInputUsed = false
fs.watchFile('ManualInput.txt', (curr, prev) => {
  let parts = fs.readFileSync('ManualInput.txt').toString().split('_')
  if (parts?.[0] == 'SDP') {
    fs.writeFileSync('ManualInput.txt', 'READ')
    let peer = {
      connectionStep: 1,
      _packetsFingerprint: parts[1],
      _packets: [{
        index: 0,
        content: JSON.stringify({
          type: "offer",
          sdp: atob(parts[2]),
        })
      }],
      _packetsLength: 1
    }
    manualInputUsed = true
    peers.push(peer)
    createNewPeer(peer)
  }
})

// Handle client-to-deno data transfer
function clientToDeno(denoProcess, recipient, message) {
  denoProcess.stdin.write("@" + recipient + " " + message + "\n");
}

async function createNewPeer(peerContext) {

  // Generate a peer
  let peer = new Peer({
    initiator: false,
    trickle: false,
    wrtc,
  })
  peer.on('signal', answer => {
    console.log(`Sending answer to ${peerContext?.ipInfo?.ip}`);
    peerContext.connectionStep = 2
    peerContext.answer = answer
    updateLinkProgram()
  }).on('connect', () => {
    peerContext.peer = peer
    console.log(`Peer connected!`);
    peerContext.connectionStep = 3
    guestNumber++
    peerContext.uid = "guest-" + leftPad(guestNumber, 5)
    // onPeerConnect(peer, peers)
  }).on('data', data => {

    // Find command
    var commandName, args, cmd;
    data = data.toString()
    if (data.startsWith('^')) { // If came from iframe
      // Search games for peerContet with same uid
      let game = games.find(g => g.name === peerContext.playing)
      if (game) {
        clientToDeno(game.denoProcess, peerContext.uid, data.slice(1))
      } else {
        peerContext.peer.send(`~\x1b[31mPlayer ${peerContext.uid} is not in a project!\x1b[0m\n`)
      }
      return
    }
    if (data.startsWith('!')) { // If command format
      console.log(`Received command from meta: ${data}`);
      data = data.slice(1);
      [ commandName, args ] = data.split(/ (.+)/s)
      cmd = serverCommands.find(x => x.name == commandName) // Global commands takes priority over game commands
      if (!cmd) {
        console.log(`Unknown command: ${commandName}`, args)
        peerContext.peer.send(`unknown-command ${commandName} ${args}`)
        return
      }
    } else { // If wildcard format
      args = data
      cmd = serverCommands.find(x => x.name == "*")
    }

    // Execute command
    try {
      cmd.exec(args, peerContext, peers, games)
    } catch (e) {
      console.log(`There was an error executing the command: ${commandName}`)
      console.log(e)
    }

  }).on('close', () => {
    let ind = peers.findIndex(x => x.peer == peer)
    if (ind != -1) {
      peers.splice(ind, 1)
    }
    console.log(`Peer #${ind} closed!`);
  }).on('error', err => {
    console.log(`Peer error!`, err);
    peer.destroy()
  })

  // Stitch together the offer packets
  peerContext.connectionStep = 1
  let sortedPackets = peerContext._packets.sort((a, b) => a.index - b.index)
  let offer = JSON.parse(sortedPackets.map(x => x.content).join(''))
  peerContext.offer = offer
  peerContext.offerLineNumber = parseInt(peerContext._packetsFingerprint.slice(0, 2), 16) // Line number of the answer in the link program (0-255)
  peerContext.playing = null
  peer.signal(offer) // Trigger connection

  // Get IP info
  let ipAddress = offer.sdp.match(/(?<=IP4 ).+/gm)[1]
  lookupIpInfo(ipAddress, peerContext)
}

async function lookupIpInfo(ipAddress, peerContext) {
  let ipdb = JSON.parse(fs.readFileSync('ipdb.json'))
  if (ipdb.find(x => x.ip == ipAddress)) { // If the IP is already in the database, use it
    peerContext.ipInfo = ipdb.find(x => x.ip == ipAddress)
  } else {
    let token = process.env.IPINFO_TOKEN
    let res = await fetch(`https://ipinfo.io/${ipAddress}?token=${token}`)
    let ipInfoRes = await res.json()

    // Add to peerData
    peerContext.ipInfo = ipInfoRes

    // Add to ipdb
    ipInfoRes.date = new Date()
    ipdb.push(ipInfoRes)
    fs.writeFileSync('ipdb.json', JSON.stringify(ipdb, null, 2))
  }
}


// update interval
var linkUpdateInterval = process.env.LINK_UPDATE_INTERVAL // in seconds
var lastUpdate = new Date()
var firstUpdate = true
async function updateLinkProgram() {
  let currentTime = new Date()
  let timeDiffSeconds = (currentTime - lastUpdate) / 1000
  if (!firstUpdate && timeDiffSeconds < linkUpdateInterval) { // If the time difference is less than the update interval, don't update
    return
  }

  // Generate new code based on offers
  let signalAnswerList = []
  for (let i = 0; i < peers.length; i++) {
    let peerObj = peers[i]
    if (peerObj.connectionStep == 2) {
      peerObj.connectionStep = 2.5
      signalAnswerList[peerObj.offerLineNumber - 1] = "answer=" + JSON.stringify(peerObj.answer)
    }
  }
  if (signalAnswerList.length == 0) {// If there are no answers, don't update the link program
    return
  }
  lastUpdate = currentTime // Changes detected, so update the last update time
  firstUpdate = false
  let newCode = signalAnswerList.join('\n')

  // Create link program
  let linkId = getConfig('link_id')
  let existingProgram
  if (linkId) {
    existingProgram = await updateProgram(linkId, newCode, "Link4")
  }
  if (!linkId || existingProgram.status == 404) {

    // Create a new program
    let data = await createProgram(newCode, "Link2")
    linkId = data.id.toString()
    console.log(`Created program ${linkId}`)

    // Update config with the program id
    editConfig('link_id', linkId)
  }

  console.log(`Done updating link - https://www.khanacademy.org/cs/i/${linkId}`)
}

// TURN server setup
var server = new Turn({
  authMech: 'long-term',
  credentials: {
    username: "password",
  },
});
server.start();
server.onSdpPacket = function (content) {
  console.log('onSdpPacket', content.slice(0, 40) + '...');

  try {
    var packetIndex = parseInt(content.slice(0, 1), 16)
    var packetLength = parseInt(content.slice(1, 2), 16)
    var packetFingerprint = content.slice(2, 6)
    var packetContent = content.slice(6)
    var peerContext = peers.find(x => x._packetsFingerprint == packetFingerprint)
  } catch (e) {
    console.log(`Error parsing packet: ${content}`, e);
    return
  }
  if (packetContent.connectionStep > 0) {
    console.log("Already connected... ")
    console.log("fingerprint: " + packetFingerprint)
    return
  }
  if (peerContext) { // If fingerprint matches a peer that is waiting for more packets
    // Check if index is already in _packets
    let existingPacket = peerContext._packets.find(y => y.index == packetIndex)
    if (existingPacket) {
      console.log('Duplicate packet!', existingPacket.index, packetIndex)
      return
    }
    peerContext._packets.push({
      index: packetIndex,
      content: packetContent,
    })
  } else { // If packet is from a new peer

    peers.push({
      connectionStep: 0,
      _packetsFingerprint: packetFingerprint,
      _packets: [{
        index: packetIndex,
        content: packetContent
      }],
      _packetsLength: packetLength
    })
  }  
  // If all packets have been received, create a new peer
  if (peerContext._packets.length >= packetLength) {
    createNewPeer(peerContext)
  }
}

// Main loop
setInterval(() => {
  if (new Date() - lastUpdate > 1000 * 60 * 5) {
    updateLinkProgram()
  }
}, process.env.LINK_UPDATE_INTERVAL) // Check for new spinoffs every 5 seconds (active) or 20 seconds (inactive)


console.log('Server started on ' + new Date())