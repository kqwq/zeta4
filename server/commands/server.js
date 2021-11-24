import { findFlagUrlByIso2Code } from 'country-flags-svg'
import { getAllTimezones, getCountry, getTimezone } from 'countries-and-timezones';
import dotenv from 'dotenv';
import { promises as fs } from "fs";
import { timingSafeEqual } from 'crypto';

dotenv.config();

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_\-]/g, '')
}

let denoPath = "./storage/deno";



export default [
  {
    name: "ping",
    exec: (args, p) => p.send("pong")
  },
  {
    name: "server-version",
    exec: (args, p) => p.send("4.1")
  },
  {
    name: "shutdown",
    exec: (args, p) => {
      if (timingSafeEqual(process.env.GLOBAL_PASSWORD, args)) {
        p.send("shutdown - Shutting down in 1 second...")
        setTimeout(() => {
          process.exit(0)
        }, 1000)
      } else {
        p.send("shutdown - Wrong password")
      }
    }
  },
  {
    name: "deno-get-projects",
    exec: async (args, p, peers, rm, fm) => {
      let allInfo = await fm.getAllInfo()
      p.send("deno-set-projects " + JSON.stringify(allInfo))
    }
  },
  {
    name: "deno-create-project",
    exec: async (args, p, peers, rm, fm) => {
      let response = await fm.createProject(JSON.parse(args))
      if (response) {
        p.send("deno-set-server " + response.server)
        p.send("deno-set-client " + response.client)
        p.send("deno-add-project " + JSON.stringify(response.info))
      }
    }
  },
  {
    name: "deno-update-info",
    exec: async (args, p, peers, rm, fm) => {
      let newInfo = JSON.parse(args)
      await fm.setInfo(newInfo.name, newInfo, p.uid)
    }
  },
  {
    name: "deno-delete-project",
    exec: async (args, p, peers, rm, fm) => {
      await fm.deleteProject(args)
      p.send("deno-remove-project " + args)
    }
  },
  {
    name: "deno-get-code",
    exec: async (args, p, peers, rm, fm) => {
      let serverCode = await fm.getServer(args)
      p.send("deno-set-server " + serverCode)
      let clientCode = await fm.getClient(args)
      p.send("deno-set-client " + clientCode)
    }
  },
  {
    name: "deno-get-client",
    exec: async (args, p, peers, rm, fm) => {
      let clientCode = await fm.getClient(args)
      p.send("deno-set-client " + clientCode)
    }
  },
  { 
    name: "deno-save-client",
    exec: async (args, p, peers, rm, fm) => {
      let argData = JSON.parse(args)
      await fm.setClient(argData.project, argData.code, p.uid)
      p.send("deno-save-client-success")
    }
  },
  {
    name: "deno-save-and-run-server",
    exec: async (args, p, peers, rm, fm) => {
      let argData = JSON.parse(args)
      p.send(`~\x1b[36mdeno run ${argData.project}/server.js\x1B[0m\n`)
      await fm.setServer(argData.project, argData.code, p.uid)
      p.send("~\x1b[31mStarting deno process...\x1B[0m\n")
      rm.createRoom(argData.project, true, [p])


      ///p.send("~\x1b[31mRestarting deno process...\x1B[0m\n")



    }


  },
  {
    name: "deno-kill",
    exec: (args, p, peers, rm) => {
      if (p.room) {
        rm.removeRooms(p.room.name)
        p.send("~\x1b[31mKilling deno process...\x1B[0m\n")
      } else {
        return p.send("~\x1b[31mNo game to kill\x1B[0m\n")
      }
    }
  },
  {
    name: "join-game",
    exec: async(args, p, peers, gm, fm) => {

      if (p.room === args) {
        return p.send("~\x1b[31mAlready in game\x1B[0m\n")
      }

      gm.addPlayer(p, args)
      p.send("~\x1b[36mYou have joined the game\x1B[0m\n")

      let data = await fs.readFile(`${denoPath}/${args}/client.html`, 'utf8')
      p.send("set-iframe " + data)
    }
  },
  {
    name: "leave-game",
    exec: (args, p, peers, rm, fm) => {
      if (p.room === null) {
        return p.send("~\x1b[31mNot in game\x1B[0m\n")
      }
      rm.removePlayer(p)
      p.send("~\x1b[36mYou have left the game\x1B[0m\n")
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
      peerData.send("geo " + JSON.stringify(geoData))
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
      p.send("geos " + JSON.stringify(players))
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
      p.send("globe " + JSON.stringify(globeData))
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
      p.send(facts[Math.floor(Math.random() * facts.length)])
    }
  },
  {
    name: "randint",
    exec: (args, p) => {
      args = args.split(" ")
      let min = parseInt(args[0]) || 0
      let max = parseInt(args[1]) || 100
      let num = Math.floor(Math.random() * (max - min + 1)) + min
      p.send(`randint ${num}`)
    }
  },
  {
    name: "date-now",
    exec: (args, p) => {
      p.send(`date-now ${new Date().toISOString()}`)
    }
  },
  {
    name: "get-guest-uid",
    exec: (args, p) => {
      p.send(`set-uid ${p.uid}`)
    }
  },
  {
    name: "change-guest-uid",
    exec: (args, p, peers) => {
      // Check if the new uid is already taken
      let newUid = "-" + sanitize(args).slice(0, 30) + "-"
      let taken = peers.some(peerData => peerData.uid === newUid)
      if (taken) {
        p.send("set-uid-error Already taken")
      } else {
        p.uid = newUid
        p.send(`set-uid ${newUid}`)
      }
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
      p.send(`set-username ${username}`)
      p.send(`set-password ${password}`)
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
    name: "rooms",
    exec: (args, p, peers, rm, fm) => {
      p.send("rooms " + JSON.stringify(rm.repr()))
    }
  }
]