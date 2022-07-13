//===================================
//  GLOBALS
//===================================
let device_connected = false;
let history_position = 0;
let command_history = [];
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder("utf-8");
const flags = new Flags();
const change_event = new Event("change");
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
//===================================
//  Parsers & Generator Functions
function GenerateConnectionId(length) {
  return Math.random()
    .toString(36)
    .slice(2);
}
function generateDropDownList(port_info) {
  if (port_info.length == 0) {
    return '<option value="-1" selected="selected">No Serial Ports</option>';
  }
  // Convert port_info array into an array of serial port paths
  const paths = port_info.map(port => {
    return port.path;
  });
  // Sort using numeric language sensitive string comparison.
  // This will result in a list like so:
  //    ["COM1", "COM2", "COM22", "COM100", "COM120"]
  //
  // vs ES6's default string sort which would result in:
  //
  //    ["COM1", "COM100", "COM120", "COM2", "COM22"]
  //
  paths.sort(collator.compare);
  console.debug(port_info, paths);
  var selected = document.querySelector("#device-select").value;
  let html = "";
  for (let i = 0; i < paths.length; i++) {
    html += `
      <option value="${paths[i]}"
      ${paths[i] === selected ? 'selected="selected"' : ""}>
          ${paths[i]}
      </option>`;
  }
  return html;
}

function generateCommandListHtml(command_list) {
  if (!command_list) {
    return "";
  }

  let html = "";
  for (let command of command_list) {
    html += `<option value="${command}" />`;
  }
  return html;
}

//===================================
//  Web Serial
//===================================
let reader;
let port;

function disconnectFromDevice() {
  device_connected = false;
  if (reader && reader.cancel) {
    reader.cancel();
  }
  $("#connect")
    .addClass("btn-outline-success")
    .removeClass("btn-outline-danger")
    .text("Connect");
  $("#baudrate").prop("disabled", false);
  $("#dtr-control").prop("disabled", true);
  $("#rts-control").prop("disabled", true);
  $("#dtr-control").prop("checked", false);
  $("#rts-control").prop("checked", false);
}

async function readFromDevice(port) {
  while (port.readable && device_connected) {
    reader = port.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          // reader.cancel() has been called.
          break;
        }
        // value is a Uint8Array.
        let decoded = new TextDecoder().decode(value);
        decoded = decoded.replace(/\n/g, "\r\n");
        term.write(decoded);
      }
    } catch (error) {
      disconnectFromDevice();
      const red = '\x1b[31m';
      const resetColor = '\x1b[0m';
      term.write(red + "Exiting serial monitor due to error: " + error + resetColor);
    } finally {
      // Allow the serial port to be closed later.
      reader.releaseLock();
    }
  }
  await port.close();
}

//===================================
//  Button Click Listeners
//===================================
document.querySelector("#connect").addEventListener("click", async () => {
  if (device_connected) {
    disconnectFromDevice();
    return;
  } else {
    try {
      port = await navigator.serial.requestPort();
      const baudRate = Number($("#baudrate").val());
      await port.open({ baudRate });
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      device_connected = true;
      $("#connect")
        .removeClass("btn-outline-success")
        .addClass("btn-outline-danger")
        .text("Disconnect");
      $("#baudrate").prop("disabled", true);
      $("#dtr-control").prop("disabled", false);
      $("#rts-control").prop("disabled", false);
      readFromDevice(port);
    } catch (error) {
      const notFoundText = "NotFoundError: No port selected by the user.";
      const userCancelledConnecting = String(error) === notFoundText;
      if (!userCancelledConnecting) {
        alert("Could not connect to serial device.")
      }
    }
  }
});


document.querySelector("#dtr-control").addEventListener("click", async () => {
  let dataTerminalReady = !!document.querySelector("#dtr-control").checked;
  await port.setSignals({ dataTerminalReady });
});

document.querySelector("#rts-control").addEventListener("click", async () => {
  let requestToSend = !!document.querySelector("#rts-control").checked;
  await port.setSignals({ requestToSend });
});

document.querySelector("#serial-input").addEventListener("keyup", event => {
  const DOWN_ARROW = 38;
  const UP_ARROW = 40;
  const ENTER_KEY = 13;

  let count_change_flag = true;

  switch (event.which) {
    case UP_ARROW:
      if (history_position > 0) {
        history_position--;
      }
      break;
    case DOWN_ARROW:
      if (history_position < command_history.length) {
        history_position++;
      }
      break;
    case ENTER_KEY:
      $("#serial-send").click();
      break;
    default:
      count_change_flag = false;
      break;
  }
  if (count_change_flag) {
    let command = command_history[command_history.length - history_position];
    if (command) {
      document.querySelector("#serial-input").value = command;
    }
  }
});

document.querySelector("#serial-send").addEventListener("click", async () => {
  let payload = $("#serial-input").val();
  $("#serial-input").val("");

  if (payload !== command_history[command_history.length - 1]) {
    command_history.push(payload);
  }

  history_position = 0;

  let cr = flags.get("carriage-return-select") ? "\r" : "";
  let nl = flags.get("newline-select") ? "\n" : "";

  console.log(`${payload}${cr}${nl}\n\n\n`);

  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  await writer.write(encoder.encode(`${payload}${cr}${nl}`));
  writer.releaseLock();
});

//Clear Button Code
document.querySelector("#clear-button").addEventListener("click", () => {
  // [0m = Reset color codes
  // [3J = Remove terminal buffer
  // [2J = Clear screen
  // [H  = Return to home (0,0)
  term.write("\x1b[0m\x1b[3J\x1b[2J\x1b[H");
});

//Command History Code
document
  .querySelector("#clear-cache-modal-open")
  .addEventListener("click", () => {
    $("#clear-cache-modal").modal("show");
  });

document.querySelector("#clear-command-cache").addEventListener("click", () => {
  flags.set("command-history", [
    /* empty array */
  ]);
});

//Serial File Upload
document.querySelector("#serial-upload").addEventListener("click", () => {
  let serial_file = document.querySelector("#serial-file").files;
  if (!device_connected) {
    alert("Please connect a device before uploading a file.");
    return;
  } else if (serial_file.length === 0) {
    alert("No file selected");
    console.debug("No file");
    return;
  }

  let file = serial_file.item(0);
  let reader = new FileReader();

  // This event listener will be fired once reader.readAsText() finishes
  reader.onload = async () => {
    const writer = port.writable.getWriter();
    await writer.write(reader.result);
    writer.releaseLock();
  };

  // Initiate reading of uploaded file
  reader.readAsArrayBuffer(file);
});

//===================================
//  Initialize everything
//===================================

function ApplyDarkTheme(dark_theme_active) {
  console.debug("Dark theme: ", dark_theme_active);
  let head = document.querySelector("head");
  if (dark_theme_active) {
    head.innerHTML += `<link
      rel="stylesheet"
      type="text/css"
      id="dark-style"
      href="static/lib/themes/dark-theme.css">`;
  } else {
    let dark_style = document.querySelector("#dark-style");
    if (dark_style) {
      head.removeChild(dark_style);
    }
  }
}

function commandHistoryUpdateHandler(command_list) {
  let command_history_element = document.querySelector("#command-history");
  command_history_element.innerHTML = generateCommandListHtml(command_list);
  console.debug("Command history updated");
}

flags.attach("baudrate", "change", "38400");
flags.attach("carriage-return-select", "change");
flags.attach("newline-select", "change", true);
flags.attach("dark-theme", "change", false, ApplyDarkTheme, ApplyDarkTheme);
flags.bind("command-history", commandHistoryUpdateHandler, []);

function main() {
  term.open(document.querySelector("#terminal"));
  term.fit();

  flags.initialize();
}

$(document).on('click', '.browse', function () {
  var file = $(this).parent().parent().parent().find('.file');
  file.trigger('click');
});
$(document).on('change', '.file', function () {
  $(this).parent().find('.form-control')
    .val($(this).val().replace(/C:\\fakepath\\/i, ''));
});

window.onbeforeunload = () => {
  let command_history = flags.get("command-history");
  if (command_history) {
    flags.set("command-history", command_history.slice(0, 99));
  }
  flags.teardown();
  return null;
};
window.addEventListener("resize", () => {
  term.fit();
});
// Entry point of software start
window.addEventListener("load", main);
