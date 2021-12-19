/*
FileManager handles 90% of the file system read/write operations.
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
  str = str.replace(/\ /g, '-');
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
    this.logLengthLimit = 400;
    this.projectInfoCache = []

    // Check if logs, and profile directories exist
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


  // Server storage
  validateKey(key) {
    // Limit key to 32 characters
    if (key.length > 32) {
      return {
        ok: false,
        key: key.slice(0, 32) + '...',
        error: `Key length must be less than 32 characters.`
      }
    }

    // Limit key to alphanumeric characters, underscores, and dashes
    if (key.match(/[^a-zA-Z0-9_-]/)) {
      return {
        ok: false,
        key: key,
        error: `Key must be alphanumeric, underscores, or dashes.`
      }
    }

    return {
      ok: true,
      key: key
    }
  }
  validateValue(key, value) {
    // Limit value to 100KB
    if (value.length > 100 * 1024) {
      return {
        ok: false,
        key: key,
        error: `Value too large. Max size is 100KB.`
      }
    }

    return {
      ok: true,
    }
  }
  async getItem(projectName, key) {
    let output = this.validateKey(key)
    if (!output.ok) return output
    let filePath = path.join(this.deno, projectName, "storage", key)
    let file = await fs.promises.readFile(filePath, "utf8")
    return {
      ok: true,
      key: key,
      value: file
    }
  }
  async setItem(projectName, key, value) {
    let output = this.validateKey(key)
    if (!output.ok) return output
    output = this.validateValue(key, value)
    if (!output.ok) return output
    let filePath = path.join(this.deno, projectName, "storage", key)
    await fs.promises.writeFile(filePath, value)
    return {
      ok: true,
      key: key,
    }
  }
  async removeItem(projectName, key) {
    let output = this.validateKey(key)
    if (!output.ok) return output
    let filePath = path.join(this.deno, projectName, "storage", key)
    await fs.promises.unlink(filePath)
    return {
      ok: true,
      key: key,
    }
  }
  async clearItems(projectName) {
    let filePath = path.join(this.deno, projectName, "storage")
    await fs.promises.rmdir(filePath, { recursive: true })
    return {
      ok: true,
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
    let maxPlayers = parseInt(newInfo.maxPlayers) || 100 
    maxPlayers = Math.min(100, Math.max(2, maxPlayers)) // Clamp to 2-100
    newInfo = {
      basedOn: newInfo.basedOn,
      name: sanitizedProjectName,
      desc: trimTo(newInfo.desc, 140),
      version: trimTo(newInfo.version, 30),
      author: writerUid,
      isTemplate: newInfo.isTemplate,
      isBasicTemplate: false,
      views: 0,
      ratings: [0, 0, 0, 0, 0],
      maxPlayers: maxPlayers
    }
    await this.setInfo(sanitizedProjectName, newInfo, writerUid, true) // Override with new name in info.json

    // Set client and server
    let clientCode = await this.getClient(newInfo.basedOn)
    let serverCode = await this.getServer(newInfo.basedOn)
    await this.setClient(sanitizedProjectName, clientCode, writerUid)
    await this.setServer(sanitizedProjectName, serverCode, writerUid)

    // Set server storage directory
    await fs.promises.mkdir(path.join(this.deno, sanitizedProjectName, "storage"))

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