# Zeta4 Server
Multiplayer games on Khan Academy.

Features:
- Ability to create, edit, and delete projects
- V


## Build instructions
1. Clone this repo `git clone ...`
2. Under root, create a .env file with these fields
```
LINK_USERNAME=   Khan Academy username
LINK_PASSWORD=   Khan Academy password
IPINFO_TOKEN=    ipinfo.io Token
GLOBAL_PASSWORD= Write any password here for access to special commands in server/_global.js
```

No verified email or 5000+ energy points required for the Khan Academy account.

3. Run `npm install && npm run start`

This will generate a config.json file with a new KAAS key and project ID. You can swap these values for another valid key/ID between restarts.


## FAQ
Q: Where are the server logs stored?<br>
A: `server/storage/logs/*`

Q: How do I get a new KAAS key?<br>
A: You don't need to do anything. Just run `npm run start` with a valid Khan Academy username/password pair.

Q: 

