const express = require('express');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const crypto = require('crypto');
const favicon = require('serve-favicon');

const app = express();
app.use(favicon(__dirname + '\\favicon.ico'));
const options = {
    cert: fs.readFileSync('SSL\\certificate.crt', 'utf8'),
    key: fs.readFileSync('SSL\\privatekey.pem', 'utf8')
};
const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

// 100자 이상은 줄임표로 바꾸는 winston format
const myFormat = winston.format.printf(({ level, message }) => {
    if (message.length > 100) {
        message = message.substring(0, 100) + '...';
    }
    return `${level}: ${message}`;
});

// winston logger 설정
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        myFormat
    ),
    //defaultMeta: { service: 'app' },
    transports: [
        new winston.transports.Console(),
        //new winston.transports.File({ filename: 'app.log' })
    ]
});

// rooms 리스트
const rooms = [];
const roomMax = 5; // 방 1개당 최대 유저 수
// rooms 리스트 요소 예시
// {
//     roomnumber: 'sdfgkgjd1',
//     users: [
//         ws, // ws.sessionId로 sessionId 사용 가능
//         ws, // ws.username로 username 사용 가능
//         ws, // ws.room으로 roomnumber 사용 가능
//         ws,
//         ...
//     ]
// },
// {
//     roomnumber: '4asdasd',
//     users: [
//         ws,
//         ws,
//         ws,
//         ...
//     ]
// }

// 웹소켓 연결
wss.on('connection', (ws) => {
    logger.info('!NEW!');

    // sessionId 생성
    ws.sessionId = generateSessionId();
    // 해당 ws 연결의 room과 user값을 선언
    ws.room;
    ws.username;

    ws.on('message', (receivedMessage) => {
        //logger.info(`MESG : ${receivedMessage}`);
        // {type, from, to, message} 형태로 메세지를 보내고 받음
        // ex1 login)       { type: 'login',      from: '', to:'', message:{roomrequest: '1234',   username: 'John'} } => to All
        // ex2 joined)      { type: 'joined',     from: '', to:'', message: 'ws.sessionId' } => to me (서버 -> 클라이언트만 발생)
        // ex3 err)         { type: 'error',      from: '', to:'', message: 'error message' } => to me (서버 -> 클라이언트만 발생)
        // ex4 offer)       { type: 'offer',      from: sessionId      to: '' message: 'WebRTC offer' } => to All
        // ex5 answer)      { type: 'answer',     from: sessionId      to: 'ws.sessionId',  message: 'WebRTC answer' } => to sessionId (from offer)
        // ex6 candidate)   { type: 'candidate',  from: sessionId      to: 'ws.sessionId',  message: 'WebRTC candidate' } => to sessionId (from answer)

        // 메세지 파싱
        const data = JSON.parse(receivedMessage);
        // type, roomrequest, username, to 변수 저장 (서버에서 from,sdp 내용 확인은 불필요함)
        const { type, from, to, message } = data;

        // 1. login 메세지인 경우
        if (type === 'login') {
            // rooms 리스트에서 roomnumber==roomrequest인 room을 찾음
            // 없으면 undefined, 있으면 해당 room을 반환
            const existingRoom = rooms.find((room) => room.roomnumber === message.roomrequest);

            // ws에 username, room 정보 저장
            ws.username = message.username;
            logger.info("username : " + ws.username + " sessionId: " + ws.sessionId);

            // room이 존재하는 경우
            if (existingRoom) {
                // 해당 room의 user수가 가득 찬 경우
                if (existingRoom.users.length >= roomMax) {
                    // 에러 메세지 전송
                    const errorMessage = { type: 'error', message: '요청하신 방이 가득 찼습니다.' };
                    ws.send(JSON.stringify(errorMessage));
                    return; // ws.on('message') 핸들러 종료 (이후 함수 실행 안함)
                }
                else {
                    // 해당 ws객체에 찾은 room 참조
                    ws.room = existingRoom;

                    // 해당 room의 users에 user(ws)를 추가
                    existingRoom.users.push(ws);
                    logger.info("Room에 추가 : " + existingRoom.roomnumber);

                }
            }

            // room이 존재하지 않는 경우
            else {
                // 해당 room을 생성하고 해당 room의 users에 user를 추가
                const newRoom = {
                    roomnumber: message.roomrequest,
                    users: [ws],
                };
                logger.info("Room 생성 : " + newRoom.roomnumber);
                rooms.push(newRoom);

                // 해당 ws객체에 새로 만든 room 참조
                ws.room = newRoom;
            }

            // 사용자에게 접속 성공 메세지 전송 (자신의 세션id 전송)
            const joinedMessage = { type: 'joined', message: ws.sessionId };
            logger.info("SEND to : " + ws.room.roomnumber + " / MSG : " + JSON.stringify(joinedMessage));
            ws.send(JSON.stringify(joinedMessage));

            // 전송할 메세지에 보낸 사람 추가
            data.from = ws.sessionId;

            //해당 room에 존재하는 본인 제외 모든 user에게 login 메세지 전송
            sendMessageToAll(ws, data);
        }
        else if (type === 'offer') { // 모두 뿌림
            sendMessageToAll(ws, data);
        }
        else if (type === 'answer' || type === 'candidate') { // 특정 user에게만 전송
            sendMessageToOne(ws, data);
        }
        else { // type이 정의되지 않은 경우
            log.error('Unknown message type : ' + data);
        }
    });

    ws.on('close', () => {
        // ex6 logout)  { type: 'logout',  username: ws.username, sessionId: ws.sessionId } => to All

        logger.info('!CLOSE : ' + ws.sessionId);
        logger.info('EXIT Room : ' + ws.room.roomnumber);
        logger.info('EXIT User : ' + ws.username);

        const logoutMessage = { type: 'logout', message: {username: ws.username, sessionId: ws.sessionId} };
        sendMessageToAll(ws, logoutMessage);

        // 방 정리
        if (ws.room) {
            let exitedUser;
            // 연결 종료된 사용자의 index를 찾음
            const exitedUserIndex = ws.room.users.findIndex((user) => user.sessionId === ws.sessionId);
            // 해당 room의 users에서 해당 user를 삭제
            if (exitedUserIndex > -1) {
                exitedUser = ws.room.users.splice(exitedUserIndex, 1)[0];
            }
            // 사용이 끝난 세션 Id 제거
            expireSessionId(exitedUser.sessionId)
            // 해당 user 변수 삭제
            exitedUser = null;
        }

        // 모든 rooms 확인 후 해당 room의 user수가 0명인 경우 해당 room을 삭제 
        rooms.forEach((room, index) => {
            if (room.users.length === 0) {
                logger.info('Removing room : ' + room.roomnumber);
                rooms.splice(index, 1);
            }
        });
    });

    ws.on('error', () => {
        console.error(error);
        const errorMessage = { type: 'error', message: error };
        ws.send(JSON.stringify(errorMessage));
    });

});

// 뷰 렌더링
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/stream.html', 'utf8');
});

// favicon.ico 요청에 대한 응답
app.get('/favicon.ico', (req, res) => {
    res.sendFile(__dirname + '/favicon.ico');
});

// 서버 리스닝
server.listen(3000, () => {
    logger.info('WebSocket server is listening on port 3000');
});

// 세션 Id 저장 객체
const UUID = [];

// 랜덤한 세션 Id 생성 함수
function generateSessionId() {
    // crypto 라이브러리를 사용하여 랜덤한 세션 Id 생성
    const sessionId = crypto.randomUUID();
    if (UUID.includes(sessionId)) { // UUID에 중복된 세션 Id가 존재하는 경우 재귀호출
        return generateSessionId();
    }
    UUID.push(sessionId); // UUID에 중복된 세션 Id가 없는 경우 UUID에 추가
    return sessionId; // 세션 Id 반환
}

// 사용이 끝난 세션 Id 제거 함수
function expireSessionId(SessionId) {
    const index = UUID.indexOf(SessionId); // UUID에서 삭제할 세션 Id의 index를 찾음
    if (index !== -1) { // UUID에서 삭제할 세션 Id가 존재하는 경우
        UUID.splice(index, 1); // UUID에서 삭제할 세션 Id를 삭제
        logger.info('expireSessionId: ' + SessionId + ' is expired')
    } else {
        logger.warn('expireSessionId: SessionId not found'); // 삭제할 UUID가 존재하지 않는 경우 경고
    }
}

// 특정 room에 존재하는 모든 user에게 메세지 전송
function sendMessageToAll(sender, message) {
    const targetRoom = rooms.find(room => room.roomnumber === sender.room.roomnumber);
    if (targetRoom) {
        targetRoom.users.forEach(user => {
            if (user.sessionId !== sender.sessionId) { // 보내는 사람 제외
                // 메세지 그대로 전송
                logger.info("SEND : " + JSON.stringify(message));
                user.send(JSON.stringify(message));
            }
        });
    }
    else {
        logger.warn('sendMessageToAll : Room not found');
    }
}

// 특정 room에 존재하는 특정 user에게 메세지 전송
function sendMessageToOne(sender, message) {
    const targetRoom = rooms.find(room => room.roomnumber === sender.room.roomnumber);
    if (targetRoom) {
        targetRoom.users.forEach(user => {
            if (user.sessionId === message.to) { // 특정 대상에게만 전송
                // 메세지 그대로 전송
                logger.info("SEND : " + JSON.stringify(message));
                user.send(JSON.stringify(message));
            }
        });
    }
    else {
        logger.warn('sendMessageToOne : Room not found');
    }
}
