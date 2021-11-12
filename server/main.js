import Turn from 'node-turn'
import fs, { existsSync } from 'fs'
import { createProgram, updateProgram } from './ka_utils.js'
import fetch from 'node-fetch'
import wrtc from 'wrtc'
import Peer from 'simple-peer'
import dotenv from 'dotenv'
import globalCommands from "./_global.js"

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

// schema name: peerContext
let peers = [
  // {
  //   ipInfo: {...}, // Includes ip address, geolocation, etc
  //   connectionStep: 0, // (0=not connected, 1=connecting, 2=answered, 3=fully connected)
  //   offerLineNumber: offerLineNumber, // Line number of the offer answer
  //   peer: Peer,
  //   offer: {...}, // Signal offer from client
  //   answer: {...}, // Signal answer from server
  //   game: {
  //     GAME_NAME: "amongUs",
  //     ... // Optionally use this space for player specific data
  //   },
  //
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

// Game commands
var gameCommands = []
function changeGame(gameName, peerContext) {
  (async () => {
    try {
      let res = await import(`./games/${gameName}.js`)
      gameCommands = res.default
      console.log(gameCommands);
      peerContext.peer.send(`game-change-sucess ${gameName}`)
      console.log(`Game changed to ${gameName}`)
    } catch (e) {
      peerContext.peer.send(`unknown-game ${gameName}`)
      console.error(`Unknown game ${gameName}`)
    }
  })();
}

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
    // onPeerConnect(peer, peers)
  }).on('data', data => {

    // Find command
    var commandName, commandArgs, cmd;
    data = data.toString()
    if (data?.[0] == '^') {
      peerContext?.denoProcess?.stdin?.write(data.slice(1) + '\n')
      return
    }
    if (data.startsWith('!')) { // If command format
      if (data.includes(' ')) {
        commandName = data.substring(1, data.indexOf(' '))  // Remove the !
        commandArgs = data.substring(data.indexOf(' ') + 1) // String after the first space
      } else {
        commandName = data.substring(1)
        commandArgs = ""
      }
      cmd = globalCommands.find(x => x.name == commandName) // Global commands takes priority over game commands
      if (!cmd) {
        cmd = gameCommands.find(x => x.name == commandName)
      }
      if (!cmd) {
        if (commandName == 'change-game') {
          changeGame(commandArgs, peerContext)
          return
        }
        console.log(`Unknown command: ${commandName}`)
        peerContext.peer.send(`unknown-command ${commandName}`)
        return
      }
    } else { // If wildcard format
      commandArgs = data
      cmd = gameCommands.find(x => x.name == '*') // Game wildcard takes priority over global wildcard
      if (!cmd) {
        cmd = globalCommands.find(x => x.name == "*")
      }
    }

    // Execute command
    try {
      cmd.exec(commandArgs, peerContext, peers)
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
  peerContext.game = {}
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