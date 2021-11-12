function sendToTurnServer(content) {
  content = content.substr(0, 500).trim()
  const pc = new RTCPeerConnection({
    iceServers: [{
      urls: ["turn:turn.willard.fun"],
      username: content,
      credential: "1"
    }],
    iceCandidatePoolSize: 1
  })
  // Close the connection to free memory
  setTimeout(() => pc.close(), 1000)
}
