const express = require('express');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');

const app = express();
const options = {
    cert: fs.readFileSync('SSL\\certificate.crt','utf8'),
    key: fs.readFileSync('SSL\\privatekey.pem','utf8'),
};
const server = https.createServer(options,app);
//const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// rooms 리스트
const rooms = [];
// rooms 리스트 요소 예시
// {
//     roomnumber: 'sdfgkgjd1',
//     users: [
//         {username: 'John', sessionId: '1q2w3e4r'},
//         {username: 'Jane', sessionId: '5t6y7u8i'},gi
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

wss.on('connection', (ws) => {
    console.log('WebSocket connection established');
    ws.on('message', (message) => {
        wss.sessionId = generateSessionId();

        console.log(`Received message: ${message}`);
        // ex) { roomrequest: '1q2w3e4r', username: 'John'}

        // 메세지 파싱
        const data = JSON.parse(message);

        // roomrequest, username 변수 저장
        const { roomrequest, username } = data;

        // rooms 리스트에서 roomnumber가 roomrequest인 room을 찾음
        // 없으면 undefined, 있으면 해당 room을 반환
        const existingRoom = rooms.find((room) => room.roomnumber === roomrequest);

        // user 객체 생성
        const user = { username, sessionId: wss.sessionId };
        console.log("username : " + username + " sessionId: " + wss.sessionId);

        if (existingRoom) {

            // rooms에 해당 room이 존재하면, 해당 room의 users에 user를 추가
            existingRoom.users.push(user);
            console.log(existingRoom);

            // 해당 rooms에 속한 모든 user에게 메세지 전송
            existingRoom.users.forEach((user) => {
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client.sessionId === user.sessionId) {
                        client.send(`사용자 ${username} 님이 접속했습니다.`);
                    }
                });
            });


        } else {
            // rooms에 해당 room이 존재하지 않으면, 해당 room을 생성하고 해당 room의 users에 user를 추가
            const newRoom = {
                roomnumber: roomrequest,
                users: [user],
            };
            rooms.push(newRoom);
        }

        // rooms 확인 후 해당 room의 user수가 0명인 경우 해당 room을 삭제 
        rooms.forEach((room, index) => {
            if (room.users.length === 0) {
                console.log('Removing room ', room.roomnumber);
                rooms.splice(index, 1);
            }
        });


    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
    
        // 접속 종료시 rooms 리스트에서 해당 세션 아이디를 가진 user를 삭제
        rooms.forEach((room) => {
            const userIndex = room.users.findIndex((user) => user.sessionId === wss.sessionId);
            if (userIndex > -1) {
                const user = room.users.splice(userIndex, 1)[0];
    
                // 해당 rooms에 속한 모든 user에게 메세지 전송
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(`사용자 ${user.username} 님이 접속을 종료했습니다.`);
                    }
                });
            }
        });
    });
});

const path = require('path');
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views\\stream.html'));
});

server.listen(3000, () => {
    console.log('WebSocket server is listening on port 3000');
});

// 랜덤한 세션 Id 생성 함수
function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
