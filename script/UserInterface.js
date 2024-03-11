import { socket } from "./WebRTC.js";

// html에서 접근할 수 있도록 전역변수로 선언
//window.randomRoom = randomRoom;

//이벤트 리스너 추가
document.getElementById('randomButton').addEventListener('click', randomRoom);
function randomRoom(event) {
    event.preventDefault();

    // UUID 생성
    const uuidValue = crypto.randomUUID();

    // 메세지 작성 후 서버로 전송
    const message = {
            type: 'randomCheck',
            data: uuidValue
        };

    socket.send(JSON.stringify(message));
}