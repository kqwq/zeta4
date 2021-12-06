/*
FileManager gives you a way to log, read, and write files.

If you want to use a database API (e.g. MongoDB) instead of the filesystem, change the following methods
  - log
  - read
  - getClient
  - getServer
  - getInfo
  - setClient
  - setServer
  - setInfo
  - deleteProject

That's it! No need to change anything else.



*/



import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();
const saltRounds = 8;

function trimTo(str, len) {
  if (str.length > len) {
    return str.substring(0, len - 3) + '...'
  }
  return str;
}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
}

class FileManager {
  constructor() {
    this.storage = "./storage"
    this.deno = "./storage/deno"
    this.logs = "./storage/logs"
    this.profile = "./storage/profile"
    this.maxProjectsPerUser = process.env.MAX_PROJECTS_PER_USER || 5
    this.minTimeBetweenProjectCreation = 1000 * 10 // 10 seconds is enough for anti-spam measures
    this.ipdb = "./storage/ipdb.json"
    this.globe = "./storage/globe.json"
    this.globeData = {}
    this.logLengthLimit = 100;
    this.projectInfoCache = []
    this.defaultClient =
      this.starterClientHtmlCode = (projName) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projName}</title>
</head>
<body>
    <h1>${projName}</h1>
    <p>This is your KA metaverse project's HTML code. Your project is stored in the cloud and can be accessed from anywhere.</p>
    <p>To save, click the save button in the top right corner of the output window.</p>
</body>
</html>`;
    this.defaultServer = (projName) => `console.log('Hello world!');`;

    // Check if storage, deno, logs, and profile directories exist
    if (!fs.existsSync(this.storage)) {
      fs.mkdirSync(this.storage);
    }
    if (!fs.existsSync(this.deno)) {
      fs.mkdirSync(this.deno);
      this.createDefaultProject()
    }
    if (!fs.existsSync(this.logs)) {
      fs.mkdirSync(this.logs);
    }
    if (!fs.existsSync(this.profile)) {
      fs.mkdirSync(this.profile);
    }
    if (!fs.existsSync(this.globe)) {
      fs.writeFileSync(this.globe, "{}")
    }

    // Add "program started" to log
    (async () => {
      await this.log("", "")
      await this.log("", " ====================================== ")
      await this.log("", "             SERVER STARTED             ")
      await this.log("", " ====================================== ")
      await this.cacheGlobeData()
    })()

    // On this.ipdb change, update globe
    fs.watch(this.ipdb, async (eventType, filename) => {
      if (eventType == "change") {
        await this.cacheGlobeData()
      }
    })


  }


  /**
   * 
   * @returns HH:MM:SS
   */
  getTimestamp() {
    let date = new Date()
    let hours = date.getUTCHours().toString().padStart(2, '0')
    let minutes = date.getUTCMinutes().toString().padStart(2, '0')
    let seconds = date.getUTCSeconds().toString().padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  getDatestamp() {
    let date = new Date()
    let year = date.getUTCFullYear().toString().padStart(4, '0')
    let month = (date.getUTCMonth() + 1).toString().padStart(2, '0')
    let day = date.getUTCDate().toString().padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  async log(uid, data) {
    // Append to log file
    let filePath = path.join(this.logs, this.getDatestamp() + ".log")
    await fs.promises.appendFile(filePath, `${this.getTimestamp()} ${uid} ${data}`.slice(0, this.logLengthLimit) + "\n");
  }

  // Getters
  async getClient(projectName) {
    let filePath = path.join(this.deno, projectName, "client.html")
    let file = await fs.promises.readFile(filePath);
    return file
  }
  async getServer(projectName) {
    let filePath = path.join(this.deno, projectName, "server.js")
    let file = await fs.promises.readFile(filePath);
    return file
  }
  async getInfo(projectName) {
    let filePath = path.join(this.deno, projectName, "info.json")
    let file = await fs.promises.readFile(filePath);
    return JSON.parse(file)
  }
  async getAllInfo() {
    let projInfo = []
    let projNames = await fs.promises.readdir(this.deno)
    for (let projName of projNames) {
      let info = await this.getInfo(projName)
      projInfo.push(info)
    }
    this.projectInfoCache = projInfo
    return projInfo
  }

  // Setters
  async setClient(projectName, data, writerUid) {
    let canWrite = await this.canWrite(projectName, writerUid)
    if (canWrite) {
      let filePath = path.join(this.deno, projectName, "client.html")
      await fs.promises.writeFile(filePath, data)
    } else {
      throw new Error(`${writerUid} does not have permission to write to ${projectName}/client.html`)
    }
  }
  async setServer(projectName, data, writerUid) {
    let canWrite = await this.canWrite(projectName, writerUid)
    if (canWrite) {
      let filePath = path.join(this.deno, projectName, "server.js")
      await fs.promises.writeFile(filePath, data)
    } else {
      throw new Error(`${writerUid} does not have permission to write to ${projectName}/server.js`)
    }
  }
  async setInfo(projectName, data, writerUid, override) {
    let canWrite;
    if (override) {
      canWrite = true
    } else {
      canWrite = await this.canWrite(projectName, writerUid)
    }
    if (canWrite) {
      let filePath = path.join(this.deno, projectName, "info.json")
      await fs.promises.writeFile(filePath, JSON.stringify(data))
    } else {
      throw new Error(`${writerUid} does not have permission to write to ${projectName}/info.json`)
    }
  }

  // Permissions
  async canWrite(projectName, writerUid) {
    // Search cache for project
    let projInfo = this.projectInfoCache.find(x => x.name == projectName)
    if (!projInfo) {
      projInfo = await this.getInfo(projectName)
    }
    return projInfo.author === writerUid || !projInfo.author // If no author, anyone can write
  }

  async createDefaultProject() {
    let writerUid = "server"
    let newProject = {
      name: "default",
      desc: "Default project",
      version: "1.0",
      author: writerUid,
      isTemplate: true,
      isBasicTemplate: true,
      basedOn: null,
      created: new Date().toISOString(),
      views: 0,
      ratings: [0, 0, 0, 0, 0],
    }
    let clientCode = this.defaultClient("default")
    let serverCode = this.defaultServer("default")
    await fs.promises.mkdir(path.join(this.deno, "default"))
    await this.setInfo("default", newProject, writerUid, true)
    await this.setClient("default", clientCode, writerUid)
    await this.setServer("default", serverCode, writerUid)
    await this.log("server", `Created default project`)
  }

  // Misc
  async createProject(newInfo, writerUid) {
    // Vars
    let projectName = newInfo.name
    let sanitizedProjectName = trimTo(sanitize(projectName), 60)
    let denoProjectPath = path.join(this.deno, sanitizedProjectName)

    // Check if project already exists
    try {
      let stat = await fs.promises.stat(denoProjectPath)
      if (stat.isDirectory()) {
        return { error: `Project ${projectName} already exists` }
      }
    } catch (err) {}

    // Add project to profile
    let profile = await this.getProfile(writerUid)
    if (!profile) {
      return { error: `User ${writerUid} does not exist` }
    }
    if (profile.projects.length >= this.maxProjectsPerUser) {
      return { error: `Sorry, you've reached your limit of ${this.maxProjectsPerUser} projects per user. You can delete other projects to free up space.` }
    }
    let dateNow = new Date()
    if (dateNow - new Date(profile.lastProjectCreated) < this.minTimeBetweenProjectCreation) {
      return { error: `Sorry, you must wait ${this.minTimeBetweenProjectCreation / 1000} seconds between creating projects.` }
    }
    profile.projects.push(sanitizedProjectName)
    profile.lastProjectCreated = dateNow
    await this.setProfile(profile)

    // Create project folder
    await fs.promises.mkdir(denoProjectPath) 

    // Set info
    newInfo = {
      basedOn: newInfo.basedOn,
      name: sanitizedProjectName,
      desc: trimTo(newInfo.desc, 140),
      version: trimTo(newInfo.version, 30),
      author: writerUid,
      isTemplate: newInfo.isTemplate,
      isBasicTemplate: false,
      created: new Date().toISOString(),
      views: 0,
      ratings: [0, 0, 0, 0, 0],
    }
    await this.setInfo(sanitizedProjectName, newInfo, writerUid, true) // Override with new name in info.json



    // Set client and server
    let clientCode = await this.getClient(newInfo.basedOn)
    let serverCode = await this.getServer(newInfo.basedOn)
    await this.setClient(sanitizedProjectName, clientCode, writerUid)
    await this.setServer(sanitizedProjectName, serverCode, writerUid)

    // Return new project info, client code, and server code
    return {
      success: true,
      client: clientCode,
      server: serverCode,
      info: newInfo,
    }
  }

  async deleteProject(projectName, writerUid) {
    let canWrite = await this.canWrite(projectName, writerUid)
    if (canWrite) {
      let denoProjectPath = path.join(this.deno, projectName)
      await fs.promises.rm(denoProjectPath, { recursive: true })

      // Remove project from profile
      let profile = await this.getProfile(writerUid)
      if (!profile) {
        return { error: `User ${writerUid} does not exist` }
      }
      profile.projects = profile.projects.filter(x => x != projectName)
      await this.setProfile(profile)
    } else {
      throw new Error(`${writerUid} does not have permission to delete ${projectName}`)
    }
  }

  async addProfile(kaProfile, password, ipAddress, deviceId) {
    let uid = kaProfile.username || kaProfile.kaid
    kaProfile.uid = uid
    kaProfile.passwordHash = await bcrypt.hash(password, saltRounds)
    kaProfile.ipAddresses = [ipAddress]
    kaProfile.deviceIds = [deviceId]
    kaProfile.projects = []
    kaProfile.lastProjectCreated = new Date()
    await this.setProfile(kaProfile)
    return uid
  }

  async setProfile(kaProfile) {
    let uid = kaProfile.username || kaProfile.kaid
    let profilePath = path.join(this.profile, uid)
    await fs.promises.writeFile(profilePath, JSON.stringify(kaProfile, null, 2))
  }

  async logInProfile(uid, password, ipAddress, deviceId) {
    let profile = await this.getProfile(uid)
    if (profile) {
      let passwordMatch = await bcrypt.compare(password, profile.passwordHash)
      if (passwordMatch) {
        if (ipAddress && !profile.ipAddresses.includes(ipAddress)) {
          profile.ipAddresses.push(ipAddress)
        }
        if (deviceId && !profile.deviceIds.includes(deviceId)) {
          profile.deviceIds.push(deviceId)
        }
        await this.setProfile(profile)
        return profile
      }
    }
    return false
  }

  async getProfile(uid) {
    let profilePath = path.join(this.profile, uid)
    try {
      var profile = await fs.promises.readFile(profilePath)
    } catch (e) {
      return false
    }
    return JSON.parse(profile)
  }

  async cacheGlobeData() {
    console.log("Caching globe data...");
    let res = await fs.promises.readFile(this.ipdb)
    let data;
    try {
      data = JSON.parse(res)
    } catch (e) {
      return console.log("Error parsing globe data:", e);
    }
    let coords = data.filter(p => p.loc).map(p => {
      let [lat, lng] = p.loc.split(",").map(x => Math.round(parseFloat(x)))
      return lat + "," + lng
    })
    this.globeData = {}
    for (let coord of coords) {
      let dataPoint = this.globeData[coord] 
      if (dataPoint) {
        this.globeData[coord].count++
      } else {
        this.globeData[coord] = {
          count: 1,
          lat: parseInt(coord.split(",")[0]),
          lng: parseInt(coord.split(",")[1]),
        }
      }
    }
    this.globeData = Object.values(this.globeData);
    (async () => {
      await fs.promises.writeFile(this.globe, JSON.stringify(this.globeData))
      await this.log("server", `Cached globe data`)
    })()
  }

  getGlobeData() {
    return this.globeData
  }
}

export { FileManager }