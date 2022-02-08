

/* This library should be included after:

 <script src="https://cdnjs.cloudflare.com/ajax/libs/simple-peer/9.11.0/simplepeer.min.js"><   script>

 */

window.metaverseDoubleInstance = false;
class MetaverseClient {
  constructor(statusCallback, serverConnectedCallback, onRecieveCallback, alternativeServerIp, alternativeLinkId) {
    if (window.metaverseDoubleInstance) {
      throw new Error("Only one instance of MetaverseClient is allowed");
    }
    window.metaverseDoubleInstance = true;
    this.statusCallback = statusCallback;
    this.serverConnectedCallback = serverConnectedCallback;
    this.onRecieve = onRecieveCallback;
    this.serverIp = alternativeServerIp || "198.251.74.16"
    this.linkId = alternativeLinkId || "5918360080531456"
    this.randomFingerprint = Math.random().toString(16).substring(2, 6)
    // Create 4-byte fingerprint and use that as answer line number
    this.answerLineNumber = parseInt(this.randomFingerprint.slice(0, 2), 16)
    this.peer = null
    this.isConnected = false

    this.connectionAttemptsMax = 6
    this.connectionAttempts = 0
  }

  connectToServer() {
    let that = this
    parent?.peer?.destroy()
    this.peer = new SimplePeer({
      initiator: true,
      trickle: false,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }]
      },
    }).on("signal", function (data) {
      console.log("%cCopy for manual input", "background: #000; font-size: x-large")
      console.log("%c" + "SDP_" + that.randomFingerprint + "_" + btoa(data.sdp), 'background: #000; color: #00ff00')
      that.statusCallback('Connecting...')
      that.sendSdpPackets(JSON.stringify(data))
    }).on("connect", function () {
      that.isConnected = true
      that.serverConnectedCallback()
    }).on("data", function (data) {
      that.onRecieve(data.toString())
    }).on("close", function () {
      that.isConnected = false
      that.statusCallback("Disconnected")
    }).on("error", function (err) {
      that.statusCallback("Error - open console")
      console.log("error", err)
    })
    parent.peer = this.peer
  }

  send(strContent) {
    if (this.isConnected) {
      this.peer.send(strContent)
    }
  }

  sendSdpPackets(content) {
    // PACKET FORMAT: 37cfa9{"type":"offer","sdp":"v=0\r\no...
    /** Breakdown
     *  - (1 char)    packet index (3=4th packet in hex)
     *  - (1 char)    number of packets (7=8 in hex), in case packets are received out of order
     *  - (4 chars)   packet fingerprint/identifier (example: cfa9)
     *  - (494 chars) packet content
     * 
     * In technical terms this has nothing to do with a network packet
     */
    let hex = "0123456789abcdef"
    let packetSize = 494
    if (content.length >= packetSize * 16) {
      this.statusCallback("SDP offer too long to send")
      console.error("SDP offer too long")
      return
    }

    // Split up sdp data into up to 16 packets
    let packets = []
    for (let i = 0; i < content.length; i += packetSize) {
      packets.push(content.substr(i, packetSize))
    }

    // Send packets with header and index
    for (let i = 0; i < packets.length; i++) {
      let packet = hex[i] + hex[packets.length] + this.randomFingerprint + packets[i]
      this.sendToTurnServer(packet)
    }
    console.log(`Sent ${packets.length} packets with fingerprint ${this.randomFingerprint}`)
    setTimeout(() => {
      this.attemptConnection()
    }, 2000)
  }


  sendToTurnServer(content) {
    const pc = new RTCPeerConnection({
      iceServers: [{
        urls: [`turn:${this.serverIp}:3478`],
        username: content,
        credential: "1"
      }],
      iceCandidatePoolSize: 1
    })
    setTimeout(() => pc.close(), 1000)
  }


  attemptConnection() {
    this.statusCallback(`Connecting (${this.connectionAttempts}/${this.connectionAttemptsMax})`)
    console.log('Attempting to connect...');
    let url = `https://www.khanacademy.org/api/internal/scratchpads/${this.linkId}?callback=?`
    let that = this
    $.getJSON(url, data => {
      if (data == null) {
        this.statusCallback("Link Program deleted - contact Squishy.")
        console.error("Connection error: Link Program was likely deleted. Please contact Squishy.")
        return
      }
      let linkProgramCode = data.revision.code.split('\n')
      let linkLastUpdated = new Date(data.revision.created)
      let nowDate = new Date()
      let diff = nowDate - linkLastUpdated
      let diffSeconds = Math.floor(diff / 1000)
      let diffHours = Math.floor(diff / (1000 * 60 * 60))

      // Detect a signal answer to my offer

      let serverOffer = linkProgramCode[this.answerLineNumber - 1]
      if (!serverOffer || !serverOffer.includes('answer=')) {
        this.connectionAttempts++
        if (this.connectionAttempts > this.connectionAttemptsMax) {
          this.statusElement.textContent = "Server offline - contact Squishy."
          console.error("Connection error: Link Program is unresponsive. Please contact Squishy.")
          return
        }
        setTimeout(() => {
          this.attemptConnection()
        }, 1000) // Wait 1 second and try again
        return
      }

      serverOffer = serverOffer.split(/\=(.+)/)[1] // Remove offerAnswer=
      this.peer.signal(serverOffer)
    })
  }

}

window.enableSuperAPIs() = function () {
  let client = new MetaverseClient((x) => {console.log(x)}, () => console.log("Connected to server"), (x) => console.log(x))
  client.connectToServer()
  ///parent.client = client// figure this out later, do not reload stuff on KA


  window.fetch_ = window.api = function (input) {
    return new Promise(function (resolve, reject) {
      client.send("!fetch " + input)
      client.onRecieve = function (msg) {
        // Get everything after the second space
        let space2Ind = msg.indexOf(" ", msg.indexOf(" ") + 1)
        let result = msg.substr(space2Ind + 1)
        resolve(JSON.parse(result))
      }
    })
  }

}

window.MetaverseClient = MetaverseClient