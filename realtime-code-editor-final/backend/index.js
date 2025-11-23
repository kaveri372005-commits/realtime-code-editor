import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import axios from "axios";
import https from 'https';

const app = express();

const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", ({ roomId, userName }) => {
    if(currentRoom){
      socket.leave(currentRoom);
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit("userJoined",Array.from(rooms.get(currentRoom).users));
    }
    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)){
       rooms.set(roomId, {users:new Set(), code:"//start code here",output:""});
    }

    rooms.get(roomId).users.add(userName);

    socket.emit("codeUpdate",rooms.get(roomId).code)

    io.to(roomId).emit("userJoined", Array.from(rooms.get(currentRoom).users));
  });

  socket.on("codeChange", ({ roomId, code }) => {
    if(rooms.has(roomId)){
      rooms.get(roomId).code = code;
    }
    socket.to(roomId).emit("codeUpdate", code);
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit(
        "userJoined",
        Array.from(rooms.get(currentRoom).users)
      );
      socket.leave(currentRoom);
      
      currentRoom = null;
      currentUser = null;
    }
  });
  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });
  socket.on("languageChange", ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);
  });
  // ... inside your Socket.<anonymous> function ...
socket.on("compileCode", async ({ code, roomId, language, version, input})=>{
  if(rooms.has(roomId)){
    const room = rooms.get(roomId);
    
    // 1. Define the data payload (the body of the POST request)
    const dataPayload = {
      language,
      version,
      files:[
        {
          content:code,
        },
      ],
      stdin : input,
    };
    
    // 2. Make the POST request: URL, Data, Config
    try {
      const response = await axios.post(
        "https://emkc.org/api/v2/piston/execute", // 1. URL
        dataPayload,                             // 3. Config (containing the httpsAgent)
      );
      
      console.log(response.data);

      room.output = response.data.run.output;
      io.to(roomId).emit("codeResponse",response.data);
      
    } catch (error) {
      console.error("Error compiling code:", error.message);
      // It's good practice to send an error back to the client
      socket.emit("codeResponse", {
        run: {
          output: `Compilation Failed: ${error.message}. Check server logs for details.`,
          stderr: error.message
        }
      });
    }
  }
});  
  socket.on("disconnect", () => {
    if(currentRoom && currentUser){
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit("userjoined",Array.from(rooms.get(currentRoom).users));
    }
    console.log("User Disconnected");
  });
});

const port = process.env.PORT || 5000;
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "/frontend/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log("Server running on port 5000");
});
