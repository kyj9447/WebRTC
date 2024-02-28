const express = require('express');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');

const app = express();
const options = {
    cert: fs.readFileSync('SSL\\certificate.crt', 'utf8'),
    key: fs.readFileSync('SSL\\privatekey.pem', 'utf8'),
};
const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

// rooms 리스트
const rooms = [];
// rooms 리스트 요소 예시
// {
//     roomnumber: 'sdfgkgjd1',
//     users: [
//         {username: 'John', sessionId: '1q2w3e4r'},
//         {username: 'Jane', sessionId: '5t6y7u8i'},
//         ...
//     ]
// },
// {
//     roomnumber: '4asdasd',
//     users: [
//         {username: 'Mike', sessionId: 'rqwerwer'},
//         {username: 'Marry', sessionId: 'fqksnd8i'},
//         {username: 'James', sessionId: 'dsfg35fg'},
//         ...
//     ]
// }

// 웹소켓 연결
wss.on('connection', (ws) => {
    ws.sessionId = generateSessionId();
    console.log('WebSocket connection established');
    const connections = {};
    ws.on('message', (message) => {
        // console.log(`Received message: ${message}`);
        // ex1 최초 접속) { type: 'login', roomrequest: '1q2w3e4r', username: 'John', rtc: 'WebRTC offer'}
        // ex2 RTC 통신) { type: 'RTC', rtc: 'WebRTC answer, WebRTC candidate'}

        // 메세지 파싱
        const data = JSON.parse(message);

        // type, roomrequest, username 변수 저장
        const { type, roomrequest, username } = data;

        // 최초 접속인 경우
        if (type === 'login') {
            // user 객체 생성
            const user = { username, sessionId: ws.sessionId };
            console.log("username : " + user.username + " sessionId: " + ws.sessionId);

            // rooms 리스트에서 roomnumber가 roomrequest인 room을 찾음
            // 없으면 undefined, 있으면 해당 room을 반환
            const existingRoom = rooms.find((room) => room.roomnumber === roomrequest);

            // room이 존재하는 경우
            if (existingRoom) {
                console.log("기존 방에 사용자 추가");
                // 해당 room의 users에 user를 추가
                existingRoom.users.push(user);
                console.log(existingRoom);

            }
            // room이 존재하지 않는 경우
            else {
                // 해당 room을 생성하고 해당 room의 users에 user를 추가
                const newRoom = {
                    roomnumber: roomrequest,
                    users: [user],
                };
                rooms.push(newRoom);
                console.log(rooms);
            }

            // !해당 room과 user를 connections에 저장! (이후 RTC 통신을 위해)
            connections[ws.sessionId] = { existingRoom, user };
        }

        // 모든 경우 공통실행 (해당 room에 존재하는 모든 user에게 메세지 전송)
        if (connections[ws.sessionId].existingRoom) {
            connections[ws.sessionId].existingRoom.users.forEach((otherUser) => {
                if (otherUser.sessionId !== connections[ws.sessionId].user.sessionId) {
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && client.sessionId === otherUser.sessionId) {
                            // 파싱 전 메세지 그대로 전송
                            //console.log("message : " + data);
                            client.send(JSON.stringify(data));
                        }
                    });
                }
            });
        }
    });

    ws.on('close', () => {
        // ex3 접속 종료시) { type: 'logout', username: 'John'}
        console.log(`WebSocket connection closed ${ws.sessionId}`);

        // 접속 종료시 해당 사용자가 속한 room을 찾음
        const usedRoom = rooms.find((rooms) => {
            return rooms.users.some((user) => user.sessionId === ws.sessionId);
        });

        console.log('Room: ', usedRoom.roomnumber);

        if (usedRoom) {
            console.log('Room with disconnected user: ', usedRoom);
            // 연결 종료된 사용자의 index를 찾음
            const disconnectedUserIndex = usedRoom.users.findIndex((user) => user.sessionId === ws.sessionId);
            if (disconnectedUserIndex > -1) {
                // splice를 사용하여 해당 index의 user를 삭제 (삭제된 user는 disconnectedUser에 저장)
                const disconnectedUser = usedRoom.users.splice(disconnectedUserIndex, 1)[0];
                // 해당 room의 users에 남아있는 user들에게 logout 메세지 전송
                usedRoom.users.forEach((otherUser) => {
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && client.sessionId === otherUser.sessionId) {
                            const logoutMessage = JSON.stringify({ type: 'logout', username: disconnectedUser.username });
                            client.send(logoutMessage);
                        }
                    });
                });
            }
        }

        // 모든 rooms 확인 후 해당 room의 user수가 0명인 경우 해당 room을 삭제 
        rooms.forEach((room, index) => {
            if (room.users.length === 0) {
                console.log('Removing room ', room.roomnumber);
                rooms.splice(index, 1);
            }
        });
    });
});

// 뷰 렌더링
const path = require('path');
const { Console } = require('console');
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views\\stream.html'));
});

// 서버 리스닝
server.listen(3000, () => {
    console.log('WebSocket server is listening on port 3000');
});

// 랜덤한 세션 Id 생성 함수
function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
