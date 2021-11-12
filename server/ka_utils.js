import fs, { existsSync } from 'fs'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
dotenv.config()

let baseUrl = "https://www.khanacademy.org/api/internal";
async function login(username, password) {
  let res = await fetch(`${baseUrl}/graphql/loginWithPasswordMutation`, {
    "credentials": "include",
    "headers": {
      "content-type": "application/json",
      "x-ka-fkey": "lol",
      "cookie": "fkey=lol"
    },
    "body": JSON.stringify({
      "operationName":
        "loginWithPasswordMutation",
      "variables": { "identifier": username, "password": password },
      "query": "mutation loginWithPasswordMutation($identifier: String!, $password: String!) {\n  loginWithPassword(identifier: $identifier, password: $password) {\n    user {\n      id\n      kaid\n      canAccessDistrictsHomepage\n      isTeacher\n      hasUnresolvedInvitations\n      transferAuthToken\n      preferredKaLocale {\n        id\n        kaLocale\n        status\n        __typename\n      }\n      __typename\n    }\n    isFirstLogin\n    error {\n      code\n      __typename\n    }\n    __typename\n  }\n}\n"
    }),
    "method": "POST",
    "mode": "cors"
  })
  let data = await res.headers.get("set-cookie")
  let kaas = (data.match(/KAAS=([\w-]+)/) || [])[1]
  return kaas
}

// Create config.json
let config
if (existsSync('config.json')) {
  config = JSON.parse(fs.readFileSync('config.json'))
} else {
  config = {
    "kaas": "",
    "link_id": "",
  }
}

// Fetch KAAS
if (!config.kaas) {
  let kaas = null
  let username = process.env.LINK_USERNAME
  let password = process.env.LINK_PASSWORD
  kaas = await login(username, password)
  console.log("Created new KAAS secret: " + kaas)
  config.kaas = kaas
  fs.writeFileSync('config.json', JSON.stringify(config)) // Write to config.json
}
let headers = {
  "content-type": "application/json",
  "x-ka-fkey": `lol`,
  "cookie": `KAAS=${config.kaas}; fkey=lol`
};


async function createProgram(
  code,
  title = "New Program",
  type = "pjs",
  base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=",
) {
  let res = await fetch(`${baseUrl}/scratchpads`, {
    "headers": headers,
    "body": JSON.stringify({
      userAuthoredContentType: type,
      title: title,
      revision: {
        code: code,
        folds: [],
        image_url: `${base64}`,
      },
    }),
    "method": "POST",
  })
  // Return error if there is one
  if (res.status != 200) {
    return res
  }
  let data = await res.json()
  return data
}

async function updateProgram(id, newCode, newTitle, newWidth = 600, newHeight = 600, base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=") {
  let body = {
    height: newWidth,
    width: newHeight,
    title: newTitle || "New program",
    revision: {
      code: newCode,
      image_url: base64,
      folds: []
    }
  }
  let res = await fetch(`${baseUrl}/scratchpads/${id}`, {
    "headers": headers,
    "body": JSON.stringify(body),
    "method": "PUT",
  })
  // Return error if there is one
  if (res.status == 404) {
    return { error: "Program does not exist", status: 404 }
  }
  let data = await res.json()
  return data
}

async function getProgram(id) {
  let res = await fetch(`${baseUrl}/scratchpads/${id}`)
  let data = await res.json()
  return data
}

/**
 * 
 * @param {string} originId 
 * @param {int} sort (default) 2: Newest to oldest, 1: Highest voted to lowest
 * @param {int} limit (default) 10
 */
async function getSpinoffs(originId, sort = 2, limit = 4) {
  let res = await fetch(`${baseUrl}/scratchpads/Scratchpad:${originId}/top-forks?sort=${sort}&limit=${limit}`)
  let data = await res.json()
  return data
}

export { createProgram, updateProgram }