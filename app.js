const $ = id => document.getElementById(id);
let ws, pc, localStream, isCaller = false;

function toast(text){
  $("toast").textContent = text;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2500);
}
function makeRoom(){
  $("room").value = Math.floor(100000 + Math.random()*900000).toString();
  updateQR();
}
function updateQR(){
  if(!window.QRCode) return;
  const room = $("room").value.trim();
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;
  QRCode.toCanvas(url, {width:112, margin:1}, (err, canvas) => {
    if(err) return;
    const box = $("qrcode");
    box.innerHTML = "";
    box.appendChild(canvas);
  });
}
const params = new URLSearchParams(location.search);
$("room").value = params.get("room") || Math.floor(100000 + Math.random()*900000).toString();
setTimeout(updateQR, 100);

$("random").onclick = makeRoom;
$("room").addEventListener("input", updateQR);
$("join").onclick = join;
$("back").onclick = () => location.reload();

async function join(){
  const room = $("room").value.trim().toUpperCase();
  if(!room) return toast("Entre un code.");
  $("join").disabled = true;
  try{
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => ws.send(JSON.stringify({type:"join", room}));
    ws.onmessage = async e => {
      const m = JSON.parse(e.data);
      if(m.type === "full") return toast("Ce code est déjà utilisé.");
      if(m.type === "joined"){
        $("home").classList.remove("active");
        $("connected").classList.add("active");
        $("roomLabel").textContent = `Code ${room}`;
      }
      if(m.type === "peer-joined"){
        isCaller = true;
        toast("Appareil connecté.");
      }
      if(m.type === "offer"){
        await ensurePC();
        await pc.setRemoteDescription(m.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({type:"answer", answer}));
      }
      if(m.type === "answer"){
        await pc.setRemoteDescription(m.answer);
      }
      if(m.type === "candidate"){
        try { await pc.addIceCandidate(m.candidate); } catch {}
      }
      if(m.type === "peer-left") toast("L’autre appareil s’est déconnecté.");
    };
    ws.onerror = () => toast("Impossible de se connecter.");
  }catch(e){ toast("Erreur de connexion."); }
}

async function ensurePC(){
  if(pc) return;
  pc = new RTCPeerConnection({
    iceServers: [{urls:"stun:stun.l.google.com:19302"}]
  });
  pc.onicecandidate = e => {
    if(e.candidate) ws.send(JSON.stringify({type:"candidate", candidate:e.candidate}));
  };
  pc.ontrack = e => {
    $("remote").srcObject = e.streams[0];
    $("empty").style.display = "none";
  };
  pc.onconnectionstatechange = () => {
    if(["failed","disconnected","closed"].includes(pc.connectionState))
      toast("Connexion interrompue.");
  };
}

$("share").onclick = async () => {
  try{
    await ensurePC();
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:{ideal:30,max:60}},
      audio:true
    });
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    $("share").disabled = true;
    $("stop").disabled = false;
    localStream.getVideoTracks()[0].onended = stopShare;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({type:"offer", offer}));
    toast("Partage en cours.");
  }catch(e){
    toast("Le partage d’écran a été annulé ou refusé.");
  }
};

$("stop").onclick = stopShare;
function stopShare(){
  if(localStream) localStream.getTracks().forEach(t=>t.stop());
  $("share").disabled = false;
  $("stop").disabled = true;
}
