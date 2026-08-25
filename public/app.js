const $ = id => document.getElementById(id);
let ws, roomName;

function toast(text){
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// Génération immédiate d'un vrai QR Code via API d'image
function makeRoom(){
  $("room").value = Math.floor(100000 + Math.random() * 900000);
  updateQR();
}

function updateQR(){
  const room = $("room").value.trim();
  if(!room) return;
  const targetUrl = `${location.origin}${location.pathname}?room=${room}`;
  // Utilisation d'un générateur d'image QR ultra-fiable
  $("qrImg").src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(targetUrl)}`;
}

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
  roomName = $("room").value.trim();
  if(!roomName) return toast("Rentre un code de salon !");
  
  $("home").classList.remove("active");
  $("connected").classList.add("active");
  $("roomLabel").textContent = roomName;
  
  initWebSocket();
};

$("back").onclick = () => location.reload();

// Connexion WebSocket pour transmettre les commandes Téléphone -> TV
function initWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", room: roomName }));
    toast("Connecté au salon !");
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "cast_youtube") {
      playYouTubeOnTV(msg.videoId);
    }
  };
}

// Extraire l'ID de la vidéo YouTube depuis n'importe quel lien
function extractYtId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Action d'envoi depuis le téléphone
$("sendYt").onclick = () => {
  const url = $("ytUrl").value.trim();
  const videoId = extractYtId(url);
  
  if(!videoId) return toast("Lien YouTube invalide !");
  
  ws.send(JSON.stringify({
    type: "cast_youtube",
    room: roomName,
    videoId: videoId
  }));
  
  toast("Vidéo envoyée à la TV !");
  $("ytUrl").value = "";
};

// Affichage et lecture sur la TV
function playYouTubeOnTV(videoId) {
  $("empty").style.display = "none";
  const frame = $("ytFrame");
  frame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  frame.style.display = "block";
  toast("Lecture démarrée sur la TV !");
}