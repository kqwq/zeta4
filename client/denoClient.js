function send(data) {
  postMessage(data);
}

function onReceive(callback) {
  addEventListener("message", function (event) {
    callback(event.data);
  });
}