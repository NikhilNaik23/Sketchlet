# Sketchlet — Real-Time Collaborative Whiteboard (MERN + Socket.io)

A minimal real-time collaborative whiteboard, similar to Figma/FigJam, built with
**MongoDB, Express, React, Node.js**, and **Socket.io** for real-time sync.

## Features (MVP)

- Email/password auth with JWT sessions
- Rooms with role-based access control (`owner`, `editor`, `viewer`)
- Per-room persistence for boards, shapes, notes, and pen strokes
- Freehand pen tool (drawn live as other users draw, not just after they finish)
- Shapes: rectangle, ellipse, line
- Sticky notes (double-click to edit text, drag to move)
- Live cursors — see everyone else's cursor position + name/color in real time
- Validation and rate limiting on auth, room, and socket actions
- Clear canvas button (wipes the current room for everyone with edit access)

## Stack

- **Backend:** Node.js, Express, Socket.io, MongoDB + Mongoose, JWT auth, Zod validation
- **Frontend:** React (Vite), HTML5 Canvas, socket.io-client
- Each authenticated user gets a persistent profile color and room memberships stored in MongoDB.

## Project structure

```
mini-figma/
├── server/                # Express + Socket.io + MongoDB backend
│   ├── config/db.js
│   ├── models/Element.js
│   ├── models/Room.js
│   ├── models/User.js
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── socket/handlers.js
│   ├── app.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── client/                 # React (Vite) frontend
    ├── src/
    │   ├── components/
    │   │   ├── Canvas.jsx
    │   │   ├── Toolbar.jsx
    │   │   └── Cursors.jsx
    │   ├── hooks/useSocket.js
    │   ├── App.jsx
    │   ├── App.css
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Setup

### 1. Prerequisites

- Node.js 18+
- A MongoDB instance — either:
  - Local: install MongoDB Community and run `mongod`, or
  - Free cloud: create a free cluster at MongoDB Atlas and copy the connection string

### 2. Backend

```bash
cd server
cp .env.example .env
# edit .env and set MONGO_URI plus JWT_SECRET
npm install
npm run dev        # starts on http://localhost:5000
```

### 3. Frontend

In a new terminal:

```bash
cd client
npm install
npm run dev         # starts on http://localhost:5173
```

Open `http://localhost:5173`, register a user, create or join a room, then open a second
browser window or tab with another account to see room-scoped collaboration and cursor
updates in real time.

### 4. (Optional) Point the frontend at a different backend URL

By default the client connects to `http://localhost:5000`. To change this, create a
`client/.env` file:

```
VITE_SERVER_URL=http://your-server-address:5000
```

## How it works (architecture notes)

- Users authenticate with email/password and receive a JWT that is required for both REST
  requests and Socket.io connections.
- Rooms are persisted in MongoDB with per-room membership and role checks; the server
  only loads and mutates the board for the joined room.
- Every drawing action emits a Socket.io event; the server validates the payload, persists
  it to MongoDB, and broadcasts it to the rest of the room.
- Pen strokes are streamed point-by-point (`stroke:start` / `stroke:point` / `stroke:end`)
  so that other users see the line being drawn live, not just once you lift the pen.
- Cursor positions are broadcast on a lightweight, non-persisted channel (`cursor:move`) —
  they're ephemeral and not saved to the database.

## Roles

- `owner` can manage room members and clear the board.
- `editor` can draw, edit, and clear the board.
- `viewer` can join and watch, but cannot mutate room contents.

## Extending this MVP

Natural next steps if you want to go further:
- Add selection + resize/rotate handles for shapes
- Add layers panel and z-index ordering
- Add undo/redo (operation log or CRDT)
