# zeta4 

Inspiration for this project came from Khan Academy's [Live Editor](https://github.com/Khan/live-editor). Specifically, the challenge was to create a truly multiplayer experience without leaving Khan Academy. In the past, I did this using [self-editing code](https://github.com/kqwq/zeta3/blob/master/peer/zeta3.js#:~:text=function%20putCode(code)%20%7B) (zeta3), but I wanted to take this a step further and reduce the latency between the client and server.

## Explanation
At first, this project was simply a library for connecting with a remote NodeJS server. Eventually, I added WebRTC support and removed peer-to-peer support left over from zeta3. This allowed scalability to handle 10+ connections (while sacrificing a tiny bit of latency). This project evolved into a full-fledged platform that now supports user-created projects. Logged in users can create, edit, and delete up to 5 of their own multiplayer projects. Users who aren't logged in can join projects but can't create their own. Logging in is done by editing the user's bio with a special code that identifies them. This is a one-time process; next time they visit the site, their localStorage will log them in. 
### TLDR; I'm a visual learner
[Server layout](https://github.com/kqwq/zeta4/blob/master/server/file_layout.pdf)
### Won't this get banned on Khan Academy?
No. This project runs in the [New webpage](https://www.khanacademy.org/computer-programming/new/webpage) page on Khan Academy. Copy the [the obfuscated code](https://kqwq.me/zeta4/client/popup.html) into the editor and you'll be able to connect to the server. This projects breaks no explicitly stated guidelines on Khan Academy.

## Join
[https://kqwq.me/metaverse/](https://kqwq.me/metaverse/)<br>
[Alternate link](https://kqwq.me/zeta4/client/)

## Build
To run an instance of the metaverse see [server/README.md](https://github.com/kqwq/zeta4/tree/master/server), however I left out a few steps so DM me on Discord if you want to get started. Check my [GitHub](https://github.com/kqwq) for contact. I'll be happy to help you out.

## Bugs
If you find any bugs, open an issue or DM me on Discord.
<br>
<small>Current version 4.9. Version 4.10 will have persistent storage and better UI.</small>

---

Thanks to everyone on Discord who has helped me with this project! No way I'd be able to do this without you.