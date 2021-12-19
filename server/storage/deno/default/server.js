import { readLines } from "https://deno.land/std@0.76.0/io/bufio.ts";

// Send data to clilent
function sendTo(recipient, data, raw) {
  console.log(`!send ${recipient} ${raw ? data : JSON.stringify(data)}`);
}

// Send command to server
function sendCommand(commandName, data) {
  console.log(`! ${commandName} ${data ? JSON.stringify(data) : ""}`);
}

// Persistent storage
const serverStorage = { // Limit 10 items, 100KB each
  getItem:    (key)        => console.log(`!get-item ${key}`),
  setItem:    (key, value) => console.log(`!set-item ${key} ${value}`),
  removeItem: (key)        => console.log(`!remove-item ${key}`),
  clear:      ()           => console.log(`!clear-items`)
}

// Variables
let players = [];

// Get data from server and connected clients
function onInput(sender, message) {
  console.log(sender, message); // Print to stdout for debugging
  if (sender === "server") { // Handle server commands
    let { command, response } = JSON.parse(message);
    switch (command) {
      case "player-join":
        players.push(response)
        break;

      case "player-leave":
        players.splice(players.indexOf(response), 1);
        break;

      case "get-item":
        break;

      default:
        console.log(`Unrecognized server command ${command}`);
    }
  } else { // Handle player messages
    sendTo("everyone", message, true); // (Optional) Broadcast to everyone
  }
}

console.log("Running");
for await (let msg of readLines(Deno.stdin)) onInput(...msg.split(/ (.+)/s));