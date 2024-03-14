const configuration = {
    'iceServers': [
        {
            'urls': 'stun:stun.l.google.com:19302'
        }
        // ,
        // {
        //     'urls': 'turn:kyj9447.iptime.org:50001',
        //     'username': 'test',
        //     'credential': 'test'
        // }
        // ,
        // {
        //     'urls': 'turn:choiyh.synology.me:50001',
        //     'username': 'test',
        //     'credential': 'test'
        // }
    ]
}

//export let socket = null;
//export var socket = new WebSocket("wss://kyj9447.iptime.org:3000")
var socket = new WebSocket("wss://kyj9447.iptime.org:3000")
// 이벤트 핸들러 설정
socket.onmessage = onmessageHandler;

// 내 media track
var myTracks = [];

// 내 MediaStream
var myStream;

// 내 sessionId
var mySessionId = '';

// 내 roomrequest
var myRoomrequest = '';

// 내 사용자 이름
var myUsername = '';

// 미디어 스트림 가져오기
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        const video = document.querySelector('video');
        video.srcObject = stream;
        myTracks = stream.getTracks();
        myStream = stream;
    })
    .catch(err => {
        console.log('An error occurred: ' + err);
        alert('카메라, 혹은 마이크 연결에 실패했습니다! \n 확인 후 재접속 해주세요'); // 사용자에게 alert
        document.getElementById('loginButton').disabled = true; // loginButton에 disabled 속성 적용
        document.getElementById('randomButton').disabled = true; // randomButton에 disabled 속성 적용
    });

// 상대 Peer객체들
const remotePeers = [];

// 상대 dataChannel 객체들
const remoteDataChannels = [];

// remotePeer 객체 생성자
function RemotePeer(from) {
    // RTCPeer 객체 생성
    this.RTCPeer = new RTCPeerConnection(configuration);
    // dataChannel 생성
    this.dataChannel = this.RTCPeer.createDataChannel('chat');
    this.dataChannel.onopen = () => console.log('Data channel is open!');
    this.dataChannel.onclose = () => console.log('Data channel is closed!');
    this.dataChannel.onmessage = (event) => onChatHandler(event);
    remoteDataChannels.push(this.dataChannel);
    // offer, answer 주고받을때 같이 받은 sessionId
    this.sessionId = from;
    // inboundStream
    this.inboundStream = null;
    // RTCPeer의 이벤트 핸들러 설정
    this.RTCPeer.onnegotiationneeded = () => onnegotiationneededHandler(this);
    this.RTCPeer.oniceconnectionstatechange = () => oniceconnectionstatechangeHandler(this);
    this.RTCPeer.ontrack = (event) => ontrackHandler(event, this);
    this.RTCPeer.onicecandidate = (event) => onicecandidateHandler(event, this);
    this.RTCPeer.ondatachannel = (event) => {
        console.log('Data channel is created!');
        event.channel.onopen = () => console.log('Data channel is open!');
        event.channel.onclose = () => console.log('Data channel is closed!');
        event.channel.onmessage = (event) => onChatHandler(event);
        //remoteDataChannels.push(event.channel);
    }
}

// 연결 내용 변경 감지시
const onnegotiationneededHandler = (remotePeer) => {
    console.log('!!!onnegotiationneeded!!!');
    remotePeer.RTCPeer.createOffer()
        .then((offer) => {
            remotePeer.RTCPeer.setLocalDescription(new RTCSessionDescription(offer));
            return offer;
        })
        .then((myOffer) => {
            sendMessage('offer', mySessionId, remotePeer.sessionId, myOffer);
        })
};

// 연결 상태 변경 감지시
const oniceconnectionstatechangeHandler = (remotePeer) => {
    console.log('!!!oniceconnectionstatechange!!!');
    console.log(remotePeer.RTCPeer.iceConnectionState);
}

// ontrack 이벤트 핸들러
const ontrackHandler = (event, remotePeer) => {
    console.log('!!!ontrack!!!');
    //console.log("ontrack 트리거 : " + event);
    console.log("[ontrack] Added track: " + event.track.kind + ", " + event.track.id);
    if (event.streams && event.streams[0]) {
        console.log("stream 시작 : " + event.streams[0]);
        // 비디오 태그에 스트림 추가
        newVideo(remotePeer.sessionId, event.streams[0]);
    }
    else {

        if (remotePeer.inboundStream === null) {
            remotePeer.inboundStream = new MediaStream();
        }
        console.log("not stream: " + event);
        console.log("새 stream track 추가 : " + event);
        remotePeer.inboundStream.addTrack(event.track);

        newVideo(remotePeer.sessionId, remotePeer.inboundStream);
    }
};

// candidate 생성
const onicecandidateHandler = (event, remotePeer) => {
    console.log("!!! onicecandidateHandler !!!" + JSON.stringify(event.candidate));
    if (event.candidate !== null) {
        // candidate 전송
        sendMessage('candidate', mySessionId, remotePeer.sessionId, event.candidate);
    }
    else {
        console.log('!!!candidate 생성 완료!!!');
    }
};

// Submit 버튼 클릭 시
window.startChat = startChat;
function startChat(event) {
    // 기본 이벤트 제거 (없으면 페이지 새로고침됨)
    event.preventDefault();

    // 웹소켓 연결
    //socket = new WebSocket("wss://kyj9447.iptime.org:3000")

    // onopen핸들러 그냥 실행 (ws 전역으로 이미 연결되어있음)
    // 입력값 가져오기
    myRoomrequest = document.getElementById('roomrequest').value;
    myUsername = document.getElementById('username').value;

    // JSON으로 메시지 생성
    const data = {
        roomrequest: myRoomrequest,
        username: myUsername,
    };

    // 로그인 메세지 전송
    sendMessage('login', '', '', data);
}

// 소켓이 메시지를 받았을 때 핸들러 ---------------------------------------------------------
function onmessageHandler(event) {
    // 받은 메세지를 JSON으로 파싱
    const parsedMessage = JSON.parse(event.data);
    console.log("[받음] " + JSON.stringify(parsedMessage));

    // 1.offer를 받았을 때
    if (parsedMessage.type === "offer") {
        // remotePeer객체 생성
        const newPeer = new RemotePeer(parsedMessage.from);
        remotePeers.push(newPeer);
        //console.log("current remotes : "+JSON.stringify(remotePeers));
        for (const track of myTracks) {
            newPeer.RTCPeer.addTrack(track, myStream);
        }

        // offer 처리, answer 전송
        newPeer.RTCPeer.setRemoteDescription(new RTCSessionDescription(parsedMessage.data))
            .then(() => {
                return newPeer.RTCPeer.createAnswer();
            })
            .then(answer => {
                //console.log('answer 생성 by offer');
                newPeer.RTCPeer.setLocalDescription(new RTCSessionDescription(answer));
                return answer;
            })
            .then((myAnswer) => {
                // answer 전송
                sendMessage('answer', mySessionId, parsedMessage.from, myAnswer);
            });
    }

    // 2.answer를 받았을 때
    else if (parsedMessage.type === "answer") {
        // remotePeer 객체 가져오기
        let newPeer = remotePeers.find(peer => peer.sessionId === parsedMessage.from);

        //console.log(newPeer.sessionId + "에 answer 추가");
        newPeer.RTCPeer.setRemoteDescription(new RTCSessionDescription(parsedMessage.data))
    }

    // 3.candidate를 받았을 때
    else if (parsedMessage.type === "candidate") {
        // remotePeer 객체 가져오기
        let newPeer = remotePeers.find(peer => peer.sessionId === parsedMessage.from);
        console.log("add candidate " + JSON.stringify(parsedMessage));
        newPeer.RTCPeer.addIceCandidate(new RTCIceCandidate(parsedMessage.data));
    }

    // 4.login을 받았을 때
    else if (parsedMessage.type === "login") {

        // html태그 추가
        let loginmessage = parsedMessage.data.username + "님이 로그인하였습니다";
        let paragraph = document.createElement("p");
        let text = document.createTextNode(loginmessage);
        paragraph.appendChild(text);
        document.body.appendChild(paragraph);

        // 해당 login의 사용자에 대한 RTCPeer 객체 생성
        const newPeer = new RemotePeer(parsedMessage.from);
        for (const track of myTracks) {
            newPeer.RTCPeer.addTrack(track, myStream);
        };

        remotePeers.push(newPeer);
        //console.log("current remotes : "+JSON.stringify(remotePeers));
    }

    // 5.logout을 받았을 때
    else if (parsedMessage.type === "logout") {
        let logoutmessage = parsedMessage.data.username + "님이 로그아웃하였습니다";
        let paragraph = document.createElement("p");
        let text = document.createTextNode(logoutmessage);
        paragraph.appendChild(text);
        document.body.appendChild(paragraph);

        // 해당 사용자의 sessionId를 id로 하는 video 태그 삭제
        let videoElement = document.getElementById(parsedMessage.data.sessionId);
        if (videoElement) {
            videoElement.remove();
        }

        // 해당 사용자의 remotePeer 객체 삭제
        let index = remotePeers.findIndex(peer => peer.sessionId === parsedMessage.data.sessionId);
        if (index !== -1) {
            const remotePeerToDelete = remotePeers.splice(index, 1)[0];
            deleteRemotePeer(remotePeerToDelete);
            //console.log("remote Deleted / current : "+JSON.stringify(remotePeers));
        }
    }

    // 6.joined를 받았을때
    else if (parsedMessage.type === "joined") {
        // 내 sessionId 저장
        mySessionId = parsedMessage.data;

        // 화면에 html태그 방 번호, 사용자 이름 추가
        let paragraph = document.getElementById("roomNumber")
        let text = document.createTextNode("방 번호 : " + myRoomrequest);
        paragraph.appendChild(text);

        // // 세션 아이디 출력
        // let notice = "내 sessionId : " + mySessionId;
        // paragraph = document.createElement("p");
        // text = document.createTextNode(notice);
        // paragraph.appendChild(text);
        // document.body.appendChild(paragraph);

        // 입력 폼 삭제
        document.getElementById('form').remove();
    }

    // 7.randomCheck를 받았을 때
    // {type: "randomCheckResult", data: {result: "ok", roomrequest: "1234"}}
    else if (parsedMessage.type === "randomCheckResult") {
        if (parsedMessage.data.result === "ok") { // 결과가 ok이면
            // html태그에 해당 방 번호 자동입력
            document.getElementById('randomButton').disabled = true;
            document.getElementById('roomrequest').value = parsedMessage.data.roomrequest;
        }
        else { // 결과가 ok이 아니면 (=fail)
            // ok가 올때까지 재전송
            randomRoom();
        }
    }

    // etc.error를 받았을 때
    else if (type === "error") {
        console.log("error: " + JSON.stringify(parsedMessage));
    }
};
// 소켓이 메시지를 받았을 때 끝---------------------------------------------------------

// 3. sendMessage 함수
function sendMessage(type, from, to, data) {
    // 입력값 가져오기

    // JSON으로 메시지 생성
    const messageToSend = {
        type: type,
        from: from,
        to: to,
        data: data
    };

    //console.log("[보냄] type: " + type + " /from: " + from + " /to: " + to);
    console.log("[보냄] " + JSON.stringify(messageToSend));
    // 메세지 전송
    socket.send(JSON.stringify(messageToSend));
}

// 4. 새 스트림 추가
function newVideo(sessionId, newStream) {
    const videoElementNumber = sessionId;
    let videoElement = document.getElementById(videoElementNumber);
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.id = videoElementNumber;
        videoElement.className = 'video';
        videoElement.autoplay = true; // Added autoplay option
        videoElement.width = 320; // Set width to 320 pixels
        videoElement.height = 240; // Set height to 240 pixels
        videoElement.srcObject = newStream;
        const remoteVideos = document.querySelector('#remoteVideos');
        remoteVideos.appendChild(videoElement); // Add videoElement to remoteVideos
    }
}

// 5. RemotePeer 객체 삭제
function deleteRemotePeer(remotePeer) {
    // RTCPeerConnection 객체 닫기
    if (remotePeer.RTCPeer) {
        // 이벤트 핸들러 제거
        remotePeer.RTCPeer.onnegotiationneeded = null;
        remotePeer.RTCPeer.oniceconnectionstatechange = null;
        remotePeer.RTCPeer.ontrack = null;
        remotePeer.RTCPeer.onicecandidate = null;

        // RTCPeerConnection 연결 닫기
        remotePeer.RTCPeer.close();
        remotePeer.RTCPeer = null;
    }

    // 다른 속성들도 null로 설정
    remotePeer.sessionId = null;
    remotePeer.inboundStream = null;
    remotePeer = null;
}

//================================================================================================
// UserInterface.js
// html에서 접근할 수 있도록 전역변수로 선언
window.randomRoom = randomRoom;
function randomRoom() {
    // UUID 생성
    const uuidValue = crypto.randomUUID();

    // 메세지 작성 후 서버로 전송
    const message = {
        type: 'randomCheck',
        data: uuidValue
    };

    socket.send(JSON.stringify(message));
}

window.displayRoomNumber = displayRoomNumber;
function displayRoomNumber() {
    const displayButton = document.getElementById('displayButton');
    displayButton.innerText = displayButton.innerText === '표시' ? '숨기기' : '표시';

    const roomNumber = document.getElementById('roomNumber');
    roomNumber.style.display = roomNumber.style.display === 'block' ? 'none' : 'block';

    const shareButton = document.getElementById('shareButton');
    shareButton.style.display = shareButton.style.display === 'block' ? 'none' : 'block';
}

window.shareRoomNumber = shareRoomNumber;
function shareRoomNumber() {
    if (myRoomrequest !== '') {
        navigator.share({
            title: "WebRTC 방 번호 공유하기",
            text: myRoomrequest,
        })
    }
}

window.sendChat = sendChat;
function sendChat(event) {
    event.preventDefault();

    let chatInput = document.getElementById('chatInput').value;
    let sender = myUsername;
    let chatMessage = {
        sender: sender,
        chatInput: chatInput
    };

    let paragraph = document.createElement("p");
    paragraph.style.color = "blue"; // 내가 보낸 chat
    let text = document.createTextNode(sender + " : " + chatInput);
    paragraph.appendChild(text);
    document.body.appendChild(paragraph);

    remoteDataChannels.forEach(dataChannel => {
        if (dataChannel.readyState === 'open') {
            console.log('Data channel is open!');
        } else {
            console.log('Data channel is not open!');
        }
        console.log(JSON.stringify(chatMessage));
        dataChannel.send(JSON.stringify(chatMessage));
    });
}

function onChatHandler(event) {
    let chatMessage = JSON.parse(event.data);
    console.log(chatMessage);
    let sender = chatMessage.sender;
    let chatInput = chatMessage.chatInput;

    let paragraph = document.createElement("p");
    let text = document.createTextNode(sender + " : " + chatInput);
    paragraph.appendChild(text);
    document.body.appendChild(paragraph);
    
}