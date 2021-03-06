import { findFlagUrlByIso2Code } from 'country-flags-svg'
import { getAllTimezones, getCountry, getTimezone } from 'countries-and-timezones';
import dotenv from 'dotenv';
import { promises as fs } from "fs";
import { timingSafeEqual } from 'crypto';
import fetch from 'node-fetch';
import { fetchProxy } from '../components/proxyAPIs.js';
dotenv.config();

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_\-]/g, '')
}

function generateSignupPin() {
  return "#" + Math.random().toString(36).substring(2, 6).toUpperCase()
}
function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array(8).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join('')
}
function authenticateAdmin(password) {
  if (password.length - process.env.GLOBAL_PASSWORD.length !== 0) {
    return false
  }
  return timingSafeEqual(Buffer.from(password), Buffer.from(process.env.GLOBAL_PASSWORD))
}

let denoPath = "./storage/deno";

let maxServerCodeLength = process.env.MAX_SERVER_CODE_LENGTH || 50000
let maxClientCodeLength = process.env.MAX_CLIENT_CODE_LENGTH || 50000

export default [
  {
    name: "ping",
    exec: (args, p) => p.send("pong")
  },
  {
    name: "pong",
    exec: (args, p) => {
      //console.log('confirm pong recieved')
      p.awaitingPing = false
    }
  },
  {
    name: "server-version",
    exec: (args, p) => p.send("4.1")
  },
  {
    name: "shutdown",
    exec: (args, p) => {
      if (authenticateAdmin(args)) {
        p.send("shutdown - Shutting down in 1 second...")
        setTimeout(() => {
          process.exit(0)
        }, 1000)
      } else {
        p.send("alert Wrong password")
      }
    }
  },
  {
    name: "alert-all",
    exec: (args, p, peers) => {
      let [password, message] = args.split(/ (.+)/s)
      if (authenticateAdmin(password)) {
        for (let peer of peers) {
          peer.send("alert Message from server admin: " + message)
        }
      } else {
        p.send("alert Wrong password")
      }
    }
  },
  {
    name: "is-eu",
    exec: (args, p) => {
      let euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']
      let country = p.ipInfo.country
      if (euCountries.includes(country)) {
        p.send("is-eu true")
      } else {
        p.send("is-eu false")
      }
    }
  },
  // {
  //   name: "deno-get-projects",
  //   exec: async (args, p, peers, rm, fm) => {
  //     let allProjects = await fm.getAllInfo()
  //     p.send("deno-set-projects " + JSON.stringify(allProjects))
  //   }
  // },
  {
    name: "deno-get-projects",
    exec: async (args, p, peers, rm, fm) => {
      let allProjects = await fm.getAllInfo()
      for (let project of allProjects) {
        project.players = []
      }
      let rooms = rm.repr().rooms
      for (let room of rooms) {
        allProjects.find(project => project.name === room.name).players.push(...room.players)
      }
      p.send("deno-set-projects " + JSON.stringify(allProjects.slice(0, 200)))
    }
  },
  {
    name: "deno-create-project",
    exec: async (args, p, peers, rm, fm) => {
      let response = await fm.createProject(JSON.parse(args), p.uid)
      if (response.success) {
        p.send("deno-set-server " + response.server)
        p.send("deno-set-client " + response.client)
        response.info.players = []
        p.send("deno-add-project " + JSON.stringify(response.info))
      } else {
        p.send("alert " + response.error)
      }
    }
  },
  {
    name: "deno-update-info",
    exec: async (args, p, peers, rm, fm) => {
      let newInfo = JSON.parse(args)
      let oldInfo = await fm.getInfo(newInfo.name)
      newInfo.views = oldInfo.views
      newInfo.ratings = oldInfo.rating
      await fm.setInfo(newInfo.name, newInfo, p.uid)
    }
  },
  {
    name: "deno-delete-project",
    exec: async (args, p, peers, rm, fm) => {
      await fm.deleteProject(args, p.uid)
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
      if (argData.code.length > maxClientCodeLength) {
        return p.send(`alert Client's HTML code is too long - ${argData.code.length}/${maxClientCodeLength} characters used`)
      }
      await fm.setClient(argData.project, argData.code, p.uid)
      p.send("deno-save-client-success")
    }
  },
  {
    name: "deno-save-and-run-server",
    exec: async (args, p, peers, rm, fm) => {
      let argData = JSON.parse(args)
      if (argData.code.length > maxServerCodeLength) {
        return p.send(`alert Server's deno code is too long - ${argData.code.length}/${maxServerCodeLength} characters used`)
      }
      p.send(`~\x1b[36mdeno run ${argData.project}/server.js\x1B[0m\n`)
      await fm.setServer(argData.project, argData.code, p.uid)
      p.send("~\x1b[31mStarting deno process...\x1B[0m\n")
      rm.createRoom(argData.project, true, [p])
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
    exec: async (args, p, peers, gm, fm) => {
      // Check if game exists
      if (p.room?.name === args) {
        return p.send("~\x1b[31mAlready in game\x1B[0m\n")
      }

      // Add player to room
      gm.addPlayer(p, args)
      p.send("~\x1b[36mYou have joined the game\x1B[0m\n")

      // Send client code to player
      let data = await fs.readFile(`${denoPath}/${args}/client.html`, 'utf8')
      p.send("set-iframe " + data)

      // Increment view count
      let info = await fm.getInfo(args)
      if (!info.views) info.views = 0 /// TODO: Remove this (repair .views)
      info.views++
      await fm.setInfo(args, info, p.uid, true)
    }
  },
  {
    name: "leave-game",
    exec: (args, p, peers, rm, fm) => {
      if (p.room === null) {
        return p.send("~\x1b[31mNot in game\x1B[0m\n")
      }
      p.room.removePlayer(p)
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
  // {
  //   name: "geos",
  //   exec: (args, p, peers) => {
  //     let players = peers.map(peerData => {
  //       let p = peerData.ipInfo;
  //       let svgLink = findFlagUrlByIso2Code(p.country);
  //       let countryName = getCountry(p.country).name;
  //       let timezone = getTimezone(p.timezone);
  //       return {
  //         loc: p.loc,
  //         country: countryName,
  //         iso2: p.country,
  //         tz: p.timezone,
  //         utcOffset: timezone.utcOffset,
  //         dstOffset: timezone.dstOffset,
  //         flag: svgLink
  //       }
  //     })
  //     p.send("geos " + JSON.stringify(players))
  //   }
  // },
  {
    name: "countries",
    exec: async (args, thisPeer, peers, gm, fm) => {
      let res = await fs.readFile(fm.ipdb, 'utf8')
      let ipdb = JSON.parse(res)
      let countries = ipdb.map(i => {
        return {
          countryName: i.country,
        }
      })
      let countryCounts = {}
      countries.forEach(c => {
        if (countryCounts[c.countryName]) {
          countryCounts[c.countryName]++
        } else {
          countryCounts[c.countryName] = 1
        }
      })
      let countryData = Object.keys(countryCounts).map(c => {
        return {
          iso2: c,
          flagUrl: findFlagUrlByIso2Code(c),
          count: countryCounts[c]
        }
      })

      thisPeer.send("countries " + JSON.stringify(countryData))
    }
  },
  {
    name: "globe",
    exec: async (args, thisPeer, peers, gm, fm) => {
      let globeData = fm.getGlobeData().map(g => {
        return {
          lat: g.lat,
          lng: g.lng,
          count: g.count,
        }
      })
      peers.filter(p => p.ipInfo?.loc).forEach(peerData => {
        let loc = peerData.ipInfo?.loc
        let [lat, lng] = loc.split(",").map(v => Math.round(parseFloat(v)))
        let status
        if (peerData.room) {
          status = "playing"
        } else if (peerData.uid === thisPeer.uid) {
          status = "self"
        } else {
          status = "online"
        }
        globeData.find(g => g.lat === lat && g.lng === lng).status = status
      })
      thisPeer.send("globe " + JSON.stringify(globeData))
    }
  },
  {
    name: "lifeprotip",
    exec: (args, p) => {
      let facts = [
        "A person who has never made a mistake has never tried anything new.",
        "Banging your head against a wall for hours and hours is an extremely effective way to pass the time.",
        "The most common way people give up their power is by thinking they don???t have any.",
        "The best revenge is massive success.",
        "If you hear a voice within you say ???you cannot paint,??? then by all means paint and that voice will be silenced.",
        "The only person you are destined to become is the person you decide to be.",
        "A thrilling time is in your immediate future.",
        "The world is a dangerous place, and those who do not act will be swept up in their own destruction.",
        "It???s better to be alone sometimes.",
        "When everything seems to be going against you, remember that the airplane takes off against the wind, not with it.",
        "It???s not the years in your life that count. It???s the life in your years.",
        "Change your thoughts and you change your world.",
        "The best time to plant a tree was 20 years ago. The second best time is now.",
        "The person who will not stand for something will fall for anything.",
        "If you tell the truth, you don???t have to remember anything.",
        "A friend is someone who knows all about you and still loves you.",
        "A life spent making mistakes is not only more honorable, but more useful than a life spent doing nothing.",
        "If you want to make a permanent change, stop focusing on the negative and focus on the positive.",
        "The only way to do great work is to love what you do.",
        "If you can dream it, you can achieve it.",
        "The best time to plant a tree was 20 years ago. The second best time is now.",
        "The person who will not stand for something will fall for anything.",
        "If you tell the truth, you don???t have to remember anything.",
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
        p.send(`alert Username ${newUid} is already taken.`)
      } else {
        p.uid = newUid
        p.send(`set-uid ${newUid}`)
      }
    }
  },
  {
    name: "get-ka-profile",
    exec: async (args, p) => {
      let res = await fetchProxy("profile", args)
      let json = await res.json()
      let user = json.data.user
      if (user === null) {
        return p.send("get-ka-profile error")
      }
      let returnProfile = {
        kaid: user.kaid,
        nickname: user.nickname,
        username: user.username,
        points: user.points,
        bio: user.bio,
        joined: user.joined,
        pin: generateSignupPin(),
        loggedIn: false
      }
      res = await fetchProxy("avatarDataForProfile", user.kaid)
      json = await res.json()
      returnProfile.avatarSrc = json.data.user.avatar.imageSrc
      p.kaProfile = returnProfile
      p.send(`get-ka-profile ${JSON.stringify(returnProfile)}`)
    }
  },
  {
    name: "sign-up-with-bio-pin",
    exec: async (args, p, peers, rm, fm) => {
      if (p.kaProfile?.loggedIn) {
        return p.send("alert You are already logged in. Please close all KA metaverse instances and try again.") // Already logged in
      }
      if (args) {
        p.deviceId = args // "offerHash" in index.html to disguise it
      }
      // No args are inputted


      let res = await fetchProxy("profile", p.kaProfile?.kaid)
      let json = await res.json()
      let bio = json.data.user.bio
      let pin = p.kaProfile?.pin
      console.log(pin, bio)
      if (pin && bio.includes(pin)) {
        p.kaProfile.loggedIn = true
        let password = generatePassword()
        p.uid = await fm.addProfile(p.kaProfile, password, p.ipInfo?.ip, p.deviceId)
        p.send("sign-up-with-bio-pin success")
        p.send("set-uid " + p.uid)
        p.send("set-password " + password)
      } else {
        p.send("alert There was an error signing you up. Please try again.")
      }
    }
  },
  {
    name: "auto-login",
    exec: async (args, p, peers, rm, fm) => {
      if (p.kaProfile?.loggedIn) {
        return p.send("auto-login already") // Already logged in
      }
      let argsSplit = args.split(" ")
      p.uid = argsSplit[0];
      let password = argsSplit[1];
      p.deviceId = argsSplit[2];
      let resProfile = await fm.logInProfile(p.uid, password, p.ipInfo?.ip, p.deviceId)
      if (resProfile) {
        p.kaProfile = resProfile
        p.kaProfile.loggedIn = true
        p.send("auto-login success")
        p.send("set-uid " + p.uid)
      } else {
        p.send("auto-login error")
      }
    }
  },
  {
    name: "fetch",
    exec: async (args, p, peers, rm, fm) => {
      let firstArg = args.split(" ")[0]
      let res = await fetchProxy(firstArg, args.slice(firstArg.length + 1))
      if (!res.ok) {
        p.send(`fetch ${res.status}`)
        return
      }
      let json = await res.json()
      p.send(`fetch ${res.status} ${JSON.stringify(json)}`)
    }
  },

  {
    name: "rooms",
    exec: (args, p, peers, rm, fm) => {
      p.send("rooms " + JSON.stringify(rm.repr()))
    }
  }
]