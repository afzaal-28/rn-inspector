use std::io::{self, Read, Write};
use std::net::TcpStream;
use std::process::Command;

use anyhow::{Context, Result};
use base64::Engine;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(author, version, about)]
struct Args {
    /// Device id (adb device id). Optional for iOS/desktop.
    #[arg(long)]
    device: Option<String>,

    /// Platform hint (android | ios | ios-sim | ios-device)
    #[arg(long)]
    platform: Option<String>,

    /// Host where companion app streams frames
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Port where companion app streams frames
    #[arg(long, default_value_t = 27183)]
    port: u16,

    /// adb path (for android only)
    #[arg(long, default_value = "adb")]
    adb: String,
}

fn send_error(message: impl AsRef<str>) -> io::Result<()> {
    let payload = format!(
        "{{\"type\":\"error\",\"error\":{}}}\n",
        serde_json::to_string(message.as_ref()).unwrap_or("\"unknown error\"".to_string())
    );
    io::stdout().write_all(payload.as_bytes())?;
    io::stdout().flush()
}

fn setup_android_forward(adb: &str, device: Option<&str>, port: u16) -> Result<()> {
    let mut cmd = Command::new(adb);
    if let Some(id) = device {
        cmd.arg("-s").arg(id);
    }
    cmd.args(["forward", &format!("tcp:{}", port), &format!("tcp:{}", port)]);
    let output = cmd.output().context("Failed to execute adb forward")?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("adb forward failed: {}", err.trim());
    }
    Ok(())
}

fn read_frame(stream: &mut TcpStream) -> Result<(String, Vec<u8>)> {
    let mut header = [0u8; 5];
    stream.read_exact(&mut header)?;
    let mime_id = header[0];
    let len = u32::from_be_bytes([header[1], header[2], header[3], header[4]]) as usize;
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf)?;

    let mime = match mime_id {
        1 => "image/png",
        2 => "image/jpeg",
        3 => "image/webp",
        _ => "image/png",
    };
    Ok((mime.to_string(), buf))
}

fn main() -> Result<()> {
    let args = Args::parse();

    let platform = args.platform.clone().unwrap_or_else(|| "android".to_string());
    if platform.starts_with("android") {
        if let Err(err) = setup_android_forward(&args.adb, args.device.as_deref(), args.port) {
            let _ = send_error(format!("{}", err));
        }
    }

    let addr = format!("{}:{}", args.host, args.port);
    let mut stream = TcpStream::connect(&addr)
        .with_context(|| format!("Failed to connect to mirror companion at {addr}"))?;

    loop {
        match read_frame(&mut stream) {
            Ok((mime, bytes)) => {
                let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
                let payload = format!(
                    "{{\"type\":\"frame\",\"mime\":{},\"data\":{}}}\n",
                    serde_json::to_string(&mime).unwrap_or("\"image/png\"".to_string()),
                    serde_json::to_string(&b64).unwrap_or("\"\"".to_string())
                );
                io::stdout().write_all(payload.as_bytes())?;
                io::stdout().flush()?;
            }
            Err(err) => {
                let _ = send_error(format!("Mirror stream error: {}", err));
                break;
            }
        }
    }

    Ok(())
}
