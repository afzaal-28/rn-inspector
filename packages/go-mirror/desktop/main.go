package main

import (
    "bytes"
    "encoding/binary"
    "flag"
    "fmt"
    "io"
    "net"
    "os"
    "os/exec"
    "path/filepath"
    "runtime"
)

func main() {
    var listenAddr string
    var ffplayPath string
    var ffmpegPath string
    var recordPath string
    var noWindow bool
    var windowTitle string
    flag.StringVar(&listenAddr, "listen", ":7070", "Address to listen for Android stream (ip:port)")
    flag.StringVar(&ffplayPath, "ffplay", "", "Optional path to ffplay binary")
    flag.StringVar(&ffmpegPath, "ffmpeg", "", "Optional path to ffmpeg binary")
    flag.StringVar(&recordPath, "record", "", "Record to file (.mp4 uses ffmpeg, .h264 saves raw)")
    flag.BoolVar(&noWindow, "no-window", false, "Disable GUI window (headless mode)")
    flag.StringVar(&windowTitle, "title", "Go Mirror", "Window title for preview")
    flag.Parse()

    if noWindow && recordPath == "" {
        fmt.Fprintln(os.Stderr, "either enable window preview or provide --record")
        os.Exit(1)
    }

    if !noWindow {
        if ffplayPath == "" {
            resolved, err := findBundledTool("ffplay")
            if err != nil {
                fmt.Fprintf(os.Stderr, "%v\n", err)
                os.Exit(1)
            }
            ffplayPath = resolved
        }
    }

    if recordPath != "" && !isRawRecording(recordPath) && ffmpegPath == "" {
        resolved, err := findBundledTool("ffmpeg")
        if err != nil {
            fmt.Fprintf(os.Stderr, "%v\n", err)
            os.Exit(1)
        }
        ffmpegPath = resolved
    }

    ln, err := net.Listen("tcp", listenAddr)
    if err != nil {
        fmt.Fprintf(os.Stderr, "failed to listen: %v\n", err)
        os.Exit(1)
    }
    defer ln.Close()

    fmt.Printf("Go Mirror desktop receiver listening on %s\n", listenAddr)
    conn, err := ln.Accept()
    if err != nil {
        fmt.Fprintf(os.Stderr, "failed to accept connection: %v\n", err)
        os.Exit(1)
    }
    defer conn.Close()

    header, err := readHeader(conn)
    if err != nil {
        fmt.Fprintf(os.Stderr, "invalid stream header: %v\n", err)
        os.Exit(1)
    }

    fmt.Printf("Stream: %dx%d\n", header.Width, header.Height)

    writers := make([]io.Writer, 0, 2)
    var cleanup []func()

    if !noWindow {
        ffplayCmd, err := startFFplay(ffplayPath, windowTitle)
        if err != nil {
            fmt.Fprintf(os.Stderr, "failed to start ffplay: %v\n", err)
            os.Exit(1)
        }
        writers = append(writers, ffplayCmd.stdin)
        cleanup = append(cleanup, ffplayCmd.close)
    }

    if recordPath != "" {
        if isRawRecording(recordPath) {
            file, err := os.Create(recordPath)
            if err != nil {
                fmt.Fprintf(os.Stderr, "failed to create record file: %v\n", err)
                os.Exit(1)
            }
            writers = append(writers, file)
            cleanup = append(cleanup, func() {
                _ = file.Close()
            })
        } else {
            ffmpegCmd, err := startFFmpeg(ffmpegPath, recordPath)
            if err != nil {
                fmt.Fprintf(os.Stderr, "failed to start ffmpeg: %v\n", err)
                os.Exit(1)
            }
            writers = append(writers, ffmpegCmd.stdin)
            cleanup = append(cleanup, ffmpegCmd.close)
        }
    }

    multi := io.MultiWriter(writers...)
    if _, err := io.Copy(multi, conn); err != nil {
        if !isClosedNetworkErr(err) {
            fmt.Fprintf(os.Stderr, "stream ended with error: %v\n", err)
        }
    }

    for _, closeFn := range cleanup {
        closeFn()
    }
}

func findBundledTool(tool string) (string, error) {
    if path, err := exec.LookPath(tool); err == nil {
        return path, nil
    }

    exe, err := os.Executable()
    if err != nil {
        return "", fmt.Errorf("failed to locate %s: %w", tool, err)
    }

    baseDir := filepath.Dir(exe)
    ext := ""
    if runtime.GOOS == "windows" {
        ext = ".exe"
    }
    name := tool + ext
    candidates := []string{
        filepath.Join(baseDir, name),
        filepath.Join(baseDir, "ffmpeg", name),
        filepath.Join(baseDir, "ffmpeg", "bin", name),
        filepath.Join(baseDir, "bin", name),
    }

    for _, candidate := range candidates {
        info, statErr := os.Stat(candidate)
        if statErr == nil && !info.IsDir() {
            return candidate, nil
        }
    }

    return "", fmt.Errorf("failed to locate %s: not found in PATH or bundled next to the executable", tool)
}

func isClosedNetworkErr(err error) bool {
    if err == nil {
        return false
    }
    if execErr, ok := err.(*exec.ExitError); ok {
        return execErr.ProcessState != nil
    }
    if opErr, ok := err.(*net.OpError); ok {
        return opErr.Err != nil && opErr.Timeout() == false
    }
    return false
}

type streamHeader struct {
    Width  uint32
    Height uint32
}

func readHeader(conn net.Conn) (*streamHeader, error) {
    headerBytes := make([]byte, 16)
    if _, err := io.ReadFull(conn, headerBytes); err != nil {
        return nil, err
    }
    if !bytes.Equal(headerBytes[:8], []byte("GOMIRROR")) {
        return nil, fmt.Errorf("unexpected magic")
    }
    width := binary.BigEndian.Uint32(headerBytes[8:12])
    height := binary.BigEndian.Uint32(headerBytes[12:16])
    return &streamHeader{Width: width, Height: height}, nil
}

type processHandle struct {
    stdin io.WriteCloser
    close func()
}

func startFFplay(path string, title string) (*processHandle, error) {
    cmd := exec.Command(
        path,
        "-window_title", title,
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-framedrop",
        "-probesize", "32",
        "-analyzeduration", "0",
        "-sync", "ext",
        "-",
    )
    stdin, err := cmd.StdinPipe()
    if err != nil {
        return nil, err
    }
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    if err := cmd.Start(); err != nil {
        return nil, err
    }
    return &processHandle{
        stdin: stdin,
        close: func() {
            _ = stdin.Close()
            _ = cmd.Wait()
        },
    }, nil
}

func startFFmpeg(path string, output string) (*processHandle, error) {
    cmd := exec.Command(
        path,
        "-f", "h264",
        "-i", "pipe:0",
        "-c:v", "copy",
        output,
    )
    stdin, err := cmd.StdinPipe()
    if err != nil {
        return nil, err
    }
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    if err := cmd.Start(); err != nil {
        return nil, err
    }
    return &processHandle{
        stdin: stdin,
        close: func() {
            _ = stdin.Close()
            _ = cmd.Wait()
        },
    }, nil
}

func isRawRecording(path string) bool {
    ext := filepath.Ext(path)
    return ext == ".h264" || ext == ".264"
}
