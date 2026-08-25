const $ = id => document.getElementById(id);
let ws, pc, localStream, roomName;

// --- Système de Toast (Notifications) ---
function toast(text){
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// --- Gestion du QR Code (Maintenant robuste) ---
function makeRoom(){
  $("room").value = Math.floor(100000 + Math.random() * 900000);
  updateQR();
}

function updateQR(){
  const room = $("room").value.trim();
  if(!room) return;
  
  const box = $("qrcode");
  const url = `${location.origin}${location.pathname}?room=${room}`;
  
  // Fonction interne pour générer quand la lib est prête
  const generate = () => {
    if(!window.QRCode) {
        // La lib n'est pas encore chargée, on réessaie dans 200ms
        setTimeout(generate, 200);
        return;
    }
    box.innerHTML = ""; // Vide le texte "Génération..."
    QRCode.toCanvas(url, {width:120, margin:1}, (err, canvas) => {
      if(err) {
          box.textContent = "Erreur QR";
          console.error(err);
      } else {
          box.appendChild(canvas);
      }
    });
  };

  generate();
}

// --- Initialisation au démarrage ---
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const roomParam = params.get("room");
  
  if(roomParam){
    $("room").value = roomParam;
  } else {
    makeRoom();
  }
  updateQR();
  
  // Désactive le partage d'écran sur mobile au démarrage
  if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
    $("share").disabled = true;
    $("share").textContent = "▣ Partage indisponible sur mobile";
    $("share").style.opacity = 0.5;
  }
});

// Événements boutons Accueil
$("random").onclick = makeRoom;
$("room").addEventListener("input", updateQR);

$("join").onclick = () => {
  roomName = $("room").value.trim();
  if(!roomName) return toast("Rentre un code de salon !");
  
  $("home").classList.remove("active");
  $("connected").classList.add("active");
  $("roomLabel").textContent = ` Code : ${roomName}`;
  
  initWebRTC();
};

$("back").onclick = () => location.reload();

// --- Logique WebRTC & Signalement (Corrigée) ---

function initWebRTC() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    // 1. Rejoindre le salon
    ws.send(JSON.stringify({ type: "join", room: roomName }));
    toast("Connecté au serveur");
  };

  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    
    // Initialise le PeerConnection si ce n'est pas déjà fait
    if(!pc) createPeerConnection();

    switch(msg.type) {
      case "ready":
        // L'autre appareil est là, on est prêt à recevoir/envoyer
        break;
      case "offer":
        // On reçoit une demande de connexion
        await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer, room: roomName }));
        break;
      case "answer":
        // On reçoit la réponse à notre demande
        await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
        break;
      case "candidate":
        // On reçoit des informations de chemin réseau
        if (msg.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
        break;
    }
  };
}

function createPeerConnection() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  // Envoi des candidats ICE au serveur
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, room: roomName }));
    }
  };

  // Réception du flux vidéo
  pc.ontrack = (e) => {
    console.log("Flux reçu");
    $("remote").srcObject = e.streams[0];
    $("empty").style.display = "none";
    $("statusDot").classList.add("online");
    toast("Écran reçu !");
  };
}

// --- Action : Partager mon écran (PC/TV seulement) ---
$("share").onclick = async () => {
  if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
      toast("Le partage d'écran est impossible depuis un mobile.");
      return;
  }

  try {
    // Demande au navigateur de choisir l'écran à partager
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    
    // Assure-toi que la connexion WebRTC est prête
    if (!pc) createPeerConnection();
    
    // Ajoute le flux au WebRTC
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    
    // Crée la demande de connexion (Offer)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // Envoie la demande via le serveur
    ws.send(JSON.stringify({ type: "offer", offer, room: roomName }));
    
    // UI mise à jour
    $("share").disabled = true;
    $("stop").disabled = false;
    toast("Partage démarré");
  } catch (err) {
    toast("Partage annulé ou erreur");
    console.error(err);
  }
};

$("stop").onclick = () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  $("share").disabled = false;
  $("stop").disabled = true;
  toast("Partage arrêté");
};