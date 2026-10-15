const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
const stage = $("stage"), preview = $("preview"), hint = $("stageHint"), result = $("result");
let stream = null, rafId = null;

function decode(source, w, h) {
  canvas.width = w; canvas.height = h;
  ctx.drawImage(source, 0, 0, w, h);
  return jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
}

async function analyze(content) {
  result.innerHTML = '<p class="empty">Checking…</p>';
  try {
    const res = await fetch("/api/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    render(data);
  } catch (e) {
    result.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = "Could not check this code: " + e.message + ". Make sure the Python server is running.";
    result.append(p);
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;   // textContent: QR data is untrusted
  return n;
}

function render(d) {
  const titles = { safe: "Looks safe", suspicious: "Be careful", dangerous: "Likely fraud" };
  const advice = {
    safe: "No warning signs found. Still confirm the sender if money is involved.",
    suspicious: "Some warning signs. Do not enter passwords or payment details.",
    dangerous: "Do not open this link or pay. Report the QR code to its location owner.",
  };
  result.innerHTML = "";
  const v = el("div", "verdict " + d.verdict);
  v.append(el("h2", "", titles[d.verdict]), el("p", "", advice[d.verdict]));

  const meter = el("div", "meter"); const mark = el("i"); mark.style.left = d.score + "%"; meter.append(mark);
  const meta = el("div", "meta"); meta.append(el("span", "", d.type), el("span", "", "Risk " + d.score + " / 100"));

  const list = el("ul", "findings");
  if (!d.findings.length) list.append(el("li", "clean", "No warning signs detected."));
  d.findings.forEach((f) => list.append(el("li", f.level, f.text)));

  result.append(v, meter, meta, el("div", "payload", d.content), list);
}

function stopCamera() {
  if (rafId) cancelAnimationFrame(rafId);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = rafId = null; video.hidden = true; stage.classList.remove("scanning");
  $("camBtn").textContent = "Start camera";
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch { result.innerHTML = '<p>Camera access was blocked. Allow it in your browser, or upload an image instead.</p>'; return; }
  preview.hidden = true; hint.hidden = true; video.hidden = false;
  video.srcObject = stream; await video.play();
  stage.classList.add("scanning"); $("camBtn").textContent = "Stop camera";
  const tick = () => {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const code = decode(video, video.videoWidth, video.videoHeight);
      if (code) { stopCamera(); analyze(code.data); return; }
    }
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

$("camBtn").onclick = () => (stream ? stopCamera() : startCamera());

$("file").onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  stopCamera();
  const url = URL.createObjectURL(file);
  preview.onload = () => {
    hint.hidden = true; preview.hidden = false;
    const code = decode(preview, preview.naturalWidth, preview.naturalHeight);
    URL.revokeObjectURL(url);
    code ? analyze(code.data) : (result.innerHTML = "<p>No QR code found in that image. Try a sharper, closer photo.</p>");
  };
  preview.src = url; e.target.value = "";
};

$("checkBtn").onclick = () => { const t = $("manual").value.trim(); if (t) analyze(t); };
