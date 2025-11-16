# RSSchool NodeJS websocket task

> [Task](https://github.com/AlreadyBored/nodejs-assignments/blob/main/assignments/battleship/assignment.md)

## Installation

`npm install`

## Usage

**Development**

`npm run start`

- App served @ `http://localhost:8181`
- WebSocket server served @ `http://localhost:3000`

**Production**

`npm run start:prod`

- App served @ `http://localhost:8181`

---

**All commands**

| Command              | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `npm run start`      | App served @ `http://localhost:8181` with nodemon    |
| `npm run start:prod` | App served @ `http://localhost:8181` without nodemon |
| `npm run build`      | Build project to /dist using Webpack                 |
| `npm run format`     | Format project using Prettier                        |
| `npm run lint`       | Show eslint issues                                   |
| `npm run lint:fix`   | Auto-fix possible eslint issues                      |
