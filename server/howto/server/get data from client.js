import { readLines } from "https://deno.land/std@0.76.0/io/bufio.ts";
(async() => {
    for await (let msg of readLines(Deno.stdin)) onInput( ...msg.split(/ (.+)/s) );
})()

function onInput(sender, message) {
    var data = JSON.parse(message);
    // Handle data from client
}