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

function trimTo(str, len) {
  if (str.length > len) {
    return str.substring(0, len - 3) + '...'
  }
  return str;
}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_\-]/g, '')
}

class FileManager {
  constructor() {
    this.storage = "./storage"
    this.deno = "./storage/deno"
    this.logs = "./storage/logs"
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

    // Check if storage, deno, and logs directories exist
    if (!fs.existsSync(this.storage)) {
      fs.mkdirSync(this.storage);
    }
    if (!fs.existsSync(this.deno)) {
      fs.mkdirSync(this.deno);
    }
    if (!fs.existsSync(this.logs)) {
      fs.mkdirSync(this.logs);
    }

    // Add "program started" to log
    this.log("", "")
    this.log("", " ====================================== ")
    this.log("", "             SERVER STARTED             ")
    this.log("", " ====================================== ")


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
    let filePath = path.join(this.logs, this.getDatestamp()+".log")
    await fs.promises.appendFile(filePath, `${this.getTimestamp()} ${uid} ${data}`.slice(0, this.logLengthLimit)+"\n");
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
    return projInfo.owner === writerUid || !projInfo.owner // If no owner, anyone can write
  }

  // Misc
  async createProject(projectName, writerUid, newInfo) {
    let sanitizedProjectName = sanitize(projectName).trimTo(60)
    let denoProjectPath = `${denoPath}/${sanitizedProjectName}`

    // Check if project already exists
    let stat = await fs.promises.stat(denoProjectPath)
    if (stat.isDirectory()) {
      return false
    }

    // Create project folder
    await fs.promises.mkdir(denoProjectPath)

    if (newInfo.basedOn) { // Copy from existing project (template)
      let basedOnProj = newInfo.basedOn
      let templatePath = path.join(this.deno, basedOnProj)
      await fs.promises.copy(templatePath, denoProjectPath)
      let oldInfo = await this.getInfo(basedOnProj)
      let newInfo = {
        ...oldInfo,
        name: sanitizedProjectName,
        owner: writerUid,
        isTemplate: false,
        basedOn: basedOnProj,
        created: new Date().toISOString(),
        views: 0,
        ratings: [0, 0, 0, 0, 0],
      }
      await this.setInfo(sanitizedProjectName, newInfo, writerUid, true) // Override with new name in info.json
    } else { // Create new project from info provided
      let newProject = {
        name: sanitizedProjectName,
        desc: trimTo(newInfo.desc, 1000) || "Blank description",
        version: trimTo(newInfo.version, 60) || "1.0.0",
        owner: writerUid,
        isTemplate: newInfo.isTemplate || false,
        basedOn: null,
        created: new Date().toISOString(),
        views: 0,
        ratings: [0, 0, 0, 0, 0],
      }
      let clientCode = this.defaultClient(sanitizedProjectName)
      let serverCode = this.defaultServer(sanitizedProjectName)
      await this.setClient(sanitizedProjectName, clientCode, writerUid)
      await this.setServer(sanitizedProjectName, serverCode, writerUid)
      await this.setInfo(sanitizedProjectName, newProject, writerUid, true)
      return {
        client: clientCode,
        server: serverCode,
        info: newProject,
      }
    }
  }

  async deleteProject(projectName, writerUid) {
    let canWrite = await this.canWrite(projectName, writerUid)
    if (canWrite) {
      let denoProjectPath = `${denoPath}/${projectName}`
      await fs.promises.rmdir(denoProjectPath)
    } else {
      throw new Error(`${writerUid} does not have permission to delete ${projectName}`)
    }
  }



}

export { FileManager }