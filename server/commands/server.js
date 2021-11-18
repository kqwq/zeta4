import { findFlagUrlByIso2Code } from 'country-flags-svg'
import { getAllTimezones, getCountry, getTimezone } from 'countries-and-timezones';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import { promises as fs } from "fs";
import { timingSafeEqual } from 'crypto';
import fetch from 'node-fetch';
import denoCommands from './deno.js';

dotenv.config();

const hidePersonalFilename = (filename) => {
  return filename.replace(/file:\/\/\/C:\/Users\/Student\/Code\/KA2\/zeta4\/server\/deno\//g, '')
}

let starterServerJSCode = `console.log('Hello world!');`;
let starterClientHtmlCode = (name) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
</head>
<body>
    <h1>${name}</h1>
    <p>This is your KA metaverse project's HTML code. Your project is stored in the cloud and can be accessed from anywhere.</p>
    <p>To save, click the save button in the top right corner of the output window.</p>
</body>
</html>`;

function createDenoProcessAndAppendToGames(projectName, p, peers, games, isTesting) {
  // Create instance of Deno
  let denoProjPath = `./deno/${projectName}`
  let child = spawn('deno', ['run', '--v8-flags=--max-old-space-size=256', `${denoProjPath}/server.js`])
  child.scriptOutput = "";
  child.isTesting = isTesting;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', function (data) {
    data = data.toString();
    var cmd, args, commandName;
    if (data.startsWith("!")) {
      [commandName, args] = data.split(/ (.+)/s)
      cmd = denoCommands.find(c => c.name == commandName.substring(1))
    } else {
      args = data
      cmd = denoCommands.find(c => c.name == "*")
    }
    if (cmd) {
      try {
        cmd.exec(args, child, peers)
      } catch (e) {
        console.log(`There was an error executing the command: ${commandName}`)
        console.log(e)
      }
    } else {
      console.log("~\x1b[31mUnknown command: " + commandName + "\x1B[0m")
    }
    child.scriptOutput += data;
    if (child.scriptOutput.length > 10000) {
      child.kill()
      p.peer.send("~\x1b[31mDeno process killed due to excessive output\x1B[0m\n")
    }
  });
  child.stderr.on('data', function (err) {
    err = hidePersonalFilename(err.toString())
    p.peer.send("~" + err)
    child.scriptOutput += err;
  });
  child.on('close', function (code) {
    p.peer.send(`~Process finished with exit code ${code}\n`)
    p.peer.send('deno-terminal-end')
    for (let peer2 of peers) {
      if (peer2.playing === projectName) { // If the peer is playing the game, remove it
        peer2.playing = null
      }
    }
    // Remove the game from the list of games
    let [gameRemoved] = games.splice(games.findIndex(g => g.name === projectName), 1)

    // Restart the game if testing
    if (gameRemoved && gameRemoved.onRestart) {
      gameRemoved.onRestart()
    }
  });


  // Add the game to the list of games
  games.push({
    name: projectName,
    denoProcess: child,
    players: [p.uid],
    started: new Date()
  })
  p.playing = projectName

}

export default [
  {
    name: "*",
    exec: (args, p) => {
      try {
        p.peer.send("Wildcard command * recieved by server with data " + args.toString())
      } catch (e) {
        console.log("Missed input (p.peer is not assigned): " + args)
      }
    }
  },
  {
    name: "ping",
    exec: (args, p) => p.peer.send("pong")
  },
  {
    name: "server-version",
    exec: (args, p) => p.peer.send("beta")
  },
  {
    name: "shutdown",
    exec: (args, p) => {
      if (timingSafeEqual(process.env.GLOBAL_PASSWORD, args)) {
        process.exit(0)
      } else {
        p.peer.send("Wrong password")
      }
    }
  },
  {
    name: "deno-get-projects",
    exec: (args, p) => {
      (async () => {
        let denoProjectList = []
        let files = await fs.readdir("./deno")
        for (let file of files) {
          let info = await fs.readFile('./deno/' + file + '/info.json')
          denoProjectList.push(JSON.parse(info.toString()))
        }
        p.peer.send("deno-set-projects " + JSON.stringify(denoProjectList))
      })();
    }
  },
  {
    name: "deno-create-project",
    exec: (args, p) => {
      (async () => {
        let name = 'new-' + Math.random().toString().substring(14)
        await fs.mkdir('./deno/' + name)
        let newProject = {
          name: name,
          desc: `Description for ${name}`,
          version: "0.1",
          author: "unknown",
        }
        await fs.writeFile('./deno/' + name + '/info.json', JSON.stringify(newProject))
        await fs.writeFile('./deno/' + name + '/server.js', starterServerJSCode)
        await fs.writeFile('./deno/' + name + '/client.html', starterClientHtmlCode(name))
        p.peer.send("deno-set-server " + starterServerJSCode)
        p.peer.send("deno-set-client " + starterClientHtmlCode(name))
        p.peer.send("deno-add-project " + JSON.stringify(newProject))
      })();
    }
  },
  {
    name: "deno-update-info",
    exec: (args, p) => {
      (async () => {
        let info = JSON.parse(args)
        // Rename the old folder
        if (info.name != info.prevName) {
          await fs.rename('./deno/' + info.prevName, './deno/' + info.name)
        }
        await fs.writeFile('./deno/' + info.name + '/info.json', JSON.stringify(info))
        if (info.name != info.prevName) {
          p.peer.send("deno-add-project " + JSON.stringify(info))
        }
      })();
    }
  },
  {
    name: "deno-delete-project",
    exec: (args, p) => {
      (async () => {
        let name = args
        await fs.rmdir('./deno/' + name, { recursive: true })
        p.peer.send("deno-remove-project " + name)
      })();
    }
  },
  {
    name: "deno-get-code",
    exec: (args, p) => {
      (async () => {
        let data = await fs.readFile(`./deno/${args}/server.js`, 'utf8')
        p.peer.send("deno-set-server " + data)
        data = await fs.readFile(`./deno/${args}/client.html`, 'utf8')
        p.peer.send("deno-set-client " + data)
      })();
    }
  },
  {
    name: "deno-get-client",
    exec: (args, p) => {
      (async () => {
        data = await fs.readFile(`./deno/${args}/client.html`, 'utf8')
        p.peer.send("deno-set-client " + data)
      })();
    }
  },
  {
    name: "deno-save-client",
    exec: (args, p) => {
      (async () => {
        let argData = JSON.parse(args)
        let denoProjPath = `./deno/${argData.project}`
        await fs.writeFile(`${denoProjPath}/client.html`, argData.code)
        p.peer.send("deno-save-client-success")
      })();
    }
  },
  {
    name: "deno-save-and-run-server",
    exec: (args, p, peers, games) => {
      (async () => {

        // Define vars
        let argData = JSON.parse(args)
        let projectName = argData.project
        let denoProjPath = `./deno/${projectName}`

        // Write demo server code
        await fs.writeFile(`${denoProjPath}/server.js`, argData.code)

        // Attach to the games list
        let game = games.find(g => g.name === projectName) // Check if the game is already running
        if (game) {
          game.onRestart = () => { // When the game is restarted, create a new deno process
            p.peer.send("~\x1b[31mRestarting deno process...\x1B[0m\n")
            createDenoProcessAndAppendToGames(projectName, p, peers, games, true)
          }
          game.denoProcess.kill() // Kill the old process
        } else {
          p.peer.send(`~\x1b[36mdeno run ${denoProjPath}/server.js\x1B[0m\n`)
          p.peer.send("~\x1b[31mStarting deno process...\x1B[0m\n")
          createDenoProcessAndAppendToGames(projectName, p, peers, games, true)
        }

      })();
    }


  },
  {
    name: "deno-kill",
    exec: (args, p, peers, games) => {
      let game = games.find(g => g.name === p.playing)
      if (!game) {
        return p.peer.send("~\x1b[31mNo game to kill\x1B[0m\n")
      }
      if (game.denoProcess) {
        game.denoProcess.kill()
        p.peer.send("~\x1b[31mKilling deno process...\x1B[0m\n")
      } else {
        p.peer.send("~Unknown deno error\n")///
      }
    }

  },
  {
    name: "join-game",
    exec: (args, p, peers, games) => {
      (async () => {
        let game = games.find(g => g.name == args)
        if (!game) { // If the game doesn't exist, create it
          createDenoProcessAndAppendToGames(args, p, peers, games)
        } else if (game.players.includes(p.uid)) { // If the player is already in the game, do nothing
          return p.peer.send("~\x1b[31mAlready in game\x1B[0m\n")
        } else { // If the game exists, add the player to it
          game.players.push(p.uid)
          p.playing = game.name
          p.peer.send("~\x1b[36mYou have joined the game\x1B[0m\n")
        }

        // Send a copy of the client html to the player
        let data = await fs.readFile(`./deno/${args}/client.html`, 'utf8')
        p.peer.send("set-iframe " + data)
      })();
    }
  },
  {
    name: "leave-game",
    exec: (args, p, peers, games) => {
      let game = games.find(g => g.name == p.playing)
      if (!game) {// If the game doesn't exist, return
        return p.peer.send("~\x1b[31mNo game to leave\x1B[0m\n")
      }
      if (!game.players.includes(p.uid)) {
        // If the player isn't in the game, return
        return p.peer.send("~\x1b[31mNot in game\x1B[0m\n")
      }
      game.players = game.players.filter(uid => uid != p.uid)
      p.peer.send("~\x1b[36mYou have left the game\x1B[0m\n")

      // If there are no players left, kill the process
      if (game.players.length == 0) {
        game.denoProcess.kill()
        // Remove the game from the list
        games.splice(games.indexOf(game), 1)
      }
    }
  },
  {
    name: "geo",
    exec: (args, peerData) => {
      let p = peerData.ipInfo;
      let svgLink = findFlagUrlByIso2Code(p.country);
      let countryName = getCountry(p.country).name;
      let timezone = getTimezone(p.timezone);
      let geoData = {
        loc: p.loc,
        country: countryName,
        iso2: p.country,
        tz: p.timezone,
        utcOffset: timezone.utcOffset,
        dstOffset: timezone.dstOffset,
        flag: svgLink
      }
      peerData.peer.send("geo " + JSON.stringify(geoData))
    }
  },
  {
    name: "geos",
    exec: (args, p, peers) => {
      let players = peers.map(peerData => {
        let p = peerData.ipInfo;
        let svgLink = findFlagUrlByIso2Code(p.country);
        let countryName = getCountry(p.country).name;
        let timezone = getTimezone(p.timezone);
        return {
          loc: p.loc,
          country: countryName,
          iso2: p.country,
          tz: p.timezone,
          utcOffset: timezone.utcOffset,
          dstOffset: timezone.dstOffset,
          flag: svgLink
        }
      })
      p.peer.send("geos " + JSON.stringify(players))
    }
  },
  {
    name: "globe",
    exec: (args, p, peers) => {
      let globeData = peers.map(peerData => {
        let p = peerData.ipInfo;
        let [lat, lng] = p.loc.split(",").map(x => parseFloat(x))
        return {
          lat: lat,
          lng: lng,
          uid: peerData.uid,
        }
      })
      p.peer.send("globe " + JSON.stringify(globeData))
    }
  },
  {
    name: "lifeprotip",
    exec: (args, p) => {
      let facts = [
        "A person who has never made a mistake has never tried anything new.",
        "Banging your head against a wall for hours and hours is an extremely effective way to pass the time.",
        "The most common way people give up their power is by thinking they don’t have any.",
        "The best revenge is massive success.",
        "If you hear a voice within you say “you cannot paint,” then by all means paint and that voice will be silenced.",
        "The only person you are destined to become is the person you decide to be.",
        "A thrilling time is in your immediate future.",
        "The world is a dangerous place, and those who do not act will be swept up in their own destruction.",
        "It’s better to be alone sometimes.",
        "When everything seems to be going against you, remember that the airplane takes off against the wind, not with it.",
        "It’s not the years in your life that count. It’s the life in your years.",
        "Change your thoughts and you change your world.",
        "The best time to plant a tree was 20 years ago. The second best time is now.",
        "The person who will not stand for something will fall for anything.",
        "If you tell the truth, you don’t have to remember anything.",
        "A friend is someone who knows all about you and still loves you.",
        "A life spent making mistakes is not only more honorable, but more useful than a life spent doing nothing.",
        "If you want to make a permanent change, stop focusing on the negative and focus on the positive.",
        "The only way to do great work is to love what you do.",
        "If you can dream it, you can achieve it.",
        "The best time to plant a tree was 20 years ago. The second best time is now.",
        "The person who will not stand for something will fall for anything.",
        "If you tell the truth, you don’t have to remember anything.",
        "A friend is someone who knows all about you and still"
      ]
      p.peer.send(facts[Math.floor(Math.random() * facts.length)])
    }
  },
  {
    name: "randint",
    exec: (args, p) => {
      args = args.split(" ")
      let min = parseInt(args[0]) || 0
      let max = parseInt(args[1]) || 100
      let num = Math.floor(Math.random() * (max - min + 1)) + min
      p.peer.send(`randint ${num}`)
    }
  },
  {
    name: "date-now",
    exec: (args, p) => {
      p.peer.send(`date-now ${new Date().toISOString()}`)
    }
  },
  {
    name: "get-guest-uid",
    exec: (args, p) => {
      p.peer.send(`set-uid ${p.uid}`)
    }
  },
  {
    name: "sign-up",
    exec: (args, p) => {
      let username = args.split(" ")[0];
      let password = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      let accountData = {
        account: account,
        password: password
      }
      p.peer.send(`set-username ${username}`)
      p.peer.send(`set-password ${password}`)
    }
  },
  {
    name: "auto-login",
    exec: (args, p) => {
      let username = args.split(" ")[0];
      let password = args.split(" ")[1];

      // Check if username and password are valid
      /// ...
    }
  },
  {
    name: "debug-games",
    exec: (args, p, peers, games) => {
      let gamesClean = games.map(g => {
        return {
          name: g.name,
          players: g.players,
          started: g.started,
        }
      })
      console.log(gamesClean)
      p.peer.send(`debug-games ${JSON.stringify(gamesClean)}`)
    }
  }
]