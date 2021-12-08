import { findFlagUrlByIso2Code } from 'country-flags-svg'
import { getAllTimezones, getCountry, getTimezone } from 'countries-and-timezones';
import dotenv from 'dotenv';
import { promises as fs } from "fs";
import { timingSafeEqual } from 'crypto';
import fetch from 'node-fetch';

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

let denoPath = "./storage/deno";

let maxServerCodeLength = process.env.MAX_SERVER_CODE_LENGTH || 50000
let maxClientCodeLength = process.env.MAX_CLIENT_CODE_LENGTH || 50000

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
    name: "alert-all",
    exec: (args, p, peers) => {
      let [ password, message ] = args.split(/\s+/);
      if (timingSafeEqual(process.env.GLOBAL_PASSWORD, password)) {
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
        allProjects.find(project => project.name === room.name).players.concat(room.players)
      }
      p.send("deno-set-projects " + JSON.stringify(allProjects))
    }
  },
  {
    name: "deno-create-project",
    exec: async (args, p, peers, rm, fm) => {
      let response = await fm.createProject(JSON.parse(args), p.uid)
      if (response.success) {
        p.send("deno-set-server " + response.server)
        p.send("deno-set-client " + response.client)
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

      if (p.room?.name === args) {
        p.send("~\x1b[31mAlready in game\x1B[0m\n")
        return
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
        let [ lat, lng ] = loc.split(",").map(v => Math.round(parseFloat(v)))
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
        p.send(`alert Username ${newUid} is already taken.`)
      } else {
        p.uid = newUid
        p.send(`set-uid ${newUid}`)
      }
    }
  },
  {
    name: "get-ka-profile",
    exec: async(args, p) => {
      let isKaid = args.startsWith("kaid_")
      let innerVariables = isKaid ? `\"kaid\":\"${args}\"` : `\"username\":\"${args}\"`
      let res = await fetch("https://www.khanacademy.org/api/internal/graphql/getFullUserProfile", {
        "headers": {
          "content-type": "application/json",
        },
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": `{\"operationName\":\"getFullUserProfile\",\"variables\":{${innerVariables}},\"query\":\"query getFullUserProfile($kaid: String, $username: String) {\\n  user(kaid: $kaid, username: $username) {\\n    id\\n    kaid\\n    key\\n    userId\\n    email\\n    username\\n    profileRoot\\n    gaUserId\\n    qualarooId\\n    isPhantom\\n    isDeveloper: hasPermission(name: \\\"can_do_what_only_admins_can_do\\\")\\n    isCurator: hasPermission(name: \\\"can_curate_tags\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isCreator: hasPermission(name: \\\"has_creator_role\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isPublisher: hasPermission(name: \\\"can_publish\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isModerator: hasPermission(name: \\\"can_moderate_users\\\", scope: GLOBAL)\\n    isParent\\n    isSatStudent\\n    isTeacher\\n    isDataCollectible\\n    isChild\\n    isOrphan\\n    isCoachingLoggedInUser\\n    canModifyCoaches\\n    nickname\\n    hideVisual\\n    joined\\n    points\\n    countVideosCompleted\\n    bio\\n    soundOn\\n    muteVideos\\n    showCaptions\\n    prefersReducedMotion\\n    noColorInVideos\\n    autocontinueOn\\n    newNotificationCount\\n    canHellban: hasPermission(name: \\\"can_ban_users\\\", scope: GLOBAL)\\n    canMessageUsers: hasPermission(name: \\\"can_send_moderator_messages\\\", scope: GLOBAL)\\n    isSelf: isActor\\n    hasStudents: hasCoachees\\n    hasClasses\\n    hasChildren\\n    hasCoach\\n    badgeCounts\\n    homepageUrl\\n    isMidsignupPhantom\\n    includesDistrictOwnedData\\n    preferredKaLocale {\\n      id\\n      kaLocale\\n      status\\n      __typename\\n    }\\n    underAgeGate {\\n      parentEmail\\n      daysUntilCutoff\\n      approvalGivenAt\\n      __typename\\n    }\\n    authEmails\\n    signupDataIfUnverified {\\n      email\\n      emailBounced\\n      __typename\\n    }\\n    pendingEmailVerifications {\\n      email\\n      unverifiedAuthEmailToken\\n      __typename\\n    }\\n    tosAccepted\\n    shouldShowAgeCheck\\n    __typename\\n  }\\n  actorIsImpersonatingUser\\n}\\n\"}`,
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
      })
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
      res = await fetch("https://www.khanacademy.org/api/internal/graphql/avatarDataForProfile", {
        "headers": {
          "content-type": "application/json",
        },
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": `{\"operationName\":\"avatarDataForProfile\",\"variables\":{\"kaid\":\"${user.kaid}\"},\"query\":\"query avatarDataForProfile($kaid: String!) {\\n  user(kaid: $kaid) {\\n    id\\n    avatar {\\n      name\\n      imageSrc\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\"}`,
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
      })
      json = await res.json()
      returnProfile.avatarSrc = json.data.user.avatar.imageSrc
      p.kaProfile = returnProfile
      p.send(`get-ka-profile ${JSON.stringify(returnProfile)}`)
    }
  },
  {
    name: "sign-up-with-bio-pin",
    exec: async(args, p, peers, rm, fm) => {
      if (p.kaProfile?.loggedIn) {
        return p.send("alert You are already logged in. Please close all KA metaverse instances and try again.") // Already logged in
      }
      if (args) {
        p.deviceId = args // "offerHash" in index.html to disguise it
      }
      // No args are inputted

      
      let res = await fetch("https://www.khanacademy.org/api/internal/graphql/getFullUserProfile", {
        "headers": {
          "content-type": "application/json",
        },
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": `{\"operationName\":\"getFullUserProfile\",\"variables\":{\"kaid\":\"${p.kaProfile?.kaid}\"},\"query\":\"query getFullUserProfile($kaid: String, $username: String) {\\n  user(kaid: $kaid, username: $username) {\\n    id\\n    kaid\\n    key\\n    userId\\n    email\\n    username\\n    profileRoot\\n    gaUserId\\n    qualarooId\\n    isPhantom\\n    isDeveloper: hasPermission(name: \\\"can_do_what_only_admins_can_do\\\")\\n    isCurator: hasPermission(name: \\\"can_curate_tags\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isCreator: hasPermission(name: \\\"has_creator_role\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isPublisher: hasPermission(name: \\\"can_publish\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isModerator: hasPermission(name: \\\"can_moderate_users\\\", scope: GLOBAL)\\n    isParent\\n    isSatStudent\\n    isTeacher\\n    isDataCollectible\\n    isChild\\n    isOrphan\\n    isCoachingLoggedInUser\\n    canModifyCoaches\\n    nickname\\n    hideVisual\\n    joined\\n    points\\n    countVideosCompleted\\n    bio\\n    soundOn\\n    muteVideos\\n    showCaptions\\n    prefersReducedMotion\\n    noColorInVideos\\n    autocontinueOn\\n    newNotificationCount\\n    canHellban: hasPermission(name: \\\"can_ban_users\\\", scope: GLOBAL)\\n    canMessageUsers: hasPermission(name: \\\"can_send_moderator_messages\\\", scope: GLOBAL)\\n    isSelf: isActor\\n    hasStudents: hasCoachees\\n    hasClasses\\n    hasChildren\\n    hasCoach\\n    badgeCounts\\n    homepageUrl\\n    isMidsignupPhantom\\n    includesDistrictOwnedData\\n    preferredKaLocale {\\n      id\\n      kaLocale\\n      status\\n      __typename\\n    }\\n    underAgeGate {\\n      parentEmail\\n      daysUntilCutoff\\n      approvalGivenAt\\n      __typename\\n    }\\n    authEmails\\n    signupDataIfUnverified {\\n      email\\n      emailBounced\\n      __typename\\n    }\\n    pendingEmailVerifications {\\n      email\\n      unverifiedAuthEmailToken\\n      __typename\\n    }\\n    tosAccepted\\n    shouldShowAgeCheck\\n    __typename\\n  }\\n  actorIsImpersonatingUser\\n}\\n\"}`,
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
      })
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
    exec: async(args, p, peers, rm, fm) => {
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
    name: "rooms",
    exec: (args, p, peers, rm, fm) => {
      p.send("rooms " + JSON.stringify(rm.repr()))
    }
  }
]