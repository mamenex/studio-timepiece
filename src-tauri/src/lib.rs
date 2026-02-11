use std::{
  collections::HashMap,
  fs,
  io::{Read, Write},
  net::{Shutdown, TcpStream, UdpSocket},
  path::{Component, Path},
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
  },
  thread,
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use rosc::{encoder, OscMessage, OscPacket, OscType};
use serde::Serialize;
use tauri::Emitter;

#[derive(Default)]
struct X32ListenerState {
  inner: Mutex<Option<X32ListenerHandle>>,
}

struct X32ListenerHandle {
  stop: Arc<AtomicBool>,
  thread: Option<thread::JoinHandle<()>>,
}

#[derive(Clone, Copy, Debug)]
struct ChannelState {
  on: bool,
  fader: f32,
}

#[derive(Serialize, Clone)]
struct MicChannelPayload {
  channel: u8,
  on: bool,
  fader: f32,
  live: bool,
}

#[derive(Serialize, Clone)]
struct MicStatePayload {
  channels: Vec<MicChannelPayload>,
  any_live: bool,
  updated_at: u64,
}

fn osc_arg_to_f32(arg: &OscType) -> Option<f32> {
  match arg {
    OscType::Float(value) => Some(*value),
    OscType::Double(value) => Some(*value as f32),
    OscType::Int(value) => Some(*value as f32),
    OscType::Long(value) => Some(*value as f32),
    _ => None,
  }
}

fn parse_channel_from_addr(addr: &str) -> Option<u8> {
  let parts: Vec<&str> = addr.split('/').collect();
  if parts.len() < 3 {
    return None;
  }
  if parts[1] != "ch" {
    return None;
  }
  parts[2].parse::<u8>().ok()
}

fn send_subscribe(socket: &UdpSocket, target: &str, address: &str, time_factor: i32) {
  let message = OscMessage {
    addr: "/subscribe".to_string(),
    args: vec![OscType::String(address.to_string()), OscType::Int(time_factor)],
  };
  let packet = OscPacket::Message(message);
  if let Ok(buf) = encoder::encode(&packet) {
    let _ = socket.send_to(&buf, target);
  }
}

fn emit_state(
  app: &tauri::AppHandle,
  channels: &[u8],
  states: &HashMap<u8, ChannelState>,
  threshold: f32,
) {
  let mut payload_channels = Vec::with_capacity(channels.len());
  for channel in channels {
    let state = states.get(channel).copied().unwrap_or(ChannelState { on: false, fader: 0.0 });
    let live = state.on && state.fader > threshold;
    payload_channels.push(MicChannelPayload {
      channel: *channel,
      on: state.on,
      fader: state.fader,
      live,
    });
  }
  let any_live = payload_channels.iter().any(|entry| entry.live);
  let updated_at = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as u64)
    .unwrap_or(0);
  let payload = MicStatePayload {
    channels: payload_channels,
    any_live,
    updated_at,
  };
  let _ = app.emit("x32_mic_state", payload);
}

#[tauri::command]
fn start_x32_listener(
  app: tauri::AppHandle,
  state: tauri::State<X32ListenerState>,
  host: String,
  port: u16,
  channels: Vec<u8>,
  threshold: f32,
) -> Result<(), String> {
  stop_x32_listener(state.clone())?;

  let socket = UdpSocket::bind("0.0.0.0:0").map_err(|err| err.to_string())?;
  socket
    .set_read_timeout(Some(Duration::from_millis(250)))
    .map_err(|err| err.to_string())?;

  let target = format!("{host}:{port}");
  let channel_list = if channels.is_empty() {
    vec![1, 2, 3, 4, 5, 6]
  } else {
    channels
  };
  let subscribe_paths: Vec<String> = channel_list
    .iter()
    .flat_map(|channel| {
      [
        format!("/ch/{:02}/mix/on", channel),
        format!("/ch/{:02}/mix/fader", channel),
      ]
    })
    .collect();

  let stop_flag = Arc::new(AtomicBool::new(false));
  let thread_stop = stop_flag.clone();
  let app_handle = app.clone();

  let handle = thread::spawn(move || {
    let mut states: HashMap<u8, ChannelState> = HashMap::new();
    let mut last_subscribe = Instant::now() - Duration::from_secs(30);
    let mut buf = [0u8; 2048];

    while !thread_stop.load(Ordering::Relaxed) {
      if last_subscribe.elapsed() >= Duration::from_secs(8) {
        for path in &subscribe_paths {
          send_subscribe(&socket, &target, path, 20);
        }
        last_subscribe = Instant::now();
      }

      match socket.recv_from(&mut buf) {
        Ok((size, _)) => {
          if let Ok((_, packet)) = rosc::decoder::decode_udp(&buf[..size]) {
            handle_packet(&app_handle, &channel_list, &mut states, threshold, packet);
          }
        }
        Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {}
        Err(err) if err.kind() == std::io::ErrorKind::TimedOut => {}
        Err(_) => {}
      }
    }
  });

  let mut guard = state.inner.lock().map_err(|_| "Listener lock poisoned".to_string())?;
  *guard = Some(X32ListenerHandle {
    stop: stop_flag,
    thread: Some(handle),
  });
  Ok(())
}

fn handle_packet(
  app: &tauri::AppHandle,
  channels: &[u8],
  states: &mut HashMap<u8, ChannelState>,
  threshold: f32,
  packet: OscPacket,
) {
  match packet {
    OscPacket::Message(message) => handle_message(app, channels, states, threshold, message),
    OscPacket::Bundle(bundle) => {
      for entry in bundle.content {
        handle_packet(app, channels, states, threshold, entry);
      }
    }
  }
}

fn handle_message(
  app: &tauri::AppHandle,
  channels: &[u8],
  states: &mut HashMap<u8, ChannelState>,
  threshold: f32,
  message: OscMessage,
) {
  let channel = match parse_channel_from_addr(&message.addr) {
    Some(channel) => channel,
    None => return,
  };

  if message.addr.ends_with("/mix/on") {
    if let Some(arg) = message.args.first() {
      let on = match arg {
        OscType::Int(value) => *value != 0,
        OscType::Long(value) => *value != 0,
        OscType::Float(value) => *value > 0.0,
        OscType::Double(value) => *value > 0.0,
        _ => false,
      };
      let entry = states.entry(channel).or_insert(ChannelState { on: false, fader: 0.0 });
      if entry.on != on {
        entry.on = on;
        emit_state(app, channels, states, threshold);
      }
    }
  }

  if message.addr.ends_with("/mix/fader") {
    if let Some(arg) = message.args.first().and_then(osc_arg_to_f32) {
      let entry = states.entry(channel).or_insert(ChannelState { on: false, fader: 0.0 });
      if (entry.fader - arg).abs() > f32::EPSILON {
        entry.fader = arg;
        emit_state(app, channels, states, threshold);
      }
    }
  }
}

#[tauri::command]
fn stop_x32_listener(state: tauri::State<X32ListenerState>) -> Result<(), String> {
  let handle = {
    let mut guard = state.inner.lock().map_err(|_| "Listener lock poisoned".to_string())?;
    guard.take()
  };

  if let Some(listener) = handle {
    listener.stop.store(true, Ordering::Relaxed);
    if let Some(thread) = listener.thread {
      let _ = thread.join();
    }
  }
  Ok(())
}

fn sanitize_amcp_value(value: &str) -> Result<String, String> {
  if value.chars().any(|ch| ch == '\n' || ch == '\r') {
    return Err("AMCP values cannot contain line breaks".to_string());
  }
  Ok(value.trim().to_string())
}

fn escape_amcp_quoted(value: &str) -> String {
  value.replace('\\', "\\\\").replace('\"', "\\\"")
}

fn send_amcp(host: &str, port: u16, command: &str) -> Result<String, String> {
  let address = format!("{}:{}", host.trim(), port);
  let mut stream = TcpStream::connect(address).map_err(|err| err.to_string())?;
  stream
    .set_read_timeout(Some(Duration::from_millis(1200)))
    .map_err(|err| err.to_string())?;
  stream
    .set_write_timeout(Some(Duration::from_millis(1200)))
    .map_err(|err| err.to_string())?;

  let payload = format!("{}\r\n", command.trim());
  stream.write_all(payload.as_bytes()).map_err(|err| err.to_string())?;
  let _ = stream.shutdown(Shutdown::Write);

  let mut response = String::new();
  stream
    .read_to_string(&mut response)
    .map_err(|err| err.to_string())?;

  let trimmed = response.trim().to_string();
  if trimmed.is_empty() {
    Ok("No response".to_string())
  } else {
    Ok(trimmed)
  }
}

#[tauri::command]
fn casparcg_ping(host: String, port: u16) -> Result<String, String> {
  send_amcp(host.trim(), port, "INFO")
}

#[tauri::command]
fn casparcg_send_amcp(host: String, port: u16, command: String) -> Result<String, String> {
  let clean = sanitize_amcp_value(&command)?;
  if clean.is_empty() {
    return Err("Command is required".to_string());
  }
  send_amcp(host.trim(), port, &clean)
}

#[tauri::command]
fn casparcg_play_template(
  host: String,
  port: u16,
  channel: u16,
  layer: u16,
  template: String,
  data: String,
) -> Result<String, String> {
  let clean_template = sanitize_amcp_value(&template)?;
  if clean_template.is_empty() {
    return Err("Template name is required".to_string());
  }
  let clean_data = sanitize_amcp_value(&data)?;
  let escaped_template = escape_amcp_quoted(&clean_template);
  let escaped_data = escape_amcp_quoted(&clean_data);
  let command = if clean_data.is_empty() {
    format!("CG {}-{} ADD 1 \"{}\" 1", channel, layer, escaped_template)
  } else {
    format!("CG {}-{} ADD 1 \"{}\" 1 \"{}\"", channel, layer, escaped_template, escaped_data)
  };
  send_amcp(host.trim(), port, &command)
}

#[tauri::command]
fn casparcg_update_template(
  host: String,
  port: u16,
  channel: u16,
  layer: u16,
  data: String,
) -> Result<String, String> {
  let clean_data = sanitize_amcp_value(&data)?;
  let escaped_data = escape_amcp_quoted(&clean_data);
  let command = format!("CG {}-{} UPDATE 1 \"{}\"", channel, layer, escaped_data);
  send_amcp(host.trim(), port, &command)
}

#[tauri::command]
fn casparcg_stop_template(host: String, port: u16, channel: u16, layer: u16) -> Result<String, String> {
  let command = format!("CG {}-{} STOP 1", channel, layer);
  send_amcp(host.trim(), port, &command)
}

fn validate_relative_template_path(path: &str) -> Result<String, String> {
  let normalized = path.trim().replace('\\', "/");
  if normalized.is_empty() {
    return Err("Template file name is required".to_string());
  }
  let candidate = Path::new(&normalized);
  for component in candidate.components() {
    match component {
      Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
        return Err("Template file path must be relative to template root".to_string())
      }
      _ => {}
    }
  }
  Ok(normalized)
}

#[tauri::command]
fn casparcg_write_template_file(
  template_root: String,
  relative_path: String,
  content: String,
) -> Result<String, String> {
  let root = template_root.trim();
  if root.is_empty() {
    return Err("Template root path is required".to_string());
  }

  let safe_relative = validate_relative_template_path(&relative_path)?;
  let target = Path::new(root).join(safe_relative);

  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }

  fs::write(&target, content).map_err(|err| err.to_string())?;
  Ok(format!("Wrote {}", target.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(X32ListenerState::default())
    .invoke_handler(tauri::generate_handler![
      start_x32_listener,
      stop_x32_listener,
      casparcg_ping,
      casparcg_send_amcp,
      casparcg_play_template,
      casparcg_update_template,
      casparcg_stop_template,
      casparcg_write_template_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
