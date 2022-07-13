
Terminal.applyAddon(fit);

let term = new Terminal({
  bellSound: "both",
  bellStyle: "sound",
  cursorBlink: true,
  lineHeight: 1,
  fontSize: 18,
  fontFamily: "Andale Mono, courier-new, courier, monospace",
  scrollback: 1024 * 100,
});

term.on('key', async function (key, event) {
  key = (event.code == "Backspace") ? "\b" : key;
  key = (event.code == "Enter") ? "\n" : key;
  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  await writer.write(encoder.encode(key));
  writer.releaseLock();
});

term.on('data', function (data, ev) {
  console.debug(data);
});