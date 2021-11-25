
import Turn from 'node-turn'
import fs from 'fs'
import { createProgram, updateProgram } from './ka_utils.js'
import fetch from 'node-fetch'
import wrtc from 'wrtc'
import Peer from 'simple-peer'

const config = JSON.parse(fs.readFileSync('./storage/config.json'))
let links = [] // array of KALink objects

var guestNumber = 0
function getNextUid() { // returns a unique user id
  function leftPad(num, size) {
    return ('000000000' + num).substr(-size);
  }
  return 'guest-' + leftPad(++guestNumber, 5)
}

class KALinkProgram {
  constructor(linkId) {
    this.linkId = linkId
    this.lastUpdated = new Date(2020, 1, 1)
    this.isUpdateScheduled = false
    this.minUpdateInterval = 1000 * 5 // 10 seconds
  }

  queueLink(link) {
    links.push(link)

    if (!this.isUpdateScheduled) { // If there is no update scheduled, schedule one
      this.isUpdateScheduled = true
      let remainingTime = this.minUpdateInterval - (new Date() - this.lastUpdated)
      setTimeout(() => {
        this.update()
      }, remainingTime)
    }
  }

  async update() {
    // Update schedule
    this.isUpdateScheduled = false
    this.lastUpdated = new Date()

    // Generate new code based on offers
    let signalAnswerList = []
    for (let link of links) {
      signalAnswerList[link.offerLineNumber - 1] = "answer=" + JSON.stringify(link.answer)
    }
    if (signalAnswerList.length == 0) {// If there are no answers, don't update the link program
      return
    }
    let newCode = signalAnswerList.join('\n')
    let existingProgram
    existingProgram = await updateProgram(this.linkId, newCode, "Link4")
    if (existingProgram.status == 404) { // If the Link Program doesn't exit or was deleted, create a new one

      // Create a new program
      let data = await createProgram(newCode)
      this.linkId = data.id.toString()
      console.log(`Created a new Link Program - https://www.khanacademy.org/cs/i/${this.linkId}`)

      // Update config with the program id
      config.link_id = this.linkId
      await fs.writeFile('./storage/config.json', JSON.stringify(config))
    }

    console.log(`Updated Link Program - https://www.khanacademy.org/cs/i/${this.linkId}`)
  }
}
const linkProgram = new KALinkProgram(config.link_id)

class KALink {
  constructor(turnServer, fingerprint, packetLength) {
    links.push(this)
    this.turnServer = turnServer
    this.uid = getNextUid()
    this.peer = null
    this.ipInfo = {}
    this.fingerprint = fingerprint
    this.packetLength = packetLength
    this.packets = []
    this.offerLineNumber = 0 // Line number of the offer in the link program (0-255)
  }

  addPacket(packetIndex, packetContent) {
    if (this.fingerprint == "") return
    this.packets[packetIndex] = packetContent

    // Check if all packets are received
    let allPacketsReceived = true
    for (let i = 0; i < this.packetLength; i++) {
      if (this.packets[i] === undefined) {
        allPacketsReceived = false
        break
      }
    }

    // If all packets are received, create peer connection
    if (allPacketsReceived) {
      let offer = JSON.parse(this.packets.join(''))
      this.offerLineNumber = parseInt(this.fingerprint.slice(0, 2), 16)
      this.fingerprint = "" // Prevent fingerprint from colliding with other links
      this.packets = [] // Free memory
      this.createPeerConnection(offer)
    }
  }

  killSelf() {
    let self = links.find(x => x.uid === this.uid)
    links.splice(links.indexOf(self), 1)
  }

  createPeerConnection(offer) {
    this.peer = new Peer({
      initiator: false,
      trickle: false,
      wrtc,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }]
      },
    })
    this.peer.on('signal', answer => {
      this.answer = answer
      linkProgram.queueLink(this)
    }).on('connect', () => {
      this.turnServer.connectAsPeer(this)
    }).on('close', () => {
      this.killSelf()
      console.log(`Peer closed!`);
    }).on('error', err => {
      console.log(`Peer error!`, err);
    }).on('data', data => {
      console.log("Missing out on " + data)
    })
    this.peer.signal(offer) // Trigger connection

    // Get IP info
    let ipAddress = offer.sdp.match(/(?<=IP4 ).+/gm)[1]
    this.getIpInfo(ipAddress) // Practically, this always finishes before the peer connection is established,
                              // so no need to wait for it to finish
  }

  async getIpInfo(ipAddress) {
    // If ./storage/ipInfo.json doesn't exist, create it
    let ipdbStr
    let ipdbStatus = await fs.promises.stat('./storage/ipdb.json')
    if (!ipdbStatus.isFile()) {
      ipdbStr = '[]'
      fs.writeFileSync('./storage/ipdb.json', '[]')
    } else {
      ipdbStr = await fs.promises.readFile('./storage/ipdb.json')
    }

    // Add IP info to ./storage/ipInfo.json
    let ipdb = JSON.parse(ipdbStr)
    if (ipdb.find(x => x.ip == ipAddress)) { // If the IP is already in the database, use it
      this.ipInfo = ipdb.find(x => x.ip == ipAddress)
    } else {
      let token = process.env.IPINFO_TOKEN
      let res = await fetch(`https://ipinfo.io/${ipAddress}?token=${token}`)
      this.ipInfo = await res.json()

      // Update ipdb.json with date retrieved
      this.ipInfo.date = new Date()
      ipdb.push(this.ipInfo)
      await fs.promises.writeFile('./storage/ipdb.json', JSON.stringify(ipdb, null, 2))
    }
  }
}

// Manages the TURN server
class TurnListener {
  constructor() {
    this.leakLinks = links
    this.server = new Turn({
      authMech: 'long-term',
      credentials: {
        username: "password",
      },
    });
    this.server.onSdpPacket = sdp => this.onSdpPacket(sdp) // Handle SDP packets
    this.guestNumber = 0;
    this.onNewPeerCallback = null
  }

  start() {
    this.server.start();
    console.log('Server started on ' + new Date())
  }

  onSdpPacket(content) {
    try {
      var packetIndex = parseInt(content.slice(0, 1), 16)
      var packetLength = parseInt(content.slice(1, 2), 16)
      var packetFingerprint = content.slice(2, 6)
      var packetContent = content.slice(6)
      var matchingLink = links.find(x => x.fingerprint == packetFingerprint)
    } catch (e) {
      console.log(`Error parsing packet: ${content}`, e);
      return
    }
    if (matchingLink) { // If fingerprint matches a KALink that is waiting for more packets
      matchingLink.addPacket(packetIndex, packetContent)
    } else { // If packet is from a new peer
      let link = new KALink(this, packetFingerprint, packetLength)
      link.addPacket(packetIndex, packetContent)
    }
  }


  /**
   * Callback for when a new peer is created.
   * 
   * @callback onNewPeerCallback
   * @param {string} uid - A unique ID for the peer.
   * @param {Peer} peer - A Peer instance as defined here: https://www.npmjs.com/package/simple-peer
   */

  /**
   * Register a callback to be called when a new peer is connected.
   * 
   * @param {onNewPeerCallback} callback - Callback fired when a new peer is connected.
   * @author Alex
   */
  onNewPeer(callback) {
    this.onNewPeerCallback = callback
  }

  connectAsPeer(link) {
    this.onNewPeerCallback(link.uid, link.peer, link.ipInfo)
  }

}


export { TurnListener }