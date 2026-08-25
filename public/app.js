const $ = id => document.getElementById(id);
let ws, pc, localStream, isCaller = false;

function toast(text){
  $("toast").textContent = text;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3000);
}

function makeRoom(){
  $("room").value = Math.floor(100000 + Math.random() * 900000);
  updateQR();
}

function updateQR(){
  if(!window.QRCode) return setTimeout(updateQR, 200); // Réessaie si la lib n'est pas chargée
  const room = $("room").value.trim();
  if(!room) return;
  const url = `${location.origin}${location.pathname}?room=${room}`;
  
  const box = $("qrcode");
  box.innerHTML = "";
  QRCode.toCanvas(url, {width:120, margin:1}, (err, canvas) => {
    if(!err) box.appendChild(canvas);
  });
}

// Initialisation au chargement de la page
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const roomParam = params.get("room");
  
  if(roomParam){
    $("room").value = roomParam;
  } else {
    makeRoom();
  }
  updateQR();
});

$("random").onclick = makeRoom;
$("room").addEventListener("input", updateQR);

$("join").onclick = () => {
  const room = $("room").value.trim();
  if(!room) return toast("Rentre un code de salon !");
  
  $("home").classList.remove("active");
  $("connected").classList.add("active");
  $("roomLabel").textContent = ` Code : ${room}`;
  
  initWebRTC(room);
};

$("back").onclick = () => location.reload();

function initWebRTC(room) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", room }));
    toast("Connecté au serveur de signalement");
  };

  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === "ready") {
      createPeerConnection(room);
    } else if (msg.type === "offer") {
      createPeerConnection(room);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: "answer", answer, room }));
    } else if (msg.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
    } else if (msg.type === "candidate") {
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  };
}

function createPeerConnection(room) {
  if (pc) return;
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, room }));
    }
  };

  pc.ontrack = (e) => {
    $("remote").srcObject = e.streams[0];
    $("empty").style.display = "none";
    $("statusDot").classList.add("online");
  };

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }
}

$("share").onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    
    if (pc) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const room = $("room").value.trim();
      ws.send(JSON.stringify({ type: "offer", offer, room }));
    }
    
    $("share").disabled = true;
    $("stop").disabled = false;
  } catch (err) {
    toast("Erreur de partage d'écran");
  }
};

$("stop").onclick = () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  $("share").disabled = false;
  $("stop").disabled = true;
};